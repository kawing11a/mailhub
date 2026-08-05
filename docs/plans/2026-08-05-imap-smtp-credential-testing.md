# Custom IMAP & SMTP Credential Testing Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Require users to test Custom IMAP & SMTP credentials before connecting an account, and automatically reset verification state whenever credential or server configuration fields change.

**Architecture:** Add a new `POST /api/accounts/test-credentials` route for testing unsaved credentials using `ImapFlow` and `nodemailer`. Update `AddAccountModal` with react-hook-form field watching to reset test state on changes and keep the submit button disabled until testing passes.

**Tech Stack:** Next.js App Router, TypeScript, React Hook Form, TanStack Query, ImapFlow, Nodemailer, Lucide React icons.

---

### Task 1: Create Backend Unsaved Credential Testing API Endpoint

**Files:**
- Create: `src/app/api/accounts/test-credentials/route.ts`
- Test: `src/__tests__/app/api/accounts/test-credentials.test.ts`

**Step 1: Write the failing unit test**

Create `src/__tests__/app/api/accounts/test-credentials.test.ts`:
```typescript
import { testApiHandler } from 'next-test-api-route-handler';
import * as POSTRoute from '@/app/api/accounts/test-credentials/route';

describe('POST /api/accounts/test-credentials', () => {
  it('should return 401 if user is not authenticated', async () => {
    await testApiHandler({
      appHandler: POSTRoute,
      test: async ({ fetch }) => {
        const res = await fetch({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imapHost: 'imap.example.com',
            imapPort: 993,
            smtpHost: 'smtp.example.com',
            smtpPort: 465,
            username: 'user@example.com',
            password: 'secret',
            emailAddress: 'user@example.com',
          }),
        });
        expect(res.status).toBe(401);
      },
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/app/api/accounts/test-credentials.test.ts`
Expected: FAIL with route module not found.

**Step 3: Implement backend test-credentials API route**

Create `src/app/api/accounts/test-credentials/route.ts`:
```typescript
import { NextRequest } from 'next/server';
import { ImapFlow } from 'imapflow';
import { createTransport } from 'nodemailer';
import {
  authenticate,
  requireAdmin,
  apiResponse,
  apiError,
} from '@/lib/auth/middleware';
import { createAccountSchema } from '@/lib/validation/schemas';

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const adminCheck = requireAdmin(auth);
  if (adminCheck) return adminCheck;

  try {
    const body = await req.json();
    const parseResult = createAccountSchema.safeParse(body);
    if (!parseResult.success) {
      return apiError(parseResult.error.issues[0]?.message || 'Invalid parameters', 400);
    }

    const {
      imapHost,
      imapPort,
      imapSecure,
      smtpHost,
      smtpPort,
      smtpSecure,
      username,
      password,
      emailAddress,
    } = parseResult.data;

    const results = { imap: false, smtp: false, imapError: '', smtpError: '' };

    // Test IMAP connection
    if (imapHost && password) {
      try {
        const client = new ImapFlow({
          host: imapHost,
          port: imapPort || 993,
          secure: imapSecure ?? true,
          auth: {
            user: username || emailAddress,
            pass: password,
          },
          logger: false,
        });
        await client.connect();
        await client.logout();
        results.imap = true;
      } catch (e: unknown) {
        results.imapError = e instanceof Error ? e.message : 'IMAP connection failed';
      }
    }

    // Test SMTP connection
    if (smtpHost && password) {
      try {
        const transporter = createTransport({
          host: smtpHost,
          port: smtpPort || 465,
          secure: smtpSecure ?? true,
          auth: {
            user: username || emailAddress,
            pass: password,
          },
        });
        await transporter.verify();
        results.smtp = true;
      } catch (e: unknown) {
        results.smtpError = e instanceof Error ? e.message : 'SMTP connection failed';
      }
    }

    const ok = results.imap && results.smtp;
    return apiResponse({ ok, ...results });
  } catch (error: any) {
    console.error('Test credentials error:', error);
    return apiError(error.message || 'Failed to test credentials', 500);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx jest src/__tests__/app/api/accounts/test-credentials.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/app/api/accounts/test-credentials/route.ts src/__tests__/app/api/accounts/test-credentials.test.ts
git commit -m "feat: add POST /api/accounts/test-credentials route"
```

---

### Task 2: Enhance AddAccountModal with Credential Testing & Form Reset

**Files:**
- Modify: `src/components/settings/AddAccountModal.tsx`

**Step 1: Update AddAccountModal state & watched fields**

In `AddAccountModal.tsx`:
- Add `watch` from `useForm<CreateAccountInput>`.
- Add state `testStatus` (`'idle' | 'testing' | 'success' | 'error'`) and `testResult`.
- Watch `['imapHost', 'imapPort', 'smtpHost', 'smtpPort', 'username', 'password', 'emailAddress', 'imapSecure', 'smtpSecure']`.
- Add a `useEffect` that resets `testStatus` to `'idle'` whenever any watched connection field changes.

**Step 2: Add testCredentials mutation & UI buttons**

In `AddAccountModal.tsx`:
- Add `testMutation` using `useMutation` calling `POST /api/accounts/test-credentials`.
- Add a **"Test Credentials"** button next to **"Connect Account"**.
- Disable **"Connect Account"** button unless `testStatus === 'success'`.
- Render success badge when both IMAP and SMTP succeed, or error message showing specific failure details when testing fails.

**Step 3: Run build to verify TypeScript compilation**

Run: `npm run build`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/settings/AddAccountModal.tsx
git commit -m "feat: add credential testing and auto-reset to AddAccountModal"
```
