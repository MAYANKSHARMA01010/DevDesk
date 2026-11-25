"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

// Keep the static export and first hydration render identical before reading native APIs.
export function useClientReady(): boolean {
  return useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
}
