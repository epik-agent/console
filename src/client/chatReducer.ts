import type {
  AgentEvent,
  AssistantMessage,
  Block,
  CompactionMessage,
  Message,
  TextBlock,
} from './types'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** Immutable state managed by {@link chatReducer} for a single agent pane. */
export interface ChatState {
  /** Ordered list of user and assistant messages in the conversation. */
  messages: Message[]
  /**
   * `true` while an agent turn is in progress (between `user_send` and
   * `turn_end` / `interrupted`).
   */
  busy: boolean
}

/** The initial empty state for a freshly opened pane. */
export const initialChatState: ChatState = { messages: [], busy: false }

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Union of all actions accepted by {@link chatReducer}.
 *
 * - `user_send` — user submits a message; appends a user bubble and an empty
 *   assistant bubble, sets `busy = true`.
 * - `agent_event` — an {@link AgentEvent} arrived from the agent runner;
 *   updates the last assistant message in-place.
 * - `interrupted` — the agent turn was cancelled; clears `busy`.
 * - `enqueue_user` — appends a user message without starting a turn (used
 *   when a second message arrives while the agent is already busy).
 */
export type ChatAction =
  | { type: 'user_send'; text: string }
  | { type: 'agent_event'; event: AgentEvent }
  | { type: 'interrupted' }
  | { type: 'enqueue_user'; text: string }

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

/**
 * Pure reducer for chat state.
 *
 * All message mutations (streaming text deltas, tool blocks, errors) are
 * handled here so that the component only needs to dispatch actions.
 */
export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'user_send': {
      return {
        messages: [
          ...state.messages,
          { role: 'user', text: action.text },
          { role: 'assistant', blocks: [] },
        ],
        busy: true,
      }
    }

    case 'interrupted':
      return { ...state, busy: false }

    case 'enqueue_user':
      return { ...state, messages: [...state.messages, { role: 'user', text: action.text }] }

    case 'agent_event': {
      const { event } = action
      switch (event.kind) {
        case 'text_delta':
          return {
            ...state,
            messages: appendToLastAssistant(state.messages, (blocks) => {
              const last = blocks[blocks.length - 1]
              if (last?.type === 'text') {
                return [
                  ...blocks.slice(0, -1),
                  { type: 'text', text: last.text + event.text } satisfies TextBlock,
                ]
              }
              return [...blocks, { type: 'text', text: event.text }]
            }),
          }

        case 'tool_use':
          return {
            ...state,
            messages: appendToLastAssistant(state.messages, (blocks) => [
              ...blocks,
              { type: 'tool_use', name: event.name, input: event.input },
            ]),
          }

        case 'tool_result':
          return {
            ...state,
            messages: appendToLastAssistant(state.messages, (blocks) => [
              ...blocks,
              { type: 'tool_result', content: event.content },
            ]),
          }

        case 'turn_end':
          return { ...state, busy: false }

        case 'error':
          return {
            busy: false,
            messages: appendToLastAssistant(state.messages, (blocks) => [
              ...blocks,
              { type: 'text', text: `**Error:** ${event.message}` },
            ]),
          }

        case 'inject':
          // inject is handled by the component (triggers a send), not by message state
          return state

        case 'compaction':
          // Insert a compaction marker into the message list at the current position
          return {
            ...state,
            messages: [
              ...state.messages,
              { role: 'compaction', summary: event.summary, trigger: event.trigger, preTokens: event.preTokens } satisfies CompactionMessage,
            ],
          }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Pure helper
// ---------------------------------------------------------------------------

/**
 * Applies `updater` to the {@link Block} array of the last {@link AssistantMessage}
 * in `messages`, returning a new array with that message replaced.
 *
 * If no assistant message exists, a new one is appended with `updater([])`.
 */
export function appendToLastAssistant(
  messages: Message[],
  updater: (blocks: Block[]) => Block[],
): Message[] {
  const idx = [...messages].reverse().findIndex((m) => m.role === 'assistant')
  if (idx === -1) return [...messages, { role: 'assistant', blocks: updater([]) }]
  const realIdx = messages.length - 1 - idx
  return messages.map((m, i) => {
    if (i !== realIdx) return m
    const a = m as AssistantMessage
    return { ...a, blocks: updater([...a.blocks]) }
  })
}
