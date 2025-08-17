import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { colors } from '../src/theme';
import { supabase } from '../src/lib/supabase';

export default function Menu() {
  return (
    <View style={{ flex:1, justifyContent:'center', alignItems:'center', padding:16, gap:12 }}>
      <Text style={{ fontSize:24, fontWeight:'700', marginBottom:8 }}>Menu</Text>

      <Pressable onPress={() => router.push('/form/new')}
        style={{ width:260, backgroundColor: colors.blue, padding:14, borderRadius:12, alignItems:'center' }}>
        <Text style={{ color: 'white', fontWeight: '700' }}>Create New Form</Text>
      </Pressable>

      <Pressable onPress={() => router.push('/submissions')}
        style={{ width:260, backgroundColor: colors.blue, padding:14, borderRadius:12, alignItems:'center' }}>
        <Text style={{ color: 'white', fontWeight: '700' }}>View Submissions</Text>
      </Pressable>

      <Pressable onPress={async () => { await supabase.auth.signOut().catch(()=>{}); router.replace('/'); }}
        style={{ width:260, backgroundColor: colors.gray, padding:14, borderRadius:12, alignItems:'center', marginTop:8 }}>
        <Text style={{ color: colors.black, fontWeight: '600' }}>Log Out</Text>
      </Pressable>

      <Pressable onPress={() => router.push('/admin')}
        style={{ marginTop:18, opacity:.7 }}>
        <Text>Admin</Text>
      </Pressable>
    </View>
  );
}
