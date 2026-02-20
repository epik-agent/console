import { execSync } from 'child_process'
import type { NatsConnection } from 'nats'
import type { AgentEvent, AgentConfig } from '../client/types.ts'

/** Retrieves the active GitHub OAuth token via the `gh` CLI, or `undefined` if unavailable. */
function githubToken(): string | undefined {
  try {
    return execSync('gh auth token', { encoding: 'utf8' }).trim()
  } catch {
    return undefined
  }
}

/** The `nats_publish` custom tool definition injected into every agent turn. */
const NATS_PUBLISH_TOOL = {
  name: 'nats_publish',
  description: 'Publish a message to a NATS topic',
  input_schema: {
    type: 'object',
    properties: {
      topic: { type: 'string' },
      message: { type: 'string' },
    },
    required: ['topic', 'message'],
  },
}

/** Options for a single {@link runAgent} call. */
export interface RunAgentOptions {
  /** Agent model and environment configuration. */
  config: AgentConfig
  /** Existing Claude Code session ID to resume, or `undefined` to start a new session. */
  sessionId: string | undefined
  /** The user message to send for this turn. */
  prompt: string
  /**
   * Transport callback invoked for each {@link AgentEvent} emitted during the turn.
   * Callers wire this to WebSocket or any other transport independently.
   */
  send: (event: AgentEvent) => void
  /** Called once with the Claude Code session ID when the session initialises. */
  onSessionId: (id: string) => void
  /** NATS connection used to publish messages from the `nats_publish` custom tool. */
  natsClient: NatsConnection
  /**
   * Optional callback invoked immediately after the query iterator is created,
   * before the event loop starts. Provides the interrupt function for early
   * cancellation of the turn. Used by the agent pool to support mid-turn interrupts.
   */
  onInterruptReady?: (interrupt: () => void) => void
}

/**
 * Runs a single Claude Code agent turn.
 *
 * Streams {@link AgentEvent}s to `opts.send` as they arrive, then emits a final
 * `turn_end` event. Returns an object with an optional `interrupt()` method that
 * can be used to cancel the turn mid-stream.
 *
 * The `nats_publish` custom tool is intercepted in the event loop: when the agent
 * emits a `tool_use` block with `name === 'nats_publish'`, the runner publishes
 * via `opts.natsClient.publish()` and returns a synthetic tool result — the event
 * never reaches Claude Code's built-in tool dispatcher.
 */
export async function runAgent(opts: RunAgentOptions): Promise<{ interrupt?: () => void }> {
  const { query } = await import('@anthropic-ai/claude-agent-sdk')
  const token = githubToken()

  const messages = query({
    prompt: opts.prompt,
    options: {
      resume: opts.sessionId,
      ...(opts.config.systemPrompt ? { systemPrompt: opts.config.systemPrompt } : {}),
      allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'mcp__github__*'],
      customTools: [NATS_PUBLISH_TOOL],
      cwd: opts.config.cwd,
      model: opts.config.model,
      includePartialMessages: true,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      ...(token
        ? {
            mcpServers: {
              github: {
                command: 'github-mcp-server',
                args: ['stdio'],
                env: { GITHUB_PERSONAL_ACCESS_TOKEN: token },
              },
            },
          }
        : {}),
    },
  })

  // Expose the interrupt handle immediately after the query is created, before
  // the event loop starts. This allows callers to cancel mid-turn.
  const messagesWithInterrupt = messages as { interrupt?: () => void }
  if (opts.onInterruptReady && messagesWithInterrupt.interrupt) {
    opts.onInterruptReady(messagesWithInterrupt.interrupt)
  }

  for await (const msg of messages as AsyncIterable<unknown>) {
    const m = msg as { type: string; subtype?: string; is_error?: boolean }

    if (m.type === 'system' && m.subtype === 'init') {
      opts.onSessionId((m as { session_id: string }).session_id)
      continue
    }

    if (m.type === 'stream_event') {
      const evt = (m as { event: { type: string; delta?: { type: string; text: string } } }).event
      if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
        opts.send({ kind: 'text_delta', text: evt.delta.text })
      }
      continue
    }

    if (m.type === 'assistant') {
      const blocks = (
        m as { message: { content: Array<{ type: string; name: string; input: unknown }> } }
      ).message.content
      for (const block of blocks) {
        if (block.type === 'tool_use') {
          if (block.name === 'nats_publish') {
            // Intercept: publish via NATS, do not forward to Claude Code's tool dispatcher
            const input = block.input as { topic: string; message: string }
            opts.natsClient.publish(input.topic, input.message)
          } else {
            opts.send({ kind: 'tool_use', name: block.name, input: block.input })
          }
        }
      }
      continue
    }

    if (m.type === 'user') {
      const blocks = (m as { message: { content: Array<unknown> } }).message.content
      for (const block of blocks) {
        if (
          typeof block === 'object' &&
          block !== null &&
          'type' in block &&
          (block as { type: string }).type === 'text' &&
          typeof (block as { text?: unknown }).text === 'string' &&
          (block as { text: string }).text.includes('<parameter name="summary">')
        ) {
          opts.send({ kind: 'compaction', summary: (block as { text: string }).text })
          continue
        }
        if (
          typeof block === 'object' &&
          block !== null &&
          'type' in block &&
          (block as { type: string }).type === 'tool_result'
        ) {
          opts.send({ kind: 'tool_result', content: (block as { content: unknown }).content })
        }
      }
      continue
    }

    if (m.type === 'result' && m.subtype !== 'success' && m.is_error) {
      opts.send({
        kind: 'error',
        message: (m as { errors?: string[] }).errors?.join('\n') ?? 'Unknown error',
      })
    }
  }

  opts.send({ kind: 'turn_end' })

  return messages as { interrupt?: () => void }
}
