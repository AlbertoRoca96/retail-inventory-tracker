import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import LogoHeader from '../../src/components/LogoHeader';
import { useAuth } from '../../src/hooks/useAuth';
import { supabase } from '../../src/lib/supabase';
import { colors, theme, typography } from '../../src/theme';
import { sendExcelFileAttachmentMessageFromPath } from '../../src/lib/chat';
import { sendDirectFileAttachmentFromPath } from '../../src/lib/directMessages';

type TargetRow =
  | { kind: 'team_chat' }
  | { kind: 'submission_chat'; submissionId: string }
  | { kind: 'member'; userId: string; label: string; email?: string | null };

export default function SendAttachmentPicker() {
  const params = useLocalSearchParams<{
    teamId?: string;
    submissionId?: string;
    localPath?: string;
    fileName?: string;
    type?: string;
  }>();

  const { session, ready } = useAuth();
  const [members, setMembers] = useState<{ user_id: string; display_name?: string | null; email?: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const teamId = typeof params.teamId === 'string' ? params.teamId : '';
  const submissionId = typeof params.submissionId === 'string' ? params.submissionId : '';
  const localPath = typeof params.localPath === 'string' ? params.localPath : '';
  const fileName = typeof params.fileName === 'string' ? params.fileName : 'attachment.xlsx';
  const type = typeof params.type === 'string' ? params.type : 'excel';

  const rows = useMemo<TargetRow[]>(() => {
    const out: TargetRow[] = [{ kind: 'team_chat' }];
    if (submissionId) out.push({ kind: 'submission_chat', submissionId });
    members.forEach((m) => {
      out.push({
        kind: 'member',
        userId: m.user_id,
        label: m.display_name || m.email || m.user_id.slice(0, 8),
        email: m.email,
      });
    });
    return out;
  }, [members, submissionId]);

  useEffect(() => {
    if (!ready || !session?.user) return;
    if (!teamId || !localPath) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase.rpc('team_users_with_names', { p_team_id: teamId });
        if (error) throw error;
        const filtered = (data as any[])
          ?.filter((row) => row.user_id !== session.user.id)
          .map((row) => ({ user_id: row.user_id, display_name: row.display_name, email: row.email }));
        if (!cancelled) setMembers(filtered || []);
      } catch (err) {
        console.warn('[send-attachment] roster load failed', err);
        if (!cancelled) setMembers([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, session?.user?.id, teamId, localPath]);

  const doSend = async (target: TargetRow) => {
    if (sending) return;
    if (!teamId || !localPath) {
      Alert.alert('Missing data', 'Missing teamId or localPath. Try exporting again.');
      return;
    }

    try {
      setSending(true);

      if (target.kind === 'team_chat') {
        const res = await sendExcelFileAttachmentMessageFromPath(teamId, null, localPath, fileName, '', {
          is_internal: true,
        });
        if (!res.success) throw new Error(res.error || 'Failed to send');
        router.replace('/chat/team');
        return;
      }

      if (target.kind === 'submission_chat') {
        const res = await sendExcelFileAttachmentMessageFromPath(teamId, target.submissionId, localPath, fileName, '', {
          is_internal: false,
        });
        if (!res.success) throw new Error(res.error || 'Failed to send');
        router.replace({ pathname: `/chat/${target.submissionId}`, params: { team: teamId } });
        return;
      }

      if (target.kind === 'member') {
        const res = await sendDirectFileAttachmentFromPath({
          teamId,
          recipientId: target.userId,
          localPath,
          fileName,
          attachmentType: type === 'pdf' ? 'pdf' : type === 'csv' ? 'csv' : 'excel',
          body: '',
        });
        if (!res.success) throw new Error(res.error || 'Failed to send');
        router.replace({ pathname: `/chat/direct/${target.userId}`, params: { team: teamId } });
        return;
      }
    } catch (err: any) {
      Alert.alert('Send failed', err?.message || 'Unable to send attachment.');
    } finally {
      setSending(false);
    }
  };

  const renderRow = ({ item }: { item: TargetRow }) => {
    if (item.kind === 'team_chat') {
      return (
        <Pressable style={styles.row} onPress={() => doSend(item)} disabled={sending}>
          <Text style={styles.title}>Team chat</Text>
          <Text style={styles.subtitle}>Send to the whole team</Text>
        </Pressable>
      );
    }

    if (item.kind === 'submission_chat') {
      return (
        <Pressable style={styles.row} onPress={() => doSend(item)} disabled={sending}>
          <Text style={styles.title}>Submission chat</Text>
          <Text style={styles.subtitle}>Send to this submission thread</Text>
        </Pressable>
      );
    }

    return (
      <Pressable style={styles.row} onPress={() => doSend(item)} disabled={sending}>
        <Text style={styles.title}>{item.label}</Text>
        {item.email ? <Text style={styles.subtitle}>{item.email}</Text> : <Text style={styles.subtitle}>Direct message</Text>}
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <LogoHeader title="Send to chat" subtitle={fileName} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.blue} />
          <Text style={styles.loadingText}>Loading recipients…</Text>
        </View>
      ) : !teamId || !localPath ? (
        <View style={styles.center}>
          <Text style={styles.loadingText}>Missing teamId/localPath. Go back and try again.</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => (r.kind === 'member' ? `m:${r.userId}` : r.kind === 'submission_chat' ? `s:${r.submissionId}` : 'team')}
          contentContainerStyle={styles.list}
          renderItem={renderRow}
          ListHeaderComponent={
            <View style={{ paddingHorizontal: theme.spacing(2), paddingTop: theme.spacing(2) }}>
              <Text style={styles.section}>Choose a chat</Text>
            </View>
          }
          ItemSeparatorComponent={() => <View style={{ height: theme.spacing(1) }} />}
        />
      )}

      {sending ? (
        <View style={styles.sendingBar}>
          <ActivityIndicator color="#fff" />
          <Text style={styles.sendingText}>Sending…</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing(4) },
  loadingText: { ...typography.body, color: colors.textMuted, marginTop: theme.spacing(2), textAlign: 'center' },
  list: { padding: theme.spacing(2), paddingBottom: theme.spacing(6) },
  section: { ...typography.label, color: colors.textMuted },
  row: {
    backgroundColor: colors.card,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: theme.spacing(3),
  },
  title: { ...typography.body, fontWeight: '800', color: colors.text },
  subtitle: { ...typography.label, color: colors.textMuted, marginTop: 4 },
  sendingBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.blue,
    padding: theme.spacing(2),
    flexDirection: 'row',
    justifyContent: 'center',
    gap: theme.spacing(2),
  },
  sendingText: { ...typography.body, color: '#fff', fontWeight: '700' },
});
