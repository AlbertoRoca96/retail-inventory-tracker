// apps/mobile/src/theme.ts
export const colors = {
  blue: '#2563eb',
  gray: '#e5e7eb',
  text: '#111827',
  white: '#ffffff',
};

export const theme = {
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
