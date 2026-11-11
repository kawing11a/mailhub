import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASELINE_VERSION = "0.1.13";
const BASELINE_TAG = `v${BASELINE_VERSION}`;
const BASELINE_COMMIT = "485a3f24eda43d08c42412be7a7268e0fe1a38ec";
const RELEASE_FILES = [
  "package.json",
  "package-lock.json",
  "docker-compose.yml",
  "README.md",
  "CHANGELOG.md",
];
const RUN_ID = process.env.GITHUB_RUN_ID;
const OUTPUT_FILE = process.env.GITHUB_OUTPUT;
const NOTES_FILE = join(process.env.RUNNER_TEMP ?? ".", "release-notes.md");

function git(args, options = {}) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    }).trimEnd();
  } catch (error) {
    if (error.stderr) error.message += `\n${error.stderr.toString()}`;
    throw error;
  }
}

function fail(message) {
  throw new Error(message);
}

function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (!match) fail(`Unsupported package version: ${value}`);
  return match.slice(1).map(Number);
}

function compareVersions(left, right) {
  const a = parseVersion(left.replace(/^v/, ""));
  const b = parseVersion(right.replace(/^v/, ""));
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function bumpVersion(version, level) {
  const [major, minor, patch] = parseVersion(version);
  if (level === "major") return `${major + 1}.0.0`;
  if (level === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function getPackageVersion() {
  return JSON.parse(readFileSync("package.json", "utf8")).version;
}

function getTagCommit(tag) {
  try {
    return git(["rev-parse", `${tag}^{commit}`]);
  } catch {
    return null;
  }
}

function getVersionTags() {
  const remoteTags = getRemoteTags();
  return git(["tag", "--list", "v[0-9]*", "--sort=-v:refname"])
    .split(/\r?\n/)
    .filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag))
    .filter((tag) => {
      if (tag === BASELINE_TAG) return getTagCommit(tag) === BASELINE_COMMIT;
      return remoteTags.get(tag) === getTagCommit(tag);
    });
}

function getRemoteTags() {
  const output = git(["ls-remote", "--tags", "origin", "refs/tags/v*"]);
  const tags = new Map();
  for (const line of output.split(/\r?\n/).filter(Boolean)) {
    const [sha, ref] = line.split(/\s+/);
    const tag = ref.replace(/\^\{\}$/, "").replace(/^refs\/tags\//, "");
    tags.set(tag, sha);
  }
  return tags;
}

function pruneUnpublishedVersionTags() {
  const remoteTags = getRemoteTags();
  for (const tag of git(["tag", "--list", "v[0-9]*"]).split(/\r?\n/).filter(Boolean)) {
    if (tag !== BASELINE_TAG && !remoteTags.has(tag)) git(["tag", "-d", tag]);
  }
}

function getLatestVersionTag() {
  return getVersionTags().sort((left, right) => compareVersions(right, left))[0] ?? null;
}

function ensureBaselineTag() {
  const remoteTag = getRemoteTags().get(BASELINE_TAG);
  const existingCommit = getTagCommit(BASELINE_TAG);
  if (existingCommit) {
    if (existingCommit !== BASELINE_COMMIT) {
      fail(`${BASELINE_TAG} points to ${existingCommit}, expected ${BASELINE_COMMIT}`);
    }
    if (remoteTag && remoteTag !== BASELINE_COMMIT) {
      fail(`${BASELINE_TAG} on origin points to ${remoteTag}, expected ${BASELINE_COMMIT}`);
    }
    return !remoteTag;
  }
  if (remoteTag && remoteTag !== BASELINE_COMMIT) {
    fail(`${BASELINE_TAG} on origin points to ${remoteTag}, expected ${BASELINE_COMMIT}`);
  }

  const releasePackage = JSON.parse(git(["show", `${BASELINE_COMMIT}:package.json`]));
  if (releasePackage.version !== BASELINE_VERSION) {
    fail(`Baseline commit has package version ${releasePackage.version}, expected ${BASELINE_VERSION}`);
  }

  git([
    "tag",
    "-a",
    BASELINE_TAG,
    BASELINE_COMMIT,
    "-m",
    `Mailhub ${BASELINE_TAG} baseline`,
  ]);
  return !remoteTag;
}

function parseTrailers(message) {
  return Object.fromEntries(
    message
      .split(/\r?\n/)
      .map((line) => /^([A-Za-z][A-Za-z-]*):\s*(.+)$/.exec(line))
      .filter(Boolean)
      .map(([, key, value]) => [key.toLowerCase(), value]),
  );
}

function findRunRelease(runId) {
  for (const tag of getVersionTags()) {
    const commit = getTagCommit(tag);
    if (!commit) continue;
    const trailers = parseTrailers(git(["show", "-s", "--format=%B", commit]));
    if (trailers["release-run-id"] === runId) {
      if (trailers["release-version"] !== tag) {
        fail(`Release tag ${tag} has mismatched release metadata`);
      }
      return { tag, commit, trailers };
    }
  }
  return null;
}

function readCommits(range) {
  const output = git(["log", "--reverse", "--format=%H%x1f%s%x1f%b%x1e", range]);
  return output
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [sha, subject, ...body] = record.split("\x1f");
      return { sha, subject: subject.trim(), body: body.join("\x1f").trim() };
    });
}

function commitBump(commit) {
  if (/BREAKING CHANGE:/m.test(commit.body)) return "major";
  const match = /^([a-z][a-z0-9-]*)(?:\([^\n)]*\))?(!)?:/i.exec(commit.subject);
  if (match?.[2]) return "major";
  return match?.[1].toLowerCase() === "feat" ? "minor" : "patch";
}

const bumpRank = { patch: 1, minor: 2, major: 3 };

function selectBump(commits) {
  return commits.reduce(
    (selected, commit) => {
      const candidate = commitBump(commit);
      return bumpRank[candidate] > bumpRank[selected] ? candidate : selected;
    },
    "patch",
  );
}

function displaySubject(subject) {
  return subject.replace(/^[a-z][a-z0-9-]*(?:\([^)]*\))?!?:\s*/i, "").trim() || subject;
}

function formatNotes(commits) {
  const sections = new Map([
    ["Added", []],
    ["Fixed", []],
    ["Changed", []],
  ]);

  for (const commit of commits) {
    if (/^chore\(release\):/i.test(commit.subject)) continue;
    const type = /^([a-z][a-z0-9-]*)(?:\([^)]*\))?!?:/i.exec(commit.subject)?.[1]?.toLowerCase();
    const section = type === "feat" ? "Added" : type === "fix" ? "Fixed" : "Changed";
    sections.get(section).push(`- ${displaySubject(commit.subject).replace(/[\r\n]+/g, " ")}`);
  }

  return [...sections]
    .filter(([, entries]) => entries.length > 0)
    .map(([name, entries]) => `### ${name}\n\n${entries.join("\n")}`)
    .join("\n\n");
}

function addChangelogEntry(version, notes) {
  const changelog = readFileSync("CHANGELOG.md", "utf8");
  const heading = `## [${version}] - ${new Date().toISOString().slice(0, 10)}`;
  const nextChangelog = changelog.replace(
    /^(# Changelog\r?\n)/,
    (header) => `${header}\n${heading}\n\n${notes}\n\n`,
  );
  if (nextChangelog === changelog) fail("Could not find the CHANGELOG.md heading");
  writeFileSync("CHANGELOG.md", nextChangelog);
}

function replaceCurrentVersion(file, oldVersion, newVersion) {
  const content = readFileSync(file, "utf8");
  if (!content.includes(oldVersion)) fail(`${file} does not contain current version ${oldVersion}`);
  writeFileSync(file, content.replaceAll(oldVersion, newVersion));
}

function notesFromReleaseCommit(commit, version) {
  const changelog = git(["show", `${commit}:CHANGELOG.md`]);
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith(`## [${version}] - `));
  if (start === -1) fail(`Could not find changelog notes for ${version}`);
  const next = lines.findIndex((line, index) => index > start && line.startsWith("## ["));
  return lines.slice(start + 1, next === -1 ? lines.length : next).join("\n").trim();
}

function writeOutputs({ tag, commit, sourceSha, previousTag, updateLatest, notes }) {
  writeFileSync(NOTES_FILE, `${notes}\n`);
  appendFileSync(
    OUTPUT_FILE,
    [
      `version=${tag.slice(1)}`,
      `tag=${tag}`,
      `release_commit=${commit}`,
      `source_sha=${sourceSha}`,
      `previous_tag=${previousTag}`,
      `update_latest=${updateLatest}`,
      "release_required=true",
      `notes_file=${NOTES_FILE}`,
    ].join("\n") + "\n",
  );
}

function pushRelease({ commit, tag, baselineTagCreated }) {
  const refs = [`${commit}:refs/heads/main`, `refs/tags/${tag}`];
  if (baselineTagCreated) refs.push(`refs/tags/${BASELINE_TAG}`);
  git(["push", "--atomic", "origin", ...refs]);
}

function makeRelease(runId) {
  git(["fetch", "origin", "main", "--tags"]);
  git(["reset", "--hard", "origin/main"]);
  git(["config", "user.name", "github-actions[bot]"]);
  git(["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
  const baselineTagCreated = ensureBaselineTag();
  const existing = findRunRelease(runId);

  if (existing) {
    const previousTag = parseTrailers(git(["show", "-s", "--format=%B", existing.commit]))["previous-tag"];
    if (!previousTag || !getTagCommit(previousTag)) fail(`Release ${existing.tag} has no valid previous tag`);
    const notes = notesFromReleaseCommit(existing.commit, existing.tag.slice(1));
    const newest = getLatestVersionTag();
    writeOutputs({
      ...existing,
      sourceSha: existing.trailers["source-commit"],
      previousTag,
      updateLatest: newest === existing.tag,
      notes,
    });
    if (baselineTagCreated) git(["push", "origin", `refs/tags/${BASELINE_TAG}`]);
    return;
  }

  const previousTag = getLatestVersionTag();
  if (!previousTag) fail("No release baseline tag exists");
  const currentVersion = getPackageVersion();
  if (`v${currentVersion}` !== previousTag) {
    fail(`package.json is ${currentVersion}, but the latest release tag is ${previousTag}`);
  }

  const sourceSha = git(["rev-parse", "origin/main"]);
  const commits = readCommits(`${previousTag}..${sourceSha}`);
  if (commits.length === 0) {
    if (baselineTagCreated) git(["push", "origin", `refs/tags/${BASELINE_TAG}`]);
    appendFileSync(OUTPUT_FILE, "release_required=false\n");
    return;
  }

  const bump = selectBump(commits);
  const version = bumpVersion(currentVersion, bump);
  const tag = `v${version}`;
  if (getTagCommit(tag)) fail(`Refusing to overwrite existing release tag ${tag}`);
  const notes = formatNotes(commits);
  if (!notes) fail(`No release notes were generated for ${tag}`);

  execFileSync("npm", ["version", bump, "--no-git-tag-version"], {
    stdio: "inherit",
  });
  for (const file of ["docker-compose.yml", "README.md"]) {
    replaceCurrentVersion(file, currentVersion, version);
  }
  addChangelogEntry(version, notes);

  git(["add", ...RELEASE_FILES]);
  git([
    "commit",
    "-m",
    `chore(release): prepare ${tag}`,
    "-m",
    `Source-Commit: ${sourceSha}\nRelease-Run-Id: ${runId}\nRelease-Version: ${tag}\nPrevious-Tag: ${previousTag}`,
  ]);
  const releaseCommit = git(["rev-parse", "HEAD"]);
  git([
    "tag",
    "-a",
    tag,
    releaseCommit,
    "-m",
    `Mailhub ${tag}\n\nSource-Commit: ${sourceSha}\nRelease-Run-Id: ${runId}`,
  ]);
  pushRelease({ commit: releaseCommit, tag, baselineTagCreated });
  writeOutputs({
    tag,
    commit: releaseCommit,
    sourceSha,
    previousTag,
    updateLatest: true,
    notes,
  });
}

if (!RUN_ID || !OUTPUT_FILE) {
  fail("GITHUB_RUN_ID and GITHUB_OUTPUT are required");
}

let lastError;
for (let attempt = 1; attempt <= 3; attempt += 1) {
  try {
    makeRelease(RUN_ID);
    process.exit(0);
  } catch (error) {
    lastError = error;
    if (attempt === 3) break;
    try {
      git(["fetch", "origin", "main", "--tags"]);
      pruneUnpublishedVersionTags();
      git(["reset", "--hard", "origin/main"]);
    } catch {
      break;
    }
  }
}

console.error(lastError?.stack ?? lastError);
process.exit(1);
