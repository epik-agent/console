import { useEffect, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import type { NodeObject } from 'react-force-graph-2d'
import type { AgentEvent, AgentId, IssueGraph as IssueGraphType } from './types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLOR_CLOSED = '#34d399'
const COLOR_OPEN = '#f5a623'
const COLOR_BLINK = '#00e599'
const BLINK_DURATION_MS = 500

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IssueNode extends NodeObject {
  id: number
  label: string
  state: 'open' | 'closed'
}

interface IssueLink {
  source: number
  target: number
}

interface IssueGraphProps {
  graph: IssueGraphType
  events: Record<AgentId, AgentEvent[]>
  agentIssueMap?: Partial<Record<AgentId, number>>
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function IssueGraph({ graph, events, agentIssueMap }: IssueGraphProps) {
  const [blinkingIssues, setBlinkingIssues] = useState<Set<number>>(new Set())
  const prevEventCountsRef = useRef<Partial<Record<AgentId, number>>>({})
  const blinkTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    if (!agentIssueMap) return

    const issuesToBlink: number[] = []

    for (const [agentId, issueNumber] of Object.entries(agentIssueMap) as [AgentId, number][]) {
      const agentEvents = events[agentId] ?? []
      const prevCount = prevEventCountsRef.current[agentId] ?? 0

      if (agentEvents.length > prevCount && issueNumber !== undefined) {
        issuesToBlink.push(issueNumber)
      }

      prevEventCountsRef.current[agentId] = agentEvents.length
    }

    if (issuesToBlink.length === 0) return

    const onTimer = setTimeout(() => {
      setBlinkingIssues((prev) => {
        const next = new Set(prev)
        for (const n of issuesToBlink) next.add(n)
        return next
      })
    }, 0)

    const timers = issuesToBlink.map((issueNumber) => {
      const existing = blinkTimers.current.get(issueNumber)
      if (existing) clearTimeout(existing)

      const offTimer = setTimeout(() => {
        setBlinkingIssues((prev) => {
          const next = new Set(prev)
          next.delete(issueNumber)
          return next
        })
        blinkTimers.current.delete(issueNumber)
      }, BLINK_DURATION_MS)

      blinkTimers.current.set(issueNumber, offTimer)
      return offTimer
    })

    return () => {
      clearTimeout(onTimer)
      for (const t of timers) clearTimeout(t)
    }
  }, [events, agentIssueMap])

  useEffect(() => {
    const timers = blinkTimers.current
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer)
      }
    }
  }, [])

  const hasNodes = graph.nodes.length > 0

  const nodes: IssueNode[] = graph.nodes.map((n) => ({
    id: n.number,
    label: n.title,
    state: n.state,
  }))

  const links: IssueLink[] = graph.nodes.flatMap((n) =>
    n.blockedBy.map((blocker) => ({ source: blocker, target: n.number })),
  )

  const nodeColor = (node: NodeObject): string => {
    const issueNode = node as IssueNode
    if (blinkingIssues.has(issueNode.id as number)) return COLOR_BLINK
    return issueNode.state === 'closed' ? COLOR_CLOSED : COLOR_OPEN
  }

  if (!hasNodes) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon" aria-hidden="true">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M8 12h8" />
            <path d="M12 8v8" />
          </svg>
        </div>
        <div className="empty-state-title">No issues loaded</div>
        <div className="empty-state-desc">
          Enter a repository above and click Load to visualize the issue dependency graph.
        </div>
      </div>
    )
  }

  return (
    <div className="graph-container">
      <ForceGraph2D
        graphData={{ nodes, links }}
        nodeId="id"
        nodeLabel="label"
        nodeColor={nodeColor}
        nodeRelSize={6}
        linkDirectionalArrowLength={6}
        linkDirectionalArrowRelPos={1}
        linkColor={() => 'rgba(255,255,255,0.10)'}
        backgroundColor="transparent"
      />

      {/* Legend */}
      <div className="graph-legend">
        <div className="graph-legend-item">
          <span className="graph-legend-dot" style={{ background: COLOR_OPEN }} />
          <span>Open</span>
        </div>
        <div className="graph-legend-item">
          <span className="graph-legend-dot" style={{ background: COLOR_CLOSED }} />
          <span>Closed</span>
        </div>
      </div>
    </div>
  )
}
