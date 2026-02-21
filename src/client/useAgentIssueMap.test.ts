import { renderHook, act } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useAgentIssueMap } from './useAgentIssueMap'
import { makeEvents } from './test-fixtures'
import type { AgentEvent, AgentId } from './types'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAgentIssueMap', () => {
  // ── AC1: empty map when no inject events ──────────────────────────────────

  it('returns an empty map when no events have been received', () => {
    const events = makeEvents({})
    const { result } = renderHook(() => useAgentIssueMap(events))
    expect(result.current).toEqual({})
  })

  // ── AC2: parses "issue #N" from inject event text ─────────────────────────

  it('maps an agent to its issue number when an inject event contains "issue #N"', () => {
    const events = makeEvents({
      'worker-0': [{ kind: 'inject', text: 'Please work on issue #42.' }],
    })
    const { result } = renderHook(() => useAgentIssueMap(events))
    expect(result.current['worker-0']).toBe(42)
  })

  it('parses "issue N" (without hash) from inject event text', () => {
    const events = makeEvents({
      'worker-1': [{ kind: 'inject', text: 'Handle issue 7 now.' }],
    })
    const { result } = renderHook(() => useAgentIssueMap(events))
    expect(result.current['worker-1']).toBe(7)
  })

  it('maps multiple agents simultaneously to different issues', () => {
    const events = makeEvents({
      'worker-0': [{ kind: 'inject', text: 'Work on issue #10.' }],
      'worker-1': [{ kind: 'inject', text: 'Work on issue #20.' }],
    })
    const { result } = renderHook(() => useAgentIssueMap(events))
    expect(result.current['worker-0']).toBe(10)
    expect(result.current['worker-1']).toBe(20)
  })

  // ── AC3: clears mapping on turn_end ───────────────────────────────────────

  it('clears an agent mapping when a turn_end event follows', () => {
    const events = makeEvents({
      'worker-0': [{ kind: 'inject', text: 'Work on issue #5.' }, { kind: 'turn_end' }],
    })
    const { result } = renderHook(() => useAgentIssueMap(events))
    expect(result.current['worker-0']).toBeUndefined()
  })

  // ── AC4: last inject wins when multiple inject events present ─────────────

  it('uses the most recent inject event when multiple inject events are present', () => {
    const events = makeEvents({
      'worker-2': [
        { kind: 'inject', text: 'Work on issue #3.' },
        { kind: 'turn_end' },
        { kind: 'inject', text: 'Now work on issue #8.' },
      ],
    })
    const { result } = renderHook(() => useAgentIssueMap(events))
    expect(result.current['worker-2']).toBe(8)
  })

  // ── AC5: inject without matching issue number is ignored ──────────────────

  it('does not map agent when inject text has no issue reference', () => {
    const events = makeEvents({
      'worker-0': [{ kind: 'inject', text: 'Please stand by.' }],
    })
    const { result } = renderHook(() => useAgentIssueMap(events))
    expect(result.current['worker-0']).toBeUndefined()
  })

  // ── AC6: non-inject events do not affect the mapping ─────────────────────

  it('ignores text_delta events for issue mapping purposes', () => {
    const events = makeEvents({
      'worker-0': [{ kind: 'text_delta', text: 'Working on issue #99.' }],
    })
    const { result } = renderHook(() => useAgentIssueMap(events))
    expect(result.current['worker-0']).toBeUndefined()
  })

  // ── AC7: reactivity — updates when events prop changes ────────────────────

  it('updates the map reactively when new events are added', () => {
    const initialEvents = makeEvents({})
    const { result, rerender } = renderHook(
      ({ events }: { events: Record<AgentId, AgentEvent[]> }) => useAgentIssueMap(events),
      { initialProps: { events: initialEvents } },
    )

    expect(result.current['worker-0']).toBeUndefined()

    act(() => {
      rerender({
        events: makeEvents({
          'worker-0': [{ kind: 'inject', text: 'Handle issue #15.' }],
        }),
      })
    })

    expect(result.current['worker-0']).toBe(15)
  })

  it('clears mapping reactively when turn_end is added after inject', () => {
    const withInject = makeEvents({
      'worker-1': [{ kind: 'inject', text: 'Work on issue #33.' }],
    })
    const { result, rerender } = renderHook(
      ({ events }: { events: Record<AgentId, AgentEvent[]> }) => useAgentIssueMap(events),
      { initialProps: { events: withInject } },
    )

    expect(result.current['worker-1']).toBe(33)

    act(() => {
      rerender({
        events: makeEvents({
          'worker-1': [{ kind: 'inject', text: 'Work on issue #33.' }, { kind: 'turn_end' }],
        }),
      })
    })

    expect(result.current['worker-1']).toBeUndefined()
  })

  // ── AC8: supervisor can also be mapped ───────────────────────────────────

  it('maps supervisor agent to its issue when inject event is received', () => {
    const events = makeEvents({
      supervisor: [{ kind: 'inject', text: 'Track issue #1 overall.' }],
    })
    const { result } = renderHook(() => useAgentIssueMap(events))
    expect(result.current['supervisor']).toBe(1)
  })
})
