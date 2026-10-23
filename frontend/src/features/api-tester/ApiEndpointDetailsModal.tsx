"use client";

import { useState } from "react";
import { DiscoveredApiEndpoint } from "@/types/apiDiscovery";
import { HttpMethod } from "@/types/apiTester";

interface ApiEndpointDetailsModalProps {
  endpoint: DiscoveredApiEndpoint | null;
  baseUrl: string;
  onClose: () => void;
  onLoadIntoTester: (endpoint: DiscoveredApiEndpoint, customBaseUrl?: string) => void;
}

function getMethodBadgeClass(method: HttpMethod): string {
  switch (method) {
    case "GET":
      return "text-[#8CA9CF] border-[#8CA9CF]/40 bg-[rgba(140,169,207,0.12)]";
    case "POST":
      return "text-[#77B58A] border-[#77B58A]/40 bg-[rgba(119,181,138,0.12)]";
    case "PUT":
      return "text-[#E0B36D] border-[#E0B36D]/40 bg-[rgba(224,179,109,0.12)]";
    case "PATCH":
      return "text-[#A6BDE0] border-[#A6BDE0]/40 bg-[rgba(166,189,224,0.12)]";
    case "DELETE":
      return "text-[#E18B8B] border-[#E18B8B]/40 bg-[rgba(225,139,139,0.12)]";
    default:
      return "text-[#A5ADBA] border-[#303642] bg-[#272D38]";
  }
}

function getStatusBadgeClass(status: number): string {
  if (status >= 200 && status < 300) {
    return "bg-[rgba(119,181,138,0.12)] text-[#77B58A] border border-[#77B58A]/40";
  }
  if (status >= 300 && status < 500) {
    return "bg-[rgba(224,179,109,0.12)] text-[#E0B36D] border border-[#E0B36D]/40";
  }
  if (status >= 500) {
    return "bg-[rgba(225,139,139,0.12)] text-[#E18B8B] border border-[#E18B8B]/40";
  }
  return "bg-[#272D38] text-[#A5ADBA] border border-[#303642]";
}

export function ApiEndpointDetailsModal({
  endpoint,
  baseUrl,
  onClose,
  onLoadIntoTester,
}: ApiEndpointDetailsModalProps) {
  const [activeCodeTab, setActiveCodeTab] = useState<"curl" | "fetchJs" | "python">("curl");
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [copiedBody, setCopiedBody] = useState<boolean>(false);
  const [copiedPath, setCopiedPath] = useState<boolean>(false);

  if (!endpoint) return null;

  const fullUrl = `${baseUrl.replace(/\/+$/, "")}${endpoint.path}`;

  const handleCopy = (text: string, type: "code" | "body" | "path") => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      if (type === "code") {
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
      } else if (type === "body") {
        setCopiedBody(true);
        setTimeout(() => setCopiedBody(false), 2000);
      } else {
        setCopiedPath(true);
        setTimeout(() => setCopiedPath(false), 2000);
      }
    }
  };

  const currentCodeSnippet =
    activeCodeTab === "curl"
      ? endpoint.howToUse.curl
      : activeCodeTab === "fetchJs"
      ? endpoint.howToUse.fetchJs
      : endpoint.howToUse.python;

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto no-scrollbar">
      <div className="bg-[#1D2129] border border-[#303642] rounded-xl max-w-3xl w-full my-auto shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* 1. Modal Header */}
        <div className="p-4 sm:p-5 bg-[#171A20] border-b border-[#303642] flex items-start justify-between gap-4 shrink-0">
          <div className="space-y-1.5 flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {/* Method Badge */}
              <span
                className={`px-2.5 py-0.5 rounded text-xs font-mono font-bold border ${getMethodBadgeClass(
                  endpoint.method
                )}`}
              >
                {endpoint.method}
              </span>

              {/* Endpoint Path */}
              <h3 className="text-base sm:text-lg font-mono font-semibold text-[#E8EBF1] truncate select-all">
                {endpoint.path}
              </h3>

              {/* Category & Framework Badges */}
              <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-[#272D38] text-[#E8EBF1] border border-[#303642]">
                {endpoint.category}
              </span>
              <span className="px-2 py-0.5 text-[10px] font-medium uppercase font-mono rounded bg-[rgba(140,169,207,0.12)] text-[#8CA9CF] border border-[#8CA9CF]/35">
                {endpoint.framework}
              </span>
            </div>

            {/* Description / Summary */}
            <p className="text-xs text-[#A5ADBA]">
              {endpoint.description || endpoint.name || "No summary provided in source code."}
            </p>
          </div>

          {/* Close Button */}
          <button
            onClick={onClose}
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition cursor-pointer"
            title="Close analysis"
          >
            ✕
          </button>
        </div>

        {/* 2. Modal Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto no-scrollbar p-4 sm:p-6 space-y-6 text-zinc-200 text-xs">
          {/* Source Location Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800 text-xs font-mono">
            <div className="flex items-center gap-2 truncate">
              <span className="text-zinc-500 font-sans text-[11px] font-semibold uppercase">
                Source:
              </span>
              <span className="text-zinc-300 select-all truncate">
                {endpoint.sourceFile}:{endpoint.sourceLine}
              </span>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={() => handleCopy(fullUrl, "path")}
                className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition cursor-pointer text-[11px]"
              >
                {copiedPath ? "✓ Copied Full URL" : "📋 Copy Full URL"}
              </button>
            </div>
          </div>

          {/* Section: Request Parameters (Path & Query) */}
          {(endpoint.pathParams.length > 0 || endpoint.queryParams.length > 0) && (
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 font-mono flex items-center gap-2">
                <span>🔍 Request Parameters</span>
              </h4>

              {/* Path Parameters Table */}
              {endpoint.pathParams.length > 0 && (
                <div className="rounded-lg border border-[#303642] overflow-hidden">
                  <div className="px-3 py-1.5 bg-[#171A20] border-b border-[#303642] font-medium text-[11px] text-[#A5ADBA]">
                    Path Parameters ({endpoint.pathParams.length})
                  </div>
                  <table className="w-full text-left font-mono text-[11px]">
                    <tbody className="divide-y divide-[#303642]">
                      {endpoint.pathParams.map((param) => (
                        <tr key={param.name} className="hover:bg-[#272D38]/50">
                          <td className="py-2 px-3 text-[#8CA9CF] font-medium w-1/4">
                            :{param.name}
                          </td>
                          <td className="py-2 px-3 text-[#A5ADBA] w-1/4">
                            type: <strong className="text-[#E8EBF1]">{param.type}</strong>
                          </td>
                          <td className="py-2 px-3 text-[#77B58A] w-1/4">
                            required: <strong>true</strong>
                          </td>
                          <td className="py-2 px-3 text-[#7C8594] text-right w-1/4">
                            sample: &quot;{param.sampleValue}&quot;
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Query Parameters Table */}
              {endpoint.queryParams.length > 0 && (
                <div className="rounded-lg border border-[#303642] overflow-hidden">
                  <div className="px-3 py-1.5 bg-[#171A20] border-b border-[#303642] font-medium text-[11px] text-[#A5ADBA]">
                    Query Parameters ({endpoint.queryParams.length})
                  </div>
                  <table className="w-full text-left font-mono text-[11px]">
                    <tbody className="divide-y divide-[#303642]">
                      {endpoint.queryParams.map((param) => (
                        <tr key={param.name} className="hover:bg-[#272D38]/50">
                          <td className="py-2 px-3 text-[#8CA9CF] font-medium w-1/4">
                            ?{param.name}
                          </td>
                          <td className="py-2 px-3 text-[#A5ADBA] w-1/4">
                            type: <strong className="text-[#E8EBF1]">{param.type}</strong>
                          </td>
                          <td className="py-2 px-3 text-[#A5ADBA] w-1/4">
                            {param.required ? (
                              <span className="text-[#77B58A] font-semibold">required</span>
                            ) : (
                              <span className="text-[#7C8594]">optional</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-[#7C8594] text-right w-1/4">
                            {param.sampleValue ? `sample: "${param.sampleValue}"` : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Section: Request Payload (Body) Analysis */}
          {endpoint.requestBody && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 font-mono flex items-center gap-2">
                  <span>📦 Request Payload / Body Analysis</span>
                </h4>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-zinc-500">
                    Content-Type: {endpoint.requestBody.contentType}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(endpoint.requestBody?.sampleJson || "{}", "body")
                    }
                    className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 text-[11px] transition cursor-pointer"
                  >
                    {copiedBody ? "✓ Copied" : "Copy Payload"}
                  </button>
                </div>
              </div>

              {endpoint.requestBody.sampleJson && (
                <div className="rounded-lg bg-zinc-900/70 border border-zinc-800 p-3 font-mono text-xs overflow-x-auto no-scrollbar">
                  <pre suppressHydrationWarning className="text-emerald-300 select-all">
                    {endpoint.requestBody.sampleJson}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Section: Response Analysis */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 font-mono flex items-center gap-2">
              <span>⚡ Response Specification & Analysis</span>
            </h4>

            <div className="space-y-2">
              {endpoint.responses.map((resp, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-bold font-mono border ${getStatusBadgeClass(
                        resp.statusCode
                      )}`}
                    >
                      {resp.statusCode} {resp.statusCode < 400 ? "OK" : "Error"}
                    </span>
                    <span className="text-zinc-400 text-xs">{resp.description}</span>
                  </div>

                  {resp.sampleJson && (
                    <pre suppressHydrationWarning className="text-[11px] font-mono text-zinc-300 bg-zinc-950 p-2 rounded border border-zinc-800/80 overflow-x-auto no-scrollbar select-all">
                      {resp.sampleJson}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Section: "How to Use" Code Generator */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 font-mono flex items-center gap-2">
                <span>💻 How to Use (Code Generator)</span>
              </h4>
              <button
                type="button"
                onClick={() => handleCopy(currentCodeSnippet, "code")}
                className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 text-[11px] transition cursor-pointer"
              >
                {copiedCode ? "✓ Copied Snippet" : "Copy Code"}
              </button>
            </div>

            {/* Language Tabs */}
            <div className="flex items-center gap-1 bg-[#171A20] border border-[#303642] rounded p-0.5 w-fit">
              <button
                type="button"
                onClick={() => setActiveCodeTab("curl")}
                className={`px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer ${
                  activeCodeTab === "curl"
                    ? "bg-[#35465E] text-[#8CA9CF] shadow-xs"
                    : "text-[#A5ADBA] hover:text-[#E8EBF1]"
                }`}
              >
                cURL
              </button>
              <button
                type="button"
                onClick={() => setActiveCodeTab("fetchJs")}
                className={`px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer ${
                  activeCodeTab === "fetchJs"
                    ? "bg-[#35465E] text-[#8CA9CF] shadow-xs"
                    : "text-[#A5ADBA] hover:text-[#E8EBF1]"
                }`}
              >
                Fetch (JS / TS)
              </button>
              <button
                type="button"
                onClick={() => setActiveCodeTab("python")}
                className={`px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer ${
                  activeCodeTab === "python"
                    ? "bg-[#35465E] text-[#8CA9CF] shadow-xs"
                    : "text-[#A5ADBA] hover:text-[#E8EBF1]"
                }`}
              >
                Python (requests)
              </button>
            </div>

            {/* Code Snippet Box */}
            <div className="rounded-lg bg-[#101216] border border-[#303642] p-3 font-mono text-xs overflow-x-auto no-scrollbar">
              <pre suppressHydrationWarning className="text-[#E8EBF1] select-all leading-relaxed">
                {currentCodeSnippet}
              </pre>
            </div>
          </div>
        </div>

        {/* 3. Modal Footer: Load into API Tester Action */}
        <div className="p-4 bg-[#171A20] border-t border-[#303642] flex items-center justify-between gap-3 shrink-0">
          <div className="text-[#7C8594] text-[11px] font-mono hidden sm:block">
            Target URL: <span className="text-[#A5ADBA]">{fullUrl}</span>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded text-xs text-[#A5ADBA] hover:text-[#E8EBF1] hover:bg-[#272D38] transition cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => {
                onLoadIntoTester(endpoint, baseUrl);
                onClose();
              }}
              className="px-4 py-1.5 rounded bg-[#8CA9CF] hover:bg-[#A6BDE0] text-[#101216] font-semibold text-xs transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <span>⚡ Load into Tester &amp; Try</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
