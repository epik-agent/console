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
  const { query, createSdkMcpServer, tool } = await import('@anthropic-ai/claude-agent-sdk')
  const { z } = await import('zod')
  const token = githubToken()

  // Register nats_publish as an in-process MCP tool. The handler is a no-op
  // because the runner intercepts the tool_use event in the assistant message
  // before MCP execution and publishes via NATS directly.
  const natsMcpServer = createSdkMcpServer({
    name: 'nats',
    tools: [
      tool(
        'nats_publish',
        'Publish a message to a NATS topic',
        { topic: z.string(), message: z.string() },
        async () => ({ content: [{ type: 'text' as const, text: 'published' }] }),
      ),
    ],
  })

  const messages = query({
    prompt: opts.prompt,
    options: {
      resume: opts.sessionId,
      ...(opts.config.systemPrompt ? { systemPrompt: opts.config.systemPrompt } : {}),
      allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'mcp__github__*'],
      cwd: opts.config.cwd,
      model: opts.config.model,
      includePartialMessages: true,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      mcpServers: {
        nats: natsMcpServer,
        ...(token
          ? {
              github: {
                command: 'github-mcp-server',
                args: ['stdio'],
                env: { GITHUB_PERSONAL_ACCESS_TOKEN: token },
              },
            }
          : {}),
      },
    },
  })

  // Expose the interrupt handle immediately after the query is created, before
  // the event loop starts. This allows callers to cancel mid-turn.
  if (opts.onInterruptReady) {
    opts.onInterruptReady(() => {
      void messages.interrupt()
    })
  }

  for await (const msg of messages) {
    if (msg.type === 'system' && msg.subtype === 'init') {
      opts.onSessionId(msg.session_id)
      continue
    }

    if (msg.type === 'stream_event') {
      const evt = msg.event
      if (evt.type === 'content_block_delta' && evt.delta.type === 'text_delta') {
        opts.send({ kind: 'text_delta', text: evt.delta.text })
      }
      continue
    }

    if (msg.type === 'assistant') {
      for (const block of msg.message.content) {
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

    if (msg.type === 'user') {
      for (const block of msg.message.content) {
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

    if (msg.type === 'result' && msg.subtype !== 'success' && msg.is_error) {
      opts.send({
        kind: 'error',
        message: (msg as { errors?: string[] }).errors?.join('\n') ?? 'Unknown error',
      })
    }
  }

  opts.send({ kind: 'turn_end' })

  return {
    interrupt: () => {
      void messages.interrupt()
    },
  }
}
