import { useApp } from "./context/AppContext";
import { ClipsProvider } from "./context/ClipsContext";
import { HistoryView } from "./components/history/HistoryView";
import { SettingsView } from "./components/settings/SettingsView";
import { OnboardingView } from "./components/onboarding/OnboardingView";
import { useUpdater } from "./hooks/useUpdater";

export function App() {
  const { ready, view, config } = useApp();
  useUpdater();

  if (!ready) return null;

  if (view === "onboarding" || !config) {
    return <OnboardingView />;
  }

  return (
    <ClipsProvider config={config}>
      {view === "settings" ? <SettingsView config={config} /> : <HistoryView />}
    </ClipsProvider>
  );
}
