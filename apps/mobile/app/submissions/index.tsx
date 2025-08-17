import { useEffect, useState } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { supabase } from '../../src/lib/supabase';
import { router } from 'expo-router';
import { colors } from '../../src/theme';

type Row = {
  id: string; created_at: string; store_location: string | null; price_per_unit: number | null; status: string;
};

export default function Submissions() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user.id ?? 'dev-user';
      const { data, error } = await supabase
        .from('submissions')
        .select('id,created_at,store_location,price_per_unit,status')
        .or(`user_id.eq.${uid},group_id.not.is.null`)   // personal + any group matches (RLS enforces access)
        .order('created_at', { ascending: false });
      if (!error && data) setRows(data as Row[]);
      setLoading(false);
    })();
  }, []);

  if (loading) return <View style={{ flex:1,justifyContent:'center',alignItems:'center' }}><ActivityIndicator /></View>;

  return (
    <View style={{ flex:1, padding:16 }}>
      <Text style={{ fontSize:20, fontWeight:'700', marginBottom:10 }}>Submissions</Text>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        ItemSeparatorComponent={() => <View style={{ height:8 }} />}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/submissions/${item.id}`)}
            style={{ backgroundColor:'white', borderWidth:1, borderColor: colors.black, borderRadius:10, padding:12 }}>
            <Text style={{ fontWeight:'700' }}>{item.store_location ?? '(no store)'}</Text>
            <Text>{new Date(item.created_at).toLocaleString()}</Text>
            <Text>Status: {item.status}  •  ${item.price_per_unit ?? '-'}</Text>
          </Pressable>
        )}
      />
      <Pressable onPress={() => router.back()} style={{ alignSelf:'flex-end', marginTop:10 }}>
        <Text>Exit</Text>
      </Pressable>
    </View>
  );
}
