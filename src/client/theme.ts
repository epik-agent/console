/**
 * Re-exports brand palette types and data from the @epik-agent/brand package.
 * Local modules should import from this file rather than the package directly,
 * keeping a single indirection point if the brand source ever changes.
 */
export type { Palette, Brand } from '@epik-agent/brand'
export { palette as themes } from '@epik-agent/brand'

/** The two supported colour modes. */
export type Theme = 'dark' | 'light'
