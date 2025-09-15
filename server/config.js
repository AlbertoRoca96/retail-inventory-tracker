import dotenv from 'dotenv';
dotenv.config();

const env = (key, fallback) => process.env[key] ?? fallback;

export const config = {
  port: Number(env('PORT', 5173)),
  provider: env('PROVIDER', 'openai'),
  model: env('MODEL', 'gpt-4o-mini'),
  maxOutputTokens: env('MAX_OUTPUT_TOKENS', 'max'),
};

export const clampMaxTokens = (provider, requested) => {
  // Very conservative caps; providers change often. Adjust as needed.
  const caps = {
    openai: 8192, // practical ceiling for most GPT-4o-mini responses
    anthropic: 8192,
    gemini: 8192,
  };
  const cap = caps[provider] ?? 4096;
  if (requested === 'max') return cap;
  const n = Number(requested);
  if (Number.isNaN(n) || n <= 0) return cap;
  return Math.min(n, cap);
};
