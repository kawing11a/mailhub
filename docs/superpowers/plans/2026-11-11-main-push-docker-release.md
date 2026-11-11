# Main push Docker release implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Release a SemVer-tagged multi-platform Mailhub image and GitHub Release from pushes to `main`.

**Architecture:** A Node release helper owns commit classification, version file updates, generated notes, and retry identity. One GitHub Actions workflow runs release preparation, Docker publishing, and GitHub Release creation in sequence.

**Tech Stack:** Node.js 20, GitHub Actions, GitHub CLI, Docker Buildx.

## Global Constraints

- `feat` selects a minor bump.
- `fix` and other commit types select a patch bump.
- A breaking-change marker selects a major bump.
- The initial package version is `0.1.13` and its baseline commit is `485a3f24eda43d08c42412be7a7268e0fe1a38ec`.
- Docker publishes a multi-platform version tag for `linux/amd64` and `linux/arm64`.
- Workflow retries reuse a release version already created by that run.
- Do not add or run tests unless the user asks.

---

### Task 1: Add the release preparation helper

**Files:**
- Create: `scripts/prepare-release.mjs`

**Interfaces:**
- Consumes: checked-out Git history, `package.json`, `package-lock.json`, Compose and README image references, `CHANGELOG.md`, `GITHUB_RUN_ID`.
- Produces: GitHub Actions outputs for `version`, `tag`, `sourceSha`, `releaseCommit`, `updateLatest`, and `notesFile`.

- [x] Find or create the `v0.1.13` baseline tag at commit `485a3f24eda43d08c42412be7a7268e0fe1a38ec`; reject a conflicting tag.
- [x] If this run already owns a release tag, reuse it and write the existing release outputs without bumping.
- [x] Read commits after the latest release tag through the fetched `main` tip. Select the strongest bump with breaking change above `feat` above patch.
- [x] Update package version and lockfile with `npm version <major|minor|patch> --no-git-tag-version`.
- [x] Replace the previous Mailhub image version in Compose and current README examples. Add dated commit notes to the top of `CHANGELOG.md`.
- [x] Commit the release files with source SHA and run ID trailers. Create the annotated version tag on that commit.
- [x] Write the workflow output file and notes file without placing commit text inside shell source.

### Task 2: Add the main-push release workflow

**Files:**
- Create: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: pushes to `main`, outputs from `scripts/prepare-release.mjs`, `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`.
- Produces: an atomic version commit and tag on `main`, Docker Hub version and `latest` manifests, and a GitHub Release.

- [x] Trigger on pushes to `main` and queue release runs without canceling pending runs.
- [x] Grant `contents: write` to the release job and keep Docker credentials scoped to the image job.
- [x] Check out current `main`, fetch tags, and run the release preparation helper.
- [x] Push the release commit, baseline tag when first created, and version tag atomically with a bounded retry if `main` advances.
- [x] Set up QEMU and Buildx, log in to Docker Hub, and build/push `linux/amd64` and `linux/arm64` under the version tag and `latest`.
- [x] Create or reuse the GitHub Release with the generated notes after the image exists.

### Task 3: Review the release artifacts

**Files:**
- Review: `.github/workflows/release.yml`
- Review: `scripts/prepare-release.mjs`
- Review: `package.json`, `package-lock.json`, `docker-compose.yml`, `README.md`, `CHANGELOG.md`

- [x] Parse the workflow YAML and run `node --check scripts/prepare-release.mjs`.
- [x] Inspect the diff for shell interpolation, missing workflow permissions, stale image tags, retry behavior, and accidental test changes.
- [x] Do not run the test suite.
