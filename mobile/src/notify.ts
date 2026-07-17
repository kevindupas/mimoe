import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { translate } from "./i18n";
import { Platform } from "react-native";

// Préférence notifications (par défaut activée), persistée + cachée en mémoire.
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

// Affiche la notif même app au premier plan.
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
 * Token push NATIF (FCM sur Android). Permet au serveur de reveiller l'appareil
 * MEME app tuee. Renvoie null si permission refusee ou FCM pas configure (Expo Go,
 * pas de google-services.json) -> le push est juste desactive, rien ne casse.
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
