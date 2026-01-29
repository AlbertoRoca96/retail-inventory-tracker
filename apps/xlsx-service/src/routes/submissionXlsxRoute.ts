import type { Request, Response } from 'express';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getBearerToken, getUserFromSupabaseJwt } from '../auth.js';
import { buildSubmissionXlsx } from '../xlsx/buildSubmissionXlsx.js';

const BodySchema = z.object({
  submission_id: z.string().uuid(),
});

async function ensureTeamMembership({
  supabaseAdmin,
  teamId,
  userId,
}: {
  supabaseAdmin: SupabaseClient;
  teamId: string;
  userId: string;
}): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('team_members')
    .select('team_id')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return false;
  return !!data?.team_id;
}

export function submissionXlsxRoute({ supabaseAdmin }: { supabaseAdmin: SupabaseClient }) {
  return async (req: Request, res: Response) => {
    const token = getBearerToken(req as any);
    if (!token) {
      return res.status(401).json({ error: 'Missing Authorization: Bearer <token>' });
    }

    const user = await getUserFromSupabaseJwt(supabaseAdmin, token);
    if (!user) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    }

    const { submission_id } = parsed.data;

    const { data: submission, error: subErr } = await supabaseAdmin
      .from('submissions')
      .select('*')
      .eq('id', submission_id)
      .maybeSingle();

    if (subErr) {
      return res.status(500).json({ error: 'DB error fetching submission', details: String(subErr.message ?? subErr) });
    }
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    const teamId = submission.team_id as string | undefined;
    if (!teamId) {
      return res.status(500).json({ error: 'Submission missing team_id' });
    }

    const isMember = await ensureTeamMembership({ supabaseAdmin, teamId, userId: user.id });
    if (!isMember) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    try {
      const xlsx = await buildSubmissionXlsx({
        supabaseAdmin,
        submission: submission as any,
        bucket: 'submissions',
      });

      res.setHeader('Content-Type', xlsx.mime);
      res.setHeader('Content-Disposition', `attachment; filename="${xlsx.fileName}"`);
      res.setHeader('Cache-Control', 'no-store');

      return res.status(200).send(xlsx.bytes);
    } catch (e: any) {
      return res.status(500).json({
        error: 'XLSX generation failed',
        details: e?.message ?? String(e),
      });
    }
  };
}
