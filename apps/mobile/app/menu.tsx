import React, { useMemo } from 'react';
import { View, Text, SafeAreaView, StyleSheet, Pressable, useWindowDimensions, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Head from 'expo-router/head';
import { supabase } from '../src/lib/supabase';
import { colors } from '../src/theme';
import { useUISettings } from '../src/lib/uiSettings';
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
  const { height } = useWindowDimensions();
  const { fontScale } = useUISettings();
  const insets = useSafeAreaInsets();

  const tileHeight = useMemo(() => {
    const headerAllowance = 160; // header + logo space
    const paddingAllowance = 32; // page padding
    const usable = height - insets.top - insets.bottom - headerAllowance - paddingAllowance;
    const rowGap = 16;
    return Math.max(160, usable / 2 - rowGap);
  }, [height, insets.top, insets.bottom]);

  const renderTile = ({ item }: { item: typeof TILE_DATA[number] }) => (
    <Pressable
      key={item.key}
      onPress={item.onPress}
      style={[styles.tile, { backgroundColor: item.color, minHeight: tileHeight }]}
    >
      <View style={styles.iconCircle}>
        <Ionicons name={item.icon} size={32} color={colors.white} />
      </View>
      <Text style={[styles.tileTitle, { fontSize: Math.round(20 * fontScale) }]}>{item.title}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <Head>
        <title>Menu - Retail Inventory Tracker</title>
      </Head>
      <LogoHeader showBack={false} showSettings settingsColor={colors.text} />
      <View style={styles.content}>
        <FlatList
          data={TILE_DATA}
          numColumns={2}
          columnWrapperStyle={styles.row}
          keyExtractor={(item) => item.key}
          renderItem={renderTile}
          contentContainerStyle={styles.grid}
          showsVerticalScrollIndicator={false}
        />
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
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  grid: {
    flexGrow: 1,
    paddingBottom: 12,
    gap: 16,
  },
  row: {
    flex: 1,
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  tile: {
    flex: 1,
    marginHorizontal: 4,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 28,
    gap: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
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
