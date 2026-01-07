import React from 'react';
import { View, Text, SafeAreaView, StyleSheet, Pressable } from 'react-native';
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
      <View style={styles.content}>
        <View style={styles.grid}>
          {TILE_DATA.map((item) => (
            <Pressable
              key={item.key}
              onPress={item.onPress}
              style={[styles.tile, { backgroundColor: item.color }]}
            >
              <View style={styles.iconCircle}>
                <Ionicons name={item.icon} size={32} color={colors.white} />
              </View>
              <Text style={styles.tileTitle}>{item.title}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 16,
    justifyContent: 'space-evenly',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignContent: 'space-between',
    rowGap: 20,
    flexGrow: 1,
  },
  tile: {
    width: '48%',
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingVertical: 32,
    gap: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 270,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  iconCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  tileTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.white,
    textAlign: 'center',
  },
});
