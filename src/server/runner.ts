import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import type { NatsConnection } from 'nats'
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import type { AgentEvent, AgentConfig } from '../client/types.ts'

function isNatsPublishInput(v: unknown): v is { topic: string; message: string } {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as Record<string, unknown>)['topic'] === 'string' &&
    typeof (v as Record<string, unknown>)['message'] === 'string'
  )
}

function isTextBlock(v: unknown): v is { type: 'text'; text: string } {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as Record<string, unknown>)['type'] === 'text' &&
    typeof (v as Record<string, unknown>)['text'] === 'string'
  )
}

function isToolResultBlock(v: unknown): v is { type: 'tool_result'; content: unknown } {
  return (
    typeof v === 'object' && v !== null && (v as Record<string, unknown>)['type'] === 'tool_result'
  )
}

/** Retrieves the active GitHub OAuth token, or `undefined` if unavailable.
 *
 * Prefers the ``GH_TOKEN`` environment variable (set in Docker). Falls back to
 * ``gh auth token`` only when the ``gh`` config directory exists, indicating
 * the CLI has been set up. This avoids the "no oauth token found" stderr noise
 * in CI environments where ``gh`` is installed but never authenticated.
 */
function githubToken(): string | undefined {
  if (process.env['GH_TOKEN']) return process.env['GH_TOKEN']
  const ghConfigDir =
    process.env['GH_CONFIG_DIR'] ?? join(process.env['HOME'] ?? '', '.config', 'gh')
  if (!existsSync(ghConfigDir)) return undefined
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
  /** Called once with the Claude Code session ID when the session initializes. */
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
        /* v8 ignore next */
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

  for await (const msg of messages as AsyncIterable<SDKMessage>) {
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
            if (!isNatsPublishInput(block.input)) continue
            opts.natsClient.publish(block.input.topic, block.input.message)
          } else {
            opts.send({ kind: 'tool_use', name: block.name, input: block.input })
          }
        }
      }
      continue
    }

    if (msg.type === 'user') {
      for (const block of msg.message.content) {
        if (isTextBlock(block) && block.text.includes('<parameter name="summary">')) {
          opts.send({ kind: 'compaction', summary: block.text })
          continue
        }
        if (isToolResultBlock(block)) {
          opts.send({ kind: 'tool_result', content: block.content })
        }
      }
      continue
    }

    if (msg.type === 'result' && msg.subtype !== 'success' && msg.is_error) {
      opts.send({
        kind: 'error',
        message: msg.errors?.join('\n') || 'Unknown error',
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
