import { useState } from 'react'
import ConsolePane from './ConsolePane'
import type { AgentEvent, AgentId, PoolState, WorkerState } from './types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Props for the {@link AgentTabs} component. */
interface AgentTabsProps {
  /** Current pool state snapshot — drives the status badge on each tab. */
  pool: PoolState
  /** Per-agent event lists, forwarded to each {@link ConsolePane}. */
  events: Record<AgentId, AgentEvent[]>
  /**
   * Called when the user submits a message in a pane.
   *
   * @param agentId - Agent whose pane generated the message.
   * @param text    - Message body.
   */
  onSend: (agentId: AgentId, text: string) => void
  /**
   * Called when the user presses Escape to interrupt an in-progress turn.
   *
   * @param agentId - Agent whose turn should be cancelled.
   */
  onInterrupt: (agentId: AgentId) => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Ordered list of agent IDs that appear as tabs, left-to-right. */
const AGENT_IDS: AgentId[] = ['supervisor', 'worker-0', 'worker-1', 'worker-2']

/**
 * Returns the human-readable tab label for an agent.
 *
 * @param id - Agent identifier.
 */
function tabLabel(id: AgentId): string {
  if (id === 'supervisor') return 'Supervisor'
  const n = id.split('-')[1]
  return `Worker ${n}`
}

/**
 * Returns the current status of an agent from the pool snapshot.
 *
 * Defaults to `'idle'` when the agent is not yet in the pool.
 *
 * @param pool - Pool snapshot from the server.
 * @param id   - Agent to look up.
 */
function workerStatus(pool: PoolState, id: AgentId): 'idle' | 'busy' {
  const worker: WorkerState | undefined = pool.find((w) => w.id === id)
  return worker?.status ?? 'idle'
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Small pill badge showing `Idle` (grey) or `Busy` (amber) next to a tab label.
 *
 * @param status - Current agent status.
 */
function StatusBadge({ status }: { status: 'idle' | 'busy' }) {
  const isBusy = status === 'busy'
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '1px 7px',
        borderRadius: '10px',
        fontSize: '11px',
        fontWeight: 600,
        background: isBusy ? '#f59e0b' : '#374151',
        color: isBusy ? '#000' : '#9ca3af',
        marginLeft: '6px',
      }}
    >
      {isBusy ? 'Busy' : 'Idle'}
    </span>
  )
}

// ---------------------------------------------------------------------------
// AgentTabs
// ---------------------------------------------------------------------------

/**
 * Tabbed panel hosting one {@link ConsolePane} per agent.
 *
 * All tab panels are mounted simultaneously so that each agent's chat state
 * is preserved when the user switches tabs. Inactive panels are hidden with
 * `display: none` rather than unmounted.
 */
export default function AgentTabs({ pool, events, onSend, onInterrupt }: AgentTabsProps) {
  const [activeId, setActiveId] = useState<AgentId>('supervisor')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Tab strip */}
      <div
        role="tablist"
        style={{
          display: 'flex',
          background: '#1f2937',
          borderBottom: '1px solid #374151',
          flexShrink: 0,
        }}
      >
        {AGENT_IDS.map((id) => {
          const isActive = id === activeId
          const status = workerStatus(pool, id)
          return (
            <button
              key={id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveId(id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 16px',
                background: isActive ? '#111827' : 'transparent',
                border: 'none',
                borderBottom: isActive ? '2px solid #3b82f6' : '2px solid transparent',
                color: isActive ? '#f9fafb' : '#9ca3af',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: isActive ? 600 : 400,
                whiteSpace: 'nowrap',
              }}
            >
              {tabLabel(id)}
              <StatusBadge status={status} />
            </button>
          )
        })}
      </div>

      {/* Tab panels — render all, hide inactive ones to preserve state */}
      {AGENT_IDS.map((id) => (
        <div
          key={id}
          role="tabpanel"
          hidden={id !== activeId}
          style={{
            flex: 1,
            minHeight: 0,
            display: id === activeId ? 'flex' : 'none',
            flexDirection: 'column',
          }}
        >
          <ConsolePane
            agentId={id}
            events={events[id] ?? []}
            onSend={(text) => onSend(id, text)}
            onInterrupt={() => onInterrupt(id)}
          />
        </div>
      ))}
    </div>
  )
}
