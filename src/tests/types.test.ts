import { describe, it, expectTypeOf } from 'vitest'
import type {
  AgentEvent,
  AgentId,
  WorkerRole,
  WorkerStatus,
  WorkerState,
  PoolState,
  IssueNode,
  IssueGraph,
  ServerMessage,
  TextBlock,
  ToolBlock,
  ToolResultBlock,
  Block,
  UserMessage,
  AssistantMessage,
  CompactionMessage,
  Message,
} from '../client/types.ts'

describe('types', () => {
  it('AgentEvent has the correct variants', () => {
    const e1: AgentEvent = { kind: 'text_delta', text: 'hello' }
    const e2: AgentEvent = { kind: 'tool_use', name: 'bash', input: {} }
    const e3: AgentEvent = { kind: 'tool_result', content: 'ok' }
    const e4: AgentEvent = { kind: 'turn_end' }
    const e5: AgentEvent = { kind: 'error', message: 'oops' }
    const e6: AgentEvent = { kind: 'inject', text: 'injected' }
    const e7: AgentEvent = { kind: 'compaction', summary: 'compact' }
    expectTypeOf(e1).toMatchTypeOf<AgentEvent>()
    expectTypeOf(e2).toMatchTypeOf<AgentEvent>()
    expectTypeOf(e3).toMatchTypeOf<AgentEvent>()
    expectTypeOf(e4).toMatchTypeOf<AgentEvent>()
    expectTypeOf(e5).toMatchTypeOf<AgentEvent>()
    expectTypeOf(e6).toMatchTypeOf<AgentEvent>()
    expectTypeOf(e7).toMatchTypeOf<AgentEvent>()
  })

  it('AgentId is a union of the four agent identifiers', () => {
    const id1: AgentId = 'supervisor'
    const id2: AgentId = 'worker-0'
    const id3: AgentId = 'worker-1'
    const id4: AgentId = 'worker-2'
    expectTypeOf(id1).toMatchTypeOf<AgentId>()
    expectTypeOf(id2).toMatchTypeOf<AgentId>()
    expectTypeOf(id3).toMatchTypeOf<AgentId>()
    expectTypeOf(id4).toMatchTypeOf<AgentId>()
  })

  it('WorkerRole is a union of supervisor and worker', () => {
    const r1: WorkerRole = 'supervisor'
    const r2: WorkerRole = 'worker'
    expectTypeOf(r1).toMatchTypeOf<WorkerRole>()
    expectTypeOf(r2).toMatchTypeOf<WorkerRole>()
  })

  it('WorkerStatus is a union of idle and busy', () => {
    const s1: WorkerStatus = 'idle'
    const s2: WorkerStatus = 'busy'
    expectTypeOf(s1).toMatchTypeOf<WorkerStatus>()
    expectTypeOf(s2).toMatchTypeOf<WorkerStatus>()
  })

  it('WorkerState has the correct shape', () => {
    const ws: WorkerState = {
      id: 'supervisor',
      role: 'supervisor',
      status: 'idle',
      sessionId: undefined,
    }
    expectTypeOf(ws).toMatchTypeOf<WorkerState>()
    expectTypeOf(ws.sessionId).toMatchTypeOf<string | undefined>()
  })

  it('PoolState is an array of WorkerState', () => {
    const pool: PoolState = [
      { id: 'supervisor', role: 'supervisor', status: 'busy', sessionId: 'abc' },
      { id: 'worker-0', role: 'worker', status: 'idle', sessionId: undefined },
    ]
    expectTypeOf(pool).toMatchTypeOf<PoolState>()
  })

  it('IssueNode has the correct shape', () => {
    const node: IssueNode = {
      number: 1,
      title: 'My issue',
      state: 'open',
      type: 'Task',
      external: false,
      blockedBy: [2, 3],
    }
    expectTypeOf(node).toMatchTypeOf<IssueNode>()
    expectTypeOf(node.type).toMatchTypeOf<'Feature' | 'Task' | 'Bug' | null>()
    expectTypeOf(node.state).toMatchTypeOf<'open' | 'closed'>()
  })

  it('IssueGraph has a nodes array', () => {
    const graph: IssueGraph = { nodes: [] }
    expectTypeOf(graph).toMatchTypeOf<IssueGraph>()
  })

  it('ServerMessage is a discriminated union on type', () => {
    const m1: ServerMessage = { type: 'pool_state', pool: [] }
    const m2: ServerMessage = {
      type: 'agent_event',
      agentId: 'worker-0',
      event: { kind: 'turn_end' },
    }
    expectTypeOf(m1).toMatchTypeOf<ServerMessage>()
    expectTypeOf(m2).toMatchTypeOf<ServerMessage>()
  })

  it('TextBlock has the correct shape', () => {
    const b: TextBlock = { type: 'text', text: 'hello' }
    expectTypeOf(b).toMatchTypeOf<TextBlock>()
  })

  it('ToolBlock has the correct shape', () => {
    const b: ToolBlock = { type: 'tool_use', name: 'bash', input: {} }
    expectTypeOf(b).toMatchTypeOf<ToolBlock>()
  })

  it('ToolResultBlock has the correct shape', () => {
    const b: ToolResultBlock = { type: 'tool_result', content: 'ok' }
    expectTypeOf(b).toMatchTypeOf<ToolResultBlock>()
  })

  it('Block is a union of TextBlock, ToolBlock, ToolResultBlock', () => {
    const b1: Block = { type: 'text', text: 'hi' }
    const b2: Block = { type: 'tool_use', name: 'bash', input: null }
    const b3: Block = { type: 'tool_result', content: [] }
    expectTypeOf(b1).toMatchTypeOf<Block>()
    expectTypeOf(b2).toMatchTypeOf<Block>()
    expectTypeOf(b3).toMatchTypeOf<Block>()
  })

  it('UserMessage has role user and text', () => {
    const m: UserMessage = { role: 'user', text: 'hello' }
    expectTypeOf(m).toMatchTypeOf<UserMessage>()
  })

  it('AssistantMessage has role assistant and blocks array', () => {
    const m: AssistantMessage = { role: 'assistant', blocks: [] }
    expectTypeOf(m).toMatchTypeOf<AssistantMessage>()
  })

  it('CompactionMessage has role compaction and summary', () => {
    const m: CompactionMessage = { role: 'compaction', summary: 'compact' }
    expectTypeOf(m).toMatchTypeOf<CompactionMessage>()
  })

  it('Message is a union of UserMessage, AssistantMessage, CompactionMessage', () => {
    const m1: Message = { role: 'user', text: 'hi' }
    const m2: Message = { role: 'assistant', blocks: [] }
    const m3: Message = { role: 'compaction', summary: 'summary' }
    expectTypeOf(m1).toMatchTypeOf<Message>()
    expectTypeOf(m2).toMatchTypeOf<Message>()
    expectTypeOf(m3).toMatchTypeOf<Message>()
  })
})
