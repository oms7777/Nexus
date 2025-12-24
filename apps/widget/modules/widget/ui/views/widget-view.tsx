// apps/widget/modules/widget/ui/views/widget-view.tsx
"use client";

import React from "react";
import { useAtomValue } from "jotai";

import { screenAtom } from "../../atoms/widget-atoms";
import { usePresence } from "../../hooks/use-presence";

import { WidgetAuthScreen } from "../screens/widget-auth-screen";
import { WidgetErrorScreen } from "../screens/widget-error-screen";
import { WidgetLoadingScreen } from "../screens/widget-loading-screen";
import { WidgetChatScreen } from "../screens/widget-chat-screen";
import { WidgetVoiceScreen } from "../screens/widget-voice-screen";
import { WidgetContactScreen } from "../screens/widget-contact-screen";

import QualifyModal from "../components/QualifyModal";
import InlineBooker from "../components/InlineBooker";
import { WidgetThemeVars } from "../components/WidgetThemeVars";

interface Props {
  organizationId: string | null;
}

export const WidgetView = ({ organizationId }: Props) => {
  const screen = useAtomValue(screenAtom);
  usePresence();

  // ✅ ON SUPPRIME: selection + inbox
  // ✅ ON GARDE: un seul point d’entrée => chat
  const screens = {
    loading: <WidgetLoadingScreen organizationId={organizationId} />,
    error: <WidgetErrorScreen />,
    auth: <WidgetAuthScreen />,

    chat: <WidgetChatScreen />,
    voice: <WidgetVoiceScreen />,
    contact: <WidgetContactScreen />,

    // compat si jamais quelque part tu fais setScreen("booking")
    booking: <WidgetChatScreen />,
  } as const;

  // ✅ fallback sécurité: si un vieux screen survit (selection/inbox), on force chat
  const node =
    (screens as any)[screen] ?? <WidgetChatScreen />;

  return (
    <main className="flex h-full w-full flex-col overflow-hidden rounded-xl border bg-muted">
      {/* ✅ Injecte les couleurs dès que widgetSettings est chargé */}
      <WidgetThemeVars />

      {node}

      {/* ✅ Overlays uniquement sur le chat */}
      {screen === "chat" && (
        <>
          <QualifyModal />
          <InlineBooker />
        </>
      )}
    </main>
  );
};
