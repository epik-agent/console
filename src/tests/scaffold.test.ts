import { describe, it, expect } from 'vitest'
import { app } from '../server/index.ts'

describe('project scaffold', () => {
  it('exports an express app', () => {
    expect(app).toBeDefined()
    expect(typeof app).toBe('function')
  })
})
