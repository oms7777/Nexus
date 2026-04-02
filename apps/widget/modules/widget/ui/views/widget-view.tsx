// apps/widget/modules/widget/ui/views/widget-view.tsx
"use client";

import React, { type PropsWithChildren } from "react";
import { useAtomValue } from "jotai";

import { screenAtom } from "../../atoms/widget-atoms";
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

function Boundary({ children }: PropsWithChildren) {
  return <ErrorBoundary fallback={null}>{children}</ErrorBoundary>;
}

const RefreshFallback = () => (
  <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-4 text-center text-sm text-muted-foreground">
    <p>Something went wrong.</p>
    <p>
      <a href={typeof window !== "undefined" ? window.location.href : "#"} className="underline">
        Refresh the page
      </a>
    </p>
  </div>
);

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
        {/* ✅ Injecte les couleurs dès que widgetSettings est chargé */}
        <WidgetThemeVars />

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
