import { describe, it, expect, vi } from 'vitest'
import { loadIssueGraph, getPRStatus } from '../server/github.ts'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Minimal gh api /repos/.../issues response shape */
const ISSUE_FIXTURE = [
  {
    number: 1,
    title: 'Root feature',
    state: 'open',
    labels: [{ name: 'Feature' }],
    body: '## Overview\n\nA root feature with no dependencies.',
  },
  {
    number: 2,
    title: 'Blocked task',
    state: 'open',
    labels: [{ name: 'Task' }],
    body: '## Overview\n\nA task.\n\n## Blocked by\n\n- #1\n',
  },
  {
    number: 3,
    title: 'Multi-blocked task',
    state: 'open',
    labels: [{ name: 'Bug' }],
    body: '## Blocked by\n\n- #1\n- #2\n',
  },
  {
    number: 4,
    title: 'No type label',
    state: 'open',
    labels: [],
    body: null,
  },
  {
    number: 5,
    title: 'Unlabelled with body',
    state: 'open',
    labels: [{ name: 'enhancement' }],
    body: 'Some description with no blocked-by section.',
  },
]

/** PR list fixture for getPRStatus */
const PR_FIXTURE_OPEN = [
  {
    number: 101,
    title: 'Fix issue 2',
    state: 'open',
    headRefName: 'feature/blocked-task-2',
    body: 'Closes #2',
    mergeable: 'MERGEABLE',
    statusCheckRollup: { state: 'SUCCESS' },
  },
]

const PR_FIXTURE_FAILING = [
  {
    number: 102,
    title: 'Fix issue 3',
    state: 'open',
    headRefName: 'feature/multi-blocked-3',
    body: 'Closes #3',
    mergeable: 'CONFLICTING',
    statusCheckRollup: { state: 'FAILURE' },
  },
]

const PR_FIXTURE_PENDING = [
  {
    number: 103,
    title: 'Fix issue 1',
    state: 'open',
    headRefName: 'feature/root-feature-1',
    body: 'Closes #1',
    mergeable: 'MERGEABLE',
    statusCheckRollup: null,
  },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a mock exec function that resolves with the serialised fixture. */
function makeExec(fixture: object[]): (args: string[]) => Promise<string> {
  return vi.fn().mockResolvedValue(JSON.stringify(fixture))
}

/** Build a mock exec function that rejects with the given error. */
function makeExecError(err: Error): (args: string[]) => Promise<string> {
  return vi.fn().mockRejectedValue(err)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('github', () => {
  // -------------------------------------------------------------------------
  // loadIssueGraph
  // -------------------------------------------------------------------------

  describe('loadIssueGraph', () => {
    it('returns an IssueGraph with nodes for each open issue', async () => {
      const graph = await loadIssueGraph('owner', 'repo', makeExec(ISSUE_FIXTURE))
      expect(graph.nodes).toHaveLength(ISSUE_FIXTURE.length)
    })

    it('sets the correct issue number and title on each node', async () => {
      const graph = await loadIssueGraph('owner', 'repo', makeExec(ISSUE_FIXTURE))
      const node1 = graph.nodes.find((n) => n.number === 1)
      expect(node1?.title).toBe('Root feature')
      expect(node1?.state).toBe('open')
    })

    it('parses a single "Blocked by" dependency', async () => {
      const graph = await loadIssueGraph('owner', 'repo', makeExec(ISSUE_FIXTURE))
      const node2 = graph.nodes.find((n) => n.number === 2)
      expect(node2?.blockedBy).toEqual([1])
    })

    it('parses multiple "Blocked by" dependencies', async () => {
      const graph = await loadIssueGraph('owner', 'repo', makeExec(ISSUE_FIXTURE))
      const node3 = graph.nodes.find((n) => n.number === 3)
      expect(node3?.blockedBy).toEqual([1, 2])
    })

    it('returns empty blockedBy array when no dependencies are listed', async () => {
      const graph = await loadIssueGraph('owner', 'repo', makeExec(ISSUE_FIXTURE))
      const node1 = graph.nodes.find((n) => n.number === 1)
      expect(node1?.blockedBy).toEqual([])
    })

    it('returns empty blockedBy when body is null', async () => {
      const graph = await loadIssueGraph('owner', 'repo', makeExec(ISSUE_FIXTURE))
      const node4 = graph.nodes.find((n) => n.number === 4)
      expect(node4?.blockedBy).toEqual([])
    })

    it('maps Feature label to type "Feature"', async () => {
      const graph = await loadIssueGraph('owner', 'repo', makeExec(ISSUE_FIXTURE))
      expect(graph.nodes.find((n) => n.number === 1)?.type).toBe('Feature')
    })

    it('maps Task label to type "Task"', async () => {
      const graph = await loadIssueGraph('owner', 'repo', makeExec(ISSUE_FIXTURE))
      expect(graph.nodes.find((n) => n.number === 2)?.type).toBe('Task')
    })

    it('maps Bug label to type "Bug"', async () => {
      const graph = await loadIssueGraph('owner', 'repo', makeExec(ISSUE_FIXTURE))
      expect(graph.nodes.find((n) => n.number === 3)?.type).toBe('Bug')
    })

    it('sets type to null when no recognised label is present', async () => {
      const graph = await loadIssueGraph('owner', 'repo', makeExec(ISSUE_FIXTURE))
      expect(graph.nodes.find((n) => n.number === 4)?.type).toBeNull()
      expect(graph.nodes.find((n) => n.number === 5)?.type).toBeNull()
    })

    it('sets external to false for all nodes by default', async () => {
      const graph = await loadIssueGraph('owner', 'repo', makeExec(ISSUE_FIXTURE))
      for (const node of graph.nodes) {
        expect(node.external).toBe(false)
      }
    })

    it('calls gh api with the correct endpoint', async () => {
      const exec = vi
        .fn<(args: string[]) => Promise<string>>()
        .mockResolvedValue(JSON.stringify([]))
      await loadIssueGraph('myorg', 'myrepo', exec)
      const [args] = exec.mock.calls[0]
      expect(args).toContain('/repos/myorg/myrepo/issues')
      expect(args.join(' ')).toContain('state=open')
    })

    it('handles an empty issues list', async () => {
      const graph = await loadIssueGraph('owner', 'repo', makeExec([]))
      expect(graph.nodes).toHaveLength(0)
    })

    it('rejects on gh cli error', async () => {
      const exec = makeExecError(new Error('gh: not found'))
      await expect(loadIssueGraph('owner', 'repo', exec)).rejects.toThrow('gh: not found')
    })
  })

  // -------------------------------------------------------------------------
  // getPRStatus
  // -------------------------------------------------------------------------

  describe('getPRStatus', () => {
    it('returns null when no PR is associated with the issue', async () => {
      const result = await getPRStatus('owner', 'repo', 99, makeExec([]))
      expect(result).toBeNull()
    })

    it('returns checksState "success" when CI is green and branch is mergeable', async () => {
      const result = await getPRStatus('owner', 'repo', 2, makeExec(PR_FIXTURE_OPEN))
      expect(result).not.toBeNull()
      expect(result?.checksState).toBe('success')
      expect(result?.mergeable).toBe(true)
    })

    it('returns checksState "failure" and mergeable false when CI fails and branch conflicts', async () => {
      const result = await getPRStatus('owner', 'repo', 3, makeExec(PR_FIXTURE_FAILING))
      expect(result?.checksState).toBe('failure')
      expect(result?.mergeable).toBe(false)
    })

    it('returns checksState "pending" when statusCheckRollup is null', async () => {
      const result = await getPRStatus('owner', 'repo', 1, makeExec(PR_FIXTURE_PENDING))
      expect(result?.checksState).toBe('pending')
    })

    it('includes prNumber in the result', async () => {
      const result = await getPRStatus('owner', 'repo', 2, makeExec(PR_FIXTURE_OPEN))
      expect(result?.prNumber).toBe(101)
    })
  })
})
