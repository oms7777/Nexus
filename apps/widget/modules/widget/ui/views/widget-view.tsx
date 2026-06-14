// apps/widget/modules/widget/ui/views/widget-view.tsx
"use client";

import React, { type PropsWithChildren, useEffect, useMemo } from "react";
import { useAtomValue } from "jotai";
import { LoaderIcon } from "lucide-react";

import {
  getWidgetUiLanguage,
  widgetCopyFor,
} from "../../../../lib/widget-chat-i18n";
import { screenAtom, widgetSettingsAtom } from "../../atoms/widget-atoms";
import { usePresence } from "../../hooks/use-presence";

import { WidgetAuthScreen } from "../screens/widget-auth-screen";
import { WidgetErrorScreen } from "../screens/widget-error-screen";
import { WidgetLoadingScreen } from "../screens/widget-loading-screen";

import { WidgetChatScreen } from "../screens/widget-chat-screen";
import { WidgetVoiceScreen } from "../screens/widget-voice-screen";


import QualifyModal from "../components/QualifyModal";
import InlineBooker from "../components/InlineBooker";
import SmartPromo from "../components/SmartPromo";
import { WidgetThemeVars } from "../components/WidgetThemeVars";
import { WidgetSettingsSubscription } from "../components/WidgetSettingsSubscription";
import { WidgetSnapshotTracker } from "../components/WidgetSnapshotTracker";

function Boundary({ children }: PropsWithChildren) {
  return <ErrorBoundary fallback={null}>{children}</ErrorBoundary>;
}

/** Prefer reloading the host page when the widget is same-origin; otherwise reload the iframe only. */
function reloadHostedWidget(): void {
  if (typeof window === "undefined") return;
  try {
    const topWin = window.top;
    if (topWin && topWin !== window) {
      topWin.location.reload();
      return;
    }
  } catch {
    /* cross-origin parent: cannot drive top navigation */
  }
  window.location.reload();
}

function RefreshFallback() {
  const widgetSettings = useAtomValue(widgetSettingsAtom);
  const lang = getWidgetUiLanguage(widgetSettings ?? undefined);
  const copy = widgetCopyFor(lang);

  const canAutoReload = useMemo(() => {
    if (typeof window === "undefined") return false;
    try {
      const k = "nx_widget_last_autoreload_at";
      const last = Number(window.sessionStorage.getItem(k) ?? "0");
      const now = Date.now();
      // Avoid infinite reload loops if a persistent bug keeps crashing the widget.
      // If we already auto-reloaded very recently, stop and show the manual button.
      if (now - last < 10_000) return false;
      window.sessionStorage.setItem(k, String(now));
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (!canAutoReload) return;
    const id = window.setTimeout(() => {
      reloadHostedWidget();
    }, 600);
    return () => window.clearTimeout(id);
  }, [canAutoReload]);

  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center p-6 text-center"
      role="alert"
      aria-live="polite"
    >
      {canAutoReload ? (
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <LoaderIcon className="h-4 w-4 animate-spin" aria-hidden />
          <div className="text-xs">Reconnecting…</div>
        </div>
      ) : (
        <button
          type="button"
          className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
          aria-label={copy.errorBoundaryRefresh}
          onClick={() => reloadHostedWidget()}
        >
          {copy.errorBoundaryRefresh}
        </button>
      )}
    </div>
  );
}

class ErrorBoundary extends React.Component<
  PropsWithChildren<{ fallback?: React.ReactNode }>,
  { hasError: boolean }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: unknown) {
    console.error("Widget error:", err);
  }
  render() {
    return this.state.hasError ? (this.props.fallback ?? null) : this.props.children;
  }
}

interface Props {
  organizationId: string | null;
}

export const WidgetView = ({ organizationId }: Props) => {
  const screen = useAtomValue(screenAtom);
  usePresence();

  const screens = {
    loading: <WidgetLoadingScreen organizationId={organizationId} />,
    error: <WidgetErrorScreen />,
    auth: <WidgetAuthScreen />,
    voice: <WidgetVoiceScreen />,
    chat: <WidgetChatScreen />,
    booking: <WidgetChatScreen />,
  } as const;

  const showPromo = true;

  return (
    <ErrorBoundary fallback={<RefreshFallback />}>
      <main className="flex h-full w-full flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-background shadow-[0_2px_8px_rgba(15,23,42,0.06),0_16px_40px_-12px_rgba(15,23,42,0.12)] ring-1 ring-slate-900/[0.04]">
        <WidgetSettingsSubscription organizationId={organizationId} />
        {/* ✅ Injecte les couleurs dès que widgetSettings est chargé */}
        <WidgetThemeVars />
        <WidgetSnapshotTracker />

        {screens[screen]}

        {showPromo && (
          <Boundary>
            <SmartPromo />
          </Boundary>
        )}

        <QualifyModal />
        <InlineBooker />
      </main>
    </ErrorBoundary>
  );
};
