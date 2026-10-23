"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  createEnvFile,
  fetchEnvFiles,
  fetchWorkspaceProjectsWithEnv,
  readEnvFile,
  saveEnvFile,
} from "@/services/env-editor";
import { WorkspaceWithProjects } from "@/types/project";
import { EnvFileMetadata, EnvVariableEntry } from "@/types/env-editor";

const SUPPORTED_ENV_FILES = [
  ".env",
  ".env.local",
  ".env.development",
  ".env.development.local",
  ".env.production",
  ".env.production.local",
  ".env.test",
] as const;

const KEY_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

export interface EnvEditorPaneProps {
  tabId: string;
  tabTitle?: string;
  initialWorkspaceId?: string;
  initialProjectId?: string;
  initialFilename?: string;
  workspaces: WorkspaceWithProjects[];
  loadingWorkspaces: boolean;
  isActivePane: boolean;
  isSplit?: boolean;
  onDirtyChange: (tabId: string, isDirty: boolean) => void;
  onMetaChange: (
    tabId: string,
    meta: {
      title: string;
      workspaceId: string;
      projectId: string;
      projectName: string;
      filename: string;
    }
  ) => void;
}

export function EnvEditorPane({
  tabId,
  tabTitle,
  initialWorkspaceId,
  initialProjectId,
  initialFilename,
  workspaces,
  loadingWorkspaces,
  isActivePane,
  isSplit,
  onDirtyChange,
  onMetaChange,
}: EnvEditorPaneProps) {
  const baseId = useId();
  const isMountedRef = useRef<boolean>(true);

  // Workspace & Project Selection
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>(
    initialWorkspaceId || ""
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    initialProjectId || ""
  );

  // Projects with .env filter
  const [projectsWithEnv, setProjectsWithEnv] = useState<string[]>([]);
  const [onlyProjectsWithEnv, setOnlyProjectsWithEnv] = useState<boolean>(true);

  // Files & Content State
  const [envFiles, setEnvFiles] = useState<EnvFileMetadata[]>([]);
  const [selectedFilename, setSelectedFilename] = useState<string>(
    initialFilename || ".env"
  );
  const [variables, setVariables] = useState<EnvVariableEntry[]>([]);
  const [rawContent, setRawContent] = useState<string>("");
  const [lastModifiedOnDisk, setLastModifiedOnDisk] = useState<string | null>(null);
  const [fileSizeBytes, setFileSizeBytes] = useState<number>(0);
  const [hasSyntaxWarnings, setHasSyntaxWarnings] = useState<boolean>(false);

  // Snapshot for dirty checking
  const [initialVariablesSnapshot, setInitialVariablesSnapshot] = useState<string>("[]");
  const [initialRawSnapshot, setInitialRawSnapshot] = useState<string>("");
  const [isDirty, setIsDirty] = useState<boolean>(false);

  // Editor View Mode
  const [viewMode, setViewMode] = useState<"structured" | "raw">("structured");
  const [searchFilter, setSearchFilter] = useState<string>("");

  // Sensitive Value Masking State (Set of variable IDs explicitly revealed)
  const [revealedVarIds, setRevealedVarIds] = useState<Set<string>>(new Set());

  // Inline New Variable Form
  const [newKey, setNewKey] = useState<string>("");
  const [newValue, setNewValue] = useState<string>("");
  const [newComment, setNewComment] = useState<string>("");
  const [newKeyError, setNewKeyError] = useState<string | null>(null);

  // Modal States
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [targetCreateFilename, setTargetCreateFilename] = useState<string>(".env");
  const [showSaveConfirmModal, setShowSaveConfirmModal] = useState<boolean>(false);
  const [showConflictModal, setShowConflictModal] = useState<boolean>(false);
  const [conflictErrorMessage, setConflictErrorMessage] = useState<string>("");

  // Loading & Feedback
  const [loadingFiles, setLoadingFiles] = useState<boolean>(false);
  const [loadingContent, setLoadingContent] = useState<boolean>(false);
  const [savingFile, setSavingFile] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [copiedPath, setCopiedPath] = useState<boolean>(false);

  // Sync dirty flag with parent tab manager
  useEffect(() => {
    onDirtyChange(tabId, isDirty);
  }, [tabId, isDirty, onDirtyChange]);

  // Handle Workspace reconciliation when workspaces change
  useEffect(() => {
    if (workspaces.length === 0) return;

    if (!selectedWorkspaceId || !workspaces.some((w) => w.id === selectedWorkspaceId)) {
      const fallbackWs = workspaces[0];
      setSelectedWorkspaceId(fallbackWs.id);
      if (fallbackWs.projects.length > 0 && !selectedProjectId) {
        setSelectedProjectId(fallbackWs.projects[0].id);
      }
    }
  }, [workspaces, selectedWorkspaceId, selectedProjectId]);

  // Load projects with .env files whenever workspace changes
  useEffect(() => {
    if (!selectedWorkspaceId) {
      setProjectsWithEnv([]);
      return;
    }

    let isEffectMounted = true;
    async function loadEnvProjects() {
      try {
        const ids = await fetchWorkspaceProjectsWithEnv(selectedWorkspaceId);
        if (!isEffectMounted) return;
        setProjectsWithEnv(ids);

        // If currently selected project is not among projects with env and onlyProjectsWithEnv is active,
        // automatically select the first project that has an .env file
        if (ids.length > 0) {
          setSelectedProjectId((prev) => {
            if (prev && ids.includes(prev)) return prev;
            return ids[0];
          });
        }
      } catch {
        // ignore
      }
    }

    loadEnvProjects();
    return () => {
      isEffectMounted = false;
    };
  }, [selectedWorkspaceId]);

  const activeWorkspace =
    workspaces.find((w) => w.id === selectedWorkspaceId) || null;
  const availableProjects = activeWorkspace?.projects || [];
  const activeProject =
    availableProjects.find((p) => p.id === selectedProjectId) || null;

  // Validate project belongs to active workspace
  useEffect(() => {
    if (activeWorkspace && activeWorkspace.projects.length > 0) {
      if (
        selectedProjectId &&
        !activeWorkspace.projects.some((p) => p.id === selectedProjectId)
      ) {
        setSelectedProjectId(activeWorkspace.projects[0].id);
      }
    } else {
      setSelectedProjectId("");
    }
  }, [selectedWorkspaceId, activeWorkspace, selectedProjectId]);

  // Inform parent about meta changes (title, project, workspace, filename)
  useEffect(() => {
    if (!activeProject) return;
    const projLabel = activeProject.displayName || activeProject.name;
    const title = `${projLabel} › ${selectedFilename}`;
    onMetaChange(tabId, {
      title,
      workspaceId: selectedWorkspaceId,
      projectId: selectedProjectId,
      projectName: activeProject.name,
      filename: selectedFilename,
    });
  }, [
    tabId,
    selectedWorkspaceId,
    selectedProjectId,
    selectedFilename,
    activeProject,
    onMetaChange,
  ]);

  // Load Supported Env Files when Selected Project Changes
  useEffect(() => {
    if (!selectedProjectId) {
      setEnvFiles([]);
      setVariables([]);
      setRawContent("");
      setIsDirty(false);
      return;
    }

    loadFilesForProject(selectedProjectId, selectedFilename);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId]);

  async function loadFilesForProject(
    projectId: string,
    preferredFileToSelect?: string
  ) {
    try {
      setLoadingFiles(true);
      setErrorMessage(null);

      const result = await fetchEnvFiles(projectId);
      if (!isMountedRef.current) return;

      setEnvFiles(result.files);

      // Determine which file to select
      let fileToSelect: string | null = null;
      if (
        preferredFileToSelect &&
        result.files.some((f) => f.filename === preferredFileToSelect && f.exists)
      ) {
        fileToSelect = preferredFileToSelect;
      } else {
        const firstExisting = result.files.find((f) => f.exists);
        fileToSelect = firstExisting
          ? firstExisting.filename
          : result.files[0]?.filename || ".env";
      }

      setSelectedFilename(fileToSelect);

      const targetFileObj = result.files.find((f) => f.filename === fileToSelect);
      if (targetFileObj && targetFileObj.exists) {
        await loadFileContent(projectId, fileToSelect);
      } else {
        setVariables([]);
        setRawContent("");
        setLastModifiedOnDisk(null);
        setFileSizeBytes(0);
        setInitialVariablesSnapshot("[]");
        setInitialRawSnapshot("");
        setIsDirty(false);
      }
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to load environment files."
      );
    } finally {
      if (isMountedRef.current) {
        setLoadingFiles(false);
      }
    }
  }

  // Load File Content
  async function loadFileContent(projectId: string, filename: string) {
    try {
      setLoadingContent(true);
      setErrorMessage(null);

      const result = await readEnvFile(projectId, filename);
      if (!isMountedRef.current) return;

      setVariables(result.variables);
      setRawContent(result.content);
      setLastModifiedOnDisk(result.lastModified);
      setFileSizeBytes(result.sizeBytes);

      const hasUnstructured = result.lines.some((l) => l.type === "raw");
      setHasSyntaxWarnings(hasUnstructured);

      const varSnapshot = JSON.stringify(result.variables);
      setInitialVariablesSnapshot(varSnapshot);
      setInitialRawSnapshot(result.content);
      setIsDirty(false);
      setRevealedVarIds(new Set());
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      setErrorMessage(
        err instanceof Error
          ? err.message
          : `Failed to read environment file "${filename}".`
      );
    } finally {
      if (isMountedRef.current) {
        setLoadingContent(false);
      }
    }
  }

  // Handle switching file
  function handleSelectFile(filename: string) {
    if (filename === selectedFilename) return;

    if (isDirty) {
      const confirmSwitch = window.confirm(
        `You have unsaved changes in "${selectedFilename}". Discard changes and switch to "${filename}"?`
      );
      if (!confirmSwitch) return;
    }

    setSelectedFilename(filename);
    const targetFile = envFiles.find((f) => f.filename === filename);
    if (targetFile && targetFile.exists && selectedProjectId) {
      loadFileContent(selectedProjectId, filename);
    } else {
      setVariables([]);
      setRawContent("");
      setLastModifiedOnDisk(null);
      setFileSizeBytes(0);
      setInitialVariablesSnapshot("[]");
      setInitialRawSnapshot("");
      setIsDirty(false);
    }
  }

  // Variable Actions
  function handleAddVariable() {
    setNewKeyError(null);
    const trimmedKey = newKey.trim();

    if (!trimmedKey) {
      setNewKeyError("Variable key is required.");
      return;
    }

    if (!KEY_REGEX.test(trimmedKey)) {
      setNewKeyError(
        "Invalid key. Must start with a letter or underscore and contain only alphanumeric characters and underscores."
      );
      return;
    }

    if (variables.some((v) => v.key === trimmedKey)) {
      setNewKeyError(`Variable "${trimmedKey}" already exists.`);
      return;
    }

    const newEntry: EnvVariableEntry = {
      id: `var-${Date.now()}-${trimmedKey}`,
      key: trimmedKey,
      value: newValue,
      comment: newComment.trim() || undefined,
      isSecret: /(SECRET|PASSWORD|PASS|TOKEN|API_KEY|PRIVATE_KEY|CREDENTIAL|AUTH|KEY)/i.test(
        trimmedKey
      ),
    };

    const updated = [...variables, newEntry];
    setVariables(updated);
    setIsDirty(true);

    setNewKey("");
    setNewValue("");
    setNewComment("");
  }

  function handleEditValue(id: string, value: string) {
    setVariables((prev) =>
      prev.map((v) => (v.id === id ? { ...v, value } : v))
    );
    setIsDirty(true);
  }

  function handleEditComment(id: string, comment: string) {
    setVariables((prev) =>
      prev.map((v) => (v.id === id ? { ...v, comment: comment || undefined } : v))
    );
    setIsDirty(true);
  }

  function handleRemoveVariable(id: string) {
    setVariables((prev) => prev.filter((v) => v.id !== id));
    setIsDirty(true);
  }

  function toggleReveal(id: string) {
    setRevealedVarIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleDiscardChanges() {
    if (viewMode === "structured") {
      try {
        const restored: EnvVariableEntry[] = JSON.parse(initialVariablesSnapshot);
        setVariables(restored);
      } catch {
        // fallback
      }
    } else {
      setRawContent(initialRawSnapshot);
    }
    setIsDirty(false);
  }

  // Create New Supported File
  async function handleCreateFile() {
    if (!selectedProjectId) return;
    try {
      setSavingFile(true);
      setErrorMessage(null);

      await createEnvFile(selectedProjectId, targetCreateFilename);
      setShowCreateModal(false);
      setSuccessMessage(`File "${targetCreateFilename}" created successfully.`);

      await loadFilesForProject(selectedProjectId, targetCreateFilename);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : `Failed to create file "${targetCreateFilename}".`
      );
    } finally {
      setSavingFile(false);
    }
  }

  // Save File
  async function handleExecuteSave() {
    if (!selectedProjectId) return;
    try {
      setSavingFile(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      const savePayload = {
        filename: selectedFilename,
        expectedLastModified: lastModifiedOnDisk,
        ...(viewMode === "raw" ? { content: rawContent } : { variables }),
      };

      const result = await saveEnvFile(selectedProjectId, savePayload);

      setShowSaveConfirmModal(false);
      setSuccessMessage(
        `Saved "${result.filename}" (${result.variableCount} variables). Safety backup: ${result.backupCreated || "None"}.`
      );

      await loadFilesForProject(selectedProjectId, selectedFilename);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save file.";
      if (msg.toLowerCase().includes("conflict")) {
        setShowSaveConfirmModal(false);
        setConflictErrorMessage(msg);
        setShowConflictModal(true);
      } else {
        setErrorMessage(msg);
      }
    } finally {
      setSavingFile(false);
    }
  }

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

  // Filter variables by search query
  const filteredVariables = variables.filter(
    (v) =>
      v.key.toLowerCase().includes(searchFilter.toLowerCase()) ||
      (v.comment && v.comment.toLowerCase().includes(searchFilter.toLowerCase()))
  );

  const displayedProjects = onlyProjectsWithEnv
    ? availableProjects.filter((p) => projectsWithEnv.includes(p.id))
    : availableProjects;

  const currentFileMeta = envFiles.find((f) => f.filename === selectedFilename);
  const fileExists = currentFileMeta?.exists ?? false;

  const existingEnvFiles = envFiles.filter((f) => f.exists);
  const missingSupportedFiles = SUPPORTED_ENV_FILES.filter(
    (fname) => !envFiles.some((f) => f.filename === fname && f.exists)
  );

  return (
    <div
      className={`flex flex-col h-full text-[#E8EBF1] overflow-hidden ${
        isSplit ? "p-3" : "p-4 sm:p-6"
      }`}
    >
      {/* Workspace & Project Selectors Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#303642] shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          {/* Workspace Selector */}
          <div className="flex items-center gap-1.5">
            <label
              htmlFor={`${baseId}-ws-select`}
              className="text-xs text-[#A5ADBA] font-medium"
            >
              Workspace:
            </label>
            <select
              id={`${baseId}-ws-select`}
              value={selectedWorkspaceId}
              onChange={(e) => {
                setSelectedWorkspaceId(e.target.value);
                setSelectedProjectId("");
              }}
              disabled={loadingWorkspaces || workspaces.length === 0}
              className="px-2 py-1 bg-[#272D38] border border-[#303642] rounded-md text-xs text-[#E8EBF1] focus:outline-none focus:border-[#8CA9CF] disabled:opacity-50 max-w-[200px] truncate"
            >
              <option value="">None (Select Workspace)</option>
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>
                  {ws.rootPath.split("/").pop() || ws.rootPath} ({ws.projects.length} projects)
                </option>
              ))}
            </select>
          </div>

          {/* Project Selector */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <label
              htmlFor={`${baseId}-proj-select`}
              className="text-xs text-[#A5ADBA] font-medium"
            >
              Project:
            </label>
            <select
              id={`${baseId}-proj-select`}
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              disabled={displayedProjects.length === 0}
              className="px-2 py-1 bg-[#272D38] border border-[#303642] rounded-md text-xs text-[#E8EBF1] focus:outline-none focus:border-[#8CA9CF] disabled:opacity-50 max-w-[220px] truncate"
            >
              <option value="">None (Select Project)</option>
              {displayedProjects.map((proj) => (
                <option key={proj.id} value={proj.id}>
                  {proj.displayName || proj.name} ({proj.type})
                </option>
              ))}
            </select>

            {/* Checkbox: only projects with .env */}
            {availableProjects.length > 0 && (
              <label className="flex items-center gap-1.5 text-xs text-[#A5ADBA] hover:text-[#E8EBF1] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={onlyProjectsWithEnv}
                  onChange={(e) => setOnlyProjectsWithEnv(e.target.checked)}
                  className="rounded bg-[#272D38] border-[#303642] text-[#8CA9CF] focus:ring-0 cursor-pointer"
                />
                <span className="text-[11px] hidden sm:inline">
                  With .env ({projectsWithEnv.length}/{availableProjects.length})
                </span>
              </label>
            )}
          </div>
        </div>

        {/* Tab Session Tag */}
        {tabTitle && (
          <span className="px-2 py-0.5 text-[11px] font-mono rounded bg-[#272D38] text-[#8CA9CF] border border-[#303642] shrink-0">
            {tabTitle}
          </span>
        )}
      </div>

      {/* Project and Env File Location Bar */}
      {activeProject && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 mt-2 rounded-md bg-[#1D2129] border border-[#303642] text-xs font-mono text-[#E8EBF1] shrink-0">
          <div className="flex items-center gap-2 truncate min-w-0">
            <span className="text-[#7C8594] font-sans text-[11px] font-semibold uppercase tracking-wider shrink-0">
              {fileExists ? "File:" : "Path:"}
            </span>
            <span
              className="truncate select-all text-[#E8EBF1] text-[11px]"
              title={
                fileExists
                  ? `${activeProject.path}/${selectedFilename}`
                  : activeProject.path
              }
            >
              {fileExists
                ? `${activeProject.path}/${selectedFilename}`
                : activeProject.path}
            </span>
            {fileExists && (
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#77B58A]/15 text-[#77B58A] border border-[#77B58A]/30 shrink-0 font-sans">
                Active on disk
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
            <button
              type="button"
              onClick={() =>
                handleCopyPath(
                  fileExists
                    ? `${activeProject.path}/${selectedFilename}`
                    : activeProject.path
                )
              }
              className="px-2 py-0.5 rounded bg-[#272D38] border border-[#303642] hover:bg-[#303642] hover:text-[#E8EBF1] text-[#A5ADBA] text-[11px] transition cursor-pointer"
              title="Copy path to clipboard"
            >
              {copiedPath ? "✓ Copied" : "📋 Copy Path"}
            </button>
            <button
              type="button"
              onClick={() => handleRevealInFinder(activeProject.path)}
              className="px-2 py-0.5 rounded bg-[#272D38] border border-[#303642] hover:bg-[#303642] hover:text-[#E8EBF1] text-[#A5ADBA] text-[11px] transition cursor-pointer"
              title="Reveal folder in Finder"
            >
              📁 Reveal
            </button>
          </div>
        </div>
      )}

      {/* Notice Banner */}
      <div className="my-2 px-3 py-1.5 rounded-md bg-[#E0B36D]/10 border border-[#E0B36D]/30 flex items-center justify-between text-xs text-[#E0B36D] shrink-0">
        <div className="flex items-center gap-2">
          <span>ℹ️</span>
          <span className="text-[11px]">
            <strong>Process Restart Notice:</strong> Saving changes updates file on disk. Running processes must be restarted to load new values.
          </span>
        </div>
      </div>

      {/* Feedback Messages (Success / Error) */}
      {errorMessage && (
        <div className="mb-2 px-3 py-1.5 rounded bg-[#E18B8B]/10 border border-[#E18B8B]/40 text-xs text-[#E18B8B] flex items-center justify-between shrink-0">
          <span>{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-[#E18B8B] hover:text-[#E8EBF1] text-xs ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {successMessage && (
        <div className="mb-2 px-3 py-1.5 rounded bg-[#77B58A]/10 border border-[#77B58A]/40 text-xs text-[#77B58A] flex items-center justify-between shrink-0">
          <span>{successMessage}</span>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-[#77B58A] hover:text-[#E8EBF1] text-xs ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Body */}
      {!selectedProjectId ? (
        <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-[#303642] rounded-lg p-6 bg-[#1D2129]/40 text-center">
          <div className="w-10 h-10 rounded-md bg-[#272D38] border border-[#303642] flex items-center justify-center text-sm font-mono text-[#7C8594] mb-3">
            📁
          </div>
          <p className="text-sm font-medium text-[#E8EBF1]">No Project Selected</p>
          <p className="text-xs text-[#7C8594] mt-1 max-w-sm">
            Select a project above to inspect and edit its environment variables.
          </p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 bg-[#1D2129] border border-[#303642] rounded-lg overflow-hidden mt-1">
          {/* File Selection Bar: Only show existing env files + New File */}
          <div className="flex items-center justify-between px-3 py-2 bg-[#171A20] border-b border-[#303642] shrink-0 overflow-x-auto gap-2">
            <div className="flex items-center gap-1.5 flex-nowrap">
              {existingEnvFiles.map((file) => {
                const isSelected = selectedFilename === file.filename;

                return (
                  <button
                    key={file.filename}
                    onClick={() => handleSelectFile(file.filename)}
                    className={`px-2.5 py-1 rounded text-xs font-mono transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                      isSelected
                        ? "bg-[#35465E] text-[#8CA9CF] border border-[#8CA9CF]/40 font-semibold shadow-xs"
                        : "text-[#A5ADBA] hover:bg-[#272D38] hover:text-[#E8EBF1] border border-transparent"
                    }`}
                  >
                    <span>{file.filename}</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#77B58A]" />
                    {isSelected && isDirty && (
                      <span
                        className="w-2 h-2 rounded-full bg-[#E0B36D] animate-pulse"
                        title="Unsaved changes"
                      />
                    )}
                  </button>
                );
              })}

              {existingEnvFiles.length === 0 && (
                <span className="text-xs text-[#7C8594] italic px-1">
                  No .env files exist in this project
                </span>
              )}

              {/* Create File Button */}
              {missingSupportedFiles.length > 0 && (
                <button
                  onClick={() => {
                    setTargetCreateFilename(missingSupportedFiles[0]);
                    setShowCreateModal(true);
                  }}
                  className="px-2 py-1 rounded text-xs text-[#A5ADBA] hover:text-[#E8EBF1] hover:bg-[#272D38] border border-dashed border-[#303642] flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                  title="Create a new environment file"
                >
                  <span>+</span>
                  <span>New File</span>
                </button>
              )}
            </div>

            {/* Actions & View Mode Toggle */}
            <div className="flex items-center gap-2 shrink-0">
              {fileExists && (
                <>
                  {/* View Mode Switcher */}
                  <div className="flex items-center bg-[#101216] border border-[#303642] rounded p-0.5 text-xs">
                    <button
                      onClick={() => setViewMode("structured")}
                      className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                        viewMode === "structured"
                          ? "bg-[#35465E] text-[#8CA9CF] font-medium"
                          : "text-[#7C8594] hover:text-[#E8EBF1]"
                      }`}
                    >
                      Structured
                    </button>
                    <button
                      onClick={() => setViewMode("raw")}
                      className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                        viewMode === "raw"
                          ? "bg-[#35465E] text-[#8CA9CF] font-medium"
                          : "text-[#7C8594] hover:text-[#E8EBF1]"
                      }`}
                    >
                      Raw
                    </button>
                  </div>

                  {/* Reload Button */}
                  <button
                    onClick={() => {
                      if (selectedProjectId) {
                        loadFileContent(selectedProjectId, selectedFilename);
                      }
                    }}
                    disabled={loadingContent}
                    className="p-1.5 text-[#7C8594] hover:text-[#E8EBF1] hover:bg-[#272D38] rounded text-xs transition-colors cursor-pointer"
                    title="Reload from disk"
                  >
                    🔄
                  </button>

                  {/* Discard Changes */}
                  {isDirty && (
                    <button
                      onClick={handleDiscardChanges}
                      className="px-2 py-1 text-xs text-[#7C8594] hover:text-[#E18B8B] hover:bg-[#272D38] rounded transition-colors cursor-pointer"
                    >
                      Discard
                    </button>
                  )}

                  {/* Save Changes Button */}
                  <button
                    onClick={() => setShowSaveConfirmModal(true)}
                    disabled={!isDirty || savingFile}
                    className={`px-3 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                      isDirty
                        ? "bg-[#8CA9CF] hover:bg-[#A6BDE0] text-[#101216] shadow-xs"
                        : "bg-[#272D38] text-[#7C8594] cursor-not-allowed border border-[#303642]"
                    }`}
                  >
                    {savingFile ? "Saving..." : "Save"}
                    {isDirty && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#101216]" />
                    )}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Subheader: File Metadata Details */}
          {fileExists ? (
            <div className="px-3 py-1.5 bg-[#171A20]/60 border-b border-[#303642] flex flex-wrap items-center justify-between text-xs text-[#7C8594] gap-2 shrink-0">
              <div className="flex items-center gap-3 font-mono text-[11px]">
                <span className="text-[#E8EBF1]">{selectedFilename}</span>
                <span>
                  Size: <strong className="text-[#E8EBF1]">{formatBytes(fileSizeBytes)}</strong>
                </span>
                <span>
                  Vars: <strong className="text-[#E8EBF1]">{variables.length}</strong>
                </span>
                {lastModifiedOnDisk && (
                  <span className="hidden md:inline">
                    Modified: {new Date(lastModifiedOnDisk).toLocaleTimeString()}
                  </span>
                )}
              </div>

              {hasSyntaxWarnings && (
                <div className="flex items-center gap-1.5 text-[#E0B36D] bg-[#E0B36D]/15 px-2 py-0.5 rounded border border-[#E0B36D]/30 text-[11px]">
                  <span>⚠️ Non-standard lines detected (preserved).</span>
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 flex flex-col items-center justify-center text-center flex-1">
              <div className="w-10 h-10 rounded-md bg-[#272D38] border border-[#303642] flex items-center justify-center text-[#7C8594] mb-2">
                📄
              </div>
              <h3 className="text-sm font-semibold text-[#E8EBF1]">
                "{selectedFilename}" does not exist in {activeProject?.name}
              </h3>
              <p className="text-xs text-[#7C8594] mt-1 max-w-sm">
                Create this file to configure environment variables for this deployment stage.
              </p>
              <button
                onClick={() => {
                  setTargetCreateFilename(selectedFilename);
                  setShowCreateModal(true);
                }}
                className="mt-4 px-3 py-1.5 bg-[#8CA9CF] hover:bg-[#A6BDE0] text-[#101216] rounded text-xs font-semibold transition-colors shadow-xs cursor-pointer"
              >
                Create {selectedFilename}
              </button>
            </div>
          )}

          {/* Editor Body */}
          {fileExists && (
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              {viewMode === "raw" ? (
                /* Raw Editor View */
                <div className="flex-1 flex flex-col p-3 min-h-0">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-[#7C8594] font-mono">
                      Raw file editor (utf-8, comments and whitespace preserved)
                    </span>
                    <span className="text-xs text-[#7C8594]">
                      Lines: {rawContent.split(/\r?\n/).length}
                    </span>
                  </div>
                  <textarea
                    value={rawContent}
                    onChange={(e) => {
                      setRawContent(e.target.value);
                      setIsDirty(true);
                    }}
                    placeholder="# Enter environment variables..."
                    spellCheck={false}
                    className="flex-1 w-full bg-[#101216] text-[#E8EBF1] font-mono text-xs p-3 border border-[#303642] rounded-md resize-none focus:outline-none focus:border-[#8CA9CF] leading-relaxed"
                  />
                </div>
              ) : (
                /* Structured Variables Table View */
                <div className="flex-1 flex flex-col min-h-0">
                  {/* Search and Filter Bar */}
                  <div className="p-2.5 border-b border-[#303642] flex items-center justify-between gap-3 shrink-0 bg-[#171A20]/40">
                    <div className="relative flex-1 max-w-sm">
                      <input
                        type="text"
                        placeholder="Search variables by key or comment..."
                        value={searchFilter}
                        onChange={(e) => setSearchFilter(e.target.value)}
                        className="w-full px-2.5 py-1 bg-[#272D38] border border-[#303642] rounded text-xs text-[#E8EBF1] focus:outline-none focus:border-[#8CA9CF] placeholder:text-[#7C8594] font-mono"
                      />
                      {searchFilter && (
                        <button
                          onClick={() => setSearchFilter("")}
                          className="absolute right-2 top-1 text-[#7C8594] hover:text-[#E8EBF1] text-xs cursor-pointer"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          if (revealedVarIds.size > 0) {
                            setRevealedVarIds(new Set());
                          } else {
                            const allIds = new Set(variables.map((v) => v.id));
                            setRevealedVarIds(allIds);
                          }
                        }}
                        className="px-2 py-1 text-xs text-[#A5ADBA] hover:text-[#E8EBF1] hover:bg-[#272D38] rounded border border-[#303642] transition-colors cursor-pointer"
                      >
                        {revealedVarIds.size > 0 ? "Hide Values" : "Reveal All"}
                      </button>
                    </div>
                  </div>

                  {/* Variables Table */}
                  <div className="flex-1 overflow-y-auto">
                    {filteredVariables.length === 0 ? (
                      <div className="p-8 text-center text-[#7C8594] text-xs">
                        {searchFilter
                          ? "No variables matching search criteria."
                          : "No variables defined in this file yet. Add one below!"}
                      </div>
                    ) : (
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-[#303642] bg-[#171A20] text-[#7C8594] font-mono">
                            <th className="py-2 px-3 w-1/4">Key</th>
                            <th className="py-2 px-3 w-5/12">Value</th>
                            <th className="py-2 px-3 w-1/4">Comment</th>
                            <th className="py-2 px-3 text-right w-16">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#303642]/60 font-mono">
                          {filteredVariables.map((variable) => {
                            const isRevealed = revealedVarIds.has(variable.id);

                            return (
                              <tr
                                key={variable.id}
                                className="hover:bg-[#272D38]/50 group transition-colors"
                              >
                                {/* Key Cell */}
                                <td className="py-2 px-3 align-middle font-medium text-[#E8EBF1]">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="select-all">{variable.key}</span>
                                    {variable.isSecret && (
                                      <span
                                        className="text-[10px] px-1 py-0.2 rounded bg-[#E0B36D]/15 border border-[#E0B36D]/30 text-[#E0B36D] font-sans"
                                        title="Sensitive Variable: masked by default"
                                      >
                                        Secret
                                      </span>
                                    )}
                                  </div>
                                </td>

                                {/* Value Cell */}
                                <td className="py-1.5 px-3 align-middle">
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type={isRevealed ? "text" : "password"}
                                      value={variable.value}
                                      onChange={(e) =>
                                        handleEditValue(variable.id, e.target.value)
                                      }
                                      placeholder="<empty>"
                                      className="flex-1 px-2 py-1 bg-[#272D38] border border-[#303642] rounded text-[#E8EBF1] focus:outline-none focus:border-[#8CA9CF] text-xs font-mono"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => toggleReveal(variable.id)}
                                      className="p-1 text-[#7C8594] hover:text-[#E8EBF1] text-xs transition-colors rounded hover:bg-[#272D38] cursor-pointer"
                                      title={isRevealed ? "Hide value" : "Reveal value"}
                                    >
                                      {isRevealed ? "👁️" : "🙈"}
                                    </button>
                                  </div>
                                </td>

                                {/* Comment Cell */}
                                <td className="py-1.5 px-3 align-middle">
                                  <input
                                    type="text"
                                    value={variable.comment || ""}
                                    onChange={(e) =>
                                      handleEditComment(variable.id, e.target.value)
                                    }
                                    placeholder="Optional comment..."
                                    className="w-full px-2 py-1 bg-[#101216]/50 border border-transparent hover:border-[#303642] focus:border-[#8CA9CF] rounded text-[#7C8594] focus:text-[#E8EBF1] focus:outline-none text-xs font-sans"
                                  />
                                </td>

                                {/* Remove Action */}
                                <td className="py-2 px-3 align-middle text-right">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveVariable(variable.id)}
                                    className="text-[#7C8594] hover:text-[#E18B8B] p-1 rounded transition-colors text-xs cursor-pointer"
                                    title="Delete variable"
                                  >
                                    🗑️
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* Inline Form to Add New Variable */}
                  <div className="p-2.5 border-t border-[#303642] bg-[#171A20] shrink-0">
                    <div className="text-xs font-medium text-[#E8EBF1] mb-1.5 flex items-center justify-between">
                      <span>Add New Variable</span>
                      {newKeyError && (
                        <span className="text-[#E18B8B] text-[11px] font-sans">
                          {newKeyError}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <div className="flex-1 min-w-[120px]">
                        <input
                          type="text"
                          placeholder="KEY (e.g. DATABASE_URL)"
                          value={newKey}
                          onChange={(e) => {
                            setNewKey(e.target.value);
                            setNewKeyError(null);
                          }}
                          className={`w-full px-2.5 py-1.5 bg-[#272D38] border rounded text-xs font-mono text-[#E8EBF1] placeholder:text-[#7C8594] focus:outline-none ${
                            newKeyError
                              ? "border-[#E18B8B] focus:border-[#E18B8B]"
                              : "border-[#303642] focus:border-[#8CA9CF]"
                          }`}
                        />
                      </div>
                      <div className="flex-1 min-w-[120px]">
                        <input
                          type="text"
                          placeholder="Value"
                          value={newValue}
                          onChange={(e) => setNewValue(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-[#272D38] border border-[#303642] rounded text-xs font-mono text-[#E8EBF1] placeholder:text-[#7C8594] focus:outline-none focus:border-[#8CA9CF]"
                        />
                      </div>
                      <div className="flex-1 min-w-[100px]">
                        <input
                          type="text"
                          placeholder="Comment (optional)"
                          value={newComment}
                          onChange={(e) => setNewComment(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-[#272D38] border border-[#303642] rounded text-xs text-[#E8EBF1] placeholder:text-[#7C8594] focus:outline-none focus:border-[#8CA9CF]"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleAddVariable}
                        className="px-4 py-1.5 bg-[#8CA9CF] hover:bg-[#A6BDE0] text-[#101216] rounded text-xs font-semibold transition-colors shadow-xs cursor-pointer shrink-0"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* MODAL: Create Environment File */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-[#101216]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1D2129] border border-[#303642] rounded-lg max-w-md w-full p-5 shadow-2xl text-[#E8EBF1]">
            <h3 className="text-base font-semibold text-[#E8EBF1]">
              Create Supported Environment File
            </h3>
            <p className="text-xs text-[#A5ADBA] mt-1">
              Select one of the controlled environment filenames to create in{" "}
              <strong className="text-[#E8EBF1]">{activeProject?.name}</strong>.
            </p>

            <div className="my-4">
              <label className="text-xs text-[#A5ADBA] font-medium block mb-1.5">
                Target Filename:
              </label>
              <select
                value={targetCreateFilename}
                onChange={(e) => setTargetCreateFilename(e.target.value)}
                className="w-full px-3 py-2 bg-[#272D38] border border-[#303642] rounded text-xs font-mono text-[#E8EBF1] focus:outline-none focus:border-[#8CA9CF]"
              >
                {missingSupportedFiles.map((fname) => (
                  <option key={fname} value={fname}>
                    {fname}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-3 py-1.5 text-xs text-[#A5ADBA] hover:text-[#E8EBF1] hover:bg-[#272D38] rounded transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateFile}
                disabled={savingFile}
                className="px-4 py-1.5 bg-[#8CA9CF] hover:bg-[#A6BDE0] text-[#101216] rounded text-xs font-semibold transition-colors shadow-xs cursor-pointer"
              >
                {savingFile ? "Creating..." : "Create File"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Save Confirmation */}
      {showSaveConfirmModal && (
        <div className="fixed inset-0 bg-[#101216]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1D2129] border border-[#303642] rounded-lg max-w-md w-full p-5 shadow-2xl text-[#E8EBF1]">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[#E0B36D]">⚠️</span>
              <h3 className="text-base font-semibold text-[#E8EBF1]">
                Confirm Save Changes
              </h3>
            </div>

            <p className="text-xs text-[#A5ADBA] leading-relaxed">
              Are you sure you want to write changes to{" "}
              <strong className="text-[#E8EBF1] font-mono">{selectedFilename}</strong>?
            </p>

            <div className="my-4 p-3 bg-[#101216] border border-[#303642] rounded text-xs space-y-1.5 text-[#7C8594] font-mono">
              <div>Project: {activeProject?.name}</div>
              <div>Variables count: {variables.length}</div>
              <div>
                Safety backup:{" "}
                <span className="text-[#77B58A]">
                  {selectedFilename}.devdesk-bak
                </span>
              </div>
            </div>

            <p className="text-[11px] text-[#7C8594] mb-4">
              DevDesk will automatically create a backup file and perform an atomic overwrite.
            </p>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSaveConfirmModal(false)}
                className="px-3 py-1.5 text-xs text-[#A5ADBA] hover:text-[#E8EBF1] hover:bg-[#272D38] rounded transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteSave}
                disabled={savingFile}
                className="px-4 py-1.5 bg-[#8CA9CF] hover:bg-[#A6BDE0] text-[#101216] rounded text-xs font-semibold transition-colors shadow-xs cursor-pointer"
              >
                {savingFile ? "Writing..." : "Confirm & Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: External Modification Conflict */}
      {showConflictModal && (
        <div className="fixed inset-0 bg-[#101216]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1D2129] border border-[#E18B8B]/60 rounded-lg max-w-md w-full p-5 shadow-2xl text-[#E8EBF1]">
            <div className="flex items-center gap-2 mb-2 text-[#E18B8B] font-semibold">
              <span>⚠️</span>
              <h3>External Conflict Detected</h3>
            </div>

            <p className="text-xs text-[#A5ADBA] leading-relaxed mb-4">
              {conflictErrorMessage ||
                `The file "${selectedFilename}" has been modified on disk by an external program since it was loaded.`}
            </p>

            <p className="text-xs text-[#7C8594] mb-6">
              To prevent accidental overwrites, please reload the file to inspect the latest changes.
            </p>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowConflictModal(false)}
                className="px-3 py-1.5 text-xs text-[#A5ADBA] hover:text-[#E8EBF1] hover:bg-[#272D38] rounded transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConflictModal(false);
                  if (selectedProjectId) {
                    loadFileContent(selectedProjectId, selectedFilename);
                  }
                }}
                className="px-4 py-1.5 bg-[#E0B36D] hover:bg-[#E0B36D]/90 text-[#101216] rounded text-xs font-semibold transition-colors shadow-xs cursor-pointer"
              >
                Reload from Disk
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
