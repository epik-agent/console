import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import AgentTabs from './AgentTabs'
import { makeEvents, noop, defaultPool } from './test-fixtures'
import type { AgentEvent, AgentId } from './types'

const pool = defaultPool
const events = makeEvents()

describe('AgentTabs', () => {
  it('renders four tab labels', () => {
    render(<AgentTabs pool={pool} events={events} onSend={noop} onInterrupt={noop} />)
    expect(screen.getByRole('tab', { name: /supervisor/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /worker 0/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /worker 1/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /worker 2/i })).toBeInTheDocument()
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

  it('renders status dots for each tab', () => {
    const { container } = render(
      <AgentTabs pool={pool} events={events} onSend={noop} onInterrupt={noop} />,
    )
    const busyDots = container.querySelectorAll('.tab-status-dot--busy')
    const idleDots = container.querySelectorAll('.tab-status-dot--idle')
    expect(busyDots.length).toBe(1) // worker-1 is busy
    expect(idleDots.length).toBe(3)
  })

  it('shows issue label when agentIssueMap has an entry', () => {
    render(
      <AgentTabs
        pool={pool}
        events={events}
        agentIssueMap={{ 'worker-0': 42 }}
        onSend={noop}
        onInterrupt={noop}
      />,
    )
    expect(screen.getByText('#42')).toBeInTheDocument()
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
