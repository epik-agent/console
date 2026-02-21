import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import AgentTabs from './AgentTabs'
import type { AgentId, PoolState } from './types'

const pool: PoolState = [
  { id: 'supervisor', role: 'supervisor', status: 'idle', sessionId: undefined },
  { id: 'worker-0', role: 'worker', status: 'idle', sessionId: undefined },
  { id: 'worker-1', role: 'worker', status: 'busy', sessionId: 'abc' },
  { id: 'worker-2', role: 'worker', status: 'idle', sessionId: undefined },
]

const events: Record<AgentId, []> = {
  supervisor: [],
  'worker-0': [],
  'worker-1': [],
  'worker-2': [],
}

const noop = () => {}

describe('AgentTabs', () => {
  it('renders four tab labels', () => {
    render(<AgentTabs pool={pool} events={events} onSend={noop} onInterrupt={noop} />)
    expect(screen.getByRole('tab', { name: /supervisor/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /worker 0/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /worker 1/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /worker 2/i })).toBeInTheDocument()
  })

  it('shows Idle badge for idle agents', () => {
    render(<AgentTabs pool={pool} events={events} onSend={noop} onInterrupt={noop} />)
    // Supervisor is idle — expect at least one Idle badge
    const idleBadges = screen.getAllByText('Idle')
    expect(idleBadges.length).toBeGreaterThan(0)
  })

  it('shows Busy badge for busy agents', () => {
    render(<AgentTabs pool={pool} events={events} onSend={noop} onInterrupt={noop} />)
    expect(screen.getByText('Busy')).toBeInTheDocument()
  })

  it('switches active tab when a tab is clicked', async () => {
    const user = userEvent.setup()
    render(<AgentTabs pool={pool} events={events} onSend={noop} onInterrupt={noop} />)
    const worker0Tab = screen.getByRole('tab', { name: /worker 0/i })
    await user.click(worker0Tab)
    expect(worker0Tab).toHaveAttribute('aria-selected', 'true')
  })

  it('renders ConsolePane for the active tab', () => {
    render(<AgentTabs pool={pool} events={events} onSend={noop} onInterrupt={noop} />)
    // All 4 ConsolePanes are rendered (to preserve state); at least one textarea is present
    const textareas = screen.getAllByPlaceholderText(/Message Claude/i)
    expect(textareas.length).toBe(4)
  })
})
