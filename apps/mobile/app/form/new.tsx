// apps/mobile/app/form/new.tsx
import { useState } from 'react';
import { View, Text, TextInput, Pressable, Image, ScrollView, Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useForm } from 'react-hook-form';
import { router } from 'expo-router';
import { downloadSubmissionExcel } from '../../src/lib/exportExcel';
import { insertSubmission, uploadPhotosToBucket, FormValues } from '../../src/lib/supabaseHelpers';

type Photo = { uri: string; name?: string; type?: string };

export default function NewForm() {
  const { register, setValue, getValues, handleSubmit } = useForm<FormValues>({
    defaultValues: {
      date: new Date().toISOString().slice(0, 10),
      store_location: '',
      conditions: '',
      price_per_unit: '',
      shelf_space: '',
      on_shelf: '',
      tags: '',
      notes: ''
    }
  });

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // TextInput wiring for react-hook-form (web + native)
  const bind = (name: keyof FormValues) => ({
    value: getValues(name),
    onChangeText: (t: string) => setValue(name, t)
  });

  async function pickPhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permission required', 'Camera permission is needed to add photos.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      allowsEditing: false
    });
    if (!res.canceled && res.assets?.length) {
      const a = res.assets[0];
      setPhotos((p) => [...p, { uri: a.uri, name: a.fileName, type: a.mimeType }].slice(0, 2));
    }
  }

  async function addFromLibrary() {
    const res = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: false,
      quality: 0.7
    });
    if (!res.canceled && res.assets?.length) {
      const a = res.assets[0];
      setPhotos((p) => [...p, { uri: a.uri, name: a.fileName, type: a.mimeType }].slice(0, 2));
    }
  }

  async function onSave(values: FormValues) {
    await onSubmit(values, 'draft');
  }

  async function onSubmit(values: FormValues, status: 'draft' | 'submitted' = 'submitted') {
    try {
      setSubmitting(true);
      setBanner(null);

      // 1) upload photos (optional)
      const folder = `submissions/${Date.now()}`;
      const photo_urls = await uploadPhotosToBucket(photos, folder);

      // 2) insert main row (+ optional photo rows)
      const id = await insertSubmission(values, photo_urls, status);

      // 3) Excel download
      downloadSubmissionExcel({
        ...values,
        photo_urls
      });

      setBanner({ type: 'success', msg: status === 'submitted' ? 'Submission successful' : 'Saved as draft' });

      // Optional navigate somewhere:
      // router.replace('/view'); or leave users on the form
    } catch (err: any) {
      setBanner({ type: 'error', msg: err?.message || 'Something went wrong' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 20, fontWeight: '700', textAlign: 'center', marginTop: 4 }}>Create New Form</Text>

      {banner ? (
        <View
          style={{
            backgroundColor: banner.type === 'success' ? '#16a34a' : '#dc2626',
            padding: 10,
            borderRadius: 10
          }}
        >
          <Text style={{ color: 'white', textAlign: 'center' }}>{banner.msg}</Text>
        </View>
      ) : null}

      <Label>DATE</Label>
      <TextInput placeholder="YYYY-MM-DD" {...bind('date')} style={inputStyle} />

      <Label>STORE LOCATION</Label>
      <TextInput placeholder="City, ST" {...bind('store_location')} style={inputStyle} />

      <Label>CONDITIONS</Label>
      <TextInput placeholder="Notes on condition" {...bind('conditions')} style={inputStyle} />

      <Label>PRICE PER UNIT</Label>
      <TextInput placeholder="$" {...bind('price_per_unit')} style={inputStyle} />

      <Label>SHELF SPACE</Label>
      <TextInput placeholder="Shared, Endcap, etc." {...bind('shelf_space')} style={inputStyle} />

      <Label>ON SHELF</Label>
      <TextInput placeholder="Flavors / SKUs" {...bind('on_shelf')} style={inputStyle} />

      <Label>TAGS</Label>
      <TextInput placeholder="comma, separated, tags" {...bind('tags')} style={inputStyle} />

      <Label>NOTES</Label>
      <TextInput placeholder="Notes" {...bind('notes')} style={[inputStyle, { height: 80 }]} multiline />

      <Label>PHOTOS</Label>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {photos.map((p, i) => (
          <Image
            key={i}
            source={{ uri: p.uri }}
            style={{ width: 340, height: 180, borderRadius: 10, borderColor: '#ddd', borderWidth: 1 }}
          />
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Button onPress={pickPhoto} text="Take Photo" />
        <Button onPress={addFromLibrary} text="Add from Library" />
      </View>

      <View style={{ height: 12 }} />

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Button
          onPress={handleSubmit(onSave)}
          text="Save"
          variant="secondary"
          disabled={submitting}
        />
        <Button
          onPress={handleSubmit((v) => onSubmit(v, 'submitted'))}
          text={submitting ? 'Submitting…' : 'Submit'}
          disabled={submitting}
        />
        <Pressable
          onPress={() => router.back()}
          style={{
            marginLeft: 'auto',
            backgroundColor: '#f3f4f6',
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 10,
            borderColor: '#e5e7eb',
            borderWidth: 1
          }}
        >
          <Text style={{ color: '#111827' }}>Exit</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <Text style={{ fontSize: 12, fontWeight: '700', color: '#111827', marginTop: 8 }}>{children}</Text>;
}

const inputStyle = {
  backgroundColor: 'white',
  borderColor: '#111827',
  borderWidth: 1,
  borderRadius: 10,
  padding: 10
} as const;

function Button({
  onPress,
  text,
  variant = 'primary',
  disabled
}: {
  onPress: () => void;
  text: string;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}) {
  const bg = variant === 'primary' ? '#2563eb' : '#e5e7eb';
  const fg = variant === 'primary' ? 'white' : '#111827';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        flex: 1,
        backgroundColor: disabled ? '#94a3b8' : bg,
        paddingVertical: 12,
        borderRadius: 10,
        alignItems: 'center'
      }}
    >
      <Text style={{ color: fg, fontWeight: '600' }}>{text}</Text>
    </Pressable>
  );
}
