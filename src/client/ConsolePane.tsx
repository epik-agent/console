import React, { memo, useCallback, useEffect, useReducer, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github-dark.css'
import { chatReducer, type ChatState } from './chatReducer'
import { themes } from './theme'
import type { AgentEvent, AgentId, AssistantMessage, Block } from './types'
import { unescapeJsonString } from './utils'
import type { Palette, Theme } from './theme'

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Right-aligned bubble displaying a user-submitted message.
 *
 * @param text - Plain-text message body.
 */
function UserBubble({ text }: { text: string }) {
  return (
    <div style={bubbleWrapperStyle}>
      <div style={userBubbleStyle}>{text}</div>
    </div>
  )
}

const bubbleWrapperStyle: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end' }
const userBubbleStyle: React.CSSProperties = {
  background: '#2563eb',
  color: '#fff',
  borderRadius: '18px 18px 4px 18px',
  padding: '10px 16px',
  maxWidth: '70%',
  whiteSpace: 'pre-wrap',
  lineHeight: 1.5,
}

/**
 * Renders a text block from the assistant using GitHub-Flavored Markdown with
 * syntax highlighting via `highlight.js`.
 *
 * @param text - Markdown string to render.
 */
function AssistantTextBlock({ text }: { text: string }) {
  return (
    <div style={assistantTextStyle}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          code: ({ className, children }) => <code className={className}>{children}</code>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}

const assistantTextStyle: React.CSSProperties = { lineHeight: 1.6, fontSize: '15px' }

/**
 * Collapsible card displaying a tool invocation (name + formatted input).
 *
 * Bash commands are shown as the raw `command` string; all other tools display
 * their input as pretty-printed JSON. The card is collapsed by default.
 *
 * @param name    - Tool name (e.g. `"Bash"`, `"Read"`).
 * @param input   - Tool input payload as received from the agent.
 * @param palette - Active colour palette for theming.
 */
export function ToolUseCard({
  name,
  input,
  palette,
}: {
  name: string
  input: unknown
  palette: Palette
}) {
  const s = makeToolStyles(palette)
  const [collapsed, setCollapsed] = React.useState(true)
  const display = unescapeJsonString(
    name === 'Bash' && typeof (input as Record<string, unknown>)?.command === 'string'
      ? (input as { command: string }).command
      : JSON.stringify(input, null, 2),
  )
  return (
    <div style={s.toolCard}>
      <div
        style={{ ...s.toolCardHeader, ...s.toolCardHeaderClickable }}
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
      >
        <span style={s.toolCardChevron}>{collapsed ? '▶' : '▼'}</span>⚙ {name}
      </div>
      {!collapsed && <pre style={s.toolCardBody}>{display}</pre>}
    </div>
  )
}

/**
 * Collapsible card displaying a tool result.
 *
 * Content longer than 2 000 characters is truncated with an ellipsis. The
 * card is collapsed by default.
 *
 * @param content - Raw tool result content (string or structured value).
 * @param palette - Active colour palette for theming.
 */
export function ToolResultCard({ content, palette }: { content: unknown; palette: Palette }) {
  const s = makeToolStyles(palette)
  const [collapsed, setCollapsed] = React.useState(true)
  const raw = unescapeJsonString(
    typeof content === 'string' ? content : JSON.stringify(content, null, 2),
  )
  const display = raw.length > 2000 ? raw.slice(0, 2000) + '\n… (truncated)' : raw
  return (
    <div style={{ ...s.toolCard, ...s.toolResultCard }}>
      <div
        style={{ ...s.toolCardHeader, ...s.toolCardHeaderClickable }}
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
      >
        <span style={s.toolCardChevron}>{collapsed ? '▶' : '▼'}</span>↩ Result
      </div>
      {!collapsed && <pre style={s.toolCardBody}>{display}</pre>}
    </div>
  )
}

/**
 * Horizontal rule inserted into the chat history when the SDK compacts the
 * context window, so the user can see where earlier conversation was summarised.
 *
 * @param palette - Active colour palette for theming.
 */
function CompactionMarker({ palette }: { palette: Palette }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        color: palette.text.faint,
        fontSize: '12px',
        margin: '4px 0',
      }}
      data-testid="compaction-marker"
    >
      <div style={{ flex: 1, height: '1px', background: palette.border.default }} />
      <span>Context compacted</span>
      <div style={{ flex: 1, height: '1px', background: palette.border.default }} />
    </div>
  )
}

/**
 * Renders an ordered list of {@link Block}s from a single assistant message.
 *
 * Memoised so that the expensive Markdown render only re-runs when the block
 * array or palette reference changes.
 *
 * @param blocks  - Content blocks for the assistant message.
 * @param palette - Active colour palette for theming.
 */
const AssistantBlocks = memo(function AssistantBlocks({
  blocks,
  palette,
}: {
  blocks: Block[]
  palette: Palette
}) {
  return (
    <div style={assistantWrapperStyle}>
      {blocks.map((block, i) => {
        if (block.type === 'text') return <AssistantTextBlock key={i} text={block.text} />
        if (block.type === 'tool_use')
          return <ToolUseCard key={i} name={block.name} input={block.input} palette={palette} />
        if (block.type === 'tool_result')
          return <ToolResultCard key={i} content={block.content} palette={palette} />
        /* v8 ignore next */
        return null
      })}
    </div>
  )
})

const assistantWrapperStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  maxWidth: '100%',
}

// ---------------------------------------------------------------------------
// ConsolePane
// ---------------------------------------------------------------------------

/** Props for the {@link ConsolePane} component. */
interface ConsolePaneProps {
  /** Identity of the agent this pane is displaying. */
  agentId: AgentId
  /**
   * Ordered list of events received for this agent.
   *
   * New events are appended by the parent — the pane processes only the slice
   * it hasn't seen yet on each render.
   */
  events: AgentEvent[]
  /**
   * Called when the user submits a message (Enter key or Send button).
   *
   * @param text - Trimmed message body.
   */
  onSend: (text: string) => void
  /** Called when the user presses Escape to interrupt an in-progress turn. */
  onInterrupt: () => void
  /** Active colour theme; defaults to `'dark'`. */
  theme?: Theme
}

/**
 * Chat pane for a single agent.
 *
 * Maintains its own {@link ChatState} via `useReducer`. Incoming `events` are
 * diffed against a processed-count ref so that only new events are dispatched.
 * `inject` events are treated as user messages and trigger a send automatically.
 * Pressing Escape while the agent is busy fires `onInterrupt`.
 */
export default function ConsolePane(props: ConsolePaneProps) {
  const { events, onSend, onInterrupt, theme = 'dark' } = props
  const palette = themes[theme]
  const s = makeStyles(palette)

  const [{ messages, busy }, dispatch] = useReducer(
    chatReducer,
    [],
    (msgs): ChatState => ({ messages: msgs, busy: false }),
  )
  const [input, setInput] = React.useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const paneRef = useRef<HTMLDivElement>(null)
  const processedCountRef = useRef(0)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Process new incoming events from the events array
  useEffect(() => {
    const newEvents = events.slice(processedCountRef.current)
    for (const event of newEvents) {
      if (event.kind === 'inject') {
        const text = event.text.trim()
        if (text) {
          dispatch({ type: 'user_send', text })
          onSend(text)
        }
      } else {
        dispatch({ type: 'agent_event', event })
      }
    }
    processedCountRef.current = events.length
  }, [events, onSend])

  // Keyboard shortcut: Escape to interrupt
  useEffect(() => {
    const el = paneRef.current
    /* v8 ignore next 2 */
    if (!el) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && busy) {
        e.preventDefault()
        dispatch({ type: 'interrupted' })
        onInterrupt()
      }
    }
    el.addEventListener('keydown', onKey)
    return () => el.removeEventListener('keydown', onKey)
  }, [busy, onInterrupt])

  const handleSend = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      if (busy) {
        dispatch({ type: 'enqueue_user', text: trimmed })
        return
      }
      dispatch({ type: 'user_send', text: trimmed })
      onSend(trimmed)
    },
    [busy, onSend],
  )

  const sendMessage = useCallback(() => {
    const text = input.trim()
    if (!text) return
    setInput('')
    handleSend(text)
  }, [input, handleSend])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        sendMessage()
      }
    },
    [sendMessage],
  )

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant') as
    | AssistantMessage
    | undefined

  return (
    <div ref={paneRef} style={s.pane} tabIndex={-1}>
      <div style={s.messageList}>
        {messages.map((msg, i) => {
          if (msg.role === 'user') return <UserBubble key={i} text={msg.text} />
          if (msg.role === 'compaction') return <CompactionMarker key={i} palette={palette} />
          return <AssistantBlocks key={i} blocks={msg.blocks} palette={palette} />
        })}
        {busy && lastAssistant?.blocks.length === 0 && (
          <div style={s.thinking}>Claude is thinking…</div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={s.inputBar}>
        <textarea
          style={s.textarea}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Message Claude… (Enter to send, Shift+Enter for newline)"
          rows={3}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

/**
 * Returns the style map for the main pane layout, derived from `p`.
 *
 * @param p - Active colour palette.
 */
function makeStyles(p: Palette): Record<string, React.CSSProperties> {
  return {
    pane: { display: 'flex', flexDirection: 'column', height: '100%', background: p.bg.root },
    messageList: {
      flex: 1,
      overflowY: 'auto',
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
    },
    thinking: { color: p.text.faint, fontStyle: 'italic', fontSize: '14px' },
    inputBar: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '12px 16px',
      background: p.bg.inputBar,
      borderTop: `1px solid ${p.border.default}`,
      flexShrink: 0,
    },
    textarea: {
      flex: 1,
      background: p.bg.root,
      color: p.text.primary,
      border: `1px solid ${p.border.default}`,
      borderRadius: '8px',
      padding: '10px 14px',
      fontSize: '15px',
      fontFamily: 'inherit',
      resize: 'none',
      outline: 'none',
      lineHeight: 1.5,
    },
  }
}

/**
 * Returns the style map for tool-use and tool-result cards, derived from `p`.
 *
 * @param p - Active colour palette.
 */
function makeToolStyles(p: Palette): Record<string, React.CSSProperties> {
  return {
    toolCard: {
      background: p.bg.toolCard,
      border: `1px solid ${p.border.default}`,
      borderRadius: '8px',
      overflow: 'hidden',
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '13px',
    },
    toolResultCard: { borderColor: p.border.toolResult, background: p.bg.toolResult },
    toolCardHeader: {
      background: p.bg.toolHeader,
      color: p.text.toolHeader,
      padding: '6px 12px',
      fontWeight: 600,
      fontSize: '12px',
      letterSpacing: '0.05em',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
    },
    toolCardHeaderClickable: {
      cursor: 'pointer',
      userSelect: 'none' as const,
    },
    toolCardChevron: {
      fontSize: '9px',
      flexShrink: 0,
    },
    toolCardBody: {
      margin: 0,
      padding: '12px',
      color: p.text.toolBody,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-all',
      maxHeight: '300px',
      overflowY: 'auto',
    },
  }
}
