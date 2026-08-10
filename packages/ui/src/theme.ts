export const colorTokens = {
  light: {
    background: "#F4F4F6",
    surface: "#FFFFFF",
    surfaceAlt: "#F2F2F0",
    border: "#E6E4E1",
    textPrimary: "#1C1B1A",
    textSecondary: "#6B6862",
    primary: "#0E7C7B",
    primaryAlt: "#0A5F5E",
    onPrimary: "#FFFFFF",
    success: "#2E8B57",
    warning: "#C97A1A",
    danger: "#C23B3B",
    categoryAtendimento: "#0E7C7B",
    categoryPessoal: "#7B5EA7",
    categoryAcademico: "#C97A1A",
  },
  dark: {
    background: "#0B0C10",
    surface: "#1B1E25",
    surfaceAlt: "#222632",
    border: "#2C313D",
    textPrimary: "#F2F2F0",
    textSecondary: "#9C9A95",
    primary: "#3DDAD3",
    primaryAlt: "#1FA09B",
    onPrimary: "#08201F",
    success: "#4CAF74",
    warning: "#E0A23B",
    danger: "#E0605F",
    categoryAtendimento: "#3DDAD3",
    categoryPessoal: "#A88BDB",
    categoryAcademico: "#E0A23B",
  },
} as const;

export type ThemeMode = keyof typeof colorTokens;
export type ColorToken = keyof typeof colorTokens.light;

// Liquid-glass material tokens: translucent surfaces that sit on top of a
// colorful blurred backdrop, with a soft specular edge to read as "glass".
export const glassTokens = {
  light: {
    surface: "rgba(255, 255, 255, 0.58)",
    surfaceStrong: "rgba(255, 255, 255, 0.78)",
    border: "rgba(255, 255, 255, 0.65)",
    borderSoft: "rgba(255, 255, 255, 0.35)",
    specular: "rgba(255, 255, 255, 0.95)",
    shadow: "rgba(31, 38, 45, 0.16)",
    blur: "28px",
  },
  dark: {
    surface: "rgba(255, 255, 255, 0.07)",
    surfaceStrong: "rgba(255, 255, 255, 0.10)",
    border: "rgba(255, 255, 255, 0.14)",
    borderSoft: "rgba(255, 255, 255, 0.08)",
    specular: "rgba(255, 255, 255, 0.22)",
    shadow: "rgba(0, 0, 0, 0.55)",
    blur: "32px",
  },
} as const;

// Ambient mesh-gradient blobs rendered behind the glass UI, so translucent
// surfaces have something colorful to refract — like wallpaper under iOS/macOS glass.
export const meshTokens = {
  light: ["#8FE3D8", "#A6C2FF", "#F6C9E3", "#FFE3A0"],
  dark: ["#0E5C58", "#1F2E78", "#5B2454", "#6E4A14"],
} as const;

export const typography = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Inter, system-ui, sans-serif',
  sizes: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 20,
    xl: 28,
    xxl: 36,
    display: 48,
  },
  weights: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  tracking: {
    tight: "-0.02em",
    snug: "-0.01em",
    normal: "0",
  },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

// Liquid Glass favors big, continuous ("squircle"-like) corner radii.
export const radius = {
  sm: 10,
  md: 18,
  lg: 26,
  xl: 34,
  full: 999,
} as const;

export const motion = {
  fast: 140,
  normal: 260,
  slow: 420,
  easing: "cubic-bezier(0.22, 1, 0.36, 1)",
  spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
} as const;

export function getTheme(mode: ThemeMode) {
  return {
    mode,
    colors: colorTokens[mode],
    glass: glassTokens[mode],
    mesh: meshTokens[mode],
    typography,
    spacing,
    radius,
    motion,
  };
}

export type Theme = ReturnType<typeof getTheme>;

// Shared "liquid glass" surface recipe so every panel/card/bar in the app
// reads as the same material, with an optional elevated ("strong") variant.
export function glassSurface(theme: Theme, opts: { strong?: boolean; radius?: number } = {}) {
  return {
    background: opts.strong ? theme.glass.surfaceStrong : theme.glass.surface,
    backdropFilter: `blur(${theme.glass.blur}) saturate(180%)`,
    WebkitBackdropFilter: `blur(${theme.glass.blur}) saturate(180%)`,
    border: `1px solid ${theme.glass.border}`,
    borderRadius: opts.radius ?? theme.radius.lg,
    boxShadow: `0 1px 0 ${theme.glass.specular} inset, 0 18px 50px -20px ${theme.glass.shadow}`,
  } as const;
}
