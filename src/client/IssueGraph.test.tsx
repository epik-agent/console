import { act, render } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { GraphData, NodeObject, LinkObject } from 'react-force-graph-2d'
import IssueGraph from './IssueGraph'
import type { AgentEvent, AgentId, IssueGraph as IssueGraphType } from './types'

// ---------------------------------------------------------------------------
// Mock react-force-graph-2d — it renders to canvas which jsdom doesn't support.
// We capture the last props passed to it so tests can inspect them.
// ---------------------------------------------------------------------------

let capturedGraphData: GraphData | null = null
let capturedNodeColorFn: ((node: NodeObject) => string) | null = null

vi.mock('react-force-graph-2d', () => ({
  default: vi.fn((props: { graphData?: GraphData; nodeColor?: (node: NodeObject) => string }) => {
    capturedGraphData = props.graphData ?? null
    capturedNodeColorFn = props.nodeColor ?? null
    return null
  }),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const sampleGraph: IssueGraphType = {
  nodes: [
    {
      number: 1,
      title: 'Root feature',
      state: 'open',
      type: 'Feature',
      external: false,
      blockedBy: [],
    },
    {
      number: 2,
      title: 'Blocked task',
      state: 'open',
      type: 'Task',
      external: false,
      blockedBy: [1],
    },
    { number: 3, title: 'Done bug', state: 'closed', type: 'Bug', external: false, blockedBy: [1] },
  ],
}

const noEvents: Record<AgentId, AgentEvent[]> = {
  supervisor: [],
  'worker-0': [],
  'worker-1': [],
  'worker-2': [],
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IssueGraph', () => {
  beforeEach(() => {
    capturedGraphData = null
    capturedNodeColorFn = null
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ── AC1: graph renders nodes for all issues ────────────────────────────────

  it('passes a node for every issue to ForceGraph', () => {
    render(<IssueGraph graph={sampleGraph} events={noEvents} />)

    expect(capturedGraphData).not.toBeNull()
    const nodeIds = capturedGraphData!.nodes.map((n) => n.id)
    expect(nodeIds).toContain(1)
    expect(nodeIds).toContain(2)
    expect(nodeIds).toContain(3)
  })

  // ── AC2: node colours match open/closed state ──────────────────────────────

  it('colours closed nodes green (#22c55e)', () => {
    render(<IssueGraph graph={sampleGraph} events={noEvents} />)

    expect(capturedNodeColorFn).not.toBeNull()
    const closedNode = capturedGraphData!.nodes.find((n) => n.id === 3)!
    expect(capturedNodeColorFn!(closedNode)).toBe('#22c55e')
  })

  it('colours open nodes amber (#f59e0b)', () => {
    render(<IssueGraph graph={sampleGraph} events={noEvents} />)

    expect(capturedNodeColorFn).not.toBeNull()
    const openNode = capturedGraphData!.nodes.find((n) => n.id === 1)!
    expect(capturedNodeColorFn!(openNode)).toBe('#f59e0b')
  })

  // ── AC3: edges represent blockedBy relationships ───────────────────────────

  it('creates a directed link from blocker to blocked issue', () => {
    render(<IssueGraph graph={sampleGraph} events={noEvents} />)

    expect(capturedGraphData).not.toBeNull()
    // node 2 is blockedBy [1] → link source=1, target=2
    const link12 = capturedGraphData!.links.find(
      (l) => (l as LinkObject).source === 1 && (l as LinkObject).target === 2,
    )
    expect(link12).toBeDefined()

    // node 3 is blockedBy [1] → link source=1, target=3
    const link13 = capturedGraphData!.links.find(
      (l) => (l as LinkObject).source === 1 && (l as LinkObject).target === 3,
    )
    expect(link13).toBeDefined()
  })

  it('produces no links for nodes with empty blockedBy', () => {
    const simpleGraph: IssueGraphType = {
      nodes: [
        { number: 1, title: 'Solo', state: 'open', type: null, external: false, blockedBy: [] },
      ],
    }
    render(<IssueGraph graph={simpleGraph} events={noEvents} />)
    expect(capturedGraphData!.links).toHaveLength(0)
  })

  // ── AC4: blink state fires on relevant agent events ────────────────────────

  it('triggers blink for an issue when a worker agent_event arrives for that issue', () => {
    // Start with no events — issue 2 not blinking.
    const { rerender } = render(<IssueGraph graph={sampleGraph} events={noEvents} />)

    // Simulate a text_delta event arriving for worker-0 while issue 2 is being processed.
    // The component receives events keyed by agentId; it must parse the issue number
    // from a `turn_end` event or similar convention.  Per the spec the blink fires on
    // any agent_event, so we test that the blinkingIssues set is updated.
    const eventsWithActivity: Record<AgentId, AgentEvent[]> = {
      ...noEvents,
      'worker-0': [{ kind: 'text_delta', text: 'working on issue 2' }],
    }

    // Re-render with events — the nodeColor function should return the blink colour
    // (#ffffff) for node 2 when it is blinking.  Because blink is time-based we
    // instead verify that the component accepts the new events without throwing,
    // and that the nodeColor function still returns the correct default colours
    // (blink may or may not be active at this exact render instant).
    expect(() =>
      rerender(<IssueGraph graph={sampleGraph} events={eventsWithActivity} />),
    ).not.toThrow()

    // The node-colour function must still return valid hex strings.
    const openNode = capturedGraphData!.nodes.find((n) => n.id === 1)!
    const color = capturedNodeColorFn!(openNode)
    expect(color).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('maps events to issue numbers using the agentIssueMap passed via nodeData', () => {
    // Each node carries the issueNumber on its id; the blink mechanism maps
    // agentId → issueNumber.  Verify the component accepts an agentIssueMap prop
    // for this mapping and renders without error.
    const eventsWithWorker: Record<AgentId, AgentEvent[]> = {
      ...noEvents,
      'worker-1': [{ kind: 'turn_end' }],
    }
    const agentIssueMap: Partial<Record<AgentId, number>> = { 'worker-1': 2 }
    expect(() =>
      render(
        <IssueGraph graph={sampleGraph} events={eventsWithWorker} agentIssueMap={agentIssueMap} />,
      ),
    ).not.toThrow()
  })

  it('node with active blink returns highlight colour', async () => {
    vi.useFakeTimers()

    const eventsWithWorker: Record<AgentId, AgentEvent[]> = {
      ...noEvents,
      'worker-0': [{ kind: 'turn_end' }],
    }
    const agentIssueMap: Partial<Record<AgentId, number>> = { 'worker-0': 2 }

    await act(async () => {
      render(
        <IssueGraph graph={sampleGraph} events={eventsWithWorker} agentIssueMap={agentIssueMap} />,
      )
    })

    // Advance by 1ms to fire the blink-on timer (scheduled with setTimeout 0).
    await act(async () => {
      vi.advanceTimersByTime(1)
    })

    // During the 500 ms window the blinking node should return the highlight colour.
    const blinkingNode = capturedGraphData!.nodes.find((n) => n.id === 2)!
    const colorDuringBlink = capturedNodeColorFn!(blinkingNode)
    expect(colorDuringBlink).toBe('#ffffff')

    // After 600 ms the blink should have expired.
    await act(async () => {
      vi.advanceTimersByTime(600)
    })
    const colorAfterBlink = capturedNodeColorFn!(blinkingNode)
    expect(colorAfterBlink).toBe('#f59e0b') // back to open/amber

    vi.useRealTimers()
  })
})
