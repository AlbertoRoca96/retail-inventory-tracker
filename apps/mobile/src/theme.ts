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

  input: {
    backgroundColor: colors.white,
    borderColor: '#111827',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    height: 44,
  },
  button: {
    backgroundColor: colors.blue,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: colors.white,
    fontWeight: '700',
  },
};
