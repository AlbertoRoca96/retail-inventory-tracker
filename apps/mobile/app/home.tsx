import { View, Text, Pressable, Platform } from 'react-native';
import { router } from 'expo-router';
import { webBasePath } from '../src/lib/webBasePath';

export default function Home() {
  const goRoot = () => {
    const base = Platform.OS === 'web' ? webBasePath() : '';
    router.replace(`${base}/`);
  };

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: '700' }}>You’re in ✅</Text>
      <Text style={{ color: '#6b7280', marginBottom: 8 }}>
        Placeholder “home” screen. We’ll wire your real app next.
      </Text>

      <Pressable
        onPress={goRoot}
        style={{
          backgroundColor: '#e5e7eb',
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderRadius: 10,
        }}
      >
        <Text>Sign out (dev)</Text>
      </Pressable>
    </View>
  );
}
