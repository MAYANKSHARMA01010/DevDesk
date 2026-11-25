"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { SetStateAction } from "react";

const eventName = "devdesk-preference-change";
const memory = new Map<string, string>();

function read(key: string): string | null {
  try { return localStorage.getItem(key) ?? memory.get(key) ?? null; }
  catch { return memory.get(key) ?? null; }
}
function subscribe(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener(eventName, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(eventName, notify);
  };
}
const serverSnapshot = () => null;

export function useStoredPreference<T>(key: string, fallback: T) {
  const getSnapshot = useCallback(() => read(key), [key]);
  const raw = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
  const value = useMemo(() => {
    if (raw === null) return fallback;
    try { return JSON.parse(raw) as T; } catch { return typeof fallback === "string" ? raw as T : fallback; }
  }, [raw, fallback]);
  const setValue = useCallback((next: SetStateAction<T>) => {
    let current = fallback;
    const stored = read(key);
    try { if (stored !== null) current = JSON.parse(stored) as T; } catch {}
    const value = typeof next === "function" ? (next as (previous: T) => T)(current) : next;
    const encoded = JSON.stringify(value);
    memory.set(key, encoded);
    try { localStorage.setItem(key, encoded); } catch {}
    window.dispatchEvent(new Event(eventName));
  }, [key, fallback]);
  return [value, setValue] as const;
}
