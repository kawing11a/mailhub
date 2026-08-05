# Custom IMAP & SMTP Credential Testing Design

## Overview
This feature introduces a mandatory credential testing step for connecting Custom IMAP & SMTP email accounts. Users must test their incoming (IMAP) and outgoing (SMTP) server credentials before adding the account to the system. Any changes to credential or host fields will reset the test verification state, requiring a new successful test.

## Key Requirements
1. **Mandatory Testing**: The "Connect Account" button remains disabled until credentials are tested and verified.
2. **Dynamic Reset**: Editing any connection parameter (`imapHost`, `imapPort`, `smtpHost`, `smtpPort`, `username`, `password`, `emailAddress`) automatically resets the verification status to `untested`.
3. **Granular Feedback**: Display distinct status and error messages for IMAP and SMTP connections.

## Architecture & Components

### 1. Backend: Unsaved Credentials Test API
- **Route**: `POST /api/accounts/test-credentials`
- **Auth**: Admin authentication required.
- **Request Body**:
  ```json
  {
    "emailAddress": "user@example.com",
    "username": "user@example.com",
    "password": "secretpassword",
    "imapHost": "imap.example.com",
    "imapPort": 993,
    "imapSecure": true,
    "smtpHost": "smtp.example.com",
    "smtpPort": 465,
    "smtpSecure": true
  }
  ```
- **Logic**:
  - Test IMAP via `ImapFlow.connect()` and `.logout()`.
  - Test SMTP via `nodemailer.createTransport().verify()`.
- **Response**:
  ```json
  {
    "ok": true,
    "imap": true,
    "smtp": true,
    "imapError": null,
    "smtpError": null
  }
  ```

### 2. Frontend: `AddAccountModal` Enhancement
- **State**:
  - `testStatus`: `'idle' | 'testing' | 'success' | 'error'`
  - `testResult`: `{ imap: boolean; smtp: boolean; imapError?: string; smtpError?: string } | null`
- **Form Watcher**:
  - Watches `imapHost`, `imapPort`, `smtpHost`, `smtpPort`, `username`, `password`, `emailAddress`.
  - Resets `testStatus` to `'idle'` when any watched field changes.
- **Controls**:
  - **"Test Credentials"** button to trigger test mutation.
  - **"Connect Account"** submit button disabled unless `testStatus === 'success'`.
- **Feedback UI**:
  - Inline alerts showing success checkmark or specific IMAP/SMTP error messages.

## Verification Strategy
- Test the `POST /api/accounts/test-credentials` API route.
- Test `AddAccountModal` UI state changes and disabled states.
- Run `npm run build` and Jest tests to verify compilation and test suite passing.
