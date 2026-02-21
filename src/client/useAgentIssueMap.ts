import { useMemo } from 'react'
import type { AgentEvent, AgentId } from './types'

/**
 * Regex that matches "issue #N" or "issue N" (case-insensitive) and captures
 * the issue number.
 */
const ISSUE_NUMBER_RE = /\bissue\s+#?(\d+)/i

/**
 * Derives a mapping from agent ID to the GitHub issue number the agent is
 * currently working on.
 *
 * The map is built by scanning each agent's event stream in order:
 *
 * - An ``inject`` event whose ``text`` contains ``"issue #N"`` or ``"issue N"``
 *   records ``agentId → N``.
 * - A ``turn_end`` event clears the mapping for that agent.
 * - Only the most recent ``inject`` that follows the last ``turn_end`` (or the
 *   beginning of the stream) is considered active.
 *
 * :param events: Per-agent event streams from ``useAgentEvents``.
 * :returns: A ``Partial<Record<AgentId, number>>`` with one entry per agent
 *           that is currently assigned to an issue.
 */
export function useAgentIssueMap(
  events: Record<AgentId, AgentEvent[]>,
): Partial<Record<AgentId, number>> {
  return useMemo(() => {
    const map: Partial<Record<AgentId, number>> = {}

    for (const [agentId, agentEvents] of Object.entries(events) as [AgentId, AgentEvent[]][]) {
      let currentIssue: number | undefined = undefined

      for (const event of agentEvents) {
        if (event.kind === 'inject') {
          const match = ISSUE_NUMBER_RE.exec(event.text)
          currentIssue = match ? parseInt(match[1], 10) : undefined
        } else if (event.kind === 'turn_end') {
          currentIssue = undefined
        }
      }

      if (currentIssue !== undefined) {
        map[agentId] = currentIssue
      }
    }

    return map
  }, [events])
}
