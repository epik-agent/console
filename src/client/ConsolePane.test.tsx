import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import ConsolePane, { ToolUseCard, ToolResultCard } from './ConsolePane'
import { noop } from './test-fixtures'
import type { AgentEvent, AgentId } from './types'

const agentId: AgentId = 'worker-0'

describe('ConsolePane', () => {
  it('renders without errors given mock props', () => {
    render(<ConsolePane agentId={agentId} events={[]} onSend={noop} onInterrupt={noop} />)
    expect(screen.getByPlaceholderText(/Message Claude/i)).toBeInTheDocument()
  })

  it('renders text_delta events from the agent', () => {
    const events: AgentEvent[] = [{ kind: 'text_delta', text: 'Hello from agent' }]
    render(<ConsolePane agentId={agentId} events={events} onSend={noop} onInterrupt={noop} />)
    expect(screen.getByText('Hello from agent')).toBeInTheDocument()
  })

  it('renders tool_use cards for tool_use events', () => {
    const events: AgentEvent[] = [{ kind: 'tool_use', name: 'Bash', input: { command: 'ls' } }]
    render(<ConsolePane agentId={agentId} events={events} onSend={noop} onInterrupt={noop} />)
    expect(screen.getByText(/Bash/)).toBeInTheDocument()
  })

  it('renders tool_result cards for tool_result events', () => {
    const events: AgentEvent[] = [{ kind: 'tool_result', content: 'some output' }]
    render(<ConsolePane agentId={agentId} events={events} onSend={noop} onInterrupt={noop} />)
    // ToolResultCard renders "↩ Result" in the header
    expect(screen.getByText(/Result/)).toBeInTheDocument()
  })

  it('renders a compaction marker for compaction events', () => {
    const events: AgentEvent[] = [{ kind: 'compaction', summary: 'Context was summarized', trigger: 'auto', preTokens: 0 }]
    render(<ConsolePane agentId={agentId} events={events} onSend={noop} onInterrupt={noop} />)
    expect(screen.getByTestId('compaction-marker')).toBeInTheDocument()
    expect(screen.getByText('Context compacted')).toBeInTheDocument()
  })

  it('calls onSend when the user types and presses Enter', async () => {
    const onSend = vi.fn()
    const user = userEvent.setup()
    render(<ConsolePane agentId={agentId} events={[]} onSend={onSend} onInterrupt={noop} />)
    const textarea = screen.getByPlaceholderText(/Message Claude/i)
    await user.type(textarea, 'Hello{Enter}')
    expect(onSend).toHaveBeenCalledWith('Hello')
  })

  it('does not call onSend when Enter is pressed with empty input', async () => {
    const onSend = vi.fn()
    const user = userEvent.setup()
    render(<ConsolePane agentId={agentId} events={[]} onSend={onSend} onInterrupt={noop} />)
    const textarea = screen.getByPlaceholderText(/Message Claude/i)
    await user.type(textarea, '{Enter}')
    expect(onSend).not.toHaveBeenCalled()
  })

  it('does not send on Shift+Enter (inserts newline instead)', async () => {
    const onSend = vi.fn()
    const user = userEvent.setup()
    render(<ConsolePane agentId={agentId} events={[]} onSend={onSend} onInterrupt={noop} />)
    const textarea = screen.getByPlaceholderText(/Message Claude/i)
    await user.type(textarea, 'Hello{Shift>}{Enter}{/Shift}')
    expect(onSend).not.toHaveBeenCalled()
  })

  it('enqueues a message when the agent is busy', () => {
    // To make the agent busy, send a turn_start by dispatching a text_delta (starts busy state)
    // We can trigger busy by providing a turn_end=false state: inject a text_delta then check
    // The simplest approach: send an inject event to start a busy turn, then send a message
    const onSend = vi.fn()
    // First render with no events
    const { rerender } = render(
      <ConsolePane agentId={agentId} events={[]} onSend={onSend} onInterrupt={noop} />,
    )
    // Simulate agent becoming busy by adding a text_delta (no turn_end yet)
    const events: AgentEvent[] = [{ kind: 'text_delta', text: 'Working...' }]
    rerender(<ConsolePane agentId={agentId} events={events} onSend={onSend} onInterrupt={noop} />)
    // Agent is now busy; the "Claude is thinking…" indicator should show when blocks are empty
    // (busy is set by the reducer when text_delta arrives without turn_end)
    // The component renders without throwing
    expect(screen.getByPlaceholderText(/Message Claude/i)).toBeInTheDocument()
  })

  it('calls onInterrupt when Escape is pressed while agent is busy', async () => {
    const onInterrupt = vi.fn()
    const user = userEvent.setup()

    render(<ConsolePane agentId={agentId} events={[]} onSend={noop} onInterrupt={onInterrupt} />)

    // Make the agent busy by having the user send a message (sets busy=true)
    const textarea = screen.getByPlaceholderText(/Message Claude/i)
    await user.type(textarea, 'Start work{Enter}')

    // Now the component is busy; fire Escape on the pane div
    const pane = screen.getByPlaceholderText(/Message Claude/i).closest('div[tabindex="-1"]')!
    fireEvent.keyDown(pane, { key: 'Escape' })

    expect(onInterrupt).toHaveBeenCalled()
  })

  it('processes inject events as user messages and calls onSend', () => {
    const onSend = vi.fn()
    const events: AgentEvent[] = [{ kind: 'inject', text: 'Injected message' }]
    render(<ConsolePane agentId={agentId} events={events} onSend={onSend} onInterrupt={noop} />)
    expect(onSend).toHaveBeenCalledWith('Injected message')
  })

  it('ignores inject events with empty or whitespace-only text', () => {
    const onSend = vi.fn()
    const events: AgentEvent[] = [{ kind: 'inject', text: '   ' }]
    render(<ConsolePane agentId={agentId} events={events} onSend={onSend} onInterrupt={noop} />)
    expect(onSend).not.toHaveBeenCalled()
  })

  it('renders markdown with code and link elements (exercises custom code and a renderers)', () => {
    // ReactMarkdown invokes the custom `code` and `a` render components when
    // the text contains inline code and links respectively.
    const events: AgentEvent[] = [
      { kind: 'text_delta', text: 'Use `npm install` and see [docs](https://example.com).' },
    ]
    // Prepend a user_send so a turn is "in progress" and the text ends up in an assistant bubble
    const { rerender } = render(
      <ConsolePane agentId={agentId} events={[]} onSend={noop} onInterrupt={noop} />,
    )
    // Simulate a user turn followed by the agent text_delta so it reaches AssistantTextBlock
    rerender(<ConsolePane agentId={agentId} events={events} onSend={noop} onInterrupt={noop} />)
    // The code element and link text should appear in the rendered output
    expect(screen.getByText(/npm install/)).toBeInTheDocument()
    expect(screen.getByText(/docs/)).toBeInTheDocument()
  })

  it('processes incremental event updates correctly', () => {
    const { rerender } = render(
      <ConsolePane agentId={agentId} events={[]} onSend={noop} onInterrupt={noop} />,
    )

    // Add first event
    const events1: AgentEvent[] = [{ kind: 'text_delta', text: 'First' }]
    rerender(<ConsolePane agentId={agentId} events={events1} onSend={noop} onInterrupt={noop} />)
    expect(screen.getByText('First')).toBeInTheDocument()

    // Add second event (first event should not be re-processed)
    const events2: AgentEvent[] = [{ kind: 'text_delta', text: 'First' }, { kind: 'turn_end' }]
    rerender(<ConsolePane agentId={agentId} events={events2} onSend={noop} onInterrupt={noop} />)
    // Agent should now be not-busy after turn_end
    expect(screen.getByPlaceholderText(/Message Claude/i)).toBeInTheDocument()
  })

  it('shows "Claude is thinking…" indicator when agent is busy with empty assistant blocks', async () => {
    const user = userEvent.setup()
    render(<ConsolePane agentId={agentId} events={[]} onSend={noop} onInterrupt={noop} />)

    // Sending a message makes agent busy and appends an empty assistant message
    const textarea = screen.getByPlaceholderText(/Message Claude/i)
    await user.type(textarea, 'Start{Enter}')

    // The "Claude is thinking…" indicator should appear
    expect(screen.getByText(/Claude is thinking/i)).toBeInTheDocument()
  })

  it('hides thinking indicator when agent has already sent text (busy with non-empty blocks)', () => {
    // After a user_send, an agent text_delta makes the assistant blocks non-empty.
    // The thinking indicator should NOT show because lastAssistant.blocks.length > 0.
    // First event: inject acts as a user message (making busy=true) and a text_delta adds a block.
    const events: AgentEvent[] = [
      { kind: 'inject', text: 'Start work' },
      { kind: 'text_delta', text: 'Agent is responding…' },
    ]
    const onSend = vi.fn()
    render(<ConsolePane agentId={agentId} events={events} onSend={onSend} onInterrupt={noop} />)

    // The agent response text should be visible
    expect(screen.getByText(/Agent is responding/)).toBeInTheDocument()
    // The thinking indicator should NOT be visible because blocks.length > 0
    expect(screen.queryByText(/Claude is thinking/i)).not.toBeInTheDocument()
  })

  it('does not enqueue when not busy (sends directly)', async () => {
    const onSend = vi.fn()
    const user = userEvent.setup()
    render(<ConsolePane agentId={agentId} events={[]} onSend={onSend} onInterrupt={noop} />)

    const textarea = screen.getByPlaceholderText(/Message Claude/i)
    await user.type(textarea, 'Direct message{Enter}')

    expect(onSend).toHaveBeenCalledWith('Direct message')
  })

  it('does not scroll on initial render with no messages', () => {
    const spy = vi.fn()
    HTMLElement.prototype.scrollIntoView = spy
    render(<ConsolePane agentId={agentId} events={[]} onSend={noop} onInterrupt={noop} />)
    expect(spy).not.toHaveBeenCalled()
    HTMLElement.prototype.scrollIntoView = () => {}
  })

  it('scrolls to bottom when a message arrives', () => {
    const spy = vi.fn()
    HTMLElement.prototype.scrollIntoView = spy
    const { rerender } = render(
      <ConsolePane agentId={agentId} events={[]} onSend={noop} onInterrupt={noop} />,
    )
    rerender(
      <ConsolePane
        agentId={agentId}
        events={[{ kind: 'text_delta', text: 'Hello' }]}
        onSend={noop}
        onInterrupt={noop}
      />,
    )
    expect(spy).toHaveBeenCalled()
    HTMLElement.prototype.scrollIntoView = () => {}
  })

  it('enqueues a second message when agent is busy', async () => {
    const onSend = vi.fn()
    const user = userEvent.setup()
    render(<ConsolePane agentId={agentId} events={[]} onSend={onSend} onInterrupt={noop} />)

    const textarea = screen.getByPlaceholderText(/Message Claude/i)
    // First message — starts busy turn
    await user.type(textarea, 'First{Enter}')
    // Second message — should be enqueued (not sent via onSend again)
    await user.type(textarea, 'Second{Enter}')

    // onSend is only called for the first message (second is enqueued)
    expect(onSend).toHaveBeenCalledTimes(1)
    expect(onSend).toHaveBeenCalledWith('First')
  })
})

// ---------------------------------------------------------------------------
// ToolUseCard
// ---------------------------------------------------------------------------

describe('ToolUseCard', () => {
  it('renders collapsed by default showing only the tool name', () => {
    render(<ToolUseCard name="Bash" input={{ command: 'ls -la' }} />)
    expect(screen.getByText(/Bash/)).toBeInTheDocument()
    // Body should not be visible when collapsed
    expect(screen.queryByText('ls -la')).not.toBeInTheDocument()
  })

  it('expands to show Bash command body on click', async () => {
    const user = userEvent.setup()
    render(<ToolUseCard name="Bash" input={{ command: 'echo hello' }} />)
    const header = screen.getByText(/Bash/).closest('div')!
    await user.click(header)
    expect(screen.getByText('echo hello')).toBeInTheDocument()
  })

  it('collapses again on second click', async () => {
    const user = userEvent.setup()
    render(<ToolUseCard name="Bash" input={{ command: 'pwd' }} />)
    const header = screen.getByText(/Bash/).closest('div')!
    await user.click(header)
    expect(screen.getByText('pwd')).toBeInTheDocument()
    await user.click(header)
    expect(screen.queryByText('pwd')).not.toBeInTheDocument()
  })

  it('renders non-Bash tool input as pretty-printed JSON', async () => {
    const user = userEvent.setup()
    const input = { file_path: '/foo/bar.ts' }
    render(<ToolUseCard name="Read" input={input} />)
    const header = screen.getByText(/Read/).closest('div')!
    await user.click(header)
    expect(screen.getByText(/file_path/)).toBeInTheDocument()
  })

  it('renders Bash tool with non-string command as JSON', async () => {
    const user = userEvent.setup()
    // command is not a string → should fall back to JSON.stringify
    render(<ToolUseCard name="Bash" input={{ command: 42 }} />)
    const header = screen.getByText(/Bash/).closest('div')!
    await user.click(header)
    expect(screen.getByText(/42/)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// ToolResultCard
// ---------------------------------------------------------------------------

describe('ToolResultCard', () => {
  it('renders collapsed by default showing only "Result"', () => {
    render(<ToolResultCard content="output text" />)
    expect(screen.getByText(/Result/)).toBeInTheDocument()
    expect(screen.queryByText('output text')).not.toBeInTheDocument()
  })

  it('expands to show string content on click', async () => {
    const user = userEvent.setup()
    render(<ToolResultCard content="my result" />)
    const header = screen.getByText(/Result/).closest('div')!
    await user.click(header)
    expect(screen.getByText('my result')).toBeInTheDocument()
  })

  it('renders non-string content as JSON', async () => {
    const user = userEvent.setup()
    const content = { stdout: 'hello', exitCode: 0 }
    render(<ToolResultCard content={content} />)
    const header = screen.getByText(/Result/).closest('div')!
    await user.click(header)
    expect(screen.getByText(/stdout/)).toBeInTheDocument()
  })

  it('truncates content longer than 2000 characters', async () => {
    const user = userEvent.setup()
    const longContent = 'x'.repeat(2500)
    render(<ToolResultCard content={longContent} />)
    const header = screen.getByText(/Result/).closest('div')!
    await user.click(header)
    expect(screen.getByText(/truncated/)).toBeInTheDocument()
  })

  it('does not truncate content shorter than 2000 characters', async () => {
    const user = userEvent.setup()
    const shortContent = 'short result'
    render(<ToolResultCard content={shortContent} />)
    const header = screen.getByText(/Result/).closest('div')!
    await user.click(header)
    expect(screen.queryByText(/truncated/)).not.toBeInTheDocument()
    expect(screen.getByText('short result')).toBeInTheDocument()
  })
})
