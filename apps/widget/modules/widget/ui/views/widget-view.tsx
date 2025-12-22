// apps/widget/modules/widget/ui/views/widget-view.tsx
"use client";

import { useAtomValue } from "jotai";
import { screenAtom } from "../../atoms/widget-atoms";
import { WidgetAuthScreen } from "../screens/widget-auth-screen";
import { WidgetErrorScreen } from "../screens/widget-error-screen";
import { WidgetLoadingScreen } from "../screens/widget-loading-screen";
import { WidgetSelectionScreen } from "../screens/widget-selection-screen";
import { WidgetChatScreen } from "../screens/widget-chat-screen";
import { WidgetInboxScreen } from "../screens/widget-inbox-screen";
import { WidgetVoiceScreen } from "../screens/widget-voice-screen";
import { WidgetContactScreen } from "../screens/widget-contact-screen";
import { usePresence } from "../../hooks/use-presence";

import QualifyModal from "../components/QualifyModal";
import InlineBooker from "../components/InlineBooker";
import SmartPromo from "../components/SmartPromo";

import React, { type PropsWithChildren } from "react";
import { ApplyWidgetTheme } from "../components/ApplyWidgetTheme";

function Boundary({ children }: PropsWithChildren) {
  return <ErrorBoundary fallback={null}>{children}</ErrorBoundary>;
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
    console.error("SmartPromo crashed:", err);
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

  const screenComponents = {
    loading: <WidgetLoadingScreen organizationId={organizationId} />,
    error: <WidgetErrorScreen />,
    auth: <WidgetAuthScreen />,
    voice: <WidgetVoiceScreen />,
    inbox: <WidgetInboxScreen />,
    selection: <WidgetSelectionScreen />,
    chat: <WidgetChatScreen />,
    contact: <WidgetContactScreen />,
    booking: <WidgetChatScreen />,
  } as const;

  const showPromo = true;

  return (
    <main className="flex h-full w-full flex-col overflow-hidden rounded-xl border bg-muted">
      {/* ✅ Injecte le thème dynamique dès que widgetSettings est chargé */}
      <ApplyWidgetTheme />

      {screenComponents[screen]}

      {showPromo && (
        <Boundary>
          <SmartPromo />
        </Boundary>
      )}

      <QualifyModal />
      <InlineBooker />
    </main>
  );
};
