import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config, clampMaxTokens } from './config.js';
import { chatOpenAI } from './providers/openai.js';
import { chatAnthropic } from './providers/anthropic.js';
import { chatGemini } from './providers/gemini.js';

const app = express();
app.use(helmet());
app.use(morgan('dev'));
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '2mb' }));
app.use(express.static('public'));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/api/chat', async (req, res) => {
  try {
    const {
      messages = [],
      provider = config.provider,
      model: rawModel = config.model,
      max_output_tokens = config.maxOutputTokens,
    } = req.body || {};

    const model = String(rawModel || '').trim();
    if (!model || model === '5') {
      throw new Error("Please pick a valid model (click 'Fetch models' and choose from the list). '5' is not a model id.");
    }

    const maxTokens = clampMaxTokens(provider, max_output_tokens);

    let result;
    if (provider === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error('OPENAI_API_KEY missing');
      result = await chatOpenAI({ apiKey, model, messages, maxTokens });
    } else if (provider === 'anthropic') {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing');
      result = await chatAnthropic({ apiKey, model, messages, maxTokens });
    } else if (provider === 'gemini') {
      const apiKey = process.env.GOOGLE_API_KEY;
      if (!apiKey) throw new Error('GOOGLE_API_KEY missing');
      result = await chatGemini({ apiKey, model, messages, maxTokens });
    } else {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    res.json({ ok: true, text: result.text, raw: result.raw, used: { provider, model, maxTokens } });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

app.get('/api/models', async (req, res) => {
  try {
    const provider = req.query.provider || config.provider;
    if (provider === 'openai') {
      const key = process.env.OPENAI_API_KEY;
      if (!key) throw new Error('OPENAI_API_KEY missing');
      const r = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!r.ok) throw new Error(`OpenAI list models failed ${r.status}`);
      const data = await r.json();
      const models = (data.data || []).map(m => m.id).sort();
      return res.json({ ok: true, models });
    }
    // Minimal stubs for other providers later
    return res.json({ ok: true, models: [] });
  } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }); }
});

app.listen(config.port, () => {
  console.log(`Puppy UI running at http://localhost:${config.port}`);
});
