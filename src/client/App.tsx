import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react'
import AgentTabs from './AgentTabs'
import IssueGraph from './IssueGraph'
import { resolveApiBase, useAgentEvents } from './useAgentEvents'
import { useAgentIssueMap } from './useAgentIssueMap'
import { useRepoHistory } from './useRepoHistory'
import { useTheme } from './useTheme'
import type { ConnectionStatus, IssueGraph as IssueGraphType } from './types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function repoFromUrl(): string {
  const params = new URLSearchParams(window.location.search)
  return params.get('repo') ?? ''
}

function isValidRepo(value: string): boolean {
  const t = value.trim()
  return t.length > 0 && t.includes('/')
}

const EMPTY_GRAPH: IssueGraphType = { nodes: [], edges: [] }

const CONNECTION_LABELS: Record<ConnectionStatus, string> = {
  connected: 'Connected',
  connecting: 'Connecting',
  disconnected: 'Disconnected',
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  return (
    <span className={`connection-badge connection-badge--${status}`}>
      <span className={`connection-dot connection-dot--${status}`} />
      {CONNECTION_LABELS[status]}
    </span>
  )
}

function SunIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="8" cy="8" r="3" />
      <line x1="8" y1="1" x2="8" y2="2.5" />
      <line x1="8" y1="13.5" x2="8" y2="15" />
      <line x1="1" y1="8" x2="2.5" y2="8" />
      <line x1="13.5" y1="8" x2="15" y2="8" />
      <line x1="3.05" y1="3.05" x2="4.11" y2="4.11" />
      <line x1="11.89" y1="11.89" x2="12.95" y2="12.95" />
      <line x1="3.05" y1="12.95" x2="4.11" y2="11.89" />
      <line x1="11.89" y1="4.11" x2="12.95" y2="3.05" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 8.5A6.5 6.5 0 0 1 7.5 2 5 5 0 1 0 14 8.5Z" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  const { theme, toggleTheme } = useTheme()
  const { history: repoHistory, pushRepo } = useRepoHistory()
  const { events, pool, connectionStatus, sendMessage, interrupt } = useAgentEvents()
  const apiBase = resolveApiBase()
  const agentIssueMap = useAgentIssueMap(events)
  const [repo, setRepo] = useState<string>(repoFromUrl)
  const [repoInput, setRepoInput] = useState<string>(repoFromUrl)
  const [graph, setGraph] = useState<IssueGraphType>(EMPTY_GRAPH)
  const pendingRef = useRef(false)
  const [loadingGraph, setLoadingGraph] = useState(false)
  const [startClickedWhileNotRunning, setStartClickedWhileNotRunning] = useState(false)
  const [stopClickedWhileRunning, setStopClickedWhileRunning] = useState(false)
  const startTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { running } = pool

  // Derive effective busy states: pending is only active until the running state flips
  const startPending = startClickedWhileNotRunning && !running
  const stopPending = stopClickedWhileRunning && running

  // Fetch issue graph when repo changes
  useEffect(() => {
    if (!repo) return
    let cancelled = false
    pendingRef.current = true
    const controller = new AbortController()
    fetch(`${apiBase}/api/issues?repo=${encodeURIComponent(repo)}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data: IssueGraphType) => {
        if (!cancelled) {
          setGraph(data)
          setLoadingGraph(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setGraph(EMPTY_GRAPH)
          setLoadingGraph(false)
        }
      })
      .finally(() => {
        pendingRef.current = false
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [repo, apiBase])

  const handleRepoSubmit = useCallback(
    (e: SyntheticEvent<HTMLFormElement>) => {
      e.preventDefault()
      const trimmed = repoInput.trim()
      if (trimmed) {
        setLoadingGraph(true)
        setRepo(trimmed)
        pushRepo(trimmed)
      }
    },
    [repoInput, pushRepo],
  )

  const handleStart = useCallback(() => {
    setStartClickedWhileNotRunning(true)
    startTimeoutRef.current = setTimeout(() => setStartClickedWhileNotRunning(false), 10_000)
    void fetch(`${apiBase}/api/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo }),
    })
  }, [repo, apiBase])

  const handleStop = useCallback(() => {
    setStopClickedWhileRunning(true)
    stopTimeoutRef.current = setTimeout(() => setStopClickedWhileRunning(false), 10_000)
    void fetch(`${apiBase}/api/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
  }, [apiBase])

  return (
    <div className="app-root">
      {/* Toolbar */}
      <header className="toolbar" role="toolbar" aria-label="Main toolbar">
        <div className="toolbar-brand">
          <svg
            className="toolbar-brand-mark"
            width="22"
            height="22"
            viewBox="0 0 22 22"
            fill="none"
            aria-hidden="true"
          >
            {/* Node-graph constellation: 4 nodes connected by lines */}
            <line
              x1="5"
              y1="5"
              x2="17"
              y2="8"
              stroke="currentColor"
              strokeWidth="1.2"
              opacity="0.35"
            />
            <line
              x1="5"
              y1="5"
              x2="8"
              y2="17"
              stroke="currentColor"
              strokeWidth="1.2"
              opacity="0.35"
            />
            <line
              x1="17"
              y1="8"
              x2="14"
              y2="17"
              stroke="currentColor"
              strokeWidth="1.2"
              opacity="0.35"
            />
            <line
              x1="8"
              y1="17"
              x2="14"
              y2="17"
              stroke="currentColor"
              strokeWidth="1.2"
              opacity="0.35"
            />
            <circle cx="5" cy="5" r="2.5" fill="var(--brand-accent-base)" />
            <circle cx="17" cy="8" r="2" fill="currentColor" />
            <circle cx="8" cy="17" r="2" fill="currentColor" />
            <circle cx="14" cy="17" r="1.6" fill="var(--brand-accent-base)" opacity="0.7" />
          </svg>
          <span>Epik</span>
        </div>

        <form onSubmit={handleRepoSubmit} className="toolbar-form">
          <input
            className="toolbar-input"
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
            placeholder="owner/repo"
            aria-label="GitHub repository"
            list="repo-history"
          />
          <datalist id="repo-history">
            {repoHistory.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
          <button
            type="submit"
            className={`btn btn-secondary${loadingGraph ? ' btn--busy' : ''}`}
            disabled={!isValidRepo(repoInput) || loadingGraph}
          >
            Load
          </button>
        </form>

        <button
          className={`btn btn-primary${startPending ? ' btn--busy' : ''}`}
          onClick={handleStart}
          disabled={!repo || connectionStatus !== 'connected' || running || startPending}
        >
          Start
        </button>

        <button
          className={`btn btn-danger${stopPending ? ' btn--busy' : ''}`}
          onClick={handleStop}
          disabled={!running || connectionStatus !== 'connected' || stopPending}
        >
          Stop
        </button>

        <ConnectionBadge status={connectionStatus} />

        <button
          className="btn btn-ghost"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
      </header>

      {/* Top 50 %: Issue graph */}
      <div className="pane-top">
        <IssueGraph graph={graph} events={events} agentIssueMap={agentIssueMap} repo={repo} />
      </div>

      {/* Bottom 50 %: Agent tabs */}
      <div className="pane-bottom">
        <AgentTabs
          pool={pool}
          events={events}
          agentIssueMap={agentIssueMap}
          onSend={sendMessage}
          onInterrupt={interrupt}
        />
      </div>
    </div>
  )
}
