import { describe, it, expect } from 'vitest'
import { supervisorPrompt } from '../../server/prompts/supervisor.ts'
import { workerPrompt } from '../../server/prompts/worker.ts'

describe('supervisorPrompt', () => {
  it('exports a non-empty string', () => {
    expect(typeof supervisorPrompt).toBe('string')
    expect(supervisorPrompt.length).toBeGreaterThan(0)
  })

  it('instructs the supervisor to receive the issue dependency graph', () => {
    expect(supervisorPrompt).toMatch(/dependency/i)
    expect(supervisorPrompt).toMatch(/graph/i)
  })

  it('instructs the supervisor to listen on epik.supervisor', () => {
    expect(supervisorPrompt).toContain('epik.supervisor')
  })

  it('instructs the supervisor to use nats_publish', () => {
    expect(supervisorPrompt).toContain('nats_publish')
  })

  it('instructs the supervisor to assign workers', () => {
    expect(supervisorPrompt).toMatch(/assign/i)
    expect(supervisorPrompt).toMatch(/worker/i)
  })

  it('instructs the supervisor to merge PRs and close issues', () => {
    expect(supervisorPrompt).toMatch(/merge/i)
    expect(supervisorPrompt).toMatch(/PR/i)
    expect(supervisorPrompt).toMatch(/close/i)
  })

  it('instructs the supervisor to reassign stuck workers', () => {
    expect(supervisorPrompt).toMatch(/stuck/i)
    expect(supervisorPrompt).toMatch(/reassign/i)
  })

  it('instructs the supervisor to declare done when all issues are closed', () => {
    expect(supervisorPrompt).toMatch(/done/i)
    expect(supervisorPrompt).toMatch(/all issues/i)
  })
})

describe('workerPrompt', () => {
  it('exports a non-empty string', () => {
    expect(typeof workerPrompt).toBe('string')
    expect(workerPrompt.length).toBeGreaterThan(0)
  })

  it('instructs the worker to wait for an assignment message on its NATS topic', () => {
    expect(workerPrompt).toMatch(/wait/i)
    expect(workerPrompt).toMatch(/assignment/i)
  })

  it('instructs the worker to use TDD', () => {
    expect(workerPrompt).toMatch(/TDD|test.driven/i)
    expect(workerPrompt).toMatch(/test/i)
  })

  it('instructs the worker to run npm run lint and npm test', () => {
    expect(workerPrompt).toContain('npm run lint')
    expect(workerPrompt).toContain('npm test')
  })

  it('instructs the worker to open a PR when done', () => {
    expect(workerPrompt).toMatch(/PR|pull request/i)
  })

  it('instructs the worker to report to epik.supervisor via nats_publish', () => {
    expect(workerPrompt).toContain('epik.supervisor')
    expect(workerPrompt).toContain('nats_publish')
  })

  it('instructs the worker to clear context at the start of each new assignment', () => {
    expect(workerPrompt).toMatch(/clear.*context|context.*clear/i)
  })

  it('instructs the worker to check out the repo', () => {
    expect(workerPrompt).toMatch(/check.?out|clone/i)
    expect(workerPrompt).toMatch(/repo/i)
  })
})
