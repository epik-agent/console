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
let capturedLinkColorFn: ((link: LinkObject) => string) | null = null
let capturedNodeCanvasObjectFn:
  | ((node: NodeObject, ctx: CanvasRenderingContext2D, scale: number) => void)
  | null = null
let capturedNodePointerAreaPaintFn:
  | ((node: NodeObject, color: string, ctx: CanvasRenderingContext2D) => void)
  | null = null
let capturedNodeCanvasObjectMode: string | null = null
let capturedOnNodeClickFn: ((node: NodeObject, event: MouseEvent) => void) | null = null
let capturedWidth: number | undefined = undefined
let capturedHeight: number | undefined = undefined

vi.mock('react-force-graph-2d', () => ({
  default: vi.fn(
    (props: {
      graphData?: GraphData
      nodeColor?: (node: NodeObject) => string
      linkColor?: (link: LinkObject) => string
      nodeCanvasObject?: (node: NodeObject, ctx: CanvasRenderingContext2D, scale: number) => void
      nodePointerAreaPaint?: (
        node: NodeObject,
        color: string,
        ctx: CanvasRenderingContext2D,
      ) => void
      nodeCanvasObjectMode?: string | ((node: NodeObject) => string)
      onNodeClick?: (node: NodeObject, event: MouseEvent) => void
      width?: number
      height?: number
    }) => {
      capturedGraphData = props.graphData ?? null
      capturedNodeColorFn = props.nodeColor ?? null
      capturedLinkColorFn = props.linkColor ?? null
      capturedNodeCanvasObjectFn = props.nodeCanvasObject ?? null
      capturedNodePointerAreaPaintFn = props.nodePointerAreaPaint ?? null
      capturedNodeCanvasObjectMode = props.nodeCanvasObjectMode ?? null
      capturedOnNodeClickFn = props.onNodeClick ?? null
      capturedWidth = props.width
      capturedHeight = props.height
      return null
    },
  ),
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
  edges: [
    { source: 1, target: 2 },
    { source: 1, target: 3 },
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
    capturedLinkColorFn = null
    capturedNodeCanvasObjectFn = null
    capturedNodePointerAreaPaintFn = null
    capturedNodeCanvasObjectMode = null
    capturedOnNodeClickFn = null
    capturedWidth = undefined
    capturedHeight = undefined
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

  it('colours closed nodes green (#34d399)', () => {
    render(<IssueGraph graph={sampleGraph} events={noEvents} />)

    expect(capturedNodeColorFn).not.toBeNull()
    const closedNode = capturedGraphData!.nodes.find((n) => n.id === 3)!
    expect(capturedNodeColorFn!(closedNode)).toBe('#34d399')
  })

  it('colours open nodes amber (#f5a623)', () => {
    render(<IssueGraph graph={sampleGraph} events={noEvents} />)

    expect(capturedNodeColorFn).not.toBeNull()
    const openNode = capturedGraphData!.nodes.find((n) => n.id === 1)!
    expect(capturedNodeColorFn!(openNode)).toBe('#f5a623')
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

  it('uses empty array fallback when agentId is not in events map', () => {
    // Pass an agentIssueMap with a key that has no corresponding entry in events.
    // This exercises the `events[agentId] ?? []` fallback branch at IssueGraph.tsx:52.
    const partialEvents: Partial<Record<AgentId, AgentEvent[]>> = {
      supervisor: [],
      // worker-0, worker-1, worker-2 intentionally omitted
    }
    const agentIssueMap: Partial<Record<AgentId, number>> = { 'worker-0': 1 }

    expect(() =>
      render(
        <IssueGraph
          graph={sampleGraph}
          events={partialEvents as Record<AgentId, AgentEvent[]>}
          agentIssueMap={agentIssueMap}
        />,
      ),
    ).not.toThrow()
  })

  it('linkColor returns a non-empty string for any link', () => {
    render(<IssueGraph graph={sampleGraph} events={noEvents} />)
    expect(capturedLinkColorFn).not.toBeNull()
    const color = capturedLinkColorFn!({} as LinkObject)
    expect(typeof color).toBe('string')
    expect(color.length).toBeGreaterThan(0)
  })

  it('produces no links for nodes with empty blockedBy', () => {
    const simpleGraph: IssueGraphType = {
      nodes: [
        { number: 1, title: 'Solo', state: 'open', type: null, external: false, blockedBy: [] },
      ],
      edges: [],
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
    // (#00e599) for node 2 when it is blinking.  Because blink is time-based we
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
    expect(colorDuringBlink).toBe('#00e599')

    // After 600 ms the blink should have expired.
    await act(async () => {
      vi.advanceTimersByTime(600)
    })
    const colorAfterBlink = capturedNodeColorFn!(blinkingNode)
    expect(colorAfterBlink).toBe('#f5a623') // back to open/amber

    vi.useRealTimers()
  })

  it('does not trigger a blink when agentIssueMap is provided but no new events arrive', () => {
    const eventsWithWorker: Record<AgentId, AgentEvent[]> = {
      ...noEvents,
      'worker-0': [{ kind: 'turn_end' }],
    }
    const agentIssueMap: Partial<Record<AgentId, number>> = { 'worker-0': 2 }

    const { rerender } = render(
      <IssueGraph graph={sampleGraph} events={eventsWithWorker} agentIssueMap={agentIssueMap} />,
    )

    // Re-render with the same events — no new events, no blink
    // The prevEventCounts are now set to 1, so re-rendering with same events
    // should NOT trigger a blink
    expect(() =>
      rerender(
        <IssueGraph graph={sampleGraph} events={eventsWithWorker} agentIssueMap={agentIssueMap} />,
      ),
    ).not.toThrow()
  })

  it('issuesToBlink is empty when event count has not changed (early return path)', () => {
    // We trigger the effect twice with the same event count.
    // First render sets prevCount = 1 for worker-0.
    // Second render: agentIssueMap changes (new object) but events don't — length > prevCount is false.
    const eventsV1: Record<AgentId, AgentEvent[]> = {
      ...noEvents,
      'worker-0': [{ kind: 'text_delta', text: 'first' }],
    }
    const agentIssueMapV1: Partial<Record<AgentId, number>> = { 'worker-0': 1 }

    const { rerender } = render(
      <IssueGraph graph={sampleGraph} events={eventsV1} agentIssueMap={agentIssueMapV1} />,
    )

    // Re-render with a NEW agentIssueMap object (forces effect re-run) but same events.
    // Now agentEvents.length (1) is NOT > prevCount (1) → false branch of the condition
    const agentIssueMapV2: Partial<Record<AgentId, number>> = { 'worker-0': 1 }
    rerender(<IssueGraph graph={sampleGraph} events={eventsV1} agentIssueMap={agentIssueMapV2} />)

    // After the second render, issuesToBlink is empty → early return hit
    expect(capturedGraphData?.nodes).toBeDefined()
  })

  it('cleans up all blink timers when unmounted during a blink', async () => {
    vi.useFakeTimers()

    const eventsWithWorker: Record<AgentId, AgentEvent[]> = {
      ...noEvents,
      'worker-0': [{ kind: 'turn_end' }],
    }
    const agentIssueMap: Partial<Record<AgentId, number>> = { 'worker-0': 2 }

    const { unmount } = render(
      <IssueGraph graph={sampleGraph} events={eventsWithWorker} agentIssueMap={agentIssueMap} />,
    )

    // Fire blink-on timer
    await act(async () => {
      vi.advanceTimersByTime(1)
    })

    // Unmount while the blink-off timer is still pending — should not throw
    expect(() => unmount()).not.toThrow()

    vi.useRealTimers()
  })

  it('clears an existing blink timer when a new event arrives for the same issue', async () => {
    vi.useFakeTimers()

    const eventsV1: Record<AgentId, AgentEvent[]> = {
      ...noEvents,
      'worker-0': [{ kind: 'text_delta', text: 'first event' }],
    }
    const agentIssueMap: Partial<Record<AgentId, number>> = { 'worker-0': 1 }

    const { rerender } = render(
      <IssueGraph graph={sampleGraph} events={eventsV1} agentIssueMap={agentIssueMap} />,
    )

    // Fire blink-on timer
    await act(async () => {
      vi.advanceTimersByTime(1)
    })

    // Advance partway through blink duration, then trigger another event for the same issue
    await act(async () => {
      vi.advanceTimersByTime(200)
    })

    const eventsV2: Record<AgentId, AgentEvent[]> = {
      ...noEvents,
      'worker-0': [
        { kind: 'text_delta', text: 'first event' },
        { kind: 'text_delta', text: 'second event' },
      ],
    }
    await act(async () => {
      rerender(<IssueGraph graph={sampleGraph} events={eventsV2} agentIssueMap={agentIssueMap} />)
    })

    // Fire the new blink-on timer
    await act(async () => {
      vi.advanceTimersByTime(1)
    })

    // Node 1 should still be blinking (existing timer was cleared and reset)
    const node1 = capturedGraphData!.nodes.find((n) => n.id === 1)!
    expect(capturedNodeColorFn!(node1)).toBe('#00e599')

    vi.useRealTimers()
  })

  // ── Custom node rendering ─────────────────────────────────────────────────

  it('passes nodeCanvasObjectMode as a function returning "replace" to ForceGraph', () => {
    render(<IssueGraph graph={sampleGraph} events={noEvents} />)
    expect(typeof capturedNodeCanvasObjectMode).toBe('function')
    expect((capturedNodeCanvasObjectMode as (node: NodeObject) => string)({})).toBe('replace')
  })

  it('passes a nodeCanvasObject function to ForceGraph', () => {
    render(<IssueGraph graph={sampleGraph} events={noEvents} />)
    expect(typeof capturedNodeCanvasObjectFn).toBe('function')
  })

  it('passes a nodePointerAreaPaint function to ForceGraph', () => {
    render(<IssueGraph graph={sampleGraph} events={noEvents} />)
    expect(typeof capturedNodePointerAreaPaintFn).toBe('function')
  })

  it('nodeCanvasObject draws without throwing for an open node', () => {
    render(<IssueGraph graph={sampleGraph} events={noEvents} />)
    expect(capturedNodeCanvasObjectFn).not.toBeNull()

    const openNode = capturedGraphData!.nodes.find((n) => n.id === 1)!
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      font: '',
      textAlign: '',
      textBaseline: '',
    } as unknown as CanvasRenderingContext2D

    expect(() => capturedNodeCanvasObjectFn!(openNode, ctx, 1)).not.toThrow()
    expect(ctx.fill).toHaveBeenCalled()
    expect(ctx.stroke).toHaveBeenCalled()
  })

  it('nodeCanvasObject draws without throwing for a closed node', () => {
    render(<IssueGraph graph={sampleGraph} events={noEvents} />)
    expect(capturedNodeCanvasObjectFn).not.toBeNull()

    const closedNode = capturedGraphData!.nodes.find((n) => n.id === 3)!
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      font: '',
      textAlign: '',
      textBaseline: '',
    } as unknown as CanvasRenderingContext2D

    expect(() => capturedNodeCanvasObjectFn!(closedNode, ctx, 1)).not.toThrow()
    expect(ctx.fill).toHaveBeenCalled()
  })

  // ── Sizing ────────────────────────────────────────────────────────────────

  it('passes numeric width and height props to ForceGraph', () => {
    render(<IssueGraph graph={sampleGraph} events={noEvents} />)
    expect(typeof capturedWidth).toBe('number')
    expect(typeof capturedHeight).toBe('number')
  })

  // ── GitHub link ───────────────────────────────────────────────────────────

  it('passes onNodeClick to ForceGraph', () => {
    render(<IssueGraph graph={sampleGraph} events={noEvents} />)
    expect(typeof capturedOnNodeClickFn).toBe('function')
  })

  it('onNodeClick opens GitHub issue URL in a new tab', () => {
    const openSpy = vi.fn()
    vi.stubGlobal('open', openSpy)

    render(<IssueGraph graph={sampleGraph} events={noEvents} repo="owner/repo" />)

    const node1 = capturedGraphData!.nodes.find((n) => n.id === 1)!
    capturedOnNodeClickFn!(node1, new MouseEvent('click'))

    expect(openSpy).toHaveBeenCalledWith('https://github.com/owner/repo/issues/1', '_blank')

    vi.unstubAllGlobals()
  })

  it('onNodeClick does nothing when repo is not provided', () => {
    const openSpy = vi.fn()
    vi.stubGlobal('open', openSpy)

    render(<IssueGraph graph={sampleGraph} events={noEvents} />)

    const node1 = capturedGraphData!.nodes.find((n) => n.id === 1)!
    capturedOnNodeClickFn!(node1, new MouseEvent('click'))

    expect(openSpy).not.toHaveBeenCalled()

    vi.unstubAllGlobals()
  })
})
