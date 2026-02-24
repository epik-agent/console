import { execFile } from 'child_process'
import type { IssueEdge, IssueGraph, IssueNode } from '../client/types.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** CI check rollup state as reported by gh. */
export type ChecksState = 'success' | 'failure' | 'pending'

/** Result of inspecting a PR associated with a GitHub issue. */
export interface PRStatus {
  /** PR number on GitHub. */
  prNumber: number
  /** Aggregated CI check state. */
  checksState: ChecksState
  /** Whether the PR branch can be cleanly merged. */
  mergeable: boolean
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** Raw GitHub issue shape returned by `gh api /repos/.../issues`. */
interface RawIssue {
  number: number
  title: string
  state: string
  labels: Array<{ name: string }>
  body: string | null
}

/** Raw PR shape returned by `gh api /repos/.../pulls`. */
interface RawPR {
  number: number
  body: string | null
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN' | null
  statusCheckRollup: { state: string } | null
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const TYPE_LABELS = new Set(['Feature', 'Task', 'Bug'])

/**
 * Parse dependency issue numbers from an issue body.
 *
 * Recognizes two conventions:
 *
 * 1. A `## Blocked by` section containing lines of the form `- #N`.
 *    Stops at the next `##` heading.
 *
 * 2. An inline `**Depends on:**` line containing `#N` references anywhere
 *    on the same line, e.g. `**Depends on:** #4 (agent skeleton), #1 (schema)`.
 */
function parseBlockedBy(body: string | null): number[] {
  if (!body) return []

  const blockedBy: number[] = []
  let inSection = false

  for (const line of body.split('\n')) {
    const trimmed = line.trim()

    if (/^##\s+blocked\s+by/i.test(trimmed)) {
      inSection = true
      continue
    }

    if (inSection) {
      if (/^##/.test(trimmed)) break // next heading — stop

      const match = trimmed.match(/^-\s+#(\d+)/)
      if (match) {
        blockedBy.push(parseInt(match[1], 10))
      }
      continue
    }

    // Inline "**Depends on:**" convention: extract all #N references on the line
    if (/^\*\*depends\s+on:\*\*/i.test(trimmed)) {
      for (const m of trimmed.matchAll(/#(\d+)/g)) {
        blockedBy.push(parseInt(m[1], 10))
      }
    }
  }

  return blockedBy
}

/**
 * Extract the recognized type label from a list of labels, or null.
 */
function parseType(labels: Array<{ name: string }>): IssueNode['type'] {
  for (const label of labels) {
    if (TYPE_LABELS.has(label.name)) {
      return label.name as IssueNode['type']
    }
  }
  return null
}

/**
 * Promisified wrapper around execFile for the `gh` CLI.
 *
 * Exported so tests can spy on it or inject a replacement via the `exec`
 * parameter of the public API functions.
 */
export function runGhCommand(args: string[], bin = 'gh'): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) {
        reject(err)
      } else {
        resolve(stdout)
      }
    })
  })
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load the issue dependency graph for a GitHub repository.
 *
 * Calls `gh api /repos/{owner}/{repo}/issues?state=open&per_page=100` and
 * parses each issue body for dependency references to build the graph.
 *
 * @param owner - GitHub organization or user name.
 * @param repo  - Repository name.
 * @param exec  - Optional override for the gh runner (used in tests).
 * @returns     The resolved issue dependency graph.
 */
export async function loadIssueGraph(
  owner: string,
  repo: string,
  exec: (args: string[]) => Promise<string> = runGhCommand,
): Promise<IssueGraph> {
  const raw = await exec([
    'api',
    `/repos/${owner}/${repo}/issues`,
    '--method',
    'GET',
    '-f',
    'state=open',
    '-f',
    'per_page=100',
  ])

  const issues: RawIssue[] = JSON.parse(raw)

  const nodes: IssueNode[] = issues.map((issue) => ({
    number: issue.number,
    title: issue.title,
    state: issue.state as 'open' | 'closed',
    type: parseType(issue.labels),
    external: false,
    blockedBy: parseBlockedBy(issue.body),
  }))

  const edges: IssueEdge[] = nodes.flatMap((n) =>
    n.blockedBy.map((blocker) => ({ source: blocker, target: n.number })),
  )

  return { nodes, edges }
}

/**
 * Find the PR associated with a GitHub issue and return its CI status.
 *
 * Uses `gh api /repos/{owner}/{repo}/pulls` to list open PRs and matches
 * by issue number referenced in the PR body.
 *
 * Returns `null` if no open PR is found for the given issue.
 *
 * @param owner       - GitHub organization or user name.
 * @param repo        - Repository name.
 * @param issueNumber - The issue number to look up.
 * @param exec        - Optional override for the gh runner (used in tests).
 */
export async function getPRStatus(
  owner: string,
  repo: string,
  issueNumber: number,
  exec: (args: string[]) => Promise<string> = runGhCommand,
): Promise<PRStatus | null> {
  const raw = await exec([
    'api',
    `/repos/${owner}/${repo}/pulls`,
    '--method',
    'GET',
    '-f',
    'state=open',
    '-f',
    'per_page=100',
  ])

  const prs: RawPR[] = JSON.parse(raw)

  const issueRef = new RegExp(
    `(closes|fixes|resolves|close|fix|resolve)\\s+#${issueNumber}\\b`,
    'i',
  )

  const pr = prs.find((p) => p.body && issueRef.test(p.body))

  if (!pr) return null

  let checksState: ChecksState
  const rollupState = pr.statusCheckRollup?.state?.toUpperCase()
  if (rollupState === 'SUCCESS') {
    checksState = 'success'
  } else if (rollupState === 'FAILURE' || rollupState === 'ERROR') {
    checksState = 'failure'
  } else {
    checksState = 'pending'
  }

  return {
    prNumber: pr.number,
    checksState,
    mergeable: pr.mergeable === 'MERGEABLE',
  }
}
