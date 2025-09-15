// apps/mobile/src/theme.ts
export const colors = {
  blue: '#2563eb',
  gray: '#e5e7eb',
  text: '#111827',
  white: '#ffffff',
  red: '#dc2626',
  black: '#000000',
  green: '#16a34a',
};

// Readable type
export const typography = {
  body:   { fontSize: 17, lineHeight: 24 },
  label:  { fontSize: 15, lineHeight: 20 },
  title:  { fontSize: 20, lineHeight: 28, fontWeight: '700' as const },
  button: { fontSize: 18, lineHeight: 24, fontWeight: '600' as const },
};

export const textA11yProps = {
  allowFontScaling: true as const,
  maxFontSizeMultiplier: 2.0 as const,
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
