/**
 * Local vendored copy of @epik-agent/brand exports.
 *
 * This mirrors the published package so imports like
 *   import { palette } from '@epik-agent/brand'
 * resolve via the Vite/TS alias to this file.
 *
 * When the real package is installable (with GH_TOKEN), the alias can
 * be removed and imports will resolve to node_modules as usual.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

export interface Font {
  family: string
  weights: number[]
  source: string
}

export interface LogoNode {
  cx: number
  cy: number
  r: number
  fill: 'accent' | 'foreground'
  opacity?: number
}

export interface Logo {
  type: string
  description: string
  nodes: LogoNode[]
  edges: [number, number][]
  edgeStyle: { strokeWidth: number; opacity: number; stroke: string }
  viewBox: string
}

export interface Brand {
  name: string
  wordmark: string
  wordmarkNote: string
  tagline: string
  copyright: string
  fonts: { sans: Font; mono: Font }
  palette: { dark: Palette; light: Palette }
  logo: Logo
  files: Record<string, string>
  meta: { themeColorDark: string; themeColorLight: string }
}

// ---------------------------------------------------------------------------
// Data (matches brand.json 0.1.0)
// ---------------------------------------------------------------------------

export const name = 'Epik'
export const wordmark = 'epik'
export const tagline = 'You describe it. We build it.'

export const fonts: Brand['fonts'] = {
  sans: {
    family: 'Geist',
    weights: [300, 400, 500, 600, 700],
    source: 'https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&display=swap',
  },
  mono: {
    family: 'Geist Mono',
    weights: [400, 500],
    source: 'https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500&display=swap',
  },
}

export const palette: { dark: Palette; light: Palette } = {
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
    border: { default: '#1f1f1f', strong: '#333333' },
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
    border: { default: '#e0e0e0', strong: '#c7c7c7' },
    graph: { closed: '#34d399', open: '#d4940a', active: '#00b377', link: 'rgba(0, 0, 0, 0.08)' },
  },
}

export const logo: Logo = {
  type: 'node-graph-constellation',
  description:
    'Four connected nodes forming an abstract network graph. Two nodes use the accent color, two use the foreground color.',
  nodes: [
    { cx: 5, cy: 5, r: 2.5, fill: 'accent' },
    { cx: 17, cy: 8, r: 2.0, fill: 'foreground' },
    { cx: 8, cy: 17, r: 2.0, fill: 'foreground' },
    { cx: 14, cy: 17, r: 1.6, fill: 'accent', opacity: 0.7 },
  ],
  edges: [
    [0, 1],
    [0, 2],
    [1, 3],
    [2, 3],
  ],
  edgeStyle: { strokeWidth: 1.2, opacity: 0.35, stroke: 'foreground' },
  viewBox: '0 0 22 22',
}

export const meta: Brand['meta'] = {
  themeColorDark: '#0a0a0a',
  themeColorLight: '#fafafa',
}

export const files: Record<string, string> = {
  favicon: 'assets/favicon.svg',
  logoMarkDark: 'assets/logo-mark-dark.svg',
  logoMarkLight: 'assets/logo-mark-light.svg',
  logoFullDark: 'assets/logo-full-dark.svg',
  logoFullLight: 'assets/logo-full-light.svg',
}

const brand: Brand = {
  name,
  wordmark,
  wordmarkNote: 'Lowercase with italic k',
  tagline,
  copyright: 'Epik',
  fonts,
  palette,
  logo,
  files,
  meta,
}

export default brand
