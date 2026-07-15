import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";
import { AppProvider } from "./context/AppContext";
import { ToastProvider } from "./context/ToastContext";
import { LanguageProvider } from "./context/LanguageContext";

createRoot(document.getElementById("app")!).render(
  <StrictMode>
    <ToastProvider>
      <LanguageProvider>
        <AppProvider>
          <App />
        </AppProvider>
      </LanguageProvider>
    </ToastProvider>
  </StrictMode>,
);
