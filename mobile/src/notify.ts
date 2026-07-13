import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

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

export async function notifyClip(kind: "text" | "image", preview: string) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Nouveau clip",
      body: kind === "image" ? "🖼 Image reçue" : preview.slice(0, 100),
    },
    trigger: null,
  });
}
