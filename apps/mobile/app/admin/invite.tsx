import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, ScrollView, Platform } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/hooks/useAuth';
import { theme, colors, typography } from '../../src/theme';
import Button from '../../src/components/Button';
import Input from '../../src/components/Input';
import Banner from '../../src/components/Banner';

export default function InviteUserRoute() {
  const { session, ready } = useAuth();
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const boot = async () => {
      if (!session?.user) return;
      const { data: tm, error } = await supabase
        .from('team_members')
        .select('team_id,teams(name)')
        .eq('user_id', session.user.id)
        .eq('is_admin', true)
        .limit(1)
        .maybeSingle();
      if (error) console.error('invite: team lookup failed', error);
      setTeamId(tm?.team_id ?? null);
      setTeamName(tm?.teams?.name ?? null);
      setLoading(false);
    };
    if (ready && session?.user) boot();
  }, [ready, session?.user?.id]);

  const sendInvite = async () => {
    if (!teamId || !email) return;
    setSending(true);
    const { error } = await supabase.functions.invoke('invite-user', {
      body: { email: email.trim(), team_id: teamId },
    });
    if (error) console.error('invite-user failed', error);
    setEmail('');
    setSending(false);
  };

  if (!ready) return <View style={S.center}><ActivityIndicator /></View>;
  if (!session?.user) return <View style={S.center}><Text>Signed out.</Text></View>;
  if (loading) return <View style={S.center}><ActivityIndicator /></View>;

  if (!teamId) {
    return (
      <View style={S.center}>
        <Text style={[styles.title, { marginBottom: theme.spacing(2) }]}>Invite Members</Text>
        <Banner 
          kind="info" 
          message="You are not an admin on any team. Contact your team administrator to get access."
        />
        <View style={{ marginTop: theme.spacing(4) }}>
          <Button 
            title="Back to Menu"
            onPress={() => router.replace('/menu')}
            variant="secondary"
            accessibilityLabel="Navigate back to main menu"
          />
        </View>
      </View>
    );
  }

  return (
    <View style={S.container}>
      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: theme.spacing(8) }}
        showsVerticalScrollIndicator={false}
      >
        <View style={S.header}>
          <Text style={styles.title}>Invite Team Member</Text>
          <Text style={styles.subtitle}>
            Send an invitation to join your team
          </Text>
        </View>

        <View style={S.content}>
          {/* Team Info Card */}
          <View style={[S.card, { backgroundColor: colors.white }]}>
            <Text style={styles.sectionHeader}>Team Information</Text>
            <View style={S.infoRow}>
              <Text style={styles.labelText}>Team Name:</Text>
              <Text style={[styles.valueText, { fontWeight: '700' }]}>
                {teamName || 'Loading...'}
              </Text>
            </View>
            <View style={S.infoRow}>
              <Text style={styles.labelText}>Team ID:</Text>
              <Text style={[styles.valueText, { color: '#6b7280', fontFamily: 'monospace', fontSize: 12 }]}>
                {teamId?.substring(0, 8)}...
              </Text>
            </View>
          </View>

          {/* Invite Form Card */}
          <View style={[S.card, { backgroundColor: colors.white }]}>
            <Text style={styles.sectionHeader}>Invite Details</Text>
            
            <Input
              label="Email Address"
              value={email}
              onChangeText={setEmail}
              placeholder="person@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            
            <Text style={styles.helpText}>
              The invited user will receive an email with instructions to join your team.
            </Text>

            <View style={S.actions}>
              <Button 
                title={sending ? 'Sending Invite…' : 'Send Invite'}
                onPress={sendInvite}
                disabled={sending || !email.trim()}
                accessibilityLabel={sending ? 'Sending invitation' : 'Send team invitation'}
              />
            </View>
          </View>

          {/* Instructions Card */}
          <View style={[S.card, { backgroundColor: colors.white }]}>
            <Text style={styles.sectionHeader}>How It Works</Text>
            <View style={S.stepList}>
              <Text style={styles.stepText}>1. Enter the email address of the person to invite</Text>
              <Text style={styles.stepText}>2. Click "Send Invite" to deliver the invitation</Text>
              <Text style={styles.stepText}>3. The invited user will receive an email with a secure link</Text>
              <Text style={styles.stepText}>4. They can sign up and automatically join your team</Text>
            </View>
          </View>

          {/* Navigation */}
          <View style={S.navigation}>
            <Button 
              title="Back to Admin"
              onPress={() => router.replace('/admin')}
              variant="secondary"
              accessibilityLabel="Navigate back to admin dashboard"
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const S = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: colors.gray 
  },
  center: { 
    flex: 1, 
    alignItems: 'center', 
    justifyContent: 'center', 
    padding: theme.spacing(4) 
  },
  header: {
    paddingTop: theme.spacing(4),
    paddingHorizontal: theme.spacing(4),
    paddingBottom: theme.spacing(3),
  },
  content: {
    paddingHorizontal: theme.spacing(4),
    gap: theme.spacing(4),
  },
  card: {
    borderRadius: theme.radius.xl,
    padding: theme.spacing(4),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    // Web shadow support
    ...Platform.select({
      web: {
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
      },
    }),
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing(2),
  },
  stepList: {
    gap: theme.spacing(2),
  },
  actions: {
    marginTop: theme.spacing(4),
  },
  navigation: {
    paddingTop: theme.spacing(2),
  },
});

const styles = StyleSheet.create({
  title: {
    ...typography.title,
    fontSize: 24,
    marginBottom: theme.spacing(1),
  },
  subtitle: {
    ...typography.body,
    color: '#6b7280',
    marginBottom: 0,
  },
  sectionHeader: {
    ...typography.title,
    fontSize: 18,
    marginBottom: theme.spacing(3),
    color: theme.colors.text,
  },
  labelText: {
    ...typography.body,
    color: '#6b7280',
  },
  valueText: {
    ...typography.body,
    color: theme.colors.text,
  },
  helpText: {
    ...typography.label,
    color: '#6b7280',
    marginTop: theme.spacing(2),
    lineHeight: 20,
  },
  stepText: {
    ...typography.body,
    color: theme.colors.text,
    lineHeight: 22,
  },
});
