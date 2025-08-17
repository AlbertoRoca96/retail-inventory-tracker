import { useState } from 'react';
import { View, Text, TextInput, Pressable, Image, ScrollView, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../src/lib/supabase';
import Banner from '../../src/components/Banner';
import { colors } from '../../src/theme';
import { router } from 'expo-router';

type Photo = { uri: string, name: string, type: string };

async function uploadToBucket(file: Photo, userId: string) {
  const res = await fetch(file.uri);
  const blob = await res.blob();
  const path = `u_${userId}/${Date.now()}_${file.name}`;
  const { error } = await supabase.storage.from('photos').upload(path, blob, { contentType: file.type, upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('photos').getPublicUrl(path);
  return data.publicUrl;
}

export default function NewForm() {
  const [date, setDate] = useState('');
  const [store, setStore] = useState('');
  const [cond, setCond] = useState('');
  const [price, setPrice] = useState('');
  const [shelf, setShelf] = useState('');
  const [onShelf, setOnShelf] = useState('');
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');
  const [p1, setP1] = useState<Photo|undefined>();
  const [p2, setP2] = useState<Photo|undefined>();
  const [banner, setBanner] = useState<string|undefined>();

  const pick = async (which: 1|2) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Camera permission is needed to add photos.');
      return;
    }
    const r = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (!r.canceled && r.assets?.[0]) {
      const a = r.assets[0];
      const photo = { uri: a.uri!, name: a.fileName ?? 'photo.jpg', type: a.mimeType ?? 'image/jpeg' };
      which === 1 ? setP1(photo) : setP2(photo);
    }
  };

  const saveOrSubmit = async (status: 'draft'|'submitted') => {
    try {
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user.id ?? 'dev-user';

      const photo1 = p1 ? await uploadToBucket(p1, uid) : null;
      const photo2 = p2 ? await uploadToBucket(p2, uid) : null;

      const { error } = await supabase.from('submissions').insert([{
        user_id: uid,
        status,
        date: date || null,
        store_location: store || null,
        conditions: cond || null,
        price_per_unit: price ? Number(price) : null,
        shelf_space: shelf || null,
        on_shelf: onShelf || null,
        tags: tags || null,
        notes: notes || null,
        photo1_url: photo1,
        photo2_url: photo2
      }]);

      if (error) throw error;
      setBanner(status === 'submitted' ? 'Submission Successful' : 'Saved draft');
      setTimeout(() => router.replace('/menu'), 900);
    } catch (e:any) {
      Alert.alert('Error', e.message ?? String(e));
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding:16, gap:10 }}>
      <Text style={{ fontSize:20, fontWeight:'700', textAlign:'center', marginBottom:6 }}>Create New Form</Text>

      <Field label="DATE" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
      <Field label="STORE LOCATION" value={store} onChangeText={setStore} />
      <Field label="CONDITIONS" value={cond} onChangeText={setCond} />
      <Field label="PRICE PER UNIT" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
      <Field label="SHELF SPACE" value={shelf} onChangeText={setShelf} />
      <Field label="ON SHELF" value={onShelf} onChangeText={setOnShelf} />
      <Field label="TAGS" value={tags} onChangeText={setTags} />
      <Field label="NOTES" value={notes} onChangeText={setNotes} multiline />

      <Text style={{ fontWeight:'700', marginTop:8, marginBottom:4 }}>PHOTOS</Text>
      <View style={{ flexDirection:'row', gap:10 }}>
        <PhotoBox photo={p1} onPick={() => pick(1)} />
        <PhotoBox photo={p2} onPick={() => pick(2)} />
      </View>

      <View style={{ flexDirection:'row', gap:10, marginTop:12 }}>
        <Pressable onPress={() => saveOrSubmit('draft')}
          style={{ flex:1, backgroundColor: colors.gray, padding:12, borderRadius:10, alignItems:'center' }}>
          <Text style={{ color: colors.black, fontWeight:'700' }}>Save</Text>
        </Pressable>
        <Pressable onPress={() => saveOrSubmit('submitted')}
          style={{ flex:1, backgroundColor: colors.blue, padding:12, borderRadius:10, alignItems:'center' }}>
          <Text style={{ color:'white', fontWeight:'700' }}>Submit</Text>
        </Pressable>
      </View>

      <Pressable onPress={() => router.back()} style={{ alignSelf:'flex-end', marginTop:8 }}>
        <Text>Exit</Text>
      </Pressable>

      {banner ? <Banner kind="success" message={banner} /> : null}
    </ScrollView>
  );
}

function Field(props: any) {
  const { label, ...rest } = props;
  return (
    <View>
      <Text style={{ fontWeight:'700', marginBottom:4 }}>{label}</Text>
      <TextInput {...rest}
        style={{ backgroundColor:'white', borderColor: colors.black, borderWidth:1, borderRadius:8, padding:10 }} />
    </View>
  );
}

function PhotoBox({ photo, onPick }:{photo?:Photo, onPick:()=>void}) {
  return (
    <Pressable onPress={onPick} style={{ flex:1, height:140, backgroundColor:'#f5f5f5', borderRadius:10, borderWidth:1, borderColor: colors.black, alignItems:'center', justifyContent:'center' }}>
      {photo ? <Image source={{ uri: photo.uri }} style={{ width:'100%', height:'100%', borderRadius:10 }} /> : <Text style={{ color:'#6b7280' }}>Tap to add</Text>}
    </Pressable>
  );
}
