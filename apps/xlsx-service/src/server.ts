import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { loadConfig, parseAllowedOrigins } from './config.js';
import { createAdminSupabase } from './supabase.js';
import { submissionXlsxRoute } from './routes/submissionXlsxRoute.js';

const config = loadConfig();
const allowedOrigins = parseAllowedOrigins(config.ALLOWED_ORIGINS);

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(
  cors({
    origin: (origin, cb) => {
      // Mobile clients often have no origin.
      if (!origin) return cb(null, true);

      if (allowedOrigins.length === 0) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);

      return cb(new Error('CORS blocked'), false);
    },
    credentials: false,
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(morgan('tiny'));

app.get('/health', (_req, res) => res.status(200).json({ ok: true }));

const supabaseAdmin = createAdminSupabase(config);

// API
app.post('/submission-xlsx', submissionXlsxRoute({ supabaseAdmin }));

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[xlsx-service] unhandled error', err);
  return res.status(500).json({ error: 'Internal error' });
});

app.listen(config.PORT, () => {
  console.log(`[xlsx-service] listening on :${config.PORT}`);
});
