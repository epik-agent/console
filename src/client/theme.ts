/** `'dark'` or `'light'` — the two supported colour modes. */
export type Theme = 'dark' | 'light'

// Epik brand palette: Monochrome + Electric Green (#00E599)
// Typefaces: Geist (sans), Geist Mono (mono)

/**
 * A complete colour palette for one {@link Theme}.
 *
 * Every component that needs a colour reads it from a `Palette` instance rather
 * than hard-coding a hex value, so dark/light switching is a single prop swap.
 */
export interface Palette {
  /** Background colours for distinct surface layers. */
  bg: {
    /** App root background. */
    root: string
    /** Top bar and footer bar background. */
    bar: string
    /** Chat input field background. */
    input: string
    /** Tool-use card background. */
    toolCard: string
    /** Tool-result card background. */
    toolResult: string
    /** Tool card header strip background. */
    toolHeader: string
    /** Input bar container background. */
    inputBar: string
  }
  /** Text colours for distinct emphasis levels. */
  text: {
    /** Primary body text. */
    primary: string
    /** Secondary / subdued text. */
    secondary: string
    /** Muted labels and metadata. */
    muted: string
    /** Faintest placeholder / hint text. */
    faint: string
    /** Tool card header text. */
    toolHeader: string
    /** Tool card body text. */
    toolBody: string
  }
  /** Border colours. */
  border: {
    /** Default subtle border. */
    default: string
    /** Stronger border for emphasis. */
    strong: string
    /** Border used around tool-result cards. */
    toolResult: string
  }
  /** Feature/persona accent colour (overridden per-feature in the UI). */
  accent: string
}

/** Pre-built {@link Palette} instances for each supported {@link Theme}. */
export const themes: Record<Theme, Palette> = {
  dark: {
    bg: {
      root: '#0a0a0a',
      bar: '#0e0e0e',
      input: '#141414',
      toolCard: '#141414',
      toolResult: '#111111',
      toolHeader: '#1a1a1a',
      inputBar: '#0e0e0e',
    },
    text: {
      primary: '#ededed',
      secondary: '#a0a0a0',
      muted: '#666666',
      faint: '#404040',
      toolHeader: '#a0a0a0',
      toolBody: '#ededed',
    },
    border: {
      default: '#1f1f1f',
      strong: '#333333',
      toolResult: '#1f1f1f',
    },
    accent: '#00e599',
  },
  light: {
    bg: {
      root: '#fafafa',
      bar: '#f0f0f0',
      input: '#ffffff',
      toolCard: '#f5f5f5',
      toolResult: '#f0f0f0',
      toolHeader: '#e5e5e5',
      inputBar: '#f0f0f0',
    },
    text: {
      primary: '#0a0a0a',
      secondary: '#525252',
      muted: '#737373',
      faint: '#a3a3a3',
      toolHeader: '#525252',
      toolBody: '#0a0a0a',
    },
    border: {
      default: '#e0e0e0',
      strong: '#c7c7c7',
      toolResult: '#e0e0e0',
    },
    accent: '#00b377',
  },
}
