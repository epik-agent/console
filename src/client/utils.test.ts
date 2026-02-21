import { describe, expect, it } from 'vitest'
import { unescapeJsonString } from './utils'

describe('unescapeJsonString', () => {
  it('returns the string unchanged when there are no escape sequences', () => {
    expect(unescapeJsonString('hello world')).toBe('hello world')
  })

  it('converts \\n to a newline character', () => {
    expect(unescapeJsonString('line1\\nline2')).toBe('line1\nline2')
  })

  it('converts \\t to a tab character', () => {
    expect(unescapeJsonString('col1\\tcol2')).toBe('col1\tcol2')
  })

  it('converts \\r to a carriage-return character', () => {
    expect(unescapeJsonString('text\\rmore')).toBe('text\rmore')
  })

  it('converts \\\\ to a single backslash', () => {
    expect(unescapeJsonString('path\\\\to\\\\file')).toBe('path\\to\\file')
  })

  it('converts multiple different escape sequences in one string', () => {
    expect(unescapeJsonString('a\\nb\\tc\\r\\\\d')).toBe('a\nb\tc\r\\d')
  })

  it('handles an empty string', () => {
    expect(unescapeJsonString('')).toBe('')
  })
})
