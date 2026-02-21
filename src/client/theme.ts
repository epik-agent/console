/** `'dark'` or `'light'` — the two supported color modes. */
export type Theme = 'dark' | 'light'

// Epik logo palette: #f6f2ee (cream), #a0707a (mauve), #2a2a2a (charcoal)

/**
 * A complete color palette for one {@link Theme}.
 *
 * Every component that needs a color reads it from a `Palette` instance rather
 * than hard-coding a hex value, so dark/light switching is a single prop swap.
 */
export interface Palette {
  /** Background colors for distinct surface layers. */
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
  /** Text colors for distinct emphasis levels. */
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
  /** Border colors. */
  border: {
    /** Default subtle border. */
    default: string
    /** Stronger border for emphasis. */
    strong: string
    /** Border used around tool-result cards. */
    toolResult: string
  }
  /** Feature/persona accent color (overridden per-feature in the UI). */
  accent: string
}

/** Pre-built {@link Palette} instances for each supported {@link Theme}. */
export const themes: Record<Theme, Palette> = {
  dark: {
    bg: {
      root: '#1e1b1b', // warm near-black
      bar: '#161313', // deeper charcoal
      input: '#2a2525', // warm dark input
      toolCard: '#2a2525',
      toolResult: '#231f1f',
      toolHeader: '#342e2e',
      inputBar: '#2a2525',
    },
    text: {
      primary: '#f0ebe6', // warm off-white (near logo cream)
      secondary: '#d9d0c8', // slightly muted cream
      muted: '#a89890', // warm gray-brown
      faint: '#72625a', // muted terracotta
      toolHeader: '#d9d0c8',
      toolBody: '#ede6df',
    },
    border: {
      default: '#3d3535',
      strong: '#524848',
      toolResult: '#342e2e',
    },
    accent: '#a0707a', // mauve
  },
  light: {
    bg: {
      root: '#f6f2ee', // logo background cream
      bar: '#ede7e0', // slightly deeper cream
      input: '#faf8f5', // near-white warm
      toolCard: '#faf8f5',
      toolResult: '#ede7e0',
      toolHeader: '#e0d8d0',
      inputBar: '#ede7e0',
    },
    text: {
      primary: '#2a2a2a', // logo charcoal
      secondary: '#3d3535', // warm dark brown
      muted: '#6b5e58', // medium warm brown
      faint: '#9e8e87', // light warm brown
      toolHeader: '#3d3535',
      toolBody: '#1e1b1b',
    },
    border: {
      default: '#d4ccc4',
      strong: '#b8afa7',
      toolResult: '#ccc4bc',
    },
    accent: '#a0707a', // mauve
  },
}
