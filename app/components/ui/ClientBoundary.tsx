"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type ClientBoundaryProps = {
  children: ReactNode;
  fallback?: ReactNode;
  label?: string;
};

type ClientBoundaryState = {
  hasError: boolean;
};

export class ClientBoundary extends Component<ClientBoundaryProps, ClientBoundaryState> {
  state: ClientBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`${this.props.label ?? "ClientBoundary"} crashed`, error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null;
    }

    return this.props.children;
  }
}
