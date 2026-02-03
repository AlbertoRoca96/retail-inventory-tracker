import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, theme, typography } from '../theme';

type Props = {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;

  canSend: boolean;
  sending?: boolean;
  onSend: () => void;

  disabled?: boolean;

  // Attachment actions
  onPickPhoto: () => void;
  onPickFile: () => void;

  // Visuals
  fontScale?: number;
};

export default function ChatComposer({
  value,
  onChangeText,
  placeholder = 'Message',
  canSend,
  sending,
  onSend,
  disabled,
  onPickPhoto,
  onPickFile,
  fontScale = 1,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  const sendDisabled = disabled || !canSend || !!sending;

  const menuItems = useMemo(
    () => [
      {
        key: 'photo',
        label: 'Photo',
        icon: 'image-outline' as const,
        onPress: () => {
          setMenuOpen(false);
          onPickPhoto();
        },
      },
      {
        key: 'file',
        label: 'File',
        icon: 'attach-outline' as const,
        onPress: () => {
          setMenuOpen(false);
          onPickFile();
        },
      },
    ],
    [onPickPhoto, onPickFile]
  );

  return (
    <View style={styles.wrap}>
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)}>
          <View style={styles.menu}>
            {menuItems.map((it, idx) => (
              <Pressable
                key={it.key}
                onPress={it.onPress}
                style={[styles.menuItem, idx === 0 ? styles.menuItemTop : null]}
              >
                <Ionicons name={it.icon} size={18} color={colors.text} />
                <Text style={[styles.menuText, { fontSize: Math.round(14 * fontScale) }]}> {it.label} </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <View style={styles.row}>
        <Pressable
          style={({ pressed }) => [
            styles.plusBtn,
            pressed && { opacity: 0.7 },
            disabled && { opacity: 0.5 },
          ]}
          onPress={() => setMenuOpen(true)}
          disabled={disabled}
          accessibilityLabel="Add attachment"
        >
          <Ionicons name="add" size={22} color={theme.colors.blue} />
        </Pressable>

        <View style={styles.inputPill}>
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={colors.textMuted}
            multiline
            editable={!disabled}
            style={[styles.input, { fontSize: Math.round(15 * fontScale) }]}
            textAlignVertical="top"
          />
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.sendBtn,
            sendDisabled && { opacity: 0.5 },
            pressed && !sendDisabled && { opacity: 0.8 },
          ]}
          onPress={onSend}
          disabled={sendDisabled}
          accessibilityLabel="Send"
        >
          <Ionicons name="send" size={18} color={colors.white} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingHorizontal: theme.spacing(2),
    paddingTop: theme.spacing(2),
    paddingBottom: theme.spacing(1),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.spacing(1.5),
  },
  plusBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputPill: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 999,
    backgroundColor: '#f8fafc',
    paddingHorizontal: theme.spacing(2),
    paddingVertical: theme.spacing(1),
    minHeight: 42,
    maxHeight: 130,
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    padding: 0,
    margin: 0,
    color: colors.text,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },

  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: theme.spacing(2),
    backgroundColor: 'rgba(15, 23, 42, 0.25)',
  },
  menu: {
    backgroundColor: colors.white,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
    paddingVertical: theme.spacing(1),
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing(3),
    paddingVertical: theme.spacing(2),
  },
  menuItemTop: {
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  menuText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
  },
});
