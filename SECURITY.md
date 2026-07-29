# Security Policy

MailHub takes the security of our application, user data, and email integrations seriously. We appreciate the efforts of security researchers and community members who help keep MailHub safe for everyone.

---

## Supported Versions

Only the latest release family receives security updates and patches.

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1.0 | :x:                |

---

## Reporting a Vulnerability

If you discover a security vulnerability within MailHub, please follow responsible disclosure practices:

1. **Do NOT open a public GitHub issue** for security vulnerabilities.
2. Email your findings privately to **`security@mailhub.app`** or contact project maintainers via private communication channels / GitHub Security Advisories.
3. Include the following details in your report:
   - Type of vulnerability (e.g. XSS, SQLi, Auth Bypass, Credential Exposure)
   - Step-by-step instructions or proof-of-concept (PoC) script to reproduce the issue
   - Affected components, endpoints, or dependencies
   - Potential impact of the issue

### What to Expect
- **Acknowledgement**: We will acknowledge receipt of your report within **48 hours**.
- **Assessment**: We will investigate and assess the vulnerability severity within **5 business days**.
- **Fix & Patch**: If confirmed, we will release a security patch update and publish a GitHub Security Advisory crediting your disclosure.

---

## Built-In Security Features

MailHub includes several defense-in-depth security measures out of the box:

- 🔒 **Credential Encryption at Rest**: IMAP/SMTP passwords and OAuth refresh tokens are encrypted in PostgreSQL using AES-256-GCM encryption (`lib/crypto.ts`).
- 🔑 **Stateless JWT Session Management**: Authentication tokens are signed using strong cryptographic algorithms (`jose`) with HTTP-only cookies.
- 🛡️ **Multi-Tenant Isolation**: Database queries enforce organization ID workspace boundaries across all user data.
- 🐳 **Isolated Container Deployment**: Worker processes run as unprivileged services inside Docker containers.

Thank you for helping keep MailHub and its community secure!
