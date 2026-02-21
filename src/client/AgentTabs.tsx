import { useState } from 'react'
import ConsolePane from './ConsolePane'
import type { AgentEvent, AgentId, PoolState, WorkerState } from './types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentTabsProps {
  pool: PoolState
  events: Record<AgentId, AgentEvent[]>
  agentIssueMap?: Partial<Record<AgentId, number>>
  onSend: (agentId: AgentId, text: string) => void
  onInterrupt: (agentId: AgentId) => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AGENT_IDS: AgentId[] = ['supervisor', 'worker-0', 'worker-1', 'worker-2']

function tabLabel(id: AgentId): string {
  if (id === 'supervisor') return 'Supervisor'
  const n = id.split('-')[1]
  return `Worker ${n}`
}

function workerStatus(pool: PoolState, id: AgentId): 'idle' | 'busy' {
  const worker: WorkerState | undefined = pool.find((w) => w.id === id)
  return worker?.status ?? 'idle'
}

// ---------------------------------------------------------------------------
// AgentTabs
// ---------------------------------------------------------------------------

export default function AgentTabs({
  pool,
  events,
  agentIssueMap,
  onSend,
  onInterrupt,
}: AgentTabsProps) {
  const [activeId, setActiveId] = useState<AgentId>('supervisor')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Tab strip */}
      <div role="tablist" className="tab-strip">
        {AGENT_IDS.map((id) => {
          const isActive = id === activeId
          const status = workerStatus(pool, id)
          const issue = agentIssueMap?.[id]
          return (
            <button
              key={id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveId(id)}
              className="tab-btn"
            >
              <span className={`tab-status-dot tab-status-dot--${status}`} />
              {tabLabel(id)}
              {issue !== undefined && (
                <span className="tab-issue-label">
                  {'#'}
                  {issue}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Tab panels */}
      {AGENT_IDS.map((id) => (
        <div
          key={id}
          role="tabpanel"
          hidden={id !== activeId}
          className="tab-panel"
          style={{ display: id === activeId ? 'flex' : 'none' }}
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
