import React from 'react';
import { View, Text, ScrollView, SafeAreaView, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Head from 'expo-router/head';
import { supabase } from '../src/lib/supabase';
import { colors, typography } from '../src/theme';
import LogoHeader from '../src/components/LogoHeader';

const TILE_DATA = [
  {
    key: 'form',
    title: 'New Form',
    subtitle: 'Capture a visit',
    icon: 'create-outline' as const,
    color: colors.accentBlue,
    onPress: () => router.push('/form/new'),
  },
  {
    key: 'submissions',
    title: 'View Submissions',
    subtitle: 'Review history',
    icon: 'checkmark-done-outline' as const,
    color: colors.accentBlue,
    onPress: () => router.push('/submissions'),
  },
  {
    key: 'chat',
    title: 'Chat',
    subtitle: 'Coordinate with team',
    icon: 'chatbubble-ellipses-outline' as const,
    color: colors.accentGreen,
    onPress: () => router.push('/chat'),
  },
  {
    key: 'logout',
    title: 'Logout',
    subtitle: 'Sign out safely',
    icon: 'log-out-outline' as const,
    color: '#1f2937',
    onPress: async () => {
      await supabase.auth.signOut().catch(() => {});
      router.replace('/login');
    },
  },
];

export default function Menu() {
  return (
    <SafeAreaView style={styles.safe}>
      <Head>
        <title>Menu - Retail Inventory Tracker</title>
      </Head>
      <LogoHeader showBack={false} showSettings settingsColor={colors.text} />
      <ScrollView
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Choose an action</Text>
        <View style={styles.grid}>
          {TILE_DATA.map((item) => (
            <Pressable
              key={item.key}
              onPress={item.onPress}
              style={[styles.tile, { borderColor: item.color }]}
            >
              <View style={[styles.iconCircle, { backgroundColor: item.color }]}>
                <Ionicons name={item.icon} size={28} color={colors.white} />
              </View>
              <Text style={styles.tileTitle}>{item.title}</Text>
              <Text style={styles.tileSubtitle}>{item.subtitle}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 24,
  },
  title: {
    ...typography.title,
    textAlign: 'center',
    color: colors.text,
    marginTop: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 16,
  },
  tile: {
    width: '48%',
    borderWidth: 2,
    borderRadius: 24,
    padding: 20,
    backgroundColor: colors.white,
    gap: 10,
  },
  iconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  tileTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  tileSubtitle: {
    fontSize: 13,
    color: colors.textMuted,
  },
});