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

// Typography tuned for readability at larger sizes.
// Keep scaling ON; cap extremes so layouts don't explode.
export const typography = {
  body:   { fontSize: 17, lineHeight: 24 },
  label:  { fontSize: 15, lineHeight: 20 },
  title:  { fontSize: 20, lineHeight: 28, fontWeight: '700' as const },
  button: { fontSize: 18, lineHeight: 24, fontWeight: '600' as const },
};

// Apply to <Text> / <TextInput> where you want scaling behavior consistent.
export const textA11yProps = {
  allowFontScaling: true as const,
  maxFontSizeMultiplier: 2.0 as const, // honors large text, but avoids catastrophic reflow
};

export const theme = {
  // expose colors for components that expect theme.colors.*
  colors,

  // simple spacing/radius helpers used by some components
  spacing: (n: number) => n * 8, // 1 -> 8px, 2 -> 16px, etc.
  radius: {
    md: 8,
    lg: 10,
    xl: 12,
  },

  // Larger, high-contrast default inputs
  input: {
    backgroundColor: colors.white,
    borderColor: '#111827',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    height: 56, // >=48–56 for fat-finger targets
  },

  // Buttons with >=48dp/pt target height
  button: {
    backgroundColor: colors.blue,
    paddingVertical: 12,
    paddingHorizontal: 20,
    minHeight: 48, // meets iOS/Android guidance
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
