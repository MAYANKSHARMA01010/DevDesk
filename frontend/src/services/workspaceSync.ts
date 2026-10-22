"use client";

import { useEffect, useCallback, useRef } from "react";
import { fetchWorkspaces } from "@/services/projects";
import { WorkspaceWithProjects } from "@/types/project";

export const WORKSPACES_CHANGED_EVENT = "devdesk:workspaces-changed";

/**
 * Broadcasts to all active views that workspaces have been added, rescanned, or modified.
 * Passing the updated workspaces list updates subscribers in real time without waiting for a re-fetch.
 */
export function broadcastWorkspacesChanged(workspaces?: WorkspaceWithProjects[]): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(WORKSPACES_CHANGED_EVENT, {
        detail: { workspaces },
      })
    );
  }
}

/**
 * Custom hook for views to subscribe to workspace updates and automatically sync:
 * 1. Instantly when another view or service broadcasts a workspace change
 * 2. When the view's tab becomes active (isActive transitions to true)
 * 3. When the browser or desktop window gains focus
 */
export function useWorkspaceSubscription(
  setWorkspaces: React.Dispatch<React.SetStateAction<WorkspaceWithProjects[]>>,
  isActive?: boolean,
  onWorkspacesLoaded?: (workspaces: WorkspaceWithProjects[]) => void
) {
  const onLoadedRef = useRef(onWorkspacesLoaded);
  useEffect(() => {
    onLoadedRef.current = onWorkspacesLoaded;
  });

  const syncLatestWorkspaces = useCallback(async () => {
    try {
      const fresh = await fetchWorkspaces();
      setWorkspaces(fresh);
      onLoadedRef.current?.(fresh);
    } catch {
      // Non-critical background sync error
    }
  }, [setWorkspaces]);

  // 1. Listen for global workspace mutation broadcasts
  useEffect(() => {
    function handleChanged(e: Event) {
      const customEvent = e as CustomEvent<{ workspaces?: WorkspaceWithProjects[] }>;
      if (customEvent.detail?.workspaces) {
        setWorkspaces(customEvent.detail.workspaces);
        onLoadedRef.current?.(customEvent.detail.workspaces);
      } else {
        syncLatestWorkspaces();
      }
    }

    window.addEventListener(WORKSPACES_CHANGED_EVENT, handleChanged);
    return () => {
      window.removeEventListener(WORKSPACES_CHANGED_EVENT, handleChanged);
    };
  }, [setWorkspaces, syncLatestWorkspaces]);

  // 2. Automatically sync when the view becomes active (tab switched)
  useEffect(() => {
    if (isActive) {
      syncLatestWorkspaces();
    }
  }, [isActive, syncLatestWorkspaces]);

  // 3. Sync when user focuses the window (e.g. returning to app)
  useEffect(() => {
    function handleFocus() {
      if (isActive !== false) {
        syncLatestWorkspaces();
      }
    }

    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [isActive, syncLatestWorkspaces]);
}
