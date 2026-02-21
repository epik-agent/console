import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTheme } from './useTheme'

// Helper to configure the matchMedia stub's return value for a given query
function setSystemPreference(preference: 'light' | 'dark') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: preference === 'light' && query === '(prefers-color-scheme: light)',
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear()
    setSystemPreference('dark')
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    // Reset html data-theme
    document.documentElement.removeAttribute('data-theme')
  })

  it('defaults to dark when system prefers dark and no localStorage', () => {
    setSystemPreference('dark')
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('dark')
  })

  it('defaults to light when system prefers light and no localStorage', () => {
    setSystemPreference('light')
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('light')
  })

  it('reads localStorage value over system preference', () => {
    setSystemPreference('dark')
    localStorage.setItem('theme', 'light')
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('light')
  })

  it('ignores invalid localStorage values and falls back to system preference', () => {
    setSystemPreference('dark')
    localStorage.setItem('theme', 'solarized')
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('dark')
  })

  it('toggleTheme flips dark to light', () => {
    setSystemPreference('dark')
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('dark')
    act(() => result.current.toggleTheme())
    expect(result.current.theme).toBe('light')
  })

  it('toggleTheme flips light to dark', () => {
    setSystemPreference('light')
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('light')
    act(() => result.current.toggleTheme())
    expect(result.current.theme).toBe('dark')
  })

  it('toggleTheme writes to localStorage', () => {
    setSystemPreference('dark')
    const { result } = renderHook(() => useTheme())
    act(() => result.current.toggleTheme())
    expect(localStorage.getItem('theme')).toBe('light')
  })

  it('sets data-theme on document.documentElement on mount', () => {
    setSystemPreference('dark')
    renderHook(() => useTheme())
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('updates data-theme after toggle', () => {
    setSystemPreference('dark')
    const { result } = renderHook(() => useTheme())
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    act(() => result.current.toggleTheme())
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })
})
