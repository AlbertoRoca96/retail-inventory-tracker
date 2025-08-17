import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, Alert } from 'react-native';
import { supabase } from '../src/lib/supabase';
import { colors } from '../src/theme';

export default function Admin() {
  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState<string|undefined>();
  const [member, setMember] = useState('');

  // Create a group (owned by current user)
  const createGroup = async () => {
    const { data: s } = await supabase.auth.getSession();
    const uid = s.session?.user.id ?? 'dev-user';
    const { data, error } = await supabase.from('groups').insert([{ name, created_by: uid }]).select().single();
    if (error) return Alert.alert('Error', error.message);
    setGroupId(data.id); setName('');
  };

  // Add a member by user id (for demo — in real life you might look up by email)
  const addMember = async () => {
    if (!groupId) return;
    const { error } = await supabase.from('group_members').insert([{ group_id: groupId, user_id: member }]);
    if (error) return Alert.alert('Error', error.message);
    setMember('');
    Alert.alert('Success', 'Member added');
  };

  return (
    <View style={{ flex:1, padding:16, gap:12 }}>
      <Text style={{ fontSize:20, fontWeight:'700' }}>Admin</Text>

      <Text style={{ fontWeight:'700' }}>Create Group</Text>
      <View style={{ flexDirection:'row', gap:8 }}>
        <TextInput placeholder="Group name" value={name} onChangeText={setName}
          style={{ flex:1, backgroundColor:'white', borderColor:'#111827', borderWidth:1, borderRadius:8, padding:10 }} />
        <Pressable onPress={createGroup}
          style={{ backgroundColor: colors.blue, paddingHorizontal:16, justifyContent:'center', borderRadius:10 }}>
          <Text style={{ color:'white', fontWeight:'700' }}>Create</Text>
        </Pressable>
      </View>

      <Text style={{ fontWeight:'700', marginTop:12 }}>Add Member (user id)</Text>
      <View style={{ flexDirection:'row', gap:8 }}>
        <TextInput placeholder="00000000-..." value={member} onChangeText={setMember}
          style={{ flex:1, backgroundColor:'white', borderColor:'#111827', borderWidth:1, borderRadius:8, padding:10 }} />
        <Pressable onPress={addMember} disabled={!groupId}
          style={{ backgroundColor: groupId ? colors.blue : colors.gray, paddingHorizontal:16, justifyContent:'center', borderRadius:10 }}>
          <Text style={{ color: groupId ? 'white' : '#6b7280', fontWeight:'700' }}>Add</Text>
        </Pressable>
      </View>

      {groupId ? <Text>Current group: {groupId}</Text> : null}
    </View>
  );
}
