import React, { memo, useCallback, useEffect, useReducer, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github-dark.css'
import { chatReducer, type ChatState } from './chatReducer'
import type { AgentEvent, AgentId, AssistantMessage, Block } from './types'
import { unescapeJsonString } from './utils'

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function UserBubble({ text }: { text: string }) {
  return (
    <div className="msg-user-wrapper">
      <div className="msg-user-bubble">{text}</div>
    </div>
  )
}

function AssistantTextBlock({ text }: { text: string }) {
  return (
    <div className="msg-assistant-text markdown-body">
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

export function ToolUseCard({ name, input }: { name: string; input: unknown }) {
  const [collapsed, setCollapsed] = React.useState(true)
  const display = unescapeJsonString(
    name === 'Bash' && typeof (input as Record<string, unknown>)?.command === 'string'
      ? (input as { command: string }).command
      : JSON.stringify(input, null, 2),
  )
  return (
    <div className="tool-card">
      <div
        className="tool-card-header"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
      >
        <span className={`tool-card-chevron${collapsed ? '' : ' tool-card-chevron--open'}`}>
          {'▶'}
        </span>
        <span>
          {'⚙ '}
          {name}
        </span>
      </div>
      {!collapsed && <pre className="tool-card-body">{display}</pre>}
    </div>
  )
}

export function ToolResultCard({ content }: { content: unknown }) {
  const [collapsed, setCollapsed] = React.useState(true)
  const raw = unescapeJsonString(
    typeof content === 'string' ? content : JSON.stringify(content, null, 2),
  )
  const display = raw.length > 2000 ? raw.slice(0, 2000) + '\n... (truncated)' : raw
  return (
    <div className="tool-card tool-card--result">
      <div
        className="tool-card-header"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
      >
        <span className={`tool-card-chevron${collapsed ? '' : ' tool-card-chevron--open'}`}>
          {'▶'}
        </span>
        <span>{'↩ Result'}</span>
      </div>
      {!collapsed && <pre className="tool-card-body">{display}</pre>}
    </div>
  )
}

function CompactionMarker() {
  return (
    <div className="compaction-marker" data-testid="compaction-marker">
      <div className="compaction-marker-line" />
      <span>Context compacted</span>
      <div className="compaction-marker-line" />
    </div>
  )
}

function ThinkingIndicator() {
  return (
    <div className="thinking-indicator">
      <span>Claude is thinking</span>
      <span className="thinking-dots">
        <span />
        <span />
        <span />
      </span>
    </div>
  )
}

function SendIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2L7 9" />
      <path d="M14 2L9.5 14L7 9L2 6.5L14 2Z" />
    </svg>
  )
}

const AssistantBlocks = memo(function AssistantBlocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="msg-assistant-wrapper">
      {blocks.map((block, i) => {
        if (block.type === 'text') return <AssistantTextBlock key={i} text={block.text} />
        if (block.type === 'tool_use')
          return <ToolUseCard key={i} name={block.name} input={block.input} />
        if (block.type === 'tool_result') return <ToolResultCard key={i} content={block.content} />
        return null
      })}
    </div>
  )
})

// ---------------------------------------------------------------------------
// ConsolePane
// ---------------------------------------------------------------------------

interface ConsolePaneProps {
  agentId: AgentId
  events: AgentEvent[]
  onSend: (text: string) => void
  onInterrupt: () => void
}

export default function ConsolePane(props: ConsolePaneProps) {
  const { events, onSend, onInterrupt } = props

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
    if (messages.length === 0) return
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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

  useEffect(() => {
    const el = paneRef.current
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
    <div ref={paneRef} className="console-pane" tabIndex={-1}>
      <div className="console-messages">
        {messages.map((msg, i) => {
          if (msg.role === 'user') return <UserBubble key={i} text={msg.text} />
          if (msg.role === 'compaction') return <CompactionMarker key={i} />
          return <AssistantBlocks key={i} blocks={msg.blocks} />
        })}
        {busy && lastAssistant?.blocks.length === 0 && <ThinkingIndicator />}
        <div ref={bottomRef} />
      </div>

      <div className="console-input-bar">
        <textarea
          className="console-textarea"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Message Claude... (Enter to send, Shift+Enter for newline)"
          rows={2}
        />
        <button
          className="console-send-btn"
          onClick={sendMessage}
          disabled={!input.trim()}
          aria-label="Send message"
        >
          <SendIcon />
        </button>
      </div>
    </div>
  )
}
