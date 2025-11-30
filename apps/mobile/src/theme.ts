// apps/mobile/src/theme.ts
export const colors = {
  blue: '#2563eb',
  gray: '#e5e7eb',
  text: '#111827',
  white: '#ffffff',
  red: '#dc2626',
  black: '#000000',
  green: '#16a34a',
  success: '#16a34a',
  warning: '#f59e0b', 
  error: '#dc2626',
  primary: {
    600: '#2563eb',
    700: '#1d4ed8',
  },
  gray: {
    400: '#9ca3af',
    700: '#374151',
  },
  border: '#e5e7eb',
  card: '#ffffff',
};

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
    backgroundColor: colors.white,
    borderColor: '#111827',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    height: 56,
  },

  button: {
    backgroundColor: colors.blue,
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
