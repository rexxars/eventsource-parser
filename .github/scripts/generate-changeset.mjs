/**
 * Derives a changeset from the conventional commit in a pull request title.
 *
 * Pull requests are squash merged with the title as the commit message, so the
 * title is the canonical description of the change. This keeps `.changeset/pr-<n>.md`
 * in sync with it: written when the title warrants a release, removed when it no
 * longer does, and left alone the moment a human takes ownership of the changeset.
 *
 * Runs from the base branch under `pull_request_target`, so it never executes or
 * imports anything from the pull request itself.
 */
import {randomUUID} from 'node:crypto'
import {appendFileSync} from 'node:fs'

const {
  GH_TOKEN,
  GITHUB_OUTPUT,
  GITHUB_REPOSITORY,
  PACKAGE_NAME,
  PR_BODY = '',
  PR_HEAD_SHA,
  PR_NUMBER,
  PR_REPO,
  PR_TITLE,
} = process.env

const required = {
  GH_TOKEN,
  GITHUB_OUTPUT,
  GITHUB_REPOSITORY,
  PACKAGE_NAME,
  PR_HEAD_SHA,
  PR_NUMBER,
  PR_REPO,
  PR_TITLE,
}
const missing = Object.keys(required).filter((key) => !required[key])
if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
}

const CHANGESET_FILE = `.changeset/pr-${PR_NUMBER}.md`

/**
 * Marks the file as owned by this script. Delete the line to take it over by
 * hand - the next run will see the marker is gone and stop touching the file.
 */
const AUTO_GENERATED_MARKER = '<!-- auto-generated -->'

/** @param {string} path */
async function ghApi(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {Accept: 'application/vnd.github+json', Authorization: `Bearer ${GH_TOKEN}`},
  })
  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${await res.text()}`)
  }
  return res.json()
}

/** @param {string} key @param {string} value */
function setOutput(key, value) {
  appendFileSync(GITHUB_OUTPUT, `${key}=${value}\n`)
}

/** @param {string} title */
function parseConventionalCommit(title) {
  const match = title.match(/^([a-z]+)(\((.+)\))?(!)?:\s.+/)
  return match ? {breaking: match[4] === '!', type: match[1]} : null
}

/** @param {string} type @param {boolean} breaking @param {string} body */
function determineBump(type, breaking, body) {
  if (breaking) return 'major'
  if (body.split('\n').some((line) => line.startsWith('BREAKING CHANGE:'))) return 'major'
  if (type === 'feat') return 'minor'
  if (['fix', 'perf', 'revert'].includes(type)) return 'patch'
  return null
}

/** Every changed file path in the pull request, following pagination. */
async function getChangedFiles() {
  const files = []
  for (let page = 1; ; page++) {
    const data = await ghApi(
      `/repos/${GITHUB_REPOSITORY}/pulls/${PR_NUMBER}/files?per_page=100&page=${page}`,
    )
    if (data.length === 0) return files
    files.push(...data.map((file) => file.filename))
  }
}

/** Contents of the auto-generated changeset on the pull request branch, if it exists. */
async function getExistingChangeset() {
  const url = `https://api.github.com/repos/${PR_REPO}/contents/${CHANGESET_FILE}?ref=${PR_HEAD_SHA}`
  const res = await fetch(url, {
    headers: {Accept: 'application/vnd.github+json', Authorization: `Bearer ${GH_TOKEN}`},
  })
  if (res.status === 404) return null
  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${await res.text()}`)
  }
  const data = await res.json()
  return Buffer.from(data.content, 'base64').toString()
}

/**
 * Nothing to release. Clean up after ourselves if we wrote a changeset for an
 * earlier version of the title, otherwise there is nothing to do.
 * @param {string | null} existingChangeset
 */
function skipOrRemove(existingChangeset) {
  if (existingChangeset === null) {
    setOutput('action', 'skip')
    return
  }
  setOutput('action', 'remove')
  setOutput('changeset_file', CHANGESET_FILE)
}

const changedFiles = await getChangedFiles()
const existingChangeset = await getExistingChangeset()

if (existingChangeset === null) {
  const manual = changedFiles.filter(
    (file) =>
      file.startsWith('.changeset/') && file.endsWith('.md') && file !== '.changeset/README.md',
  )
  if (manual.length > 0) {
    console.log(`Skipping, the pull request already has a changeset: ${manual.join(', ')}`)
    setOutput('action', 'skip')
    process.exit(0)
  }
} else if (!existingChangeset.startsWith(AUTO_GENERATED_MARKER)) {
  console.log('Skipping, the changeset was edited by hand (marker removed)')
  setOutput('action', 'skip')
  process.exit(0)
}

const parsed = parseConventionalCommit(PR_TITLE)
if (parsed === null) {
  console.log(`::warning::Pull request title is not a conventional commit: ${PR_TITLE}`)
  skipOrRemove(existingChangeset)
  process.exit(0)
}

const bump = determineBump(parsed.type, parsed.breaking, PR_BODY)
if (bump === null) {
  console.log(`\`${parsed.type}\` does not release a new version, no changeset needed`)
  skipOrRemove(existingChangeset)
  process.exit(0)
}

// Keep the full conventional commit title - it is what lands in the changelog
const content = `${AUTO_GENERATED_MARKER}\n---\n'${PACKAGE_NAME}': ${bump}\n---\n\n${PR_TITLE}\n`

console.log(`Generated changeset:\n${content}`)

setOutput('action', 'write')
setOutput('changeset_file', CHANGESET_FILE)
// Random delimiter so a crafted pull request title cannot inject extra outputs
const delimiter = `CHANGESET_EOF_${randomUUID().replaceAll('-', '')}`
appendFileSync(GITHUB_OUTPUT, `changeset_content<<${delimiter}\n${content}${delimiter}\n`)
