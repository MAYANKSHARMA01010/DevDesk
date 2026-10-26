"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { fetchWorkspaces } from "@/services/projects";
import {
  fetchProcesses,
  fetchProcessLogs,
  fetchProjectScripts,
  restartProcess,
  startProcess,
  stopProcess,
} from "@/services/processes";
import { WorkspaceWithProjects } from "@/types/project";
import { useWorkspaceSubscription } from "@/services/workspaceSync";
import { ManagedProcess, ProcessLogEntry, ProcessStatus } from "@/types/process";

export interface TerminalTab {
  id: string;
  title: string;
  workspaceId: string;
  projectId: string;
  projectName: string;
  projectDisplayName?: string;
  script: string;
  customCommand: string;
  isCustom: boolean;
  processId: string | null;
  status: ProcessStatus | "idle";
  logs: ProcessLogEntry[];
  latestSeqId: number;
  autoScroll: boolean;
  createdAt: string;
}

interface TerminalViewProps {
  isActive?: boolean;
  initialSelection?: {
    workspaceId?: string;
    projectId?: string;
    script?: string;
  } | null;
}

const LOCAL_STORAGE_TABS_KEY = "devdesk_terminal_tabs_v2";
const LOCAL_STORAGE_ACTIVE_TAB_KEY = "devdesk_active_terminal_tab_v2";
const MAX_SAVED_LOGS_PER_TAB = 500;

function createDefaultTab(index = 1): TerminalTab {
  return {
    id: `tab-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    title: `Terminal ${index}`,
    workspaceId: "",
    projectId: "",
    projectName: "",
    projectDisplayName: "",
    script: "",
    customCommand: "",
    isCustom: false,
    processId: null,
    status: "idle",
    logs: [],
    latestSeqId: 0,
    autoScroll: true,
    createdAt: new Date().toISOString(),
  };
}

export async function openExternalUrl(url: string) {
  if (!url || typeof url !== "string") return;
  const clean = url.trim();

  // 1. Try Desktop Electron IPC if available
  if (typeof window !== "undefined" && window.electron?.openExternal) {
    try {
      const res = await window.electron.openExternal(clean);
      if (res?.success) return;
    } catch {
      // fallback
    }
  }

  // 2. Call DevDesk backend open-url endpoint (launches system browser on macOS, Windows, Linux)
  try {
    const res = await fetch("http://localhost:8300/api/processes/open-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: clean }),
    });
    if (res.ok) return;
  } catch {
    // fallback
  }

  // 3. Fallback to native window.open
  if (typeof window !== "undefined") {
    window.open(clean, "_blank", "noopener,noreferrer");
  }
}

export interface ScriptDetails {
  icon: string;
  category: string;
  summary: string;
  fullCommand: string;
  expectedServices?: string;
}

export function getScriptDescription(
  key: string,
  commandDef?: string,
  pm?: string
): ScriptDetails {
  const normKey = key.toLowerCase();
  const def = (commandDef || "").toLowerCase();
  const packageManager = pm || "npm";
  const fullCommand = `${packageManager} run ${key}`;

  // 1. Development & Hot-Reload
  if (normKey === "dev" || normKey === "start:dev" || normKey === "develop") {
    return {
      icon: "⚡",
      category: "Development",
      summary: "Starts local development services with hot module reloading (HMR) and watcher listeners.",
      fullCommand,
      expectedServices: "Local web server or API (e.g. http://localhost:3000, 5173, 8000)",
    };
  }
  if (normKey === "dev:server" || normKey === "server:dev") {
    return {
      icon: "🖥️",
      category: "Backend Server",
      summary: "Spawns the backend HTTP/WebSocket server in watch mode with live request logging.",
      fullCommand,
      expectedServices: "Backend API service (e.g. http://localhost:8300, 8080, 5000)",
    };
  }
  if (normKey === "dev:client" || normKey === "client:dev") {
    return {
      icon: "🌐",
      category: "Frontend Client",
      summary: "Launches the client interface dev server (Vite / Next.js) with fast refresh.",
      fullCommand,
      expectedServices: "Frontend UI (e.g. http://localhost:3000, 5173, 8200)",
    };
  }

  // 2. Production & Start
  if (normKey === "start" || normKey === "start:prod") {
    return {
      icon: "🚀",
      category: "Production Runtime",
      summary: "Launches the compiled production application server.",
      fullCommand,
      expectedServices: "Production application listening on configured PORT",
    };
  }
  if (normKey === "build" || normKey.startsWith("build:")) {
    return {
      icon: "📦",
      category: "Build & Bundle",
      summary: "Compiles source code, transpiles TypeScript, and optimizes bundle assets.",
      fullCommand,
    };
  }

  // 3. Testing & Coverage
  if (normKey === "test:coverage" || normKey === "coverage") {
    return {
      icon: "📊",
      category: "Test Coverage",
      summary: "Executes complete test suite and generates code coverage metrics & HTML reports.",
      fullCommand,
    };
  }
  if (normKey === "test" || normKey.startsWith("test:")) {
    return {
      icon: "🧪",
      category: "Testing",
      summary: "Runs automated test runners (Vitest, Jest, Playwright, Cypress) for code validation.",
      fullCommand,
    };
  }

  // 4. Database & ORM
  if (normKey === "db:migrate" || normKey === "migrate") {
    return {
      icon: "🗄️",
      category: "Database",
      summary: "Applies pending database migrations to create or alter tables and relationships.",
      fullCommand,
      expectedServices: "Database instance (Postgres, MySQL, SQLite, etc.)",
    };
  }
  if (normKey === "db:generate" || normKey === "generate") {
    return {
      icon: "⚙️",
      category: "Database ORM",
      summary: "Generates type-safe schema definitions and ORM query clients.",
      fullCommand,
    };
  }
  if (normKey === "db:studio" || normKey === "studio") {
    return {
      icon: "🎛️",
      category: "Database GUI",
      summary: "Opens an interactive browser-based database management GUI interface.",
      fullCommand,
      expectedServices: "Studio Web GUI (e.g. http://localhost:5555)",
    };
  }
  if (normKey === "db:seed" || normKey === "seed") {
    return {
      icon: "🌱",
      category: "Database Seed",
      summary: "Populates database with mock seed data, fixtures, and initial admin records.",
      fullCommand,
    };
  }

  // 5. Code Quality & Linting
  if (normKey === "lint" || normKey.startsWith("lint:")) {
    return {
      icon: "🔍",
      category: "Linting",
      summary: "Scans codebase with ESLint/Prettier to enforce style rules and flag code smell.",
      fullCommand,
    };
  }
  if (normKey === "typecheck" || normKey.startsWith("typecheck:")) {
    return {
      icon: "🛡️",
      category: "Type Checking",
      summary: "Runs TypeScript compiler (tsc --noEmit) to detect static type errors.",
      fullCommand,
    };
  }

  // 6. Monorepo & Setup
  if (normKey === "install:all" || normKey === "install") {
    return {
      icon: "📥",
      category: "Dependencies",
      summary: "Installs and links all dependencies across monorepo packages.",
      fullCommand,
    };
  }
  if (normKey === "prepare") {
    return {
      icon: "🔧",
      category: "Lifecycle Setup",
      summary: "Configures Git hooks, Husky, or native build extensions upon install.",
      fullCommand,
    };
  }

  // Fallbacks based on definition
  if (def.includes("docker")) {
    return {
      icon: "🐳",
      category: "Containers",
      summary: "Manages Docker containers, daemon compositions, and network services.",
      fullCommand,
    };
  }
  if (def.includes("sh ") || def.endsWith(".sh")) {
    return {
      icon: "🐚",
      category: "Shell Script",
      summary: `Executes custom shell workflow (${commandDef}).`,
      fullCommand,
    };
  }

  return {
    icon: "📜",
    category: "Project Script",
    summary: `Runs "${key}" script defined in project package.json.`,
    fullCommand,
  };
}

export function stripAnsi(text: string): string {
  if (!text) return "";
  return text
    // standard ESC [ ... m or other command
    .replace(/\u001b\[[0-9;]*[a-zA-Z]/g, "")
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
    // unescaped bracketed color codes like [0;36m, [1m, [0m, [31m, [39m, [49m, [2m, [22m, etc.
    .replace(/\[\d+(?:;\d+)*m/g, "")
    .replace(/\[\d+m/g, "");
}

export function extractDetectedServices(
  logs: ProcessLogEntry[],
  processPorts?: number[]
): { url: string; label: string }[] {
  const serviceMap = new Map<string, { url: string; label: string }>();

  // 1. From live assigned ports on managed process
  if (processPorts && Array.isArray(processPorts)) {
    for (const port of processPorts) {
      if (port > 0) {
        const url = `http://localhost:${port}`;
        serviceMap.set(url, {
          url,
          label: `http://localhost:${port}`,
        });
      }
    }
  }

  // 2. Scan recent 150 log entries for URLs and listening ports
  const recentLogs = logs.slice(-150);
  const urlRegex = /(https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?(?:[^\s\)\],;>]*))/g;
  const portRegex = /(?:port|listening on|ready on|running at|available at)[^\d]*(\d{3,5})/gi;

  for (const log of recentLogs) {
    const cleanMessage = stripAnsi(log.message);

    // Check URLs
    let urlMatch: RegExpExecArray | null;
    while ((urlMatch = urlRegex.exec(cleanMessage)) !== null) {
      let rawUrl = urlMatch[1]
        .replace(/[\x00-\x1F\x7F-\x9F]/g, "")
        .replace(/[[\\\])}>]+$/, "");
      if (rawUrl.includes("0.0.0.0")) {
        rawUrl = rawUrl.replace("0.0.0.0", "localhost");
      }
      if (!serviceMap.has(rawUrl)) {
        serviceMap.set(rawUrl, {
          url: rawUrl,
          label: rawUrl,
        });
      }
    }

    // Check port mentions
    let portMatch: RegExpExecArray | null;
    while ((portMatch = portRegex.exec(cleanMessage)) !== null) {
      const portNum = parseInt(portMatch[1], 10);
      if (portNum >= 1000 && portNum <= 65535) {
        const portUrl = `http://localhost:${portNum}`;
        if (!serviceMap.has(portUrl)) {
          serviceMap.set(portUrl, {
            url: portUrl,
            label: `http://localhost:${portNum}`,
          });
        }
      }
    }
  }

  return Array.from(serviceMap.values());
}

export function renderLogMessage(message: string) {
  const cleanMessage = stripAnsi(message);
  const urlRegex = /(https?:\/\/[^\s\)\],;>]+)/g;
  if (!urlRegex.test(cleanMessage)) {
    return cleanMessage;
  }
  const parts = cleanMessage.split(urlRegex);
  return parts.map((part, index) => {
    if (part.match(/^https?:\/\//)) {
      const cleanUrl = part.replace(/[.,;!?:)]+$/, "").replace(/[[\\\])}>]+$/, "");
      return (
        <a
          key={index}
          href={cleanUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.preventDefault();
            openExternalUrl(cleanUrl);
          }}
          className="text-[#8CA9CF] underline underline-offset-2 hover:text-[#A6BDE0] font-semibold cursor-pointer"
          title={`Click to open ${cleanUrl}`}
        >
          {cleanUrl} ↗
        </a>
      );
    }
    return part;
  });
}

export function TerminalView({ isActive, initialSelection }: TerminalViewProps = {}) {
  // Workspaces state
  const [workspaces, setWorkspaces] = useState<WorkspaceWithProjects[]>([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState<boolean>(true);

  useWorkspaceSubscription(setWorkspaces, isActive);

  // Tabs state
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>("");
  const [editingTabTitleId, setEditingTabTitleId] = useState<string | null>(null);
  const [editingTitleText, setEditingTitleText] = useState<string>("");

  // Scripts cache per project { [projectId]: Record<string, string> }
  const [projectScriptsCache, setProjectScriptsCache] = useState<
    Record<string, Record<string, string>>
  >({});
  const [loadingScripts, setLoadingScripts] = useState<boolean>(false);

  // Running processes map { [processId]: ManagedProcess }
  const [runningProcesses, setRunningProcesses] = useState<
    Record<string, ManagedProcess>
  >({});

  // UI action states
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState<boolean>(false);
  const [copiedPath, setCopiedPath] = useState<boolean>(false);

  // Additional Terminal Features: Search, Stream filter, Line wrap, Copy output
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [streamFilter, setStreamFilter] = useState<"all" | "stderr" | "stdout" | "system">("all");
  const [wrapLines, setWrapLines] = useState<boolean>(true);
  const [copiedOutput, setCopiedOutput] = useState<boolean>(false);

  const handleCopyPath = (path: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(path);
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
    }
  };

  const handleRevealInFinder = async (path: string) => {
    if (window.electron?.revealInFinder) {
      await window.electron.revealInFinder(path);
    }
  };

  const terminalScrollRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<boolean>(false);
  const [, startTransition] = useTransition();

  // Horizontal scrolling state for detected scripts row
  const scriptsScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollScriptsLeft, setCanScrollScriptsLeft] = useState<boolean>(false);
  const [canScrollScriptsRight, setCanScrollScriptsRight] = useState<boolean>(false);

  const checkScriptsScroll = useCallback(() => {
    const el = scriptsScrollRef.current;
    if (el) {
      setCanScrollScriptsLeft(el.scrollLeft > 4);
      setCanScrollScriptsRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
    }
  }, []);

  const scrollScripts = (direction: "left" | "right") => {
    if (scriptsScrollRef.current) {
      const offset = direction === "left" ? -240 : 240;
      scriptsScrollRef.current.scrollBy({ left: offset, behavior: "smooth" });
    }
  };

  // Horizontal scrolling state for detected services row
  const servicesScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollServicesLeft, setCanScrollServicesLeft] = useState<boolean>(false);
  const [canScrollServicesRight, setCanScrollServicesRight] = useState<boolean>(false);

  // In-App Web Preview state
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewInputUrl, setPreviewInputUrl] = useState<string>("");
  const [previewViewport, setPreviewViewport] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [previewKey, setPreviewKey] = useState<number>(0);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const checkServicesScroll = useCallback(() => {
    const el = servicesScrollRef.current;
    if (el) {
      setCanScrollServicesLeft(el.scrollLeft > 4);
      setCanScrollServicesRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
    }
  }, []);

  const scrollServices = (direction: "left" | "right") => {
    if (servicesScrollRef.current) {
      const offset = direction === "left" ? -240 : 240;
      servicesScrollRef.current.scrollBy({ left: offset, behavior: "smooth" });
    }
  };

  const handleCopyUrl = (url: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(null), 2000);
    }
  };

  const handleOpenPreview = (url: string) => {
    setPreviewUrl(url);
    setPreviewInputUrl(url);
    setPreviewKey((k) => k + 1);
  };

  // Active tab derived
  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0] || null;

  // Active workspace and project derived for active tab
  const activeWorkspace =
    workspaces.find((w) => w.id === activeTab?.workspaceId) || null;
  const activeProject =
    activeWorkspace?.projects.find((p) => p.id === activeTab?.projectId) || null;

  // Active scripts for currently selected project in active tab
  const activeScripts = activeTab?.projectId
    ? projectScriptsCache[activeTab.projectId] || {}
    : {};
  const scriptKeys = Object.keys(activeScripts);
  const hasDetectedScripts = scriptKeys.length > 0;

  // Active process object for currently active tab
  const activeProcess = activeTab?.processId
    ? runningProcesses[activeTab.processId] || null
    : null;

  // Derived filtered logs & counts for active tab
  const totalLogsCount = activeTab?.logs.length || 0;
  const errorCount = (activeTab?.logs || []).filter((l) => l.stream === "stderr").length;
  const stdoutCount = (activeTab?.logs || []).filter((l) => l.stream === "stdout").length;
  const systemCount = (activeTab?.logs || []).filter((l) => l.stream === "system").length;

  const filteredLogs = (activeTab?.logs || []).filter((log) => {
    if (streamFilter !== "all" && log.stream !== streamFilter) {
      return false;
    }
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase();
      const cleanMsg = stripAnsi(log.message).toLowerCase();
      return cleanMsg.includes(q) || log.stream.toLowerCase().includes(q);
    }
    return true;
  });

  const handleCopyOutput = () => {
    if (!activeTab || activeTab.logs.length === 0) return;
    const linesToCopy = filteredLogs.length > 0 ? filteredLogs : activeTab.logs;
    const text = linesToCopy
      .map(
        (l) =>
          `[${new Date(l.timestamp).toLocaleTimeString()}] [${l.stream.toUpperCase()}] ${stripAnsi(l.message)}`
      )
      .join("\n");
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedOutput(true);
      setTimeout(() => setCopiedOutput(false), 2000);
    }
  };

  const scrollToTop = () => {
    if (terminalScrollRef.current) {
      terminalScrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  useEffect(() => {
    checkScriptsScroll();
    const el = scriptsScrollRef.current;
    if (el) {
      const handleWheel = (e: WheelEvent) => {
        if (e.deltaY !== 0 && el.scrollWidth > el.clientWidth) {
          e.preventDefault();
          el.scrollLeft += e.deltaY;
        }
      };
      el.addEventListener("wheel", handleWheel, { passive: false });
      el.addEventListener("scroll", checkScriptsScroll, { passive: true });
      window.addEventListener("resize", checkScriptsScroll);
      return () => {
        el.removeEventListener("wheel", handleWheel);
        el.removeEventListener("scroll", checkScriptsScroll);
        window.removeEventListener("resize", checkScriptsScroll);
      };
    }
  }, [scriptKeys, activeTab?.projectId, checkScriptsScroll]);

  useEffect(() => {
    checkServicesScroll();
    const el = servicesScrollRef.current;
    if (el) {
      const handleWheel = (e: WheelEvent) => {
        if (e.deltaY !== 0 && el.scrollWidth > el.clientWidth) {
          e.preventDefault();
          el.scrollLeft += e.deltaY;
        }
      };
      el.addEventListener("wheel", handleWheel, { passive: false });
      el.addEventListener("scroll", checkServicesScroll, { passive: true });
      window.addEventListener("resize", checkServicesScroll);
      return () => {
        el.removeEventListener("wheel", handleWheel);
        el.removeEventListener("scroll", checkServicesScroll);
        window.removeEventListener("resize", checkServicesScroll);
      };
    }
  }, [checkServicesScroll, activeTab?.logs]);

  // 1. Initialize workspaces, restore tabs from localStorage, and handle initialSelection
  useEffect(() => {
    let mounted = true;

    async function initialize() {
      try {
        setLoadingWorkspaces(true);
        const [loadedWorkspaces, initialProcesses] = await Promise.all([
          fetchWorkspaces(),
          fetchProcesses().catch(() => [] as ManagedProcess[]),
        ]);

        if (!mounted) return;
        setWorkspaces(loadedWorkspaces);

        // Build processes lookup map
        const procMap: Record<string, ManagedProcess> = {};
        for (const p of initialProcesses) {
          procMap[p.id] = p;
        }
        setRunningProcesses(procMap);

        // Restore tabs from localStorage
        let restoredTabs: TerminalTab[] = [];
        try {
          const stored = localStorage.getItem(LOCAL_STORAGE_TABS_KEY);
          if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
              restoredTabs = parsed.map((t) => ({
                ...t,
                // reconcile status with live processes if possible
                status:
                  t.processId && procMap[t.processId]
                    ? procMap[t.processId].status
                    : t.status === "running" || t.status === "starting"
                    ? "stopped"
                    : t.status,
              }));
            }
          }
        } catch {
          // ignore corrupted storage
        }

        // Heal and re-qualify restored tabs using freshly loaded workspace project data
        const allLoadedProjects = loadedWorkspaces.flatMap((w) => w.projects);
        restoredTabs = restoredTabs.map((t) => {
          const matchedProj = allLoadedProjects.find((p) => p.id === t.projectId);
          if (!matchedProj) return t;

          const projLabel = matchedProj.displayName || matchedProj.name;
          let newTitle = t.title;

          // If the title still uses the old raw name (e.g. "frontend: dev" or "frontend: term"), heal it
          const oldName = t.projectName || matchedProj.name;
          if (t.title.startsWith(`${oldName}:`) || t.title === oldName) {
            const suffix = t.title.includes(":") ? t.title.split(":").slice(1).join(":") : "term";
            newTitle = `${projLabel}:${suffix}`;
          }

          return {
            ...t,
            projectName: matchedProj.name,
            projectDisplayName: projLabel,
            title: newTitle,
          };
        });

        let initialActiveId = "";
        try {
          initialActiveId = localStorage.getItem(LOCAL_STORAGE_ACTIVE_TAB_KEY) || "";
        } catch {
          // ignore
        }

        // If an initialSelection was provided from outside (e.g. ProjectsView)
        if (initialSelection?.workspaceId && initialSelection?.projectId) {
          const targetWs = loadedWorkspaces.find((w) => w.id === initialSelection.workspaceId);
          const targetProj = targetWs?.projects.find((p) => p.id === initialSelection.projectId);

          if (targetWs && targetProj) {
            const projLabel = targetProj.displayName || targetProj.name;
            // Check if there is already a tab for this project
            const existingTab = restoredTabs.find(
              (t) =>
                t.projectId === targetProj.id &&
                (!initialSelection.script || t.script === initialSelection.script)
            );

            if (existingTab) {
              initialActiveId = existingTab.id;
            } else {
              // Create a dedicated tab for this selected project
              const newTab: TerminalTab = {
                ...createDefaultTab(restoredTabs.length + 1),
                title: `${projLabel}: ${initialSelection.script || "term"}`,
                workspaceId: targetWs.id,
                projectId: targetProj.id,
                projectName: targetProj.name,
                projectDisplayName: projLabel,
                script: initialSelection.script || "",
              };
              restoredTabs.push(newTab);
              initialActiveId = newTab.id;
            }
          }
        }

        // If no tabs were restored, create initial default Tab 1
        if (restoredTabs.length === 0) {
          const firstTab = createDefaultTab(1);
          restoredTabs = [firstTab];
          initialActiveId = firstTab.id;
        }

        // If default single tab has no project selected, restore last used workspace & project
        if (restoredTabs.length === 1 && !restoredTabs[0].workspaceId) {
          const lastWsId = localStorage.getItem("devdesk_terminal_last_workspace_id");
          const lastProjId = localStorage.getItem("devdesk_terminal_last_project_id");
          if (lastWsId) {
            const matchedWs = loadedWorkspaces.find((w) => w.id === lastWsId);
            if (matchedWs) {
              const matchedProj =
                matchedWs.projects.find((p) => p.id === lastProjId) ||
                (matchedWs.projects.length > 0 ? matchedWs.projects[0] : null);
              const projLabel = matchedProj
                ? matchedProj.displayName || matchedProj.name
                : "";
              restoredTabs[0] = {
                ...restoredTabs[0],
                workspaceId: matchedWs.id,
                projectId: matchedProj?.id || "",
                projectName: matchedProj?.name || "",
                projectDisplayName: projLabel,
                title: matchedProj ? `${projLabel}: term` : restoredTabs[0].title,
              };
            }
          }
        }

        // Validate active tab ID
        if (!restoredTabs.some((t) => t.id === initialActiveId)) {
          initialActiveId = restoredTabs[0].id;
        }

        setTabs(restoredTabs);
        setActiveTabId(initialActiveId);
      } catch (err: unknown) {
        if (!mounted) return;
        setErrorMessage(
          err instanceof Error ? err.message : "Failed to initialize terminal"
        );
      } finally {
        if (mounted) setLoadingWorkspaces(false);
      }
    }

    initialize();

    return () => {
      mounted = false;
    };
  }, []);

  // 2. Handle external initialSelection updates when view is already mounted
  useEffect(() => {
    if (!initialSelection?.workspaceId || !initialSelection?.projectId || workspaces.length === 0) {
      return;
    }

    const targetWs = workspaces.find((w) => w.id === initialSelection.workspaceId);
    const targetProj = targetWs?.projects.find((p) => p.id === initialSelection.projectId);
    if (!targetWs || !targetProj) return;

    // Check if an existing tab matches
    const existingIndex = tabs.findIndex(
      (t) =>
        t.projectId === targetProj.id &&
        (!initialSelection.script || t.script === initialSelection.script)
    );

    if (existingIndex >= 0) {
      setActiveTabId(tabs[existingIndex].id);
    } else {
      const projLabel = targetProj.displayName || targetProj.name;
      // Create new tab
      const newTab: TerminalTab = {
        ...createDefaultTab(tabs.length + 1),
        title: `${projLabel}: ${initialSelection.script || "term"}`,
        workspaceId: targetWs.id,
        projectId: targetProj.id,
        projectName: targetProj.name,
        projectDisplayName: projLabel,
        script: initialSelection.script || "",
      };
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(newTab.id);
    }
  }, [initialSelection, workspaces]);

  // 3. Save tabs to localStorage whenever tabs or active tab changes
  useEffect(() => {
    if (tabs.length === 0) return;
    try {
      // Save trimmed tabs to prevent localStorage overflow
      const trimmedTabs = tabs.map((t) => ({
        ...t,
        logs: t.logs.slice(-MAX_SAVED_LOGS_PER_TAB),
      }));
      localStorage.setItem(LOCAL_STORAGE_TABS_KEY, JSON.stringify(trimmedTabs));
      if (activeTabId) {
        localStorage.setItem(LOCAL_STORAGE_ACTIVE_TAB_KEY, activeTabId);
      }
    } catch {
      // ignore storage write errors
    }
  }, [tabs, activeTabId]);

  // 4. Fetch available scripts for active project when projectId changes
  useEffect(() => {
    if (!activeTab?.projectId) return;
    const projId = activeTab.projectId;

    if (projectScriptsCache[projId]) {
      return; // already cached
    }

    let mounted = true;

    async function loadScripts() {
      try {
        setLoadingScripts(true);
        const discovered = await fetchProjectScripts(projId);
        if (!mounted) return;
        setProjectScriptsCache((prev) => ({ ...prev, [projId]: discovered }));
        const keys = Object.keys(discovered);
        if (keys.length === 0) {
          updateActiveTab({ isCustom: true });
        } else if (!activeTab?.script && keys.length > 0) {
          const preferred = keys.find((k) => ["dev", "start", "serve", "test"].includes(k)) || keys[0];
          updateActiveTab({ script: preferred });
        }
      } catch {
        if (!mounted) return;
        setProjectScriptsCache((prev) => ({ ...prev, [projId]: {} }));
        updateActiveTab({ isCustom: true });
      } finally {
        if (mounted) setLoadingScripts(false);
      }
    }

    loadScripts();

  }, [activeTab?.projectId, projectScriptsCache]);

  const handleRefreshScripts = async () => {
    if (!activeTab?.projectId) return;
    const projId = activeTab.projectId;
    setLoadingScripts(true);
    try {
      const discovered = await fetchProjectScripts(projId);
      setProjectScriptsCache((prev) => ({ ...prev, [projId]: discovered }));
    } catch {
      // Ignore refresh error
    } finally {
      setLoadingScripts(false);
    }
  };

  // 5. Global polling loop for ALL running processes across ALL tabs
  useEffect(() => {
    let mounted = true;

    async function pollAllProcesses() {
      if (pollingRef.current) return;
      pollingRef.current = true;

      try {
        // Collect all process IDs across all tabs that need polling
        const activeProcessIds = tabs
          .map((t) => t.processId)
          .filter((id): id is string => Boolean(id));

        if (activeProcessIds.length === 0) {
          return;
        }

        // Fetch overall process states
        const allProcs = await fetchProcesses().catch(() => [] as ManagedProcess[]);
        if (!mounted) return;

        const procMap: Record<string, ManagedProcess> = {};
        for (const p of allProcs) {
          procMap[p.id] = p;
        }
        setRunningProcesses(procMap);

        // Fetch logs for each tab with an active process
        for (const tab of tabs) {
          if (!tab.processId) continue;
          const currentProc = procMap[tab.processId];

          // Fetch incremental logs
          try {
            const result = await fetchProcessLogs(tab.processId, tab.latestSeqId);
            if (!mounted) return;

            if (result.logs.length > 0 || (currentProc && currentProc.status !== tab.status)) {
              setTabs((prevTabs) =>
                prevTabs.map((t) => {
                  if (t.id !== tab.id) return t;
                  const newLogs =
                    result.logs.length > 0 ? [...t.logs, ...result.logs] : t.logs;
                  return {
                    ...t,
                    logs: newLogs.slice(-2000), // maintain bounded buffer of 2000 lines
                    latestSeqId:
                      result.latestSequenceId > t.latestSeqId
                        ? result.latestSequenceId
                        : t.latestSeqId,
                    status: currentProc ? currentProc.status : result.status || t.status,
                  };
                })
              );
            }
          } catch {
            // ignore incremental log error
          }
        }
      } catch {
        // ignore polling error
      } finally {
        pollingRef.current = false;
      }
    }

    const interval = setInterval(pollAllProcesses, 800);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [tabs]);

  // 6. Auto-scroll active tab terminal logs to bottom
  useEffect(() => {
    if (!activeTab?.autoScroll || !terminalScrollRef.current) return;
    terminalScrollRef.current.scrollTop = terminalScrollRef.current.scrollHeight;
  }, [activeTab?.logs, activeTab?.autoScroll]);

  function handleTerminalScroll() {
    if (!terminalScrollRef.current || !activeTab) return;
    const { scrollTop, scrollHeight, clientHeight } = terminalScrollRef.current;
    const isBottom = scrollHeight - scrollTop - clientHeight < 40;

    if (activeTab.autoScroll !== isBottom) {
      updateActiveTab({ autoScroll: isBottom });
    }
    setShowScrollBottomBtn(!isBottom && activeTab.logs.length > 0);
  }

  function scrollToBottom() {
    if (!terminalScrollRef.current) return;
    terminalScrollRef.current.scrollTo({
      top: terminalScrollRef.current.scrollHeight,
      behavior: "smooth",
    });
    updateActiveTab({ autoScroll: true });
    setShowScrollBottomBtn(false);
  }

  // Helper to update active tab properties
  function updateActiveTab(updates: Partial<TerminalTab>) {
    if (!activeTabId) return;
    setTabs((prev) =>
      prev.map((t) => (t.id === activeTabId ? { ...t, ...updates } : t))
    );
  }

  // Tab management: Add Tab, Close Tab, Rename Tab
  function handleAddTab() {
    const newTab = createDefaultTab(tabs.length + 1);
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  }

  async function handleCloseTab(tabIdToClose: string, e?: React.MouseEvent) {
    if (e) e.stopPropagation();

    const targetTab = tabs.find((t) => t.id === tabIdToClose);
    if (!targetTab) return;

    // If running, stop background process
    if (targetTab.processId && targetTab.status === "running") {
      stopProcess(targetTab.processId).catch(() => {});
    }

    const remaining = tabs.filter((t) => t.id !== tabIdToClose);

    if (remaining.length === 0) {
      // If closing last tab, reset to clean Tab 1
      const freshTab = createDefaultTab(1);
      setTabs([freshTab]);
      setActiveTabId(freshTab.id);
    } else {
      setTabs(remaining);
      if (activeTabId === tabIdToClose) {
        setActiveTabId(remaining[remaining.length - 1].id);
      }
    }
  }

  function handleStartRename(tab: TerminalTab, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingTabTitleId(tab.id);
    setEditingTitleText(tab.title);
  }

  function handleSaveRename() {
    if (!editingTabTitleId) return;
    const trimmed = editingTitleText.trim();
    if (trimmed.length > 0) {
      setTabs((prev) =>
        prev.map((t) => (t.id === editingTabTitleId ? { ...t, title: trimmed } : t))
      );
    }
    setEditingTabTitleId(null);
  }

  // Workspace & Project change in active tab
  function handleWorkspaceChange(wsId: string) {
    if (typeof window !== "undefined") {
      localStorage.setItem("devdesk_terminal_last_workspace_id", wsId);
      localStorage.setItem("devdesk_last_selected_workspace_id", wsId);
    }
    const ws = workspaces.find((w) => w.id === wsId);
    const firstProj = ws?.projects[0] || null;
    const projLabel = firstProj ? (firstProj.displayName || firstProj.name) : "";
    if (firstProj && typeof window !== "undefined") {
      localStorage.setItem("devdesk_terminal_last_project_id", firstProj.id);
      localStorage.setItem("devdesk_last_selected_project_id", firstProj.id);
    }

    updateActiveTab({
      workspaceId: wsId,
      projectId: firstProj?.id || "",
      projectName: firstProj?.name || "",
      projectDisplayName: projLabel,
      script: "",
      title: firstProj ? `${projLabel}: term` : `Terminal ${tabs.length}`,
    });
  }

  function handleProjectChange(projId: string) {
    if (typeof window !== "undefined") {
      localStorage.setItem("devdesk_terminal_last_project_id", projId);
      localStorage.setItem("devdesk_last_selected_project_id", projId);
    }
    const proj = activeWorkspace?.projects.find((p) => p.id === projId);
    const projLabel = proj ? (proj.displayName || proj.name) : "";
    updateActiveTab({
      projectId: projId,
      projectName: proj?.name || "",
      projectDisplayName: projLabel,
      script: "",
      title: proj ? `${projLabel}: term` : activeTab?.title || "Terminal",
    });
  }

  // Script selection or custom command update
  function handleSelectScript(scriptKey: string, autoRun = false) {
    if (!activeTab) return;
    const label = activeTab.projectDisplayName || activeTab.projectName;
    updateActiveTab({
      script: scriptKey,
      isCustom: false,
      title: label
        ? `${label}: ${scriptKey}`
        : scriptKey,
    });
    if (autoRun && activeTab.projectId && !isRunning) {
      setTimeout(() => {
        handleStart(scriptKey);
      }, 50);
    }
  }

  // Process Actions: Start, Stop, Restart, Clear Logs, Export Logs
  async function handleStart(overrideScript?: string, overrideCommand?: string) {
    if (!activeTab || !activeTab.projectId) return;

    const isCustomMode = Boolean(overrideCommand) || activeTab.isCustom || !hasDetectedScripts;
    const commandToRun = (overrideCommand || (isCustomMode ? activeTab.customCommand : "")).trim();
    const scriptToRun = !overrideCommand && (overrideScript || (!isCustomMode ? activeTab.script : ""));

    if (!commandToRun && !scriptToRun) {
      setErrorMessage(
        hasDetectedScripts
          ? "Please select a script or enter a custom command to run."
          : "Please enter a command to execute in the project directory."
      );
      return;
    }

    try {
      setActionLoading(true);
      setErrorMessage(null);

      // Add system log entry
      const startLog: ProcessLogEntry = {
        id: activeTab.latestSeqId + 1,
        timestamp: new Date().toISOString(),
        stream: "system",
        message: `[DevDesk] Starting: ${commandToRun || scriptToRun}...`,
      };

      const proc = await startProcess(
        activeTab.projectId,
        scriptToRun || undefined,
        commandToRun || undefined
      );

      const label = activeTab.projectDisplayName || activeTab.projectName;

      // Update active tab with running process info
      updateActiveTab({
        processId: proc.id,
        status: "starting",
        script: scriptToRun || (commandToRun ? commandToRun.slice(0, 24) : activeTab.script),
        customCommand: commandToRun || activeTab.customCommand,
        latestSeqId: startLog.id,
        logs: [...activeTab.logs, startLog],
        title: label
          ? `${label}: ${proc.script}`
          : proc.script,
      });

      setRunningProcesses((prev) => ({ ...prev, [proc.id]: proc }));
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to start process."
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function handleStop() {
    if (!activeTab) return;

    if (!activeTab.processId) {
      updateActiveTab({ status: "stopped" });
      return;
    }

    try {
      setActionLoading(true);
      setErrorMessage(null);

      const updated = await stopProcess(activeTab.processId);
      updateActiveTab({ status: updated.status });
      setRunningProcesses((prev) => ({ ...prev, [updated.id]: updated }));
    } catch (err: unknown) {
      updateActiveTab({ status: "stopped" });
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to stop process."
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function handleStopTab(tabId: string, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    const tabToStop = tabs.find((t) => t.id === tabId);
    if (!tabToStop) return;

    if (!tabToStop.processId) {
      setTabs((prev) =>
        prev.map((t) => (t.id === tabId ? { ...t, status: "stopped" } : t))
      );
      return;
    }

    try {
      setActionLoading(true);
      setErrorMessage(null);

      const updated = await stopProcess(tabToStop.processId);
      setTabs((prev) =>
        prev.map((t) => (t.id === tabId ? { ...t, status: updated.status } : t))
      );
      setRunningProcesses((prev) => ({ ...prev, [updated.id]: updated }));
    } catch (err: unknown) {
      setTabs((prev) =>
        prev.map((t) => (t.id === tabId ? { ...t, status: "stopped" } : t))
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRestart() {
    if (!activeTab?.processId) return;

    try {
      setActionLoading(true);
      setErrorMessage(null);

      const restartLog: ProcessLogEntry = {
        id: activeTab.latestSeqId + 1,
        timestamp: new Date().toISOString(),
        stream: "system",
        message: "[DevDesk] Restarting process...",
      };

      updateActiveTab({
        logs: [...activeTab.logs, restartLog],
        latestSeqId: restartLog.id,
        status: "starting",
      });

      const updated = await restartProcess(activeTab.processId);
      updateActiveTab({
        processId: updated.id,
        status: updated.status,
      });
      setRunningProcesses((prev) => ({ ...prev, [updated.id]: updated }));
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to restart process."
      );
    } finally {
      setActionLoading(false);
    }
  }

  function handleClearLogs() {
    if (!activeTab) return;
    updateActiveTab({ logs: [], latestSeqId: 0 });
  }

  function handleExportLogs() {
    if (!activeTab || activeTab.logs.length === 0) return;
    const content = activeTab.logs
      .map((l) => `[${l.timestamp}] [${l.stream.toUpperCase()}] ${l.message}`)
      .join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeTab.title.replace(/[^a-zA-Z0-9_-]/g, "_")}_logs.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function getWorkspaceLabel(rootPath: string): string {
    const parts = rootPath.split(/[/\\]/).filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : rootPath;
  }

  function getScriptIcon(key: string, def?: string): string {
    const k = key.toLowerCase();
    const d = (def || "").toLowerCase();

    if (k.startsWith("cargo:") || d.includes("cargo")) return "🦀";
    if (k.startsWith("go:") || d.includes("go run")) return "🐹";
    if (k.startsWith("make:") || d.startsWith("make")) return "⚙️";
    if (k.startsWith("sh:") || k.endsWith(".sh") || d.startsWith("bash") || d.startsWith("sh ")) return "🐚";
    if (k.startsWith("composer:")) return "🐘";
    if (k === "runserver" || k === "migrate" || k.endsWith(".py") || k.startsWith("pip") || d.includes("python")) {
      return "🐍";
    }

    if (k.includes("server") || k.includes("backend") || k.includes("api")) return "🖥️";
    if (k.includes("client") || k.includes("frontend") || k.includes("ui") || k.includes("web")) return "🌐";
    if (k === "dev" || k === "start:dev" || k === "develop" || k.includes("watch")) return "⚡";
    if (k === "start" || k === "serve" || k.startsWith("prod")) return "🚀";
    if (k === "build" || k.startsWith("build")) return "📦";
    if (k.includes("coverage")) return "📊";
    if (k === "test" || k.startsWith("test") || k.includes("jest") || k.includes("vitest")) return "🧪";
    if (k.includes("lint") || k.includes("typecheck") || k.includes("format") || k.includes("prettier")) return "🔍";
    if (k.includes("studio")) return "📊";
    if (k.includes("migrate")) return "🗄️";
    if (k.includes("generate") || k.includes("codegen")) return "⚙️";
    if (k.startsWith("db:") || k.includes("db") || k.includes("prisma")) return "🗄️";
    if (k.startsWith("install") || k === "prepare" || k === "setup") return "📥";
    if (k.includes("clean")) return "🧹";
    if (k.includes("docker")) return "🐳";

    return "📜";
  }

  // --- RENDER STATES ---

  // Loading initial workspaces
  if (loadingWorkspaces) {
    return (
      <div className="flex flex-col h-full p-6 text-zinc-100 w-full">
        <div className="mb-6">
          <h2 className="text-xl font-semibold tracking-tight">Terminal</h2>
          <p className="text-xs text-zinc-400 mt-1">Connecting to workspace processes...</p>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-zinc-800 rounded-lg p-10 bg-zinc-900/20 text-center">
          <div className="w-8 h-8 rounded-full border-2 border-zinc-700 border-t-zinc-200 animate-spin mb-4" />
          <p className="text-sm font-medium text-zinc-200">Loading workspaces and projects...</p>
        </div>
      </div>
    );
  }

  // Empty state: No workspaces configured
  if (workspaces.length === 0) {
    return (
      <div className="flex flex-col h-full p-6 text-zinc-100 w-full">
        <div className="mb-6">
          <h2 className="text-xl font-semibold tracking-tight">Terminal</h2>
          <p className="text-xs text-zinc-400 mt-1">
            Run project scripts and monitor real-time output across multiple terminals.
          </p>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-zinc-800 rounded-lg p-10 bg-zinc-900/30 text-center">
          <div className="w-12 h-12 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-sm font-mono text-zinc-400 mb-4 shadow-sm">
            &gt;_
          </div>
          <p className="text-sm font-semibold text-zinc-200">No Workspaces Found</p>
          <p className="text-xs text-zinc-400 mt-1 max-w-md leading-relaxed">
            Scan and save a workspace root in the Projects tab before running project scripts.
          </p>
        </div>
      </div>
    );
  }

  const isRunning =
    activeTab?.status === "running" || activeTab?.status === "starting";

  return (
    <div className="flex flex-col h-full p-6 text-zinc-100 w-full overflow-hidden">
      {/* 1. Header & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 shrink-0">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Terminal</h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Multi-terminal manager: run scripts, monitor real-time output, and preserve session history.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAddTab}
            className="px-2.5 py-1.5 rounded-md text-xs font-medium text-zinc-100 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition flex items-center gap-1.5 cursor-pointer shadow-xs"
            title="Open a new terminal session"
          >
            <span className="text-sm font-bold leading-none">+</span>
            <span>New Terminal</span>
          </button>
        </div>
      </div>

      {/* 2. Multi-Terminal Tab Bar */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 mb-3 border-b border-[#303642] shrink-0">
        {tabs.map((tab, idx) => {
          const isActive = tab.id === activeTabId;
          const isTabRunning = tab.status === "running";
          const isTabStarting = tab.status === "starting";
          const isTabFailed = tab.status === "failed";

          return (
            <div
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={`group flex items-center gap-2 px-3 py-1.5 rounded-t-md border-t border-x text-xs cursor-pointer select-none transition-all ${
                isActive
                  ? "bg-[#1D2129] border-t-2 border-t-[#8CA9CF] border-x-[#303642] border-b-0 text-[#E8EBF1] font-medium shadow-xs"
                  : "bg-[#171A20]/60 border-transparent text-[#A5ADBA] hover:text-[#E8EBF1] hover:bg-[#1D2129]/50"
              }`}
              title={`Click to switch. Double-click to rename.\nStatus: ${tab.status}`}
            >
              {/* Status indicator dot */}
              <span className="flex h-2 w-2 shrink-0 items-center justify-center">
                <span
                  className={`inline-flex rounded-full h-1.5 w-1.5 ${
                    isTabRunning
                      ? "bg-[#77B58A] animate-pulse"
                      : isTabStarting
                      ? "bg-[#E0B36D] animate-pulse"
                      : isTabFailed
                      ? "bg-[#E18B8B]"
                      : "bg-[#7C8594]"
                  }`}
                />
              </span>

              {/* Title or inline edit */}
              {editingTabTitleId === tab.id ? (
                <input
                  type="text"
                  value={editingTitleText}
                  onChange={(e) => setEditingTitleText(e.target.value)}
                  onBlur={handleSaveRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveRename();
                    if (e.key === "Escape") setEditingTabTitleId(null);
                  }}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                  className="px-1 py-0.5 rounded bg-[#272D38] text-[#E8EBF1] border border-[#303642] text-xs w-28 focus:outline-none"
                />
              ) : (
                <span
                  onDoubleClick={(e) => handleStartRename(tab, e)}
                  title={tab.title || `Terminal ${idx + 1}`}
                  className="truncate max-w-[200px] font-mono text-[11px]"
                >
                  {tab.title || `Terminal ${idx + 1}`}
                </span>
              )}

              {/* Stop button on tab if running */}
              {(isTabRunning || isTabStarting) && (
                <button
                  onClick={(e) => handleStopTab(tab.id, e)}
                  className="w-4 h-4 rounded-full flex items-center justify-center text-[#E18B8B] hover:text-[#101216] hover:bg-[#E18B8B] transition text-[9px] font-bold"
                  title="Stop this running session"
                >
                  ⏹
                </button>
              )}

              {/* Tab close button */}
              <button
                onClick={(e) => handleCloseTab(tab.id, e)}
                className="w-4 h-4 rounded-full flex items-center justify-center text-[#7C8594] hover:text-[#E8EBF1] hover:bg-[#272D38] transition ml-0.5"
                title="Close terminal tab"
              >
                ×
              </button>
            </div>
          );
        })}

        {/* Plus Button */}
        <button
          onClick={handleAddTab}
          className="px-2 py-1.5 rounded text-[#A5ADBA] hover:text-[#E8EBF1] hover:bg-[#272D38] text-xs transition font-semibold"
          title="Add another terminal tab"
        >
          +
        </button>
      </div>

      {/* 3. Tab Configuration Toolbar (Workspace, Project, Script / Custom Command) */}
      <div className="flex flex-col gap-2.5 p-3 rounded-lg bg-[#171A20] border border-[#303642] mb-3 shrink-0">
        {/* Row A: Selectors & Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Workspace dropdown */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-[#7C8594] uppercase">WS:</span>
              <select
                value={activeTab?.workspaceId || ""}
                onChange={(e) => handleWorkspaceChange(e.target.value)}
                disabled={isRunning}
                className="px-2.5 py-1 rounded bg-[#101216] border border-[#303642] text-[#E8EBF1] text-xs hover:border-[#8CA9CF]/60 focus:outline-none disabled:opacity-50 cursor-pointer max-w-[160px] truncate"
              >
                <option value="">(Select Workspace)</option>
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {getWorkspaceLabel(w.rootPath)}
                  </option>
                ))}
              </select>
            </div>

            {/* Project dropdown */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-[#7C8594] uppercase">Project:</span>
              <select
                value={activeTab?.projectId || ""}
                onChange={(e) => handleProjectChange(e.target.value)}
                disabled={!activeTab?.workspaceId || isRunning}
                className="px-2.5 py-1 rounded bg-[#101216] border border-[#303642] text-[#E8EBF1] text-xs hover:border-[#8CA9CF]/60 focus:outline-none disabled:opacity-50 cursor-pointer max-w-[280px] truncate"
              >
                <option value="">(Select Project)</option>
                {(activeWorkspace?.projects || [])
                  .slice()
                  .sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName || p.name} ({p.type})
                    </option>
                  ))}
              </select>
            </div>

            {/* Mode Toggle: Detected Scripts vs Custom Command */}
            {hasDetectedScripts ? (
              <div className="inline-flex rounded-md border border-[#303642] bg-[#101216] p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => updateActiveTab({ isCustom: false })}
                  className={`px-2 py-0.5 rounded font-medium transition cursor-pointer ${
                    !activeTab?.isCustom
                      ? "bg-[#272D38] text-[#E8EBF1] shadow-xs"
                      : "text-[#7C8594] hover:text-[#A5ADBA]"
                  }`}
                >
                  Auto-Detected Scripts
                </button>
                <button
                  type="button"
                  onClick={() => updateActiveTab({ isCustom: true })}
                  className={`px-2 py-0.5 rounded font-medium transition cursor-pointer ${
                    activeTab?.isCustom
                      ? "bg-[#272D38] text-[#E8EBF1] shadow-xs"
                      : "text-[#7C8594] hover:text-[#A5ADBA]"
                  }`}
                >
                  Custom Command
                </button>
              </div>
            ) : (
              <span className="px-2 py-1 rounded text-[11px] font-mono text-[#7C8594] bg-[#101216] border border-[#303642]">
                Custom Command
              </span>
            )}
          </div>

          {/* Action buttons (Start, Stop, Restart, Clear, Export) */}
          <div className="flex items-center gap-2">
            {/* Start Button */}
            <button
              onClick={() => handleStart()}
              disabled={actionLoading || isRunning || !activeTab?.projectId}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition shadow-xs flex items-center gap-1.5 cursor-pointer ${
                !isRunning && activeTab?.projectId
                  ? "text-[#101216] bg-[#8CA9CF] hover:bg-[#A6BDE0]"
                  : "text-[#7C8594] bg-[#272D38] border border-[#303642] cursor-not-allowed opacity-60"
              }`}
              title={
                isRunning
                  ? "Script is already running"
                  : !activeTab?.projectId
                  ? "Select a project first"
                  : "Start script or custom command"
              }
            >
              {actionLoading && !isRunning ? (
                <span className="w-3 h-3 rounded-full border border-[#101216] border-t-transparent animate-spin" />
              ) : (
                <span>▶</span>
              )}
              <span>Start</span>
            </button>

            {/* Stop Button - ALWAYS VISIBLE */}
            <button
              onClick={handleStop}
              disabled={actionLoading || (!isRunning && !activeTab?.processId)}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition shadow-xs flex items-center gap-1.5 cursor-pointer ${
                isRunning || activeTab?.processId
                  ? "text-[#101216] bg-[#E18B8B] hover:bg-[#e89d9d]"
                  : "text-[#7C8594] bg-[#272D38] border border-[#303642] cursor-not-allowed opacity-50"
              }`}
              title={
                isRunning
                  ? "Stop running process (SIGTERM/SIGKILL)"
                  : activeTab?.processId
                  ? "Terminate process session"
                  : "No running process to stop"
              }
            >
              {actionLoading && isRunning ? (
                <span className="w-3 h-3 rounded-full border border-[#101216] border-t-transparent animate-spin" />
              ) : (
                <span>⏹</span>
              )}
              <span>Stop</span>
            </button>

            {/* Restart / Rerun Button */}
            <button
              onClick={isRunning ? handleRestart : () => handleStart()}
              disabled={actionLoading || !activeTab?.projectId}
              className="px-3 py-1.5 rounded-md text-xs font-medium text-[#E0B36D] bg-[rgba(224,179,109,0.12)] border border-[#E0B36D]/35 hover:bg-[rgba(224,179,109,0.2)] disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1 cursor-pointer"
              title={isRunning ? "Restart current running process" : "Rerun script"}
            >
              <span>↻</span>
              <span>{isRunning ? "Restart" : "Rerun"}</span>
            </button>

            {/* Clear Button */}
            <button
              onClick={handleClearLogs}
              disabled={!activeTab || activeTab.logs.length === 0}
              className="px-2.5 py-1.5 rounded-md text-xs font-medium text-[#A5ADBA] bg-[#101216] border border-[#303642] hover:text-[#E8EBF1] hover:border-[#8CA9CF]/60 disabled:opacity-40 transition cursor-pointer"
              title="Clear terminal buffer for this tab"
            >
              Clear
            </button>

            {/* Export Button */}
            <button
              onClick={handleExportLogs}
              disabled={!activeTab || activeTab.logs.length === 0}
              className="px-2.5 py-1.5 rounded-md text-xs font-medium text-[#A5ADBA] bg-[#101216] border border-[#303642] hover:text-[#E8EBF1] hover:border-[#8CA9CF]/60 disabled:opacity-40 transition cursor-pointer"
              title="Download session logs"
            >
              Export
            </button>
          </div>
        </div>

        {/* Project Location Bar */}
        {activeProject && (
          <div className="flex items-center justify-between gap-2 px-3 py-1 rounded-md bg-[#101216] border border-[#303642] text-xs font-mono text-[#A5ADBA]">
            <div className="flex items-center gap-2 truncate min-w-0">
              <span className="text-[#7C8594] font-sans text-[11px] font-semibold uppercase tracking-wider shrink-0">
                Path:
              </span>
              <span className="truncate select-all text-[#E8EBF1]" title={activeProject.path}>
                {activeProject.path}
              </span>
              {activeProject.relativePath && activeProject.relativePath !== "." && (
                <span className="text-[10px] text-[#7C8594] hidden md:inline shrink-0">
                  📁 {activeProject.relativePath}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0 ml-auto">
              <button
                type="button"
                onClick={() => handleCopyPath(activeProject.path)}
                className="px-2 py-0.5 rounded bg-[#272D38] border border-[#303642] hover:bg-[#303642] hover:text-[#E8EBF1] text-[#A5ADBA] text-[11px] transition cursor-pointer flex items-center gap-1"
                title="Copy full directory path to clipboard"
              >
                <span>{copiedPath ? "✓" : "📋"}</span>
                <span>{copiedPath ? "Copied" : "Copy Path"}</span>
              </button>
              <button
                type="button"
                onClick={() => handleRevealInFinder(activeProject.path)}
                className="px-2 py-0.5 rounded bg-[#272D38] border border-[#303642] hover:bg-[#303642] hover:text-[#E8EBF1] text-[#A5ADBA] text-[11px] transition cursor-pointer flex items-center gap-1"
                title="Reveal folder in Finder"
              >
                <span>📁</span>
                <span>Finder</span>
              </button>
            </div>
          </div>
        )}

        {/* Row B: Script selector OR Custom Command input */}
        <div className="pt-2 border-t border-[#303642]/60">
          {loadingScripts ? (
            <div className="flex items-center gap-2 text-xs text-[#7C8594] italic py-0.5">
              <span className="w-2.5 h-2.5 rounded-full border border-[#7C8594] border-t-transparent animate-spin" />
              <span>Scanning project files for scripts...</span>
            </div>
          ) : !activeTab?.isCustom && hasDetectedScripts ? (
            /* Auto-detected Scripts */
            <div className="space-y-2">
              {/* Strictly single-line Detected Scripts container with horizontal scroll */}
              <div className="flex items-center gap-2 min-w-0 w-full">
                <div className="flex items-center gap-1.5 shrink-0 select-none">
                  <span className="text-[11px] text-[#A5ADBA] font-semibold whitespace-nowrap">
                    Detected Scripts:
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-[#272D38] text-[#8CA9CF] border border-[#303642]">
                    {scriptKeys.length}
                  </span>
                  <button
                    type="button"
                    onClick={handleRefreshScripts}
                    disabled={loadingScripts || isRunning}
                    className="p-1 rounded text-[#7C8594] hover:text-[#E8EBF1] hover:bg-[#272D38] transition cursor-pointer"
                    title="Reload scripts from package.json on disk"
                  >
                    <span className={loadingScripts ? "animate-spin inline-block text-xs" : "text-xs"}>🔄</span>
                  </button>
                </div>

                {/* Horizontally scrollable container with smooth nudge controls */}
                <div className="relative flex-1 min-w-0 flex items-center group">
                  {canScrollScriptsLeft && (
                    <button
                      type="button"
                      onClick={() => scrollScripts("left")}
                      className="absolute left-0 z-10 w-6 h-6 rounded-full bg-[#171A20]/95 hover:bg-[#272D38] text-[#8CA9CF] border border-[#303642] flex items-center justify-center text-xs shadow-md transition cursor-pointer"
                      title="Scroll left"
                    >
                      ‹
                    </button>
                  )}

                  <div
                    ref={scriptsScrollRef}
                    className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth py-0.5 w-full"
                  >
                    {scriptKeys.map((key) => {
                      const isSelected = activeTab?.script === key;
                      const def = activeScripts[key];
                      const isRunningThis =
                        isRunning &&
                        (activeProcess?.script === key ||
                          (isSelected && (activeTab.status === "running" || activeTab.status === "starting")));

                      return (
                        <button
                          key={key}
                          onClick={() => handleSelectScript(key)}
                          onDoubleClick={() => !isRunning && handleSelectScript(key, true)}
                          disabled={isRunning}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-medium transition cursor-pointer whitespace-nowrap shrink-0 ${
                            isSelected
                              ? "bg-[#35465E] text-[#8CA9CF] border border-[#8CA9CF]/60 shadow-xs ring-1 ring-[#8CA9CF]/30"
                              : "bg-[#272D38] text-[#A5ADBA] border border-[#303642] hover:text-[#E8EBF1] hover:bg-[#303642] hover:border-[#8CA9CF]/30"
                          } disabled:opacity-50`}
                          title={`Command: ${def}\nClick to inspect, double-click to run immediately`}
                        >
                          {isRunningThis ? (
                            <span className="w-2 h-2 rounded-full bg-[#77B58A] animate-pulse" />
                          ) : (
                            <span className="text-xs">{getScriptIcon(key, def)}</span>
                          )}
                          <span>{key}</span>
                        </button>
                      );
                    })}
                  </div>

                  {canScrollScriptsRight && (
                    <button
                      type="button"
                      onClick={() => scrollScripts("right")}
                      className="absolute right-0 z-10 w-6 h-6 rounded-full bg-[#171A20]/95 hover:bg-[#272D38] text-[#8CA9CF] border border-[#303642] flex items-center justify-center text-xs shadow-md transition cursor-pointer"
                      title="Scroll right"
                    >
                      ›
                    </button>
                  )}
                </div>
              </div>

              {/* Compact Script Inspector Bar */}
              {activeTab?.script && (
                (() => {
                  const scriptInfo = getScriptDescription(
                    activeTab.script,
                    activeScripts[activeTab.script],
                    activeProject?.packageManager
                  );
                  const isCurrentScriptRunning =
                    isRunning &&
                    (activeProcess?.script === activeTab.script ||
                      activeTab.status === "running" ||
                      activeTab.status === "starting");

                  return (
                    <div className="px-3 py-1.5 rounded-md bg-[#1D2129] border border-[#303642] flex flex-wrap items-center justify-between gap-2 text-xs shadow-xs">
                      <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-sm">{scriptInfo.icon}</span>
                          <span className="font-semibold text-[#E8EBF1] font-mono text-xs">
                            {activeTab.script}
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[10px] uppercase font-mono font-medium bg-[#35465E]/60 text-[#8CA9CF] border border-[#8CA9CF]/30">
                            {scriptInfo.category}
                          </span>
                          {isCurrentScriptRunning && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-medium bg-[#77B58A]/15 text-[#77B58A] border border-[#77B58A]/30 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#77B58A] animate-pulse" />
                              Active
                            </span>
                          )}
                        </div>

                        {/* Executed command snippet */}
                        <div className="flex items-center gap-1 font-mono text-[11px] min-w-0">
                          <span className="text-[#8CA9CF] font-bold">&gt;</span>
                          <code className="text-[#E8EBF1] bg-[#101216] px-1.5 py-0.5 rounded border border-[#303642] text-[11px] truncate max-w-sm sm:max-w-md" title={scriptInfo.fullCommand}>
                            {scriptInfo.fullCommand}
                          </code>
                          {activeScripts[activeTab.script] && (
                            <span
                              className="text-[#7C8594] truncate text-[11px] hidden sm:inline"
                              title={activeScripts[activeTab.script]}
                            >
                              → {activeScripts[activeTab.script]}
                            </span>
                          )}
                        </div>

                        {/* Expected Services */}
                        {scriptInfo.expectedServices && (
                          <div className="text-[10px] text-[#8CA9CF] flex items-center gap-1 shrink-0 bg-[#272D38] px-2 py-0.5 rounded border border-[#303642] hidden md:flex">
                            <span>⚡</span>
                            <span className="font-mono text-[#A5ADBA] truncate max-w-xs">{scriptInfo.expectedServices}</span>
                          </div>
                        )}
                      </div>

                      {/* Right: Quick Run or Stop action */}
                      <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                        {!isRunning ? (
                          <button
                            onClick={() => handleStart(activeTab.script)}
                            disabled={actionLoading}
                            className="px-2.5 py-1 rounded text-xs font-semibold text-[#101216] bg-[#8CA9CF] hover:bg-[#A6BDE0] disabled:opacity-50 transition cursor-pointer flex items-center gap-1 shadow-xs shrink-0"
                            title="Execute this script directly in the project directory"
                          >
                            <span>▶</span>
                            <span>Run Directly ({activeTab.script})</span>
                          </button>
                        ) : (
                          <button
                            onClick={handleStop}
                            disabled={actionLoading}
                            className="px-2.5 py-1 rounded text-xs font-semibold text-[#101216] bg-[#E18B8B] hover:bg-[#e89d9d] disabled:opacity-50 transition cursor-pointer flex items-center gap-1 shadow-xs"
                            title="Stop running process"
                          >
                            <span>⏹</span>
                            <span>Stop</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          ) : (
            /* Custom Command Input with Quick Command Presets */
            <div className="space-y-2.5">
              {/* Quick Preset Commands Bar */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-[#7C8594] font-medium shrink-0 flex items-center gap-1">
                  <span>⚡</span>
                  <span>Quick Run:</span>
                </span>
                {[
                  { label: "⚡ dev", cmd: `${activeProject?.packageManager || "npm"} run dev` },
                  { label: "🔨 build", cmd: `${activeProject?.packageManager || "npm"} run build` },
                  { label: "🧪 test", cmd: `${activeProject?.packageManager || "npm"} test` },
                  { label: "⎇ git status", cmd: "git status" },
                  { label: "📜 git log", cmd: "git log --oneline -n 5" },
                  { label: "⬇️ git pull", cmd: "git pull" },
                  { label: "📦 install", cmd: `${activeProject?.packageManager || "npm"} install` },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      updateActiveTab({ customCommand: preset.cmd });
                      if (!isRunning && activeTab?.projectId) {
                        handleStart(undefined, preset.cmd);
                      }
                    }}
                    disabled={isRunning || !activeTab?.projectId}
                    className="px-2 py-0.5 rounded text-[11px] font-mono bg-[#1D2129] hover:bg-[#35465E] text-[#8CA9CF] border border-[#303642] hover:border-[#8CA9CF]/60 transition cursor-pointer disabled:opacity-50"
                    title={`Click to execute "${preset.cmd}" directly in project directory`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Command Input with Run Directly button */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-[#8CA9CF] font-bold">&gt;_</span>
                <input
                  type="text"
                  value={activeTab?.customCommand || ""}
                  onChange={(e) => updateActiveTab({ customCommand: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !isRunning) {
                      handleStart();
                    }
                  }}
                  disabled={isRunning}
                  placeholder="Enter command to execute in project directory (e.g. pnpm run dev, pnpm test, git status, git pull)..."
                  className="flex-1 px-3 py-1.5 rounded-md bg-[#272D38] border border-[#303642] text-[#E8EBF1] placeholder-[#7C8594] text-xs font-mono focus:outline-none focus:border-[#8CA9CF] disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => handleStart()}
                  disabled={actionLoading || isRunning || !activeTab?.customCommand?.trim()}
                  className="px-3 py-1.5 rounded-md text-xs font-semibold text-[#101216] bg-[#8CA9CF] hover:bg-[#A6BDE0] disabled:opacity-50 transition cursor-pointer flex items-center gap-1 shadow-xs shrink-0"
                  title="Execute this command directly in the project directory"
                >
                  <span>▶</span>
                  <span>Run Directly</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Error message banner */}
      {errorMessage && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-[rgba(225,139,139,0.15)] border border-[#E18B8B]/40 text-xs text-[#E18B8B] mb-3 shrink-0">
          <span>{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-[#E18B8B] hover:text-[#e89d9d] text-sm font-bold ml-2 cursor-pointer"
          >
            ×
          </button>
        </div>
      )}

      {/* 4. Terminal Output Window */}
      <div className="flex-1 min-h-0 flex flex-col rounded-lg bg-[#101216] border border-[#303642] shadow-xl overflow-hidden relative">
        {/* Terminal Title Bar */}
        <div className="flex items-center justify-between px-3 py-2 bg-[#171A20] border-b border-[#303642] text-[11px] text-[#A5ADBA] shrink-0">
          <div className="flex items-center gap-2 truncate">
            <span className="w-2.5 h-2.5 rounded-full bg-[#E18B8B]/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#E0B36D]/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#77B58A]/80 inline-block" />
            <span className="font-mono text-[#E8EBF1] font-medium truncate ml-1">
              {activeTab?.title || "Terminal"}
            </span>
            {activeProject && (
              <span className="font-mono text-[#7C8594] text-[10px] truncate hidden md:inline" title={activeProject.path}>
                — {activeProject.path}
              </span>
            )}
            {activeProcess?.command && (
              <span className="font-mono text-[#7C8594] truncate hidden lg:inline">
                ({activeProcess.command})
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {/* Direct Stop / Rerun buttons right inside the Terminal Window */}
            {isRunning ? (
              <button
                onClick={handleStop}
                disabled={actionLoading}
                className="px-2.5 py-0.5 rounded text-[11px] font-semibold bg-[#E18B8B] hover:bg-[#e89d9d] text-[#101216] transition cursor-pointer flex items-center gap-1 shadow-xs"
                title="Stop current running process"
              >
                <span>⏹</span>
                <span>Stop Process</span>
              </button>
            ) : activeTab?.status === "failed" || activeTab?.status === "stopped" ? (
              <button
                onClick={() => handleStart()}
                disabled={actionLoading || !activeTab?.projectId}
                className="px-2.5 py-0.5 rounded text-[11px] font-medium bg-[#8CA9CF]/20 text-[#8CA9CF] border border-[#8CA9CF]/40 hover:bg-[#8CA9CF]/30 transition cursor-pointer flex items-center gap-1"
                title="Rerun script"
              >
                <span>↻</span>
                <span>Rerun</span>
              </button>
            ) : null}

            {/* Status pill */}
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium ${
                isRunning
                  ? "bg-[#77B58A]/15 text-[#77B58A] border border-[#77B58A]/35"
                  : activeTab?.status === "failed"
                  ? "bg-[#E18B8B]/15 text-[#E18B8B] border border-[#E18B8B]/35"
                  : "bg-[#272D38] text-[#A5ADBA] border border-[#303642]"
              }`}
            >
              <span>●</span>
              <span className="uppercase">{activeTab?.status || "idle"}</span>
              {activeProcess?.pid && <span>(PID: {activeProcess.pid})</span>}
            </span>

            {/* Line count */}
            <span className="text-[#7C8594] font-mono text-[10px]">
              {activeTab?.logs.length || 0} lines
            </span>

            {/* Copy Output Button */}
            <button
              onClick={handleCopyOutput}
              disabled={!activeTab || activeTab.logs.length === 0}
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium transition cursor-pointer flex items-center gap-1 ${
                copiedOutput
                  ? "bg-[#77B58A]/20 text-[#77B58A] border border-[#77B58A]/50"
                  : "bg-[#272D38] hover:bg-[#303642] text-[#E8EBF1] border border-[#303642]"
              } disabled:opacity-40 disabled:cursor-not-allowed`}
              title="Copy all output logs to clipboard (clean text, no ANSI codes)"
            >
              <span>{copiedOutput ? "✓" : "📋"}</span>
              <span>{copiedOutput ? "Copied!" : "Copy Output"}</span>
            </button>

            {/* Auto-scroll toggle */}
            <button
              onClick={() => updateActiveTab({ autoScroll: !activeTab?.autoScroll })}
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded transition cursor-pointer ${
                activeTab?.autoScroll
                  ? "text-[#E8EBF1] bg-[#272D38] border border-[#303642]"
                  : "text-[#7C8594] hover:text-[#E8EBF1]"
              }`}
              title="Toggle automatic scrolling to latest log output"
            >
              Scroll: {activeTab?.autoScroll ? "ON" : "OFF"}
            </button>
          </div>
        </div>

        {/* Live Execution & Detected Services Bar */}
        {(() => {
          const detectedServices = extractDetectedServices(
            activeTab?.logs || [],
            activeProcess?.ports
          );
          const hasActiveInfo =
            activeProcess || isRunning || (activeTab && activeTab.logs.length > 0);

          if (!hasActiveInfo) return null;

          return (
            <div className="flex flex-col gap-1 px-3 py-1.5 bg-[#171A20]/95 border-b border-[#303642] text-[11px] font-mono text-[#A5ADBA] shrink-0">
              {/* Row 1: Executing status */}
              <div className="flex items-center justify-between gap-2 min-w-0">
                <div className="flex items-center gap-2 truncate min-w-0">
                  <span className="text-[#7C8594] text-[10px] uppercase font-sans font-semibold shrink-0">
                    Executing:
                  </span>
                  <span className="text-[#8CA9CF] font-semibold truncate">
                    {activeProcess?.command ||
                      (activeTab?.script
                        ? `${activeProject?.packageManager || "npm"} run ${activeTab.script}`
                        : activeTab?.customCommand || "Terminal Session")}
                  </span>
                  {activeProcess?.startedAt && (
                    <span className="text-[#7C8594] text-[10px] hidden md:inline shrink-0">
                      (started {new Date(activeProcess.startedAt).toLocaleTimeString()})
                    </span>
                  )}
                </div>

                {detectedServices.length > 0 && (
                  <div className="flex items-center gap-1.5 text-[10px] text-[#7C8594] shrink-0">
                    <span>{detectedServices.length} service{detectedServices.length > 1 ? "s" : ""} live</span>
                  </div>
                )}
              </div>

              {/* Row 2: Detected Services Single-Line Horizontally Scrollable Track */}
              {detectedServices.length > 0 && (
                <div className="flex items-center gap-2 min-w-0 w-full pt-1 border-t border-[#303642]/40">
                  <div className="flex items-center gap-1.5 shrink-0 select-none">
                    <span className="text-[10px] text-[#7C8594] uppercase font-sans font-semibold whitespace-nowrap">
                      Services:
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-[#272D38] text-[#8CA9CF] border border-[#303642]">
                      {detectedServices.length}
                    </span>
                  </div>

                  {/* Horizontally scrollable services container */}
                  <div className="relative flex-1 min-w-0 flex items-center group">
                    {canScrollServicesLeft && (
                      <button
                        type="button"
                        onClick={() => scrollServices("left")}
                        className="absolute left-0 z-10 w-5 h-5 rounded-full bg-[#171A20]/95 hover:bg-[#272D38] text-[#8CA9CF] border border-[#303642] flex items-center justify-center text-xs shadow-md transition cursor-pointer"
                        title="Scroll services left"
                      >
                        ‹
                      </button>
                    )}

                    <div
                      ref={servicesScrollRef}
                      className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth py-0.5 w-full"
                    >
                      {detectedServices.map((svc) => (
                        <div
                          key={svc.url}
                          className="inline-flex items-center rounded-md bg-[#272D38] border border-[#303642] hover:border-[#8CA9CF]/60 shadow-xs shrink-0 whitespace-nowrap overflow-hidden transition group/svc"
                        >
                          {/* Main Button: Open in Default Web Browser */}
                          <button
                            type="button"
                            onClick={() => openExternalUrl(svc.url)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono font-medium text-[#8CA9CF] hover:text-[#E8EBF1] hover:bg-[#35465E]/60 transition cursor-pointer"
                            title={`Click to open ${svc.url} in your default web browser`}
                          >
                            <span>🌐</span>
                            <span>{svc.label}</span>
                            <span className="text-[10px] text-[#7C8594] group-hover/svc:text-[#8CA9CF]">↗</span>
                          </button>

                          {/* In-App Web Preview Button */}
                          <button
                            type="button"
                            onClick={() => handleOpenPreview(svc.url)}
                            className="px-1.5 py-1 text-[10px] font-mono text-[#7C8594] hover:text-[#8CA9CF] hover:bg-[#35465E]/60 border-l border-[#303642] transition cursor-pointer"
                            title={`Preview ${svc.url} inside DevDesk`}
                          >
                            👁️
                          </button>

                          {/* Copy URL Button */}
                          <button
                            type="button"
                            onClick={() => handleCopyUrl(svc.url)}
                            className="px-1.5 py-1 text-[10px] font-mono text-[#7C8594] hover:text-[#77B58A] hover:bg-[#35465E]/60 border-l border-[#303642] transition cursor-pointer"
                            title={`Copy ${svc.url} to clipboard`}
                          >
                            {copiedUrl === svc.url ? "✓" : "📋"}
                          </button>
                        </div>
                      ))}
                    </div>

                    {canScrollServicesRight && (
                      <button
                        type="button"
                        onClick={() => scrollServices("right")}
                        className="absolute right-0 z-10 w-5 h-5 rounded-full bg-[#171A20]/95 hover:bg-[#272D38] text-[#8CA9CF] border border-[#303642] flex items-center justify-center text-xs shadow-md transition cursor-pointer"
                        title="Scroll services right"
                      >
                        ›
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Terminal Sub-Toolbar: Stream Filters, Search, Display Toggles */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-[#171A20] border-b border-[#303642] text-[11px] shrink-0">
          {/* Left: Stream Filter Tabs */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-[#7C8594] uppercase font-sans font-semibold mr-1">
              Stream:
            </span>
            <button
              onClick={() => setStreamFilter("all")}
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium transition cursor-pointer ${
                streamFilter === "all"
                  ? "bg-[#8CA9CF]/20 text-[#8CA9CF] border border-[#8CA9CF]/50"
                  : "bg-[#272D38] text-[#7C8594] hover:text-[#E8EBF1] border border-transparent"
              }`}
            >
              All ({totalLogsCount})
            </button>
            <button
              onClick={() => setStreamFilter("stderr")}
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium transition cursor-pointer flex items-center gap-1 ${
                streamFilter === "stderr"
                  ? "bg-[#E18B8B]/25 text-[#E18B8B] border border-[#E18B8B]/50 font-bold"
                  : errorCount > 0
                  ? "bg-[#E18B8B]/10 text-[#E18B8B] border border-[#E18B8B]/30 hover:bg-[#E18B8B]/20"
                  : "bg-[#272D38] text-[#7C8594] hover:text-[#E8EBF1] border border-transparent"
              }`}
              title="Filter standard error logs"
            >
              {errorCount > 0 && <span className="w-1.5 h-1.5 rounded-full bg-[#E18B8B] animate-pulse" />}
              <span>Errors ({errorCount})</span>
            </button>
            <button
              onClick={() => setStreamFilter("stdout")}
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium transition cursor-pointer ${
                streamFilter === "stdout"
                  ? "bg-[#8CA9CF]/20 text-[#8CA9CF] border border-[#8CA9CF]/50"
                  : "bg-[#272D38] text-[#7C8594] hover:text-[#E8EBF1] border border-transparent"
              }`}
              title="Filter standard output logs"
            >
              Stdout ({stdoutCount})
            </button>
            <button
              onClick={() => setStreamFilter("system")}
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium transition cursor-pointer ${
                streamFilter === "system"
                  ? "bg-[#8CA9CF]/20 text-[#8CA9CF] border border-[#8CA9CF]/50"
                  : "bg-[#272D38] text-[#7C8594] hover:text-[#E8EBF1] border border-transparent"
              }`}
              title="Filter DevDesk system messages"
            >
              System ({systemCount})
            </button>
          </div>

          {/* Center/Right: Live Search Input */}
          <div className="flex items-center gap-2 flex-1 max-w-xs min-w-[180px]">
            <div className="relative w-full flex items-center">
              <span className="absolute left-2 text-[#7C8594] text-[10px] select-none">🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter logs..."
                className="w-full pl-6 pr-6 py-0.5 rounded bg-[#272D38] border border-[#303642] text-[#E8EBF1] placeholder-[#7C8594] text-[11px] font-mono focus:outline-none focus:border-[#8CA9CF]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 text-[#7C8594] hover:text-[#E8EBF1] text-xs cursor-pointer"
                  title="Clear search"
                >
                  ×
                </button>
              )}
            </div>
            {searchQuery && (
              <span className="text-[10px] font-mono text-[#8CA9CF] whitespace-nowrap shrink-0">
                {filteredLogs.length} found
              </span>
            )}
          </div>

          {/* Right: Quick actions: Line wrap, Scroll Top/Bottom, Clear */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setWrapLines(!wrapLines)}
              className={`px-2 py-0.5 rounded text-[10px] font-mono transition cursor-pointer ${
                wrapLines
                  ? "bg-[#272D38] text-[#E8EBF1] border border-[#303642]"
                  : "bg-[#1D2129] text-[#7C8594] hover:text-[#E8EBF1] border border-[#303642]"
              }`}
              title="Toggle line wrapping"
            >
              Wrap: {wrapLines ? "ON" : "OFF"}
            </button>
            <button
              onClick={scrollToTop}
              className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#272D38] hover:bg-[#303642] text-[#A5ADBA] hover:text-[#E8EBF1] border border-[#303642] transition cursor-pointer"
              title="Scroll to top of logs"
            >
              Top ↑
            </button>
            <button
              onClick={scrollToBottom}
              className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#272D38] hover:bg-[#303642] text-[#A5ADBA] hover:text-[#E8EBF1] border border-[#303642] transition cursor-pointer"
              title="Scroll to bottom of logs"
            >
              Bottom ↓
            </button>
            <button
              onClick={handleClearLogs}
              disabled={!activeTab || activeTab.logs.length === 0}
              className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#272D38] hover:bg-[#E18B8B]/20 text-[#A5ADBA] hover:text-[#E18B8B] border border-[#303642] hover:border-[#E18B8B]/40 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="Clear terminal buffer for this tab"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Terminal Logs Area */}
        <div
          ref={terminalScrollRef}
          onScroll={handleTerminalScroll}
          className="flex-1 p-4 overflow-y-auto font-mono text-xs leading-relaxed select-text"
        >
          {activeTab && activeTab.logs.length > 0 ? (
            filteredLogs.length > 0 ? (
              <div className="space-y-0.5">
                {filteredLogs.map((log) => {
                  const isErr = log.stream === "stderr";
                  const isSys = log.stream === "system";

                  return (
                    <div key={log.id} className="flex items-start gap-2 group hover:bg-[#1D2129]/60 px-1 rounded">
                      <span className="text-[#7C8594] select-none text-[10px] shrink-0 w-16 text-right">
                        {new Date(log.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </span>
                      <span
                        className={`text-[10px] select-none shrink-0 uppercase px-1 rounded ${
                          isSys
                            ? "text-[#8CA9CF] bg-[rgba(140,169,207,0.12)]"
                            : isErr
                            ? "text-[#E18B8B] bg-[rgba(225,139,139,0.12)]"
                            : "text-[#7C8594]"
                        }`}
                      >
                        {log.stream}
                      </span>
                      <span
                        className={`${
                          wrapLines ? "whitespace-pre-wrap break-all" : "whitespace-pre overflow-x-auto"
                        } flex-1 ${
                          isSys
                            ? "text-[#8CA9CF] font-semibold"
                            : isErr
                            ? "text-[#E18B8B]"
                            : "text-[#E8EBF1]"
                        }`}
                      >
                        {renderLogMessage(log.message)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center text-[#7C8594] select-none py-12">
                <span className="text-xl mb-1">🔍</span>
                <p className="text-sm font-medium text-[#A5ADBA]">No matching logs</p>
                <p className="text-xs text-[#7C8594] mt-1">
                  No log entries matched stream: <strong className="text-[#E8EBF1]">{streamFilter}</strong>
                  {searchQuery && <> and query: <strong className="text-[#8CA9CF]">"{searchQuery}"</strong></>}
                </p>
                <button
                  onClick={() => {
                    setStreamFilter("all");
                    setSearchQuery("");
                  }}
                  className="mt-3 px-2.5 py-1 rounded text-xs bg-[#272D38] hover:bg-[#303642] text-[#8CA9CF] border border-[#303642] transition cursor-pointer"
                >
                  Reset Filters
                </button>
              </div>
            )
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center text-[#7C8594] select-none">
              <span className="font-mono text-3xl mb-2 text-[#303642]">&gt;_</span>
              <p className="text-sm font-medium text-[#A5ADBA]">Terminal Ready</p>
              <p className="text-xs text-[#7C8594] mt-1 max-w-sm">
                Select a script from above or click <strong className="text-[#E8EBF1]">Start</strong> to launch, or enter a custom command.
              </p>
              <p className="text-[11px] text-[#7C8594]/80 mt-2">
                Click any script to inspect what it does, or double-click to execute immediately.
              </p>
            </div>
          )}
        </div>

        {/* Scroll to bottom floating button */}
        {showScrollBottomBtn && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-4 right-6 px-3 py-1.5 rounded-full bg-[#272D38] hover:bg-[#35465E] text-[#E8EBF1] text-xs font-sans shadow-lg border border-[#303642] flex items-center gap-1.5 transition cursor-pointer"
          >
            <span>↓</span>
            <span>Jump to Bottom</span>
          </button>
        )}
      </div>

      {/* 5. In-App Web Preview Modal / Drawer */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-3 sm:p-5 animate-in fade-in duration-150">
          <div
            className="flex flex-col bg-[#171A20] border border-[#303642] rounded-xl shadow-2xl overflow-hidden transition-all duration-200"
            style={{
              width:
                previewViewport === "mobile"
                  ? "400px"
                  : previewViewport === "tablet"
                  ? "800px"
                  : "min(1280px, 95vw)",
              height: "min(880px, 92vh)",
            }}
          >
            {/* Preview Window Header & Address Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-[#1D2129] border-b border-[#303642] shrink-0 text-xs">
              <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                {/* Traffic dots */}
                <div className="flex items-center gap-1.5 mr-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#E18B8B]/80 inline-block" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[#E0B36D]/80 inline-block" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[#77B58A]/80 inline-block" />
                </div>

                {/* Reload Button */}
                <button
                  type="button"
                  onClick={() => setPreviewKey((k) => k + 1)}
                  className="p-1 px-1.5 rounded bg-[#272D38] hover:bg-[#35465E] text-[#A5ADBA] hover:text-[#E8EBF1] border border-[#303642] transition cursor-pointer text-xs"
                  title="Reload preview"
                >
                  ↻
                </button>

                {/* Interactive Address Bar */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (previewInputUrl.trim()) {
                      let u = previewInputUrl.trim();
                      if (!u.startsWith("http://") && !u.startsWith("https://")) {
                        u = `http://${u}`;
                      }
                      setPreviewUrl(u);
                      setPreviewInputUrl(u);
                      setPreviewKey((k) => k + 1);
                    }
                  }}
                  className="flex-1 flex items-center min-w-0"
                >
                  <div className="relative w-full flex items-center">
                    <span className="absolute left-2.5 text-[#7C8594] text-[11px] select-none">🌐</span>
                    <input
                      type="text"
                      value={previewInputUrl}
                      onChange={(e) => setPreviewInputUrl(e.target.value)}
                      placeholder="http://localhost:3000..."
                      className="w-full pl-7 pr-16 py-1 rounded-md bg-[#101216] border border-[#303642] text-[#E8EBF1] text-xs font-mono focus:outline-none focus:border-[#8CA9CF]"
                    />
                    <span className="absolute right-2 text-[10px] text-[#7C8594] font-sans">
                      Enter ↵
                    </span>
                  </div>
                </form>
              </div>

              {/* Viewport switchers & Actions */}
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Viewport switchers */}
                <div className="inline-flex rounded-md border border-[#303642] bg-[#101216] p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setPreviewViewport("desktop")}
                    className={`px-2 py-0.5 rounded transition cursor-pointer ${
                      previewViewport === "desktop"
                        ? "bg-[#272D38] text-[#E8EBF1] font-semibold"
                        : "text-[#7C8594] hover:text-[#A5ADBA]"
                    }`}
                    title="Desktop View (100%)"
                  >
                    🖥️ Full
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewViewport("tablet")}
                    className={`px-2 py-0.5 rounded transition cursor-pointer ${
                      previewViewport === "tablet"
                        ? "bg-[#272D38] text-[#E8EBF1] font-semibold"
                        : "text-[#7C8594] hover:text-[#A5ADBA]"
                    }`}
                    title="Tablet View (800px)"
                  >
                    📱 Tablet
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewViewport("mobile")}
                    className={`px-2 py-0.5 rounded transition cursor-pointer ${
                      previewViewport === "mobile"
                        ? "bg-[#272D38] text-[#E8EBF1] font-semibold"
                        : "text-[#7C8594] hover:text-[#A5ADBA]"
                    }`}
                    title="Mobile View (400px)"
                  >
                    📱 Mobile
                  </button>
                </div>

                {/* Open in Default Web Browser Button */}
                <button
                  type="button"
                  onClick={() => openExternalUrl(previewUrl)}
                  className="px-2.5 py-1 rounded bg-[#35465E] hover:bg-[#8CA9CF] text-[#8CA9CF] hover:text-[#101216] border border-[#8CA9CF]/40 text-xs font-medium transition cursor-pointer flex items-center gap-1 shadow-xs"
                  title="Open this link in your default web browser"
                >
                  <span>Open in Browser</span>
                  <span>↗</span>
                </button>

                {/* Copy URL */}
                <button
                  type="button"
                  onClick={() => handleCopyUrl(previewUrl)}
                  className="px-2 py-1 rounded bg-[#272D38] hover:bg-[#303642] text-[#A5ADBA] hover:text-[#E8EBF1] border border-[#303642] text-xs transition cursor-pointer"
                  title="Copy URL"
                >
                  {copiedUrl === previewUrl ? "✓ Copied" : "📋 Copy"}
                </button>

                {/* Close Button */}
                <button
                  type="button"
                  onClick={() => setPreviewUrl(null)}
                  className="w-6 h-6 rounded flex items-center justify-center text-[#7C8594] hover:text-[#E8EBF1] hover:bg-[#272D38] transition text-base font-bold cursor-pointer ml-1"
                  title="Close preview"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Preview Frame Container */}
            <div className="flex-1 bg-[#101216] flex items-center justify-center overflow-hidden relative">
              <iframe
                key={previewKey}
                src={previewUrl}
                title="Service Preview"
                className="w-full h-full bg-white border-0"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
              />
            </div>

            {/* Bottom info strip */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-[#171A20] border-t border-[#303642] text-[10px] text-[#7C8594]">
              <span>Active URL: <strong className="text-[#A5ADBA] font-mono">{previewUrl}</strong></span>
              <span>Tip: If a service restricts iframe embedding (X-Frame-Options), click <strong>Open in Browser ↗</strong>.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
