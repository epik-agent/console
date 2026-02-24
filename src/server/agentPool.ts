import type { NatsConnection } from 'nats'
import type { AgentEvent, AgentId, PoolState, WorkerRole, WorkerState } from '../client/types.ts'
import {
  getNatsConnection,
  TOPIC_SUPERVISOR,
  TOPIC_WORKER_0,
  TOPIC_WORKER_1,
  TOPIC_WORKER_2,
} from './nats.ts'
import { runAgent } from './runner.ts'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = 'claude-sonnet-4-6'

/** Maps each AgentId to its NATS subscription topic. */
const AGENT_TOPICS: Record<AgentId, string> = {
  supervisor: TOPIC_SUPERVISOR,
  'worker-0': TOPIC_WORKER_0,
  'worker-1': TOPIC_WORKER_1,
  'worker-2': TOPIC_WORKER_2,
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Listener callback invoked for every agent event, tagged with the source agent. */
export type AgentEventListener = (agentId: AgentId, event: AgentEvent) => void

/** The public interface of the agent pool. */
export interface AgentPool {
  /** Returns a snapshot of the current pool state. */
  getPool(): PoolState
  /**
   * Registers a listener for all tagged AgentEvents.
   * Returns an unregister function that removes the listener.
   */
  registerListener(cb: AgentEventListener): () => void
  /** Injects a user message into the specified agent's next turn. */
  injectMessage(agentId: AgentId, text: string): void
  /** Interrupts the in-progress turn of the specified agent, if any. */
  interrupt(agentId: AgentId): void
  /** Sets the pool-wide running flag. */
  setRunning(value: boolean): void
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

/** Mutable runtime state for a single agent, extending WorkerState. */
interface AgentRuntimeState extends WorkerState {
  /** The interrupt function from the most recent runAgent call, if a turn is in progress. */
  currentInterrupt: (() => void) | undefined
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Creates and initializes the agent pool.
 *
 * Spawns 1 Supervisor + 3 Worker agents, subscribes each to its NATS topic,
 * and wires incoming messages to the agent's runAgent() turn mechanism.
 */
export async function createAgentPool(): Promise<AgentPool> {
  const nc: NatsConnection = await getNatsConnection()

  // Initialize agent states
  const agentStates = new Map<AgentId, AgentRuntimeState>()

  const agentDefs: Array<{ id: AgentId; role: WorkerRole }> = [
    { id: 'supervisor', role: 'supervisor' },
    { id: 'worker-0', role: 'worker' },
    { id: 'worker-1', role: 'worker' },
    { id: 'worker-2', role: 'worker' },
  ]

  for (const { id, role } of agentDefs) {
    agentStates.set(id, {
      id,
      role,
      status: 'idle',
      sessionId: undefined,
      currentInterrupt: undefined,
    })
  }

  // Pool-wide running flag
  let running = false

  // Listener registry
  const listeners = new Set<AgentEventListener>()

  /** Broadcasts an AgentEvent to all registered listeners. */
  function broadcast(agentId: AgentId, event: AgentEvent): void {
    for (const cb of listeners) {
      cb(agentId, event)
    }
  }

  /**
   * Runs a single agent turn in response to an incoming message.
   * Handles status transitions (idle → busy → idle) and session ID persistence.
   */
  async function handleMessage(agentId: AgentId, text: string): Promise<void> {
    const state = agentStates.get(agentId)!
    state.status = 'busy'

    try {
      await runAgent({
        config: {
          model: DEFAULT_MODEL,
          cwd: process.cwd(),
          systemPrompt: undefined,
        },
        sessionId: state.sessionId,
        prompt: text,
        send: (event: AgentEvent) => broadcast(agentId, event),
        onSessionId: (id: string) => {
          state.sessionId = id
        },
        natsClient: nc,
        onInterruptReady: (interruptFn: () => void) => {
          state.currentInterrupt = interruptFn
        },
      })
    } finally {
      state.status = 'idle'
      state.currentInterrupt = undefined
    }
  }

  // Subscribe each agent to its NATS topic
  for (const { id } of agentDefs) {
    const topic = AGENT_TOPICS[id]
    nc.subscribe(topic, {
      callback: (_err: unknown, msg: { data: Uint8Array }) => {
        const text = new TextDecoder().decode(msg.data)
        void handleMessage(id, text)
      },
    })
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  return {
    getPool(): PoolState {
      return {
        running,
        agents: Array.from(agentStates.values()).map(({ id, role, status, sessionId }) => ({
          id,
          role,
          status,
          sessionId,
        })),
      }
    },

    registerListener(cb: AgentEventListener): () => void {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },

    injectMessage(agentId: AgentId, text: string): void {
      void handleMessage(agentId, text)
    },

    interrupt(agentId: AgentId): void {
      const state = agentStates.get(agentId)
      state?.currentInterrupt?.()
    },

    setRunning(value: boolean): void {
      running = value
    },
  }
}
