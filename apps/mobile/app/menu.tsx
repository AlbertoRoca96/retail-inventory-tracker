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
    icon: 'create-outline' as const,
    color: '#5ba3f8',
    onPress: () => router.push('/form/new'),
  },
  {
    key: 'submissions',
    title: 'View Submissions',
    icon: 'checkmark-done-outline' as const,
    color: '#5ba3f8',
    onPress: () => router.push('/submissions'),
  },
  {
    key: 'chat',
    title: 'Chat',
    icon: 'chatbubble-ellipses-outline' as const,
    color: '#99e169',
    onPress: () => router.push('/chat'),
  },
  {
    key: 'logout',
    title: 'Log Out',
    icon: 'log-out-outline' as const,
    color: '#da291c',
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
        <View style={styles.grid}>
          {TILE_DATA.map((item) => (
            <Pressable
              key={item.key}
              onPress={item.onPress}
              style={[styles.tile, { backgroundColor: item.color }]}
            >
              <View style={styles.iconCircle}>
                <Ionicons name={item.icon} size={28} color={colors.white} />
              </View>
              <Text style={styles.tileTitle}>{item.title}</Text>
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 16,
  },
  tile: {
    width: '48%',
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 16,
    gap: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  tileTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.white,
    textAlign: 'center',
  },
});
