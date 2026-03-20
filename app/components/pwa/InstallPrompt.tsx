"use client";

import { useEffect, useState } from "react";
import { readLocalStorage, writeLocalStorage } from "@/lib/browser-storage";

type InstallChoice = {
  outcome: "accepted" | "dismissed";
  platform: string;
};

type BeforeInstallPromptEvent = Event & {
  platforms: string[];
  userChoice: Promise<InstallChoice>;
  prompt: () => Promise<void>;
};

const DISMISS_STORAGE_KEY = "grain-install-dismissed-v1";

function isStandaloneMode() {
  if (typeof window === "undefined") return false;

  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean })
    .standalone;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    iosStandalone === true
  );
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(() => isStandaloneMode());
  const [isDismissed, setIsDismissed] = useState(
    () => readLocalStorage(DISMISS_STORAGE_KEY) === "1",
  );

  useEffect(() => {
    if (isInstalled || isDismissed) {
      return;
    }

    const onBeforeInstallPrompt = (event: Event) => {
      const installEvent = event as BeforeInstallPromptEvent;
      installEvent.preventDefault();
      setDeferredPrompt(installEvent);
    };

    const onAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, [isDismissed, isInstalled]);

  if (isInstalled || isDismissed) {
    return null;
  }

  const onInstallClick = async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome === "accepted") {
      setIsInstalled(true);
    }

    setDeferredPrompt(null);
  };

  const onDismissClick = () => {
    setIsDismissed(true);
    setDeferredPrompt(null);
    writeLocalStorage(DISMISS_STORAGE_KEY, "1");
  };

  if (!deferredPrompt) {
    return null;
  }

  return (
    <aside className="install-banner mono-card" aria-live="polite">
      <div className="install-banner-head">
        <p className="install-title matrix-label">Install Grain</p>
        <button
          type="button"
          className="install-close"
          onClick={onDismissClick}
          aria-label="Dismiss install prompt"
        >
          <span aria-hidden="true">x</span>
        </button>
      </div>
      <p className="install-copy muted">
        Add Grain to your home screen for faster launch and app-like use.
      </p>
      <div className="install-actions">
        <button
          type="button"
          className="install-button install-button-primary"
          onClick={onInstallClick}
        >
          Add To Home Screen
        </button>
      </div>
    </aside>
  );
}
