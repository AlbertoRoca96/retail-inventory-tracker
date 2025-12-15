import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

if (isNative) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

let lastPermissionState: boolean | null = null;

export async function ensureNotificationPermissions() {
  if (!isNative) return false;
  if (lastPermissionState) return lastPermissionState;

  const existing = await Notifications.getPermissionsAsync();
  const granted = existing.granted || existing.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  if (granted) {
    lastPermissionState = true;
    return true;
  }

  const request = await Notifications.requestPermissionsAsync();
  const allowed = request.granted || request.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  lastPermissionState = allowed;
  return allowed;
}

type PriorityPayload = {
  id?: string;
  store?: string;
  teamId?: string;
  createdBy?: string;
  priority?: number | null;
};

export async function notifyPrioritySubmission(payload: PriorityPayload) {
  if (!isNative) return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Priority submission',
      body: payload.store ? `${payload.store} needs attention` : 'Urgent submission created',
      data: payload,
      sound: 'default',
    },
    trigger: null,
  });
}
