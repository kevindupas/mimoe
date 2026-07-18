import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { translate } from "./i18n";
import { Platform } from "react-native";

// Notifications preference (enabled by default), persisted + cached in memory.
let enabled = true;
export async function loadNotifPref(): Promise<boolean> {
  const v = await SecureStore.getItemAsync("notif_enabled");
  enabled = v !== "0";
  return enabled;
}
export function setNotifEnabled(v: boolean) {
  enabled = v;
  SecureStore.setItemAsync("notif_enabled", v ? "1" : "0");
}
export function isNotifEnabled() { return enabled; }

// Shows the notification even when the app is in the foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function setupNotifications() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("clips", {
      name: "Nouveaux clips",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") await Notifications.requestPermissionsAsync();
}

/**
 * NATIVE push token (FCM on Android). Lets the server wake the device
 * EVEN when the app is killed. Returns null if permission is denied or FCM is not
 * configured (Expo Go, no google-services.json) -> push is simply disabled, nothing breaks.
 */
export async function getFcmToken(): Promise<string | null> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") {
      const req = await Notifications.requestPermissionsAsync();
      if (req.status !== "granted") return null;
    }
    const token = await Notifications.getDevicePushTokenAsync(); // { type, data }
    return typeof token.data === "string" ? token.data : null;
  } catch {
    return null;
  }
}

export async function notifyClip(kind: "text" | "image" | "file", preview: string) {
  if (!enabled) return;
  const body =
    kind === "image" ? translate("notifImage") : kind === "file" ? `📄 ${preview.slice(0, 80)}` : preview.slice(0, 100);
  await Notifications.scheduleNotificationAsync({
    content: { title: translate("notifTitle"), body },
    trigger: null,
  });
}
