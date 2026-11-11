# Automatic releases from main

## Goal

Publish a versioned Mailhub Docker image and GitHub Release when code reaches `main`. The release workflow selects a SemVer bump from Conventional Commit messages and publishes AMD64 and ARM64 images behind one version tag.

## Release policy

The workflow runs on every push to `main`. It reads commits since the previous release tag and selects the highest bump in that range.

- `feat` selects a minor bump.
- `fix` and other commit types select a patch bump.
- `!` or a `BREAKING CHANGE:` footer selects a major bump.

The workflow starts from package version `0.1.13`. The repository has no `v0.1.13` Git tag, so the first run creates that baseline tag on commit `485a3f24eda43d08c42412be7a7268e0fe1a38ec`, which contains the `0.1.13` release files. Later runs use the previous release tag. The workflow does not classify old commits before this baseline.

## Workflow shape

One workflow listens for pushes to `main` and runs three jobs in order.

1. **Prepare the release.** Fetch the latest `main` and tags, classify commits since the previous release, update `package.json`, `package-lock.json`, `docker-compose.yml`, `README.md`, and `CHANGELOG.md`, then create an annotated `vX.Y.Z` tag and push the version commit and tag atomically.
2. **Publish the image.** Build `linux/amd64` and `linux/arm64` with Buildx. Push a multi-platform `kawing11a/mailhub:X.Y.Z` tag and update `latest` to the same manifest.
3. **Create the GitHub Release.** Attach generated release notes for the commit range to the matching version tag.

The prepare job passes the version, source commit, and generated notes to later jobs as workflow outputs. Docker login reads `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` repository secrets. The workflow needs `contents: write` to commit release metadata, create the tag, and publish the GitHub Release.

## Retry and concurrency

The workflow queues main-push runs instead of canceling an earlier pending release. It reads the current branch tip when a run starts and includes all commits after the latest release tag. A release commit records its source commit and workflow run ID. A rerun finds that release and resumes the image or GitHub Release step without selecting another version.

The workflow checks that an existing version tag points to the expected release commit. A conflicting tag or image fails with an error instead of overwriting a published version. It uses a normal atomic push and never force-pushes `main`. If branch rules prevent the workflow token from pushing, the run reports the required repository permission or branch-rule change.

The workflow uses `GITHUB_TOKEN` for the release commit and tag. Those pushes do not start another workflow run, so the same run continues through image publishing and GitHub Release creation.

## Release notes

The workflow generates release notes from commits after the previous release tag. It inserts those notes into a dated `CHANGELOG.md` section and uses the same notes for the GitHub Release. Commit text is passed through files or action inputs, not interpolated into shell source.

## Design choice

The selected design uses one workflow file with separate prepare, publish, and release jobs. A reusable publisher workflow was also considered. The single workflow keeps the release in one run and avoids a tag-triggered workflow dependency. The reusable workflow would separate Docker credentials more sharply, but adds another workflow file and input contract.

Two design candidates were compared. The single-workflow candidate provided concrete retry, queueing, and atomic-push rules. The split-workflow candidate helped keep Docker credentials scoped to image publishing. The final design uses the single workflow and keeps Docker login only in the publish job. A separate cross-judge was skipped because no agent slot could be freed in this Codex session.

## Acceptance criteria

- A push to `main` runs the workflow without a manual dispatch.
- `feat` commits produce a minor bump, `fix` and other commit types produce a patch bump, and breaking markers produce a major bump.
- The first release starts at `0.1.13` without reclassifying commits before `485a3f24eda43d08c42412be7a7268e0fe1a38ec`.
- The workflow updates the package version, Compose image pins, README examples, and changelog entry together.
- Docker Hub receives one version tag with AMD64 and ARM64 manifests, plus `latest`.
- The GitHub Release uses the same version and generated notes.
- Re-running a partially completed release reuses its version and completes the missing publication steps.
