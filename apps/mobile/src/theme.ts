// apps/mobile/src/theme.ts

const primary = {
  50: '#eff6ff',
  100: '#dbeafe',
  200: '#bfdbfe',
  300: '#93c5fd',
  400: '#60a5fa',
  500: '#3b82f6',
  600: '#2563eb',
  700: '#1d4ed8',
  800: '#1e40af',
  900: '#1e3a8a',
} as const;

const gray = {
  50: '#f8fafc',
  100: '#f1f5f9',
  200: '#e2e8f0',
  300: '#cbd5f5',
  400: '#94a3b8',
  500: '#64748b',
  600: '#475569',
  700: '#334155',
  800: '#1f2937',
  900: '#0f172a',
} as const;

const success = {
  50: '#ecfdf5',
  100: '#d1fae5',
  200: '#a7f3d0',
  400: '#34d399',
  500: '#22c55e',
  600: '#16a34a',
  700: '#15803d',
} as const;

const warning = {
  50: '#fffbeb',
  100: '#fef3c7',
  200: '#fde68a',
  400: '#fbbf24',
  500: '#f59e0b',
  600: '#d97706',
  700: '#b45309',
} as const;

const error = {
  50: '#fef2f2',
  100: '#fee2e2',
  200: '#fecaca',
  400: '#f87171',
  500: '#ef4444',
  600: '#dc2626',
  700: '#b91c1c',
} as const;

export const colors = {
  white: '#ffffff',
  black: '#0f172a',
  text: '#0f172a',
  textMuted: '#475569',
  background: '#f8fafc',
  surface: '#ffffff',
  surfaceMuted: '#f1f5f9',
  card: '#ffffff',
  border: '#e2e8f0',
  overlay: 'rgba(15, 23, 42, 0.08)',
  primary,
  gray,
  success,
  warning,
  error,
  blue: primary[600],
  red: error[600],
  green: success[600],
} as const;

// Readable type
export const typography = {
  body:   { fontSize: 17, lineHeight: 24 },
  label:  { fontSize: 15, lineHeight: 20 },
  title:  { fontSize: 20, lineHeight: 28, fontWeight: '700' as const },
  h1:     { fontSize: 24, lineHeight: 32, fontWeight: '800' as const },
  h3:     { fontSize: 18, lineHeight: 24, fontWeight: '700' as const },
  bodyLarge: { fontSize: 18, lineHeight: 26 },
  caption: { fontSize: 13, lineHeight: 18 },
  captionSmall: { fontSize: 12, lineHeight: 16 },
  button: { fontSize: 18, lineHeight: 24, fontWeight: '600' as const },
  buttonSmall: { fontSize: 16, lineHeight: 20, fontWeight: '600' as const },
  buttonLarge: { fontSize: 20, lineHeight: 26, fontWeight: '600' as const },
};

export const textA11yProps = {
  allowFontScaling: true as const,
  maxFontSizeMultiplier: 2.0 as const,
};

// Design tokens
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
};

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
};

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
};

export const animations = {
  press: {
    transform: [{ scale: 0.98 }],
  },
};

export const theme = {
  colors,
  spacing: (n: number) => n * 8,
  radius: { md: 8, lg: 10, xl: 12 },

  input: {
    backgroundColor: colors.surface,
    borderColor: colors.gray[300],
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    height: 56,
  },

  button: {
    backgroundColor: colors.primary[600],
    paddingVertical: 12,
    paddingHorizontal: 20,
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },

  buttonText: {
    color: colors.white,
    fontWeight: '700' as const,
    fontSize: typography.button.fontSize,
    lineHeight: typography.button.lineHeight,
  },
};
