import { useEffect, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import type { NodeObject } from 'react-force-graph-2d'
import type { AgentEvent, AgentId, IssueGraph as IssueGraphType } from './types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLOR_CLOSED = '#22c55e'
const COLOR_OPEN = '#f59e0b'
const COLOR_BLINK = '#ffffff'
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
  /** Maps agentId to the issue number it is currently working on. */
  agentIssueMap?: Partial<Record<AgentId, number>>
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function IssueGraph({ graph, events, agentIssueMap }: IssueGraphProps) {
  const [blinkingIssues, setBlinkingIssues] = useState<Set<number>>(new Set())

  // Track previous event counts per agent so we can detect new arrivals.
  const prevEventCountsRef = useRef<Partial<Record<AgentId, number>>>({})
  const blinkTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  // Detect new agent events and trigger blink for mapped issues.
  // We schedule the state update via setTimeout(fn, 0) to avoid calling
  // setState synchronously inside the effect body (react-hooks/set-state-in-effect).
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

    // Schedule blink-on asynchronously so setState is not called synchronously.
    const onTimer = setTimeout(() => {
      setBlinkingIssues((prev) => {
        const next = new Set(prev)
        for (const n of issuesToBlink) next.add(n)
        return next
      })
    }, 0)

    // Schedule blink-off after the blink duration.
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

  // Clean up all blink timers on unmount.
  useEffect(() => {
    const timers = blinkTimers.current
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer)
      }
    }
  }, [])

  // Build graph data from IssueGraph prop.
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

  return (
    <ForceGraph2D
      graphData={{ nodes, links }}
      nodeId="id"
      nodeLabel="label"
      nodeColor={nodeColor}
      linkDirectionalArrowLength={6}
      linkDirectionalArrowRelPos={1}
    />
  )
}
