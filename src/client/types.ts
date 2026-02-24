/**
 * Canonical TypeScript types shared between the server and client.
 */

// ---------------------------------------------------------------------------
// Agent events
// ---------------------------------------------------------------------------

/** The canonical event type emitted by an agent turn. */
export type AgentEvent =
  | { kind: 'text_delta'; text: string }
  | { kind: 'tool_use'; name: string; input: unknown }
  | { kind: 'tool_result'; content: unknown }
  | { kind: 'turn_end' }
  | { kind: 'error'; message: string }
  | { kind: 'inject'; text: string }
  | { kind: 'compaction'; summary: string; trigger: 'manual' | 'auto'; preTokens: number }

// ---------------------------------------------------------------------------
// Agent pool
// ---------------------------------------------------------------------------

/** Identifies a named agent in the pool. */
export type AgentId = 'supervisor' | 'worker-0' | 'worker-1' | 'worker-2'

/** The role an agent plays in the pool. */
export type WorkerRole = 'supervisor' | 'worker'

/** Lifecycle status of a single agent. */
export type WorkerStatus = 'idle' | 'busy'

/** Runtime state for a single agent in the pool. */
export interface WorkerState {
  id: AgentId
  role: WorkerRole
  status: WorkerStatus
  sessionId: string | undefined
}

/** Snapshot of the full agent pool. */
export interface PoolState {
  running: boolean
  agents: WorkerState[]
}

// ---------------------------------------------------------------------------
// Issue graph
// ---------------------------------------------------------------------------

/** A single node in the issue dependency graph. */
export interface IssueNode {
  /** GitHub issue number. */
  number: number
  /** Issue title. */
  title: string
  /** Whether the issue is open or closed. */
  state: 'open' | 'closed'
  /** Issue type label, or null if unlabelled. */
  type: 'Feature' | 'Task' | 'Bug' | null
  /** true when this node belongs to a different feature. */
  external: boolean
  /** Issue numbers that must be resolved before this one can start. */
  blockedBy: number[]
}

/** The dependency graph for a set of GitHub issues. */
export interface IssueGraph {
  nodes: IssueNode[]
}

// ---------------------------------------------------------------------------
// WebSocket envelope
// ---------------------------------------------------------------------------

/** Messages sent from the server to the browser over the WebSocket connection. */
export type ServerMessage =
  | { type: 'pool_state'; pool: PoolState }
  | { type: 'agent_event'; agentId: AgentId; event: AgentEvent }

// ---------------------------------------------------------------------------
// Chat UI types
// ---------------------------------------------------------------------------

/** A plain text content block within an assistant message. */
export type TextBlock = { type: 'text'; text: string }

/** A tool-invocation block within an assistant message. */
export type ToolBlock = { type: 'tool_use'; name: string; input: unknown }

/** A tool-result block appended after the agent processes a tool response. */
export type ToolResultBlock = { type: 'tool_result'; content: unknown }

/** Union of all content block variants that can appear in an AssistantMessage. */
export type Block = TextBlock | ToolBlock | ToolResultBlock

/** A message sent by the human user. */
export type UserMessage = { role: 'user'; text: string }

/** A message produced by the assistant, composed of one or more Blocks. */
export type AssistantMessage = { role: 'assistant'; blocks: Block[] }

/** A visual marker inserted into the chat history when the SDK compacts the context window. */
export type CompactionMessage = {
  role: 'compaction'
  summary: string
  trigger: 'manual' | 'auto'
  preTokens: number
}

/** A single entry in the chat history. */
export type Message = UserMessage | AssistantMessage | CompactionMessage

// ---------------------------------------------------------------------------
// REST API errors
// ---------------------------------------------------------------------------

/** Structured error response returned by all REST endpoints on failure. */
export interface ApiError {
  code:
    | 'INVALID_REPO'
    | 'MISSING_FIELDS'
    | 'GITHUB_AUTH_ERROR'
    | 'GITHUB_ERROR'
    | 'NATS_UNAVAILABLE'
  message: string
}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

/** WebSocket connection lifecycle state. */
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

// ---------------------------------------------------------------------------
// Agent configuration
// ---------------------------------------------------------------------------

/** Configuration for a single agent runner. */
export interface AgentConfig {
  /** Claude model identifier. */
  model: string
  /** Working directory for the agent process. */
  cwd: string
  /** Optional system prompt override. */
  systemPrompt: string | undefined
}
