# Contributing to MailHub

Thank you for your interest in contributing to MailHub! We welcome contributions from the community to help improve MailHub's open-source multi-account email management platform.

---

## Code of Conduct

Please be respectful, constructive, and polite in all interactions with fellow contributors, maintainers, and issue reporters.

---

## How to Contribute

### 1. Reporting Bugs & Requesting Features
- **Search existing issues**: Before opening a new issue, please check if the issue or feature request has already been reported.
- **Provide clear details**: When opening a bug report, include reproduction steps, environment info (Node.js version, OS, browser), and relevant error logs.

### 2. Contributing Code

#### Development Setup
1. **Fork & Clone the Repository**
   ```bash
   git clone https://github.com/your-username/mailhub.git
   cd mailhub
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Set Up Environment Variables**
   Copy `.env.example` to `.env` or `.env.local` and configure your local PostgreSQL, Redis, and Meilisearch credentials:
   ```bash
   cp .env.example .env
   ```

4. **Start Local Services**
   Use Docker Compose to launch PostgreSQL, Redis, and Meilisearch:
   ```bash
   npm run services:up
   ```

5. **Run Database Migrations & Seeds**
   ```bash
   npx prisma migrate dev
   npm run db:seed
   ```

6. **Start Development Server & Background Worker**
   In terminal 1:
   ```bash
   npm run dev
   ```
   In terminal 2:
   ```bash
   npm run worker
   ```

#### Branching & Commit Guidelines
- Create a feature branch with a descriptive name from `main`:
  ```bash
  git checkout -b feature/your-feature-name
  # or
  git checkout -b fix/your-bug-fix
  ```
- Keep commits clear, logical, and focused on a single responsibility.
- Write informative commit messages describing the changes made.

#### Testing & Linting
Before submitting a pull request, ensure all tests pass and your code is free of linting errors:
```bash
# Run linting
npm run lint

# Run unit and integration tests
npm run test

# Check build output
npm run build
```

#### Submitting a Pull Request (PR)
1. Push your branch to your forked repository.
2. Open a Pull Request against the `main` branch of the official repository.
3. Provide a detailed PR description referencing any related issues (e.g. `Fixes #123`).
4. Be responsive to review feedback and questions from maintainers.

---

## Project Structure & Architecture Overview

- **Framework**: Next.js 16 (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS v4, Lucide Icons, Geist font
- **Backend & Queue**: Next.js API Routes, Prisma ORM, PostgreSQL, Redis, BullMQ
- **Email Protocols**: Nodemailer (SMTP), ImapFlow (IMAP), Gmail OAuth & API, Microsoft OAuth & Graph API
- **Search & State**: Meilisearch, Zustand, TanStack React Query v5


---

## Financial Contributions & Sponsorship

If you prefer to support MailHub financially rather than through code contributions, you can sponsor the maintainers and project infrastructure through:

- 💖 **[GitHub Sponsors](https://github.com/sponsors/kawing11a)**
- ☕ **[Buy Me a Coffee](https://www.buymeacoffee.com/kawing11a)**

---

## License

By contributing to MailHub, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).
