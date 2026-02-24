import { useCallback, useEffect, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import type { NodeObject } from 'react-force-graph-2d'
import { themes as palette } from './theme'
import type { AgentEvent, AgentId, IssueGraph as IssueGraphType } from './types'

// ---------------------------------------------------------------------------
// Constants (sourced from brand package)
// ---------------------------------------------------------------------------

const COLOR_CLOSED = palette.dark.graph.closed
const COLOR_OPEN = palette.dark.graph.open
const COLOR_BLINK = palette.dark.graph.active
const BLINK_DURATION_MS = 500

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IssueNode extends NodeObject {
  id: number
  label: string
  state: 'open' | 'closed'
}

interface IssueGraphProps {
  graph: IssueGraphType
  events: Record<AgentId, AgentEvent[]>
  agentIssueMap?: Partial<Record<AgentId, number>>
  repo?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function IssueGraph({ graph, events, agentIssueMap, repo }: IssueGraphProps) {
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

  const observerRef = useRef<ResizeObserver | null>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  const containerRef = useCallback((el: HTMLDivElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect()
      observerRef.current = null
    }
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setDimensions({ width, height })
    })
    observer.observe(el)
    observerRef.current = observer
  }, [])

  const hasNodes = graph.nodes.length > 0

  const nodes: IssueNode[] = graph.nodes.map((n) => ({
    id: n.number,
    label: n.title,
    state: n.state,
  }))

  const links = graph.edges

  const nodeColor = (node: NodeObject): string => {
    const issueNode = node as IssueNode
    if (blinkingIssues.has(issueNode.id as number)) return COLOR_BLINK
    return issueNode.state === 'closed' ? COLOR_CLOSED : COLOR_OPEN
  }

  const nodeCanvasObject = (
    node: NodeObject,
    ctx: CanvasRenderingContext2D,
    globalScale: number,
  ): void => {
    const n = node as IssueNode
    const W = 120,
      H = 36,
      R = 6
    const x = (n.x ?? 0) - W / 2
    const y = (n.y ?? 0) - H / 2
    const color = nodeColor(n)
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(x, y, W, H, R)
    ctx.fillStyle = color + '33'
    ctx.fill()
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5 / globalScale
    ctx.stroke()
    ctx.fillStyle = color
    ctx.font = `bold ${11 / globalScale}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`#${n.id}`, n.x ?? 0, (n.y ?? 0) - 6)
    const title = n.label.length > 18 ? n.label.slice(0, 17) + '\u2026' : n.label
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.font = `${9 / globalScale}px sans-serif`
    ctx.fillText(title, n.x ?? 0, (n.y ?? 0) + 7)
    ctx.restore()
  }

  const nodePointerAreaPaint = (
    node: NodeObject,
    color: string,
    ctx: CanvasRenderingContext2D,
  ): void => {
    const n = node as IssueNode
    ctx.fillStyle = color
    ctx.fillRect((n.x ?? 0) - 60, (n.y ?? 0) - 18, 120, 36)
  }

  const onNodeClick = (node: NodeObject): void => {
    if (!repo) return
    window.open(`https://github.com/${repo}/issues/${(node as IssueNode).id}`, '_blank')
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
    <div className="graph-container" ref={containerRef}>
      <ForceGraph2D
        graphData={{ nodes, links }}
        nodeId="id"
        nodeLabel="label"
        nodeColor={nodeColor}
        nodeCanvasObject={nodeCanvasObject}
        nodeCanvasObjectMode={() => 'replace'}
        nodePointerAreaPaint={nodePointerAreaPaint}
        onNodeClick={onNodeClick}
        width={dimensions.width}
        height={dimensions.height}
        linkDirectionalArrowLength={6}
        linkDirectionalArrowRelPos={1}
        linkColor={() => palette.dark.graph.link}
        backgroundColor="transparent"
        autoPauseRedraw={false}
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
