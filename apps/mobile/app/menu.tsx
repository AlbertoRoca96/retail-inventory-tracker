// apps/mobile/app/menu.tsx - Professional Menu Page
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, ScrollView, Dimensions } from 'react-native';
import { router } from 'expo-router';
import Head from 'expo-router/head';
import { supabase } from '../src/lib/supabase';
import { useIsAdmin } from '../src/hooks/useIsAdmin';
import { useUISettings } from '../src/lib/uiSettings';
import { colors, theme, typography, textA11yProps, borderRadius, shadows, spacing } from '../src/theme';
import Button from '../src/components/Button';

const { width, height } = Dimensions.get('window');

export default function Menu() {
  const { isAdmin, loading } = useIsAdmin();
  const { fontScale, highContrast, targetMinHeight, simplifiedMode, largeText } = useUISettings();

  // Lightweight check for display name
  const [needsDisplayName, setNeedsDisplayName] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const name = (data.user?.user_metadata as any)?.display_name;
      if (!cancelled) setNeedsDisplayName(!name || String(name).trim().length === 0);
    })();
    return () => { cancelled = true; };
  }, []);

  // Typography scaled by user preference
  const titleStyle = useMemo(() => ({
    fontSize: Math.round(typography.h1.fontSize * fontScale * 1.1),
    lineHeight: Math.round(typography.h1.lineHeight * fontScale * 1.1),
    fontWeight: '800' as const,
    marginBottom: theme.spacing.lg,
    color: colors.primary[800],
    textAlign: 'center' as const,
  }), [fontScale]);

  const subtitleStyle = useMemo(() => ({
    fontSize: Math.round(typography.bodyLarge.fontSize * fontScale),
    lineHeight: Math.round(typography.bodyLarge.lineHeight * fontScale),
    fontWeight: '500' as const,
    color: colors.gray[600],
    textAlign: 'center' as const,
    marginBottom: theme.spacing.xl,
  }), [fontScale]);

  return (
    <ScrollView 
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      <Head>
        <title>Menu - Retail Inventory Tracker</title>
      </Head>

      {/* Header with Professional Background */}
      <View style={styles.header}>
        <View style={styles.headerBackground}>
          <View style={styles.headerContent}>
            <Text {...textA11yProps} style={titleStyle}>
              Retail Tracker
            </Text>
            <Text {...textA11yProps} style={subtitleStyle}>
              Manage your retail inventory with ease
            </Text>
          </View>
        </View>
      </View>

      {/* Quick Actions Section */}
      <View style={styles.section}>
        <Text {...textA11yProps} style={styles.sectionTitle}>
          Quick Actions
        </Text>
        
        <View style={styles.actionGrid}>
          <Button
            title="📝 Create Form"
            onPress={() => router.push('/form/new')}
            variant="primary"
            size="lg"
            fullWidth
            accessibilityLabel="Create new submission form"
          />
          
          <Button
            title="📊 View Submissions"
            onPress={() => router.push('/submissions')}
            variant="secondary"
            size="lg"
            fullWidth
            accessibilityLabel="View all submissions"
          />
        </View>
      </View>

      {/* Account Section */}
      <View style={styles.section}>
        <Text {...textA11yProps} style={styles.sectionTitle}>
          Account
        </Text>
        
        <View style={styles.actionGrid}>
          <Button
            title="⚙️ Settings"
            onPress={() => router.push('/account/settings')}
            variant="ghost"
            size="md"
            fullWidth
            accessibilityLabel="Account settings"
          />
          
          {needsDisplayName && (
            <Button
              title="👤 Set Display Name"
              onPress={() => router.push('/account/display-name')}
              variant="warning"
              size="md"
              fullWidth
              accessibilityLabel="Set your display name"
            />
          )}
        </View>
      </View>

      {/* Admin Section */}
      {loading ? (
        <View style={styles.loadingSection}>
          <ActivityIndicator 
            accessibilityLabel="Loading admin status" 
            size="large" 
            color={colors.primary[600]} 
          />
          <Text {...textA11yProps} style={styles.loadingText}>
            Loading admin features...
          </Text>
        </View>
      ) : isAdmin ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text {...textA11yProps} style={styles.sectionTitle}>
              👑 Admin
            </Text>
            <View style={styles.adminBadge}>
              <Text style={styles.adminBadgeText}>ADMIN</Text>
            </View>
          </View>
          
          <View style={styles.actionGrid}>
            <Button
              title="🎛️ Admin Panel"
              onPress={() => router.push('/admin')}
              variant="secondary"
              size="md"
              fullWidth
              accessibilityLabel="Open admin panel"
            />
            
            <Button
              title="📈 Metrics Dashboard"
              onPress={() => router.push('/admin/metrics')}
              variant="ghost"
              size="md"
              fullWidth
              accessibilityLabel="View metrics dashboard"
            />
          </View>
        </View>
      ) : null}

      {/* Chat functionality */}
      <View style={[styles.section, styles.lastSection]}>
        <Button
          title="💬 Chat"
          onPress={() => router.push('/chat')}
          variant="primary"
          size="md"
          fullWidth
          accessibilityLabel="Open team chat"
        />
      </View>

      {/* Logout Section */}
      <View style={[styles.section, styles.lastSection]}>
        <Button
          title="🚪 Log Out"
          onPress={async () => {
            await supabase.auth.signOut().catch(() => {});
            router.replace('/');
          }}
          variant="error"
          size="md"
          fullWidth
          accessibilityLabel="Log out of application"
        />
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text {...textA11yProps} style={styles.footerText}>
          Retail Inventory Tracker v1.0
        </Text>
        <Text {...textA11yProps} style={styles.footerSubtext}>
          Professional Mobile Solution
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = {
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  contentContainer: {
    flexGrow: 1,
    paddingBottom: theme.spacing.xxl,
  },
  header: {
    marginBottom: theme.spacing.lg,
  },
  headerBackground: {
    backgroundColor: theme.colors.primary[600],
    borderBottomLeftRadius: borderRadius.xl * 2,
    borderBottomRightRadius: borderRadius.xl * 2,
    ...shadows.lg,
  },
  headerContent: {
    paddingVertical: theme.spacing.xxl,
    paddingHorizontal: theme.spacing.lg,
    alignItems: 'center',
  },
  section: {
    marginBottom: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
  },
  lastSection: {
    marginBottom: theme.spacing.xl,
  },
  sectionTitle: {
    fontSize: typography.h3.fontSize,
    fontWeight: '700' as const,
    color: colors.gray[800],
    marginBottom: theme.spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  adminBadge: {
    backgroundColor: colors.error[500],
    paddingHorizontal: spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: borderRadius.sm,
    ...shadows.sm,
  },
  adminBadgeText: {
    color: theme.colors.white,
    fontSize: typography.caption.fontSize,
    fontWeight: '700' as const,
  },
  actionGrid: {
    gap: theme.spacing.md,
  },
  loadingSection: {
    alignItems: 'center',
    paddingVertical: theme.spacing.lg,
  },
  loadingText: {
    marginTop: spacing.sm,
    fontSize: typography.body.fontSize,
    color: colors.gray[500],
  },
  footer: {
    alignItems: 'center',
    paddingTop: theme.spacing.xl,
    paddingHorizontal: theme.spacing.lg,
  },
  footerText: {
    fontSize: typography.caption.fontSize,
    color: colors.gray[500],
    fontWeight: '600' as const,
  },
  footerSubtext: {
    fontSize: typography.captionSmall.fontSize,
    color: colors.gray[400],
    marginTop: theme.spacing.xs,
  },
};
