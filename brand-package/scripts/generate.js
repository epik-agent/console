#!/usr/bin/env node
/**
 * Reads brand.json and generates:
 *   dist/brand.css  – CSS custom properties for dark & light themes
 *   dist/brand.js   – ES module re-exporting the JSON with typed helpers
 *   dist/brand.d.ts – TypeScript declarations
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const brand = JSON.parse(readFileSync(join(root, 'brand.json'), 'utf-8'))

mkdirSync(join(root, 'dist'), { recursive: true })

// ---------------------------------------------------------------------------
// 1. Generate CSS custom properties
// ---------------------------------------------------------------------------

function flattenTokens(obj, prefix = '') {
  const entries = []
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}-${key}` : key
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      entries.push(...flattenTokens(value, path))
    } else {
      entries.push([path, value])
    }
  }
  return entries
}

function buildCssBlock(palette, indent = '  ') {
  return flattenTokens(palette)
    .map(([key, val]) => `${indent}--brand-${key}: ${val};`)
    .join('\n')
}

const css = `/* @epik-agent/brand – generated from brand.json – do not edit */

/* Font imports */
@import url('${brand.fonts.sans.source}');
@import url('${brand.fonts.mono.source}');

:root,
[data-theme="dark"] {
  --brand-font-sans: '${brand.fonts.sans.family}', ui-sans-serif, system-ui, sans-serif;
  --brand-font-mono: '${brand.fonts.mono.family}', ui-monospace, monospace;
${buildCssBlock(brand.palette.dark)}
}

[data-theme="light"] {
  --brand-font-sans: '${brand.fonts.sans.family}', ui-sans-serif, system-ui, sans-serif;
  --brand-font-mono: '${brand.fonts.mono.family}', ui-monospace, monospace;
${buildCssBlock(brand.palette.light)}
}

@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) {
${buildCssBlock(brand.palette.light, '    ')}
  }
}
`

writeFileSync(join(root, 'dist', 'brand.css'), css)

// ---------------------------------------------------------------------------
// 2. Generate JS module
// ---------------------------------------------------------------------------

const js = `// @epik-agent/brand – generated from brand.json – do not edit
import brand from '../brand.json' with { type: 'json' };
export default brand;
export const name = brand.name;
export const wordmark = brand.wordmark;
export const tagline = brand.tagline;
export const fonts = brand.fonts;
export const palette = brand.palette;
export const logo = brand.logo;
export const meta = brand.meta;
export const files = brand.files;
`

writeFileSync(join(root, 'dist', 'brand.js'), js)

// ---------------------------------------------------------------------------
// 3. Generate TypeScript declarations
// ---------------------------------------------------------------------------

const dts = `// @epik-agent/brand – generated from brand.json – do not edit

export interface BgTokens {
  root: string; surface: string; raised: string; input: string;
  bar: string; hover: string; active: string; overlay: string;
}
export interface TextTokens {
  primary: string; secondary: string; muted: string; faint: string; inverse: string;
}
export interface AccentTokens {
  base: string; hover: string; muted: string; onAccent: string;
}
export interface SemanticTokens {
  success: string; successMuted: string; warning: string; warningMuted: string;
  error: string; errorMuted: string; info: string;
}
export interface BorderTokens { default: string; strong: string; }
export interface GraphTokens { closed: string; open: string; active: string; link: string; }

export interface Palette {
  bg: BgTokens; text: TextTokens; accent: AccentTokens;
  semantic: SemanticTokens; border: BorderTokens; graph: GraphTokens;
}

export interface Font {
  family: string;
  weights: number[];
  source: string;
}

export interface LogoNode {
  cx: number; cy: number; r: number;
  fill: 'accent' | 'foreground';
  opacity?: number;
}

export interface Logo {
  type: string;
  description: string;
  nodes: LogoNode[];
  edges: [number, number][];
  edgeStyle: { strokeWidth: number; opacity: number; stroke: string; };
  viewBox: string;
}

export interface Brand {
  name: string;
  wordmark: string;
  wordmarkNote: string;
  tagline: string;
  copyright: string;
  fonts: { sans: Font; mono: Font; };
  palette: { dark: Palette; light: Palette; };
  logo: Logo;
  files: Record<string, string>;
  meta: { themeColorDark: string; themeColorLight: string; };
}

declare const brand: Brand;
export default brand;
export declare const name: string;
export declare const wordmark: string;
export declare const tagline: string;
export declare const fonts: Brand['fonts'];
export declare const palette: Brand['palette'];
export declare const logo: Logo;
export declare const meta: Brand['meta'];
export declare const files: Brand['files'];
`

writeFileSync(join(root, 'dist', 'brand.d.ts'), dts)

console.log('Generated dist/brand.css, dist/brand.js, dist/brand.d.ts')
