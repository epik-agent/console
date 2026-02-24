/**
 * Local brand palette types and data, inlined from @epik-agent/brand.
 * Source: /Users/mcneill/src/Epik/brand/brand.json
 */

export interface BgTokens {
  root: string
  surface: string
  raised: string
  input: string
  bar: string
  hover: string
  active: string
  overlay: string
}
export interface TextTokens {
  primary: string
  secondary: string
  muted: string
  faint: string
  inverse: string
}
export interface AccentTokens {
  base: string
  hover: string
  muted: string
  onAccent: string
}
export interface SemanticTokens {
  success: string
  successMuted: string
  warning: string
  warningMuted: string
  error: string
  errorMuted: string
  info: string
}
export interface BorderTokens {
  default: string
  strong: string
}
export interface GraphTokens {
  closed: string
  open: string
  active: string
  link: string
}

export interface Palette {
  bg: BgTokens
  text: TextTokens
  accent: AccentTokens
  semantic: SemanticTokens
  border: BorderTokens
  graph: GraphTokens
}

export interface Brand {
  name: string
  wordmark: string
  wordmarkNote: string
  tagline: string
  copyright: string
  fonts: {
    sans: { family: string; weights: number[]; source: string }
    mono: { family: string; weights: number[]; source: string }
  }
  palette: { dark: Palette; light: Palette }
}

/** The two supported colour modes. */
export type Theme = 'dark' | 'light'

export const themes: { dark: Palette; light: Palette } = {
  dark: {
    bg: {
      root: '#0a0a0a',
      surface: '#111111',
      raised: '#1a1a1a',
      input: '#141414',
      bar: '#0e0e0e',
      hover: '#1f1f1f',
      active: '#262626',
      overlay: 'rgba(0, 0, 0, 0.60)',
    },
    text: {
      primary: '#ededed',
      secondary: '#a0a0a0',
      muted: '#666666',
      faint: '#404040',
      inverse: '#0a0a0a',
    },
    accent: {
      base: '#00e599',
      hover: '#33edb3',
      muted: 'rgba(0, 229, 153, 0.12)',
      onAccent: '#0a0a0a',
    },
    semantic: {
      success: '#00e599',
      successMuted: 'rgba(0, 229, 153, 0.12)',
      warning: '#f5a623',
      warningMuted: 'rgba(245, 166, 35, 0.12)',
      error: '#ef4444',
      errorMuted: 'rgba(239, 68, 68, 0.12)',
      info: '#a0a0a0',
    },
    border: {
      default: '#1f1f1f',
      strong: '#333333',
    },
    graph: {
      closed: '#34d399',
      open: '#f5a623',
      active: '#00e599',
      link: 'rgba(255, 255, 255, 0.10)',
    },
  },
  light: {
    bg: {
      root: '#fafafa',
      surface: '#f0f0f0',
      raised: '#e5e5e5',
      input: '#ffffff',
      bar: '#f0f0f0',
      hover: '#e0e0e0',
      active: '#d4d4d4',
      overlay: 'rgba(0, 0, 0, 0.15)',
    },
    text: {
      primary: '#0a0a0a',
      secondary: '#525252',
      muted: '#737373',
      faint: '#a3a3a3',
      inverse: '#ededed',
    },
    accent: {
      base: '#00b377',
      hover: '#009966',
      muted: 'rgba(0, 179, 119, 0.10)',
      onAccent: '#ffffff',
    },
    semantic: {
      success: '#00b377',
      successMuted: 'rgba(0, 179, 119, 0.10)',
      warning: '#d4940a',
      warningMuted: 'rgba(212, 148, 10, 0.10)',
      error: '#dc2626',
      errorMuted: 'rgba(220, 38, 38, 0.08)',
      info: '#525252',
    },
    border: {
      default: '#e0e0e0',
      strong: '#c7c7c7',
    },
    graph: {
      closed: '#34d399',
      open: '#d4940a',
      active: '#00b377',
      link: 'rgba(0, 0, 0, 0.08)',
    },
  },
}
