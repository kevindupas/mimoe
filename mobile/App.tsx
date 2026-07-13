import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { useColorScheme, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Home from "./src/screens/Home";
import Onboarding from "./src/screens/Onboarding";
import Settings from "./src/screens/Settings";
import { clearConfig, loadConfig, type Config } from "./src/store";
import { colors } from "./src/theme";

type Screen = "loading" | "onboarding" | "home" | "settings";

export default function App() {
  const scheme = useColorScheme();
  const p = scheme === "dark" ? colors.dark : colors.light;
  const [screen, setScreen] = useState<Screen>("loading");
  const [cfg, setCfg] = useState<Config | null>(null);

  async function refresh() {
    const c = await loadConfig();
    setCfg(c);
    setScreen(c ? "home" : "onboarding");
  }

  useEffect(() => { refresh(); }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <View style={{ flex: 1, backgroundColor: p.bg }}>
        {screen === "onboarding" && <Onboarding p={p} onDone={refresh} />}
        {screen === "home" && cfg && <Home p={p} cfg={cfg} onSettings={() => setScreen("settings")} />}
        {screen === "settings" && cfg && (
          <Settings p={p} cfg={cfg} onBack={() => setScreen("home")}
            onUnpair={async () => { await clearConfig(); setCfg(null); setScreen("onboarding"); }} />
        )}
      </View>
    </SafeAreaProvider>
  );
}
