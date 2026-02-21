import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import AgentTabs from './AgentTabs'
import type { AgentEvent, AgentId, PoolState } from './types'

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

  it('defaults to Idle badge when an agent is not in the pool', () => {
    // Provide an empty pool so no agents are found
    render(<AgentTabs pool={[]} events={events} onSend={noop} onInterrupt={noop} />)
    const idleBadges = screen.getAllByText('Idle')
    // All 4 agents should show Idle
    expect(idleBadges.length).toBe(4)
  })

  it('calls onSend with the correct agentId when a message is sent', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<AgentTabs pool={pool} events={events} onSend={onSend} onInterrupt={noop} />)

    // The supervisor pane is active by default
    const textareas = screen.getAllByPlaceholderText(/Message Claude/i)
    await user.type(textareas[0], 'Test message{Enter}')

    expect(onSend).toHaveBeenCalledWith('supervisor', 'Test message')
  })

  it('calls onInterrupt with the correct agentId when interrupted', async () => {
    const user = userEvent.setup()
    const onInterrupt = vi.fn()
    render(<AgentTabs pool={pool} events={events} onSend={noop} onInterrupt={onInterrupt} />)

    // Make the supervisor pane busy by sending a message first
    const textareas = screen.getAllByPlaceholderText(/Message Claude/i)
    await user.type(textareas[0], 'Start work{Enter}')

    // Now press Escape to interrupt
    const pane = textareas[0].closest('div[tabindex="-1"]')!
    fireEvent.keyDown(pane, { key: 'Escape' })

    expect(onInterrupt).toHaveBeenCalledWith('supervisor')
  })

  it('falls back to empty array when events[id] is undefined', () => {
    // Pass a partial events object that is missing some agent keys
    const partialEvents = { supervisor: [] } as unknown as Record<AgentId, AgentEvent[]>
    expect(() =>
      render(<AgentTabs pool={pool} events={partialEvents} onSend={noop} onInterrupt={noop} />),
    ).not.toThrow()
    // All 4 ConsolePanes should still render (with empty events for missing agents)
    const textareas = screen.getAllByPlaceholderText(/Message Claude/i)
    expect(textareas.length).toBe(4)
  })
})
