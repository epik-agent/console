import { describe, expect, it } from 'vitest'
import { appendToLastAssistant, chatReducer, initialChatState, type ChatState } from './chatReducer'
import type { AgentEvent, AssistantMessage, Message } from './types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assistantState(messages: Message[]): ChatState {
  return { messages, busy: false }
}

// ---------------------------------------------------------------------------
// user_send
// ---------------------------------------------------------------------------

describe('user_send', () => {
  it('appends user and empty assistant messages', () => {
    const state = chatReducer(initialChatState, { type: 'user_send', text: 'Hello' })
    expect(state.messages).toHaveLength(2)
    expect(state.messages[0]).toEqual({ role: 'user', text: 'Hello' })
    expect(state.messages[1]).toEqual({ role: 'assistant', blocks: [] })
  })

  it('sets busy to true', () => {
    const state = chatReducer(initialChatState, { type: 'user_send', text: 'Hello' })
    expect(state.busy).toBe(true)
  })

  it('trims leading/trailing whitespace from text', () => {
    // user_send does NOT trim — the component is responsible for trimming
    const state = chatReducer(initialChatState, { type: 'user_send', text: '  Hi  ' })
    expect(state.messages[0]).toEqual({ role: 'user', text: '  Hi  ' })
  })
})

// ---------------------------------------------------------------------------
// interrupted
// ---------------------------------------------------------------------------

describe('interrupted', () => {
  it('sets busy to false', () => {
    const busy: ChatState = { messages: [], busy: true }
    const state = chatReducer(busy, { type: 'interrupted' })
    expect(state.busy).toBe(false)
  })

  it('preserves messages', () => {
    const msgs: Message[] = [{ role: 'user', text: 'Hi' }]
    const state = chatReducer({ messages: msgs, busy: true }, { type: 'interrupted' })
    expect(state.messages).toEqual(msgs)
  })
})

// ---------------------------------------------------------------------------
// enqueue_user
// ---------------------------------------------------------------------------

describe('enqueue_user', () => {
  it('appends a user message without changing busy', () => {
    const state = chatReducer({ messages: [], busy: true }, { type: 'enqueue_user', text: 'Next' })
    expect(state.messages).toEqual([{ role: 'user', text: 'Next' }])
    expect(state.busy).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// agent_event — text_delta
// ---------------------------------------------------------------------------

describe('agent_event / text_delta', () => {
  function textDelta(text: string): { type: 'agent_event'; event: AgentEvent } {
    return { type: 'agent_event', event: { kind: 'text_delta', text } }
  }

  it('appends a new text block when last block is not text', () => {
    const initial: ChatState = {
      messages: [{ role: 'assistant', blocks: [] }],
      busy: true,
    }
    const state = chatReducer(initial, textDelta('Hello'))
    const blocks = (state.messages[0] as AssistantMessage).blocks
    expect(blocks).toEqual([{ type: 'text', text: 'Hello' }])
  })

  it('merges into the last text block', () => {
    const initial: ChatState = {
      messages: [{ role: 'assistant', blocks: [{ type: 'text', text: 'Hello' }] }],
      busy: true,
    }
    const state = chatReducer(initial, textDelta(' world'))
    const blocks = (state.messages[0] as AssistantMessage).blocks
    expect(blocks).toEqual([{ type: 'text', text: 'Hello world' }])
  })

  it('creates a new assistant message if none exists', () => {
    const state = chatReducer(initialChatState, textDelta('Hi'))
    expect(state.messages).toHaveLength(1)
    expect((state.messages[0] as AssistantMessage).blocks).toEqual([{ type: 'text', text: 'Hi' }])
  })
})

// ---------------------------------------------------------------------------
// agent_event — tool_use
// ---------------------------------------------------------------------------

describe('agent_event / tool_use', () => {
  it('appends a tool_use block to the last assistant message', () => {
    const initial: ChatState = {
      messages: [{ role: 'assistant', blocks: [] }],
      busy: true,
    }
    const event: AgentEvent = { kind: 'tool_use', name: 'Bash', input: { command: 'ls' } }
    const state = chatReducer(initial, { type: 'agent_event', event })
    const blocks = (state.messages[0] as AssistantMessage).blocks
    expect(blocks).toEqual([{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }])
  })
})

// ---------------------------------------------------------------------------
// agent_event — tool_result
// ---------------------------------------------------------------------------

describe('agent_event / tool_result', () => {
  it('appends a tool_result block to the last assistant message', () => {
    const initial: ChatState = {
      messages: [{ role: 'assistant', blocks: [{ type: 'tool_use', name: 'Bash', input: {} }] }],
      busy: true,
    }
    const event: AgentEvent = { kind: 'tool_result', content: 'file1\nfile2' }
    const state = chatReducer(initial, { type: 'agent_event', event })
    const blocks = (state.messages[0] as AssistantMessage).blocks
    expect(blocks[1]).toEqual({ type: 'tool_result', content: 'file1\nfile2' })
  })
})

// ---------------------------------------------------------------------------
// agent_event — turn_end
// ---------------------------------------------------------------------------

describe('agent_event / turn_end', () => {
  it('sets busy to false', () => {
    const state = chatReducer(
      { messages: [], busy: true },
      { type: 'agent_event', event: { kind: 'turn_end' } },
    )
    expect(state.busy).toBe(false)
  })

  it('preserves messages', () => {
    const msgs: Message[] = [{ role: 'user', text: 'Hi' }]
    const state = chatReducer(
      { messages: msgs, busy: true },
      { type: 'agent_event', event: { kind: 'turn_end' } },
    )
    expect(state.messages).toEqual(msgs)
  })
})

// ---------------------------------------------------------------------------
// agent_event — error
// ---------------------------------------------------------------------------

describe('agent_event / error', () => {
  it('appends an error text block and sets busy to false', () => {
    const initial: ChatState = {
      messages: [{ role: 'assistant', blocks: [] }],
      busy: true,
    }
    const state = chatReducer(initial, {
      type: 'agent_event',
      event: { kind: 'error', message: 'Something went wrong' },
    })
    expect(state.busy).toBe(false)
    const blocks = (state.messages[0] as AssistantMessage).blocks
    expect(blocks[0]).toEqual({ type: 'text', text: '**Error:** Something went wrong' })
  })
})

// ---------------------------------------------------------------------------
// agent_event — inject
// ---------------------------------------------------------------------------

describe('agent_event / inject', () => {
  it('returns state unchanged', () => {
    const msgs: Message[] = [{ role: 'user', text: 'Hi' }]
    const initial = assistantState(msgs)
    const state = chatReducer(initial, {
      type: 'agent_event',
      event: { kind: 'inject', text: 'injected' },
    })
    expect(state).toEqual(initial)
  })
})

// ---------------------------------------------------------------------------
// agent_event — compaction
// ---------------------------------------------------------------------------

describe('agent_event / compaction', () => {
  it('appends a compaction message', () => {
    const state = chatReducer(initialChatState, {
      type: 'agent_event',
      event: { kind: 'compaction', summary: 'Context compacted', trigger: 'auto', preTokens: 0 },
    })
    expect(state.messages).toHaveLength(1)
    expect(state.messages[0]).toEqual({
      role: 'compaction',
      summary: 'Context compacted',
      trigger: 'auto',
      preTokens: 0,
    })
  })
})

// ---------------------------------------------------------------------------
// appendToLastAssistant helper
// ---------------------------------------------------------------------------

describe('appendToLastAssistant', () => {
  it('updates the last assistant message', () => {
    const msgs: Message[] = [
      { role: 'user', text: 'Hi' },
      { role: 'assistant', blocks: [] },
    ]
    const result = appendToLastAssistant(msgs, () => [{ type: 'text', text: 'Hello' }])
    expect((result[1] as AssistantMessage).blocks).toEqual([{ type: 'text', text: 'Hello' }])
  })

  it('appends a new assistant message if none exists', () => {
    const msgs: Message[] = [{ role: 'user', text: 'Hi' }]
    const result = appendToLastAssistant(msgs, () => [{ type: 'text', text: 'Hello' }])
    expect(result).toHaveLength(2)
    expect((result[1] as AssistantMessage).blocks).toEqual([{ type: 'text', text: 'Hello' }])
  })

  it('updates the LAST assistant message when multiple exist', () => {
    const msgs: Message[] = [
      { role: 'assistant', blocks: [{ type: 'text', text: 'First' }] },
      { role: 'user', text: 'Hi' },
      { role: 'assistant', blocks: [] },
    ]
    const result = appendToLastAssistant(msgs, () => [{ type: 'text', text: 'Second' }])
    expect((result[0] as AssistantMessage).blocks).toEqual([{ type: 'text', text: 'First' }])
    expect((result[2] as AssistantMessage).blocks).toEqual([{ type: 'text', text: 'Second' }])
  })
})
