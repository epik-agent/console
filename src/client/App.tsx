import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type SyntheticEvent,
} from 'react'
import AgentTabs from './AgentTabs'
import IssueGraph from './IssueGraph'
import { useAgentEvents } from './useAgentEvents'
import type { IssueGraph as IssueGraphType } from './types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Reads the `repo` query-string parameter from the current URL.
 *
 * @returns The raw `owner/repo` string, or an empty string if absent.
 */
function repoFromUrl(): string {
  const params = new URLSearchParams(window.location.search)
  return params.get('repo') ?? ''
}

/** Sentinel empty graph used before the first successful `/api/issues` fetch. */
const EMPTY_GRAPH: IssueGraphType = { nodes: [] }

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

/**
 * Root application component.
 *
 * Renders a toolbar with a repository input and a **Start** button, an
 * {@link IssueGraph} occupying the top half of the viewport, and
 * {@link AgentTabs} occupying the bottom half.
 *
 * On mount it reads `?repo=owner/repo` from the URL and fetches the issue
 * graph immediately. The **Start** button triggers `POST /api/start` to kick
 * off the Supervisor agent.
 */
export default function App() {
  const { events, pool, sendMessage, interrupt } = useAgentEvents()
  const [repo, setRepo] = useState<string>(repoFromUrl)
  const [repoInput, setRepoInput] = useState<string>(repoFromUrl)
  const [graph, setGraph] = useState<IssueGraphType>(EMPTY_GRAPH)
  const pendingRef = useRef(false)

  // Fetch issue graph when repo changes
  useEffect(() => {
    if (!repo) return
    let cancelled = false
    pendingRef.current = true
    fetch(`/api/issues?repo=${encodeURIComponent(repo)}`)
      .then((r) => r.json())
      .then((data: IssueGraphType) => {
        if (!cancelled) setGraph(data)
      })
      .catch(() => {
        if (!cancelled) setGraph(EMPTY_GRAPH)
      })
      .finally(() => {
        pendingRef.current = false
      })
    return () => {
      cancelled = true
    }
  }, [repo])

  const handleRepoSubmit = useCallback(
    (e: SyntheticEvent<HTMLFormElement>) => {
      e.preventDefault()
      const trimmed = repoInput.trim()
      if (trimmed) setRepo(trimmed)
    },
    [repoInput],
  )

  const handleStart = useCallback(() => {
    void fetch('/api/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo }),
    })
  }, [repo])

  return (
    <div style={rootStyle}>
      {/* Toolbar */}
      <div style={toolbarStyle}>
        <form onSubmit={handleRepoSubmit} style={formStyle}>
          <input
            style={repoInputStyle}
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
            placeholder="owner/repo"
            aria-label="GitHub repository"
          />
          <button type="submit" style={secondaryButtonStyle}>
            Load
          </button>
        </form>
        <button style={startButtonStyle} onClick={handleStart} disabled={!repo}>
          Start
        </button>
      </div>

      {/* Top 50%: Issue graph */}
      <div style={topPaneStyle}>
        <IssueGraph graph={graph} events={events} />
      </div>

      {/* Bottom 50%: Agent tabs */}
      <div style={bottomPaneStyle}>
        <AgentTabs pool={pool} events={events} onSend={sendMessage} onInterrupt={interrupt} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const rootStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100vh',
  background: '#111827',
  color: '#f9fafb',
  fontFamily: 'system-ui, sans-serif',
}

const toolbarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px 16px',
  background: '#1f2937',
  borderBottom: '1px solid #374151',
  flexShrink: 0,
}

const formStyle: CSSProperties = {
  display: 'flex',
  gap: '6px',
  flex: 1,
}

const repoInputStyle: CSSProperties = {
  flex: 1,
  padding: '6px 12px',
  background: '#111827',
  border: '1px solid #374151',
  borderRadius: '6px',
  color: '#f9fafb',
  fontSize: '14px',
  outline: 'none',
}

const secondaryButtonStyle: CSSProperties = {
  padding: '6px 14px',
  background: '#374151',
  border: 'none',
  borderRadius: '6px',
  color: '#f9fafb',
  cursor: 'pointer',
  fontSize: '14px',
}

const startButtonStyle: CSSProperties = {
  padding: '6px 18px',
  background: '#3b82f6',
  border: 'none',
  borderRadius: '6px',
  color: '#fff',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: 600,
}

const topPaneStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  borderBottom: '1px solid #374151',
}

const bottomPaneStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
}
