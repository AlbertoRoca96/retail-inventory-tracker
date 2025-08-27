import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, Image, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../src/hooks/useAuth';
import { supabase } from '../../src/lib/supabase';
import { uploadAvatarAndGetPublicUrl } from '../../src/lib/supabaseHelpers';
import { router } from 'expo-router';

const isWeb = Platform.OS === 'web';

export default function AccountSettings() {
  const { session } = useAuth();
  const user = session?.user || null;

  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const md = (user?.user_metadata || {}) as any;
    setDisplayName(md.display_name || user?.email?.split('@')[0] || '');
    setAvatarUrl(md.avatar_url || null);
  }, [user?.id]);

  const pickAvatar = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    const url = await uploadAvatarAndGetPublicUrl(user!.id, {
      uri: a.uri,
      fileName: a.fileName || 'avatar.jpg',
      mimeType: a.mimeType || 'image/jpeg',
    }, 'avatars');
    if (url) setAvatarUrl(url);
  };

  const save = async () => {
    if (!user) return;
    setBusy(true); setMsg(null);
    const { error } = await supabase.auth.updateUser({
      data: { display_name: displayName, avatar_url: avatarUrl || null },
    });
    setBusy(false);
    setMsg(error ? error.message : 'Saved');
  };

  return (
    <View style={{ flex:1, padding:16, gap:12 }}>
      <Text style={{ fontSize:20, fontWeight:'800', textAlign:'center', marginBottom:8 }}>Account Settings</Text>

      <View style={{ alignItems:'center', gap:8 }}>
        <Image
          source={{ uri: avatarUrl || 'https://i.pravatar.cc/150?u=placeholder' }}
          style={{ width:120, height:120, borderRadius:60, borderWidth:1, borderColor:'#111' }}
        />
        <Pressable onPress={pickAvatar}
          style={{ backgroundColor:'#2563eb', paddingVertical:10, paddingHorizontal:14, borderRadius:10 }}>
          <Text style={{ color:'#fff', fontWeight:'700' }}>Change Photo</Text>
        </Pressable>
      </View>

      <View>
        <Text style={{ fontWeight:'700', marginBottom:6 }}>DISPLAY NAME</Text>
        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Your name"
          autoCorrect={false}
          autoCapitalize="words"
          style={{
            backgroundColor: 'white',
            borderWidth: 1,
            borderColor: '#111',
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 8,
            height: 40,
          }}
        />
      </View>

      <Pressable onPress={save} disabled={busy}
        style={{ backgroundColor: busy ? '#94a3b8' : '#2563eb', padding:12, borderRadius:10, alignItems:'center' }}>
        <Text style={{ color:'#fff', fontWeight:'700' }}>{busy ? 'Saving…' : 'Save'}</Text>
      </Pressable>

      <Pressable onPress={() => router.back()} style={{ alignSelf:'center', marginTop:8 }}>
        <Text>Exit</Text>
      </Pressable>

      {msg ? (
        <View style={{ alignItems:'center', marginTop:8 }}>
          <Text style={{ color: msg === 'Saved' ? '#16a34a' : '#ef4444' }}>{msg}</Text>
        </View>
      ) : null}
    </View>
  );
}
