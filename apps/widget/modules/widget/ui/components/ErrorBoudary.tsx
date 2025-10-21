// apps/widget/modules/widget/components/ErrorBoundary.tsx
"use client";
import React, { type PropsWithChildren } from "react";

type Props = PropsWithChildren<{ fallback?: React.ReactNode }>;

export class ErrorBoundary extends React.Component<Props, { hasError: boolean }> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: unknown) {
    // optional: report to Sentry, console, etc.
    console.error("Widget boundary caught:", err);
  }
  render() {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}
