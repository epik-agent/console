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

/** Raw PR shape returned by `gh api /repos/.../pulls`. */
interface RawPR {
  number: number
  body: string | null
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN' | null
  statusCheckRollup: { state: string } | null
}

/** Raw issue node shape returned by the GraphQL query. */
interface GqlIssueNode {
  number: number
  title: string
  state: string
  labels: { nodes: Array<{ name: string }> }
  blockedBy: { nodes: Array<{ number: number }> }
}

/** Shape of the GraphQL response from the repository query. */
interface GqlResponse {
  data: {
    repository: {
      issues: { nodes: GqlIssueNode[] }
      projectsV2: { totalCount: number }
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const TYPE_LABELS = new Set(['Feature', 'Task', 'Bug'])

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

const ISSUES_QUERY = `
query($owner: String!, $repo: String!) {
  repository(owner: $owner, name: $repo) {
    issues(first: 100, states: [OPEN]) {
      nodes {
        number
        title
        state
        labels(first: 10) { nodes { name } }
        blockedBy(first: 50) { nodes { number } }
      }
    }
    projectsV2(first: 1) {
      totalCount
    }
  }
}
`.trim()

/**
 * Load the issue dependency graph for a GitHub repository.
 *
 * Uses a single GraphQL query to fetch all open issues and their native
 * GitHub "blocked by" relationships in one round trip.
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
    'graphql',
    '-f',
    `query=${ISSUES_QUERY}`,
    '-f',
    `owner=${owner}`,
    '-f',
    `repo=${repo}`,
  ])

  const response: GqlResponse = JSON.parse(raw)
  const { issues, projectsV2 } = response.data.repository

  const nodes: IssueNode[] = issues.nodes.map((issue) => ({
    number: issue.number,
    title: issue.title,
    state: issue.state.toLowerCase() as 'open' | 'closed',
    type: parseType(issue.labels.nodes),
    external: false,
  }))

  const edges: IssueEdge[] = issues.nodes.flatMap((issue) =>
    issue.blockedBy.nodes.map((blocker) => ({ source: blocker.number, target: issue.number })),
  )

  const result: IssueGraph = { nodes, edges }

  if (projectsV2.totalCount === 0) {
    result.warning =
      'This repository has no linked GitHub Project. Dependency tracking may be incomplete.'
  }

  return result
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
