# Meilisearch Email Summarization Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Integrate Meilisearch email querying and adaptive Map-Reduce batch summarization into the background summary worker to handle large email batches with full body content without LLM context degradation.

**Architecture:** Update `generateEmailBatchSummary` in `summary-service.ts` to support optional full body text, body cleaning/truncation, and chunked Map-Reduce processing for > 15 emails. Update `executeSummaryRun` in `summary.ts` to query Meilisearch for matching email IDs sorted by recency, fallback to Prisma on index/network error, fetch email body content, and trigger summarization.

**Tech Stack:** TypeScript, Meilisearch JS SDK (`meilisearch`), Prisma ORM, BullMQ, Jest.

---

### Task 1: Adaptive Map-Reduce & Body Sanitization in AI Summary Service

**Files:**
- Modify: `src/lib/ai/summary-service.ts`
- Test: `src/__tests__/lib/ai/summary-service.test.ts`

**Step 1: Write failing tests for Map-Reduce chunking & body text handling**

Add tests to `src/__tests__/lib/ai/summary-service.test.ts`:
- Test that single-pass summarization uses body text/snippets for ≤ 15 emails.
- Test that batch > 15 emails triggers chunked Map-Reduce (multiple LLM calls for chunks + reduce call).

```typescript
test('triggers Map-Reduce chunked summarization for email batches exceeding threshold', async () => {
  // Mock fetch responses for 2 map chunks + 1 reduce call
  (global.fetch as jest.Mock)
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'Chunk 1 summary' } }] }),
    })
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'Chunk 2 summary' } }] }),
    })
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'Final reduced summary' } }] }),
    });

  const dummyEmails = Array.from({ length: 25 }, (_, i) => ({
    id: `email-${i}`,
    subject: `Subject ${i}`,
    snippet: `Snippet ${i}`,
    bodyText: `Full body content for email ${i}`,
  }));

  const summary = await generateEmailBatchSummary({
    provider: 'openai',
    apiKey: 'sk-test-key',
    labelName: 'Support',
    emails: dummyEmails,
    chunkSize: 15,
  });

  expect(summary).toBe('Final reduced summary');
  expect(global.fetch).toHaveBeenCalledTimes(3);
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/lib/ai/summary-service.test.ts`
Expected: FAIL due to missing Map-Reduce logic and `chunkSize` handling.

**Step 3: Update `src/lib/ai/summary-service.ts`**

Update `EmailForSummary` and `AiSummarizeOptions` to include `bodyText` and `chunkSize`.
Implement `cleanTextBody` helper and adaptive Map-Reduce flow:
- If `emails.length > (options.chunkSize || 15)`:
  - Split `emails` into chunks of size `options.chunkSize || 15`.
  - Perform Map phase: map each chunk into a chunk summary using `generateSingleBatchSummary`.
  - Perform Reduce phase: synthesize chunk summaries into the final executive summary prompt.
- Else: execute standard single-pass batch summary.

**Step 4: Run test to verify it passes**

Run: `npx jest src/__tests__/lib/ai/summary-service.test.ts`
Expected: PASS all tests.

**Step 5: Commit**

```bash
git add src/lib/ai/summary-service.ts src/__tests__/lib/ai/summary-service.test.ts
git commit -m "feat(ai): add adaptive Map-Reduce chunking and body cleaning to summary service"
```

---

### Task 2: Meilisearch Querying with Fallback in Summary Worker

**Files:**
- Modify: `src/lib/queue/workers/summary.ts`
- Create/Modify Test: `src/__tests__/lib/queue/summary-worker.test.ts`

**Step 1: Write failing test for Meilisearch retrieval and fallback**

Create `src/__tests__/lib/queue/summary-worker.test.ts` testing:
- Meilisearch search filter constructing `organizationId = "..." AND (labelIds = "..." OR accountId IN [...])`.
- Correct fallback to Prisma query if Meilisearch fails or returns no results.

**Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/lib/queue/summary-worker.test.ts`
Expected: FAIL (file or mock behavior not yet integrated).

**Step 3: Update `src/lib/queue/workers/summary.ts`**

In `executeSummaryRun`:
1. Query Meilisearch using `meilisearch.index('emails').search('', { filter: ..., sort: ['receivedAt:desc'] })`.
2. Extract matching email IDs.
3. If search errors or returns empty list while Prisma has emails, log warning and execute legacy Prisma query.
4. Fetch matching emails and their `body` (`bodyText`) from Prisma using the candidate IDs.
5. Pass emails with `bodyText` to `generateEmailBatchSummary`.

**Step 4: Run test to verify it passes**

Run: `npx jest src/__tests__/lib/queue/summary-worker.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/queue/workers/summary.ts src/__tests__/lib/queue/summary-worker.test.ts
git commit -m "feat(worker): implement Meilisearch querying with DB fallback in email summary worker"
```

---

### Task 3: Full Test Suite Verification

**Files:**
- Test: All unit test suites

**Step 1: Run complete test suite**

Run: `npm test`
Expected: PASS with 0 failures across all unit test suites.

**Step 2: Commit**

```bash
git add .
git commit -m "chore: verify full test suite pass for Meilisearch summary worker"
```
