import fs from "fs";
import path from "path";
import { HttpMethod } from "../../types/apiTester.js";
import {
  ApiDiscoveryResult,
  ApiParamInfo,
  ApiRequestBodyInfo,
  ApiResponseInfo,
  DiscoveredApiEndpoint,
  HowToUseCodeSnippets,
} from "../../types/apiDiscovery.js";

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "out",
  ".turbo",
  "coverage",
  ".cache",
  ".vscode",
  "vendor",
  "__pycache__",
  ".venv",
  "env",
]);

const MAX_SCAN_FILES = 1200;
const MAX_FILE_SIZE_BYTES = 512 * 1024; // 512 KB

function cleanPath(p: string): string {
  let res = p.trim().replace(/\\/g, "/");
  if (!res.startsWith("/")) res = "/" + res;
  res = res.replace(/\/+/g, "/");
  if (res.length > 1 && res.endsWith("/")) res = res.slice(0, -1);
  return res;
}

function normalizeDynamicParam(p: string): string {
  // Replace Next.js [param] or [id] with :id
  let normalized = p.replace(/\[\.\.\.([^\]]+)\]/g, "*$1");
  normalized = normalized.replace(/\[([^\]]+)\]/g, ":$1");
  // Replace FastAPI / Flask {id} with :id
  normalized = normalized.replace(/\{([a-zA-Z0-9_]+)\}/g, ":$1");
  return cleanPath(normalized);
}

function extractPathParams(routePath: string): ApiParamInfo[] {
  const params: ApiParamInfo[] = [];
  const matches = routePath.match(/:([a-zA-Z0-9_]+)|\*([a-zA-Z0-9_]+)/g);
  if (matches) {
    for (const m of matches) {
      const name = m.replace(/^[:*]/, "");
      params.push({
        name,
        type: "string",
        required: true,
        description: `Path parameter "${name}"`,
        sampleValue: name.toLowerCase().includes("id") ? "1" : "sample-value",
      });
    }
  }
  return params;
}

function generateHowToUseSnippets(
  method: HttpMethod,
  fullUrl: string,
  sampleBody?: string,
  hasHeaders: boolean = true
): HowToUseCodeSnippets {
  const isPostLike = ["POST", "PUT", "PATCH"].includes(method);
  const jsonBody = isPostLike && sampleBody ? sampleBody.trim() : null;

  // 1. cURL
  let curl = `curl -X ${method} "${fullUrl}"`;
  if (jsonBody) {
    curl += ` \\\n  -H "Content-Type: application/json" \\\n  -d '${jsonBody}'`;
  } else if (hasHeaders && method !== "GET") {
    curl += ` \\\n  -H "Accept: application/json"`;
  }

  // 2. Fetch (JavaScript / TypeScript)
  let fetchJs = `const response = await fetch("${fullUrl}", {\n  method: "${method}",\n`;
  if (jsonBody) {
    fetchJs += `  headers: {\n    "Content-Type": "application/json",\n  },\n  body: JSON.stringify(${jsonBody}),\n`;
  } else {
    fetchJs += `  headers: {\n    "Accept": "application/json",\n  },\n`;
  }
  fetchJs += `});\n\nconst data = await response.json();\nconsole.log(data);`;

  // 3. Python (requests)
  let python = `import requests\n\nurl = "${fullUrl}"\n`;
  if (jsonBody) {
    try {
      const parsed = JSON.parse(jsonBody);
      python += `payload = ${JSON.stringify(parsed, null, 2)}\nheaders = {"Content-Type": "application/json"}\n\n`;
      python += `response = requests.${method.toLowerCase()}(url, json=payload, headers=headers)\n`;
    } catch {
      python += `payload = """${jsonBody}"""\nheaders = {"Content-Type": "application/json"}\n\n`;
      python += `response = requests.${method.toLowerCase()}(url, data=payload, headers=headers)\n`;
    }
  } else {
    python += `response = requests.${method.toLowerCase()}(url)\n`;
  }
  python += `print(response.status_code)\nprint(response.json())`;

  return { curl, fetchJs, python };
}

export class ApiDiscoveryService {
  /**
   * Discovers all available API endpoints in a project directory.
   */
  public async discoverProjectEndpoints(
    projectPath: string,
    projectName: string,
    projectId: string
  ): Promise<ApiDiscoveryResult> {
    if (!fs.existsSync(projectPath)) {
      throw new Error(`Project directory does not exist: "${projectPath}"`);
    }

    // 1. Detect Framework & Default Port
    const { framework, detectedPort } = this.detectProjectInfo(projectPath);
    const port = detectedPort || (framework === "nextjs" ? 3000 : 5001);
    const baseUrlSuggestion = `http://localhost:${port}`;

    // 2. Collect code files
    const codeFiles: string[] = [];
    this.collectFiles(projectPath, projectPath, codeFiles);

    // 3. Check for OpenAPI / Swagger specs first
    const openApiEndpoints = this.scanOpenApiSpecs(projectPath, baseUrlSuggestion);
    if (openApiEndpoints.length > 0) {
      return {
        projectId,
        projectName,
        projectPath,
        framework: "openapi",
        detectedPort: port,
        baseUrlSuggestion,
        endpointsCount: openApiEndpoints.length,
        endpoints: openApiEndpoints,
      };
    }

    // 4. Scan files for routes based on framework patterns
    const endpoints: DiscoveredApiEndpoint[] = [];

    // First, scan for Express router mount prefixes
    const routerMountMap = this.scanExpressRouterMounts(codeFiles);

    for (const filePath of codeFiles) {
      const relativePath = path.relative(projectPath, filePath).replace(/\\/g, "/");

      // Next.js App Router (app/api/**/route.ts|js)
      if (
        relativePath.includes("app/api/") &&
        /\/route\.(ts|js|tsx|jsx|mjs)$/.test(relativePath)
      ) {
        this.parseNextAppRoute(filePath, relativePath, baseUrlSuggestion, endpoints);
        continue;
      }

      // Next.js Pages Router (pages/api/**/*.ts|js)
      if (
        (relativePath.startsWith("pages/api/") || relativePath.includes("/pages/api/")) &&
        /\.(ts|js|tsx|jsx|mjs)$/.test(relativePath)
      ) {
        this.parseNextPagesRoute(filePath, relativePath, baseUrlSuggestion, endpoints);
        continue;
      }

      // NestJS Controllers (@Controller)
      if (/\.(controller|service)\.(ts|js)$/.test(relativePath)) {
        this.parseNestJsController(filePath, relativePath, baseUrlSuggestion, endpoints);
      }

      // Python FastAPI / Flask
      if (relativePath.endsWith(".py")) {
        this.parsePythonRoute(filePath, relativePath, baseUrlSuggestion, endpoints);
        continue;
      }

      // Standard Express / Node routes (router.get, app.post, etc.)
      this.parseExpressRoute(
        filePath,
        relativePath,
        routerMountMap,
        baseUrlSuggestion,
        endpoints
      );
    }

    // Deduplicate endpoints by HTTP Method + Normalized Path and merge richer metadata
    const uniqueMap = new Map<string, DiscoveredApiEndpoint>();

    for (const ep of endpoints) {
      const normalizedPath = cleanPath(ep.path);
      const dedupeKey = `${ep.method.toUpperCase()}:${normalizedPath}`;

      if (!uniqueMap.has(dedupeKey)) {
        uniqueMap.set(dedupeKey, ep);
      } else {
        const existing = uniqueMap.get(dedupeKey)!;

        // Prefer non-"General" category
        if (existing.category === "General" && ep.category && ep.category !== "General") {
          existing.category = ep.category;
        }

        // Prefer endpoint with description
        if (!existing.description && ep.description) {
          existing.description = ep.description;
          existing.name = ep.name;
        }

        // Prefer endpoint with request body
        if (!existing.requestBody && ep.requestBody) {
          existing.requestBody = ep.requestBody;
        }

        // Merge query params
        if (ep.queryParams && ep.queryParams.length > 0) {
          const existingNames = new Set((existing.queryParams || []).map((q) => q.name));
          for (const q of ep.queryParams) {
            if (!existingNames.has(q.name)) {
              if (!existing.queryParams) existing.queryParams = [];
              existing.queryParams.push(q);
            }
          }
        }

        // Merge path params
        if (ep.pathParams && ep.pathParams.length > 0) {
          const existingNames = new Set((existing.pathParams || []).map((p) => p.name));
          for (const p of ep.pathParams) {
            if (!existingNames.has(p.name)) {
              if (!existing.pathParams) existing.pathParams = [];
              existing.pathParams.push(p);
            }
          }
        }

        // Prefer sourceFile in routes/ or controllers/ over root index/server
        if (
          existing.sourceFile &&
          !/routes?|controllers?|api/i.test(existing.sourceFile) &&
          ep.sourceFile &&
          /routes?|controllers?|api/i.test(ep.sourceFile)
        ) {
          existing.sourceFile = ep.sourceFile;
          existing.sourceLine = ep.sourceLine;
        }
      }
    }

    // Ensure all endpoints have clean, guaranteed unique IDs
    const uniqueEndpoints = Array.from(uniqueMap.values());
    const seenIds = new Set<string>();

    for (const ep of uniqueEndpoints) {
      const pathSlug = ep.path
        .replace(/[^a-zA-Z0-9]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      const baseId = `api-${ep.method.toLowerCase()}-${pathSlug || "root"}`;
      let uniqueId = baseId;
      let counter = 1;
      while (seenIds.has(uniqueId)) {
        uniqueId = `${baseId}-${counter++}`;
      }
      seenIds.add(uniqueId);
      ep.id = uniqueId;
    }

    // Sort endpoints alphabetically by path, then method
    uniqueEndpoints.sort((a, b) => {
      if (a.path !== b.path) return a.path.localeCompare(b.path);
      return a.method.localeCompare(b.method);
    });

    return {
      projectId,
      projectName,
      projectPath,
      framework,
      detectedPort: port,
      baseUrlSuggestion,
      endpointsCount: uniqueEndpoints.length,
      endpoints: uniqueEndpoints,
    };
  }

  /**
   * Detects project framework and declared port from package.json or .env.
   */
  private detectProjectInfo(projectPath: string): {
    framework: string;
    detectedPort?: number;
  } {
    let framework = "generic";
    let detectedPort: number | undefined;

    // Check .env files for PORT
    const envCandidates = [".env", ".env.local", ".env.development"];
    for (const fname of envCandidates) {
      const p = path.join(projectPath, fname);
      if (fs.existsSync(p)) {
        try {
          const content = fs.readFileSync(p, "utf8");
          const m = content.match(/^PORT\s*=\s*(\d+)/m);
          if (m && m[1]) {
            detectedPort = parseInt(m[1], 10);
            break;
          }
        } catch {
          // ignore
        }
      }
    }

    // Check package.json
    const pkgPath = path.join(projectPath, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };

        if (deps.next) {
          framework = "nextjs";
        } else if (deps["@nestjs/core"]) {
          framework = "nestjs";
        } else if (deps.express) {
          framework = "express";
        } else if (deps.fastify) {
          framework = "fastify";
        } else if (deps.koa) {
          framework = "koa";
        }

        // Check scripts for port flag, e.g. "next dev -p 3001" or "PORT=5001"
        if (!detectedPort && pkg.scripts) {
          const allScripts = Object.values(pkg.scripts).join(" ");
          const scriptPortMatch = allScripts.match(/-p\s+(\d+)|PORT=(\d+)/);
          if (scriptPortMatch) {
            detectedPort = parseInt(scriptPortMatch[1] || scriptPortMatch[2], 10);
          }
        }
      } catch {
        // ignore
      }
    }

    // Check Python
    if (
      fs.existsSync(path.join(projectPath, "requirements.txt")) ||
      fs.existsSync(path.join(projectPath, "pyproject.toml"))
    ) {
      framework = "fastapi";
    }

    return { framework, detectedPort };
  }

  /**
   * Recursively collects scannable files up to MAX_SCAN_FILES limit.
   */
  private collectFiles(root: string, dir: string, files: string[]): void {
    if (files.length >= MAX_SCAN_FILES) return;

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= MAX_SCAN_FILES) break;

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
          this.collectFiles(root, fullPath, files);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (
          [".ts", ".tsx", ".js", ".jsx", ".mjs", ".py", ".json", ".yaml", ".yml"].includes(
            ext
          )
        ) {
          files.push(fullPath);
        }
      }
    }
  }

  /**
   * Scans for Express router mount mappings:
   * e.g. app.use("/api", apiRouter)
   * e.g. apiRouter.use("/workspaces", workspaceRoutes)
   * Handles nested router prefixes (e.g. /api + /workspaces = /api/workspaces)
   */
  private scanExpressRouterMounts(codeFiles: string[]): Map<string, string> {
    const mountMap = new Map<string, string>(); // base filename, var name, file path -> mount path prefix
    const parentRouterMap = new Map<string, string>(); // child name -> parent router instance name
    const fileOfRouter = new Map<string, string>(); // child name -> file path

    // Standard router mount: app.use("/api/auth", authRouter) or apiRouter.use("/cart", cartRouter)
    const mountRegex =
      /([a-zA-Z0-9_$]+)\.use\s*\(\s*["']([^"']+)["']\s*,\s*([a-zA-Z0-9_$]+)\s*\)/g;

    // Inline require mount: app.use("/api/auth", require("./routes/authRoute.js"))
    const inlineRequireRegex =
      /([a-zA-Z0-9_$]+)\.use\s*\(\s*["']([^"']+)["']\s*,\s*require\s*\(\s*["']([^"']+)["']\s*\)\s*\)/g;

    for (const filePath of codeFiles) {
      if (!/\.(ts|js|mjs)$/.test(filePath)) continue;
      try {
        const stat = fs.statSync(filePath);
        if (stat.size > MAX_FILE_SIZE_BYTES) continue;
        const content = fs.readFileSync(filePath, "utf8");
        const dir = path.dirname(filePath);

        const registerMount = (
          parentInstance: string,
          mountPath: string,
          routerIdentifier: string,
          importPath?: string
        ) => {
          const cleanMount = cleanPath(mountPath);

          // 1. By variable / identifier name
          mountMap.set(routerIdentifier, cleanMount);
          parentRouterMap.set(routerIdentifier, parentInstance);
          fileOfRouter.set(routerIdentifier, filePath);

          if (importPath) {
            const rawBase = path.basename(importPath).replace(/\.(js|ts|mjs|tsx|jsx)$/, "");
            mountMap.set(rawBase, cleanMount);
            mountMap.set(rawBase.toLowerCase(), cleanMount);
            parentRouterMap.set(rawBase, parentInstance);
            fileOfRouter.set(rawBase, filePath);

            // Stripped resource name (e.g. authRoute -> auth, addressRoutes -> address)
            const strippedBase = rawBase
              .replace(/(?:Routes?|Router|Controller)$/i, "")
              .toLowerCase();
            if (strippedBase) {
              mountMap.set(strippedBase, cleanMount);
            }

            // Resolve exact absolute file paths
            if (importPath.startsWith(".")) {
              const absCandidate = path.resolve(dir, importPath).replace(/\\/g, "/");
              mountMap.set(absCandidate, cleanMount);
              mountMap.set(absCandidate.replace(/\.(js|ts|mjs|tsx|jsx)$/, ""), cleanMount);
              for (const ext of [".js", ".ts", ".mjs"]) {
                mountMap.set(absCandidate + ext, cleanMount);
              }
            }
          }
        };

        // 1. Inline require mounts: app.use("/api/auth", require("./routes/authRoute"))
        let inlineM: RegExpExecArray | null;
        inlineRequireRegex.lastIndex = 0;
        while ((inlineM = inlineRequireRegex.exec(content)) !== null) {
          const parentInstance = inlineM[1];
          const mountPath = inlineM[2];
          const reqPath = inlineM[3];
          const rawBase = path.basename(reqPath).replace(/\.(js|ts|mjs|tsx|jsx)$/, "");
          registerMount(parentInstance, mountPath, rawBase, reqPath);
        }

        // 2. Variable mounts: app.use("/api/auth", authRouter)
        let m: RegExpExecArray | null;
        mountRegex.lastIndex = 0;
        while ((m = mountRegex.exec(content)) !== null) {
          const parentInstance = m[1];
          const mountPath = m[2];
          const routerVar = m[3];

          // Trace import/require for routerVar in this file:
          // - const authRouter = require("./routes/authRoute.js")
          // - const { authRouter } = require("./routes/authRoute.js")
          // - import authRouter from "./routes/authRoute.js"
          // - import { authRouter } from "./routes/authRoute.js"
          const requireRegex = new RegExp(
            `(?:import\\s+(?:${routerVar}|\\{[^}]*\\b${routerVar}\\b[^}]*\\})\\s+from|(?:const|let|var)\\s+(?:${routerVar}|\\{[^}]*\\b${routerVar}\\b[^}]*\\})\\s*=\\s*require\\s*\\()\\s*["']([^"']+)["']`,
            "i"
          );
          const reqMatch = content.match(requireRegex);
          const importPath = reqMatch && reqMatch[1] ? reqMatch[1] : undefined;

          registerMount(parentInstance, mountPath, routerVar, importPath);
        }
      } catch {
        // ignore read error
      }
    }

    // Pass 2: Resolve nested mount chains (e.g. app.use("/api", apiRouter) -> apiRouter.use("/workspaces", ...))
    for (let pass = 0; pass < 3; pass++) {
      for (const [childName, currentPath] of Array.from(mountMap.entries())) {
        const parentInstance = parentRouterMap.get(childName);
        if (!parentInstance) continue;

        // Check if parentInstance has a known mount
        const parentMount = mountMap.get(parentInstance);
        if (parentMount && !currentPath.startsWith(parentMount)) {
          mountMap.set(childName, cleanPath(`${parentMount}/${currentPath}`));
        } else {
          // Check if parent file has a known mount
          const parentFile = fileOfRouter.get(childName);
          if (parentFile) {
            const parentBase = path.basename(parentFile).replace(/\.(js|ts|mjs)$/, "");
            const parentBaseMount = mountMap.get(parentBase);
            if (parentBaseMount && !currentPath.startsWith(parentBaseMount)) {
              mountMap.set(childName, cleanPath(`${parentBaseMount}/${currentPath}`));
            }
          }
        }
      }
    }

    // If an apiRouter or "/api" root mount exists, ensure child routes files inherit /api
    const apiPrefix = mountMap.get("apiRouter") || mountMap.get("index") || mountMap.get("api");
    if (apiPrefix && (apiPrefix === "/api" || apiPrefix.startsWith("/api/"))) {
      for (const [childName, currentPath] of Array.from(mountMap.entries())) {
        if (!currentPath.startsWith("/api/") && currentPath !== "/api" && childName !== "index") {
          mountMap.set(childName, cleanPath(`/api/${currentPath}`));
        }
      }
    }

    return mountMap;
  }

  /**
   * Parses Express / Connect route definitions:
   * router.get('/path', handler)
   * app.post('/api/users', handler)
   * productRouter.get('/items', handler)
   */
  private parseExpressRoute(
    filePath: string,
    relativePath: string,
    routerMountMap: Map<string, string>,
    baseUrl: string,
    endpoints: DiscoveredApiEndpoint[]
  ): void {
    if (!/\.(ts|js|tsx|jsx|mjs)$/.test(filePath)) return;
    try {
      const stat = fs.statSync(filePath);
      if (stat.size > MAX_FILE_SIZE_BYTES) return;
      const content = fs.readFileSync(filePath, "utf8");

      const fileBaseName = path.basename(filePath).replace(/\.(ts|js|mjs|tsx|jsx)$/, "");
      const normalizedPath = filePath.replace(/\\/g, "/");
      const normalizedNoExt = normalizedPath.replace(/\.(ts|js|mjs|tsx|jsx)$/, "");
      const resourceBase = fileBaseName
        .replace(/(?:Routes?|Router|Controller)$/i, "")
        .toLowerCase();

      // Look up mount prefix: exact file path -> normalized -> base name -> resource name
      let prefix =
        routerMountMap.get(filePath) ||
        routerMountMap.get(normalizedPath) ||
        routerMountMap.get(normalizedNoExt) ||
        routerMountMap.get(fileBaseName) ||
        routerMountMap.get(fileBaseName.toLowerCase()) ||
        routerMountMap.get(resourceBase) ||
        "";

      // Fallback prefix: if this is a route/controller file without explicit app.use found,
      // prevent routes from polluting root / and colliding with other route files
      if (!prefix) {
        const isRouteFile =
          /\/routes?\/|\/controllers?\/|\/endpoints?\//i.test(normalizedPath) &&
          !/^(?:index|app|server|main)$/i.test(fileBaseName);

        if (isRouteFile && resourceBase) {
          const hasApiPrefix =
            Array.from(routerMountMap.values()).some((v) => v.startsWith("/api")) ||
            relativePath.includes("backend");
          prefix = cleanPath(hasApiPrefix ? `/api/${resourceBase}` : `/${resourceBase}`);
        }
      }

      if (prefix && !prefix.startsWith("/api") && relativePath.includes("backend")) {
        prefix = cleanPath(`/api/${prefix}`);
      }

      // Discover router variable names declared in this file
      const routerVarNames = new Set<string>([
        "router",
        "app",
        "server",
        "api",
        "routes",
        "v1",
        "v2",
        "r",
      ]);

      // Add declared router identifiers: const authRouter = express.Router(), etc.
      const routerDeclRegex =
        /(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:express\.)?(?:Router|express)\s*\(/g;
      let declM: RegExpExecArray | null;
      while ((declM = routerDeclRegex.exec(content)) !== null) {
        routerVarNames.add(declM[1]);
      }

      // Add any variable in file ending with Router or Route (e.g. productRouter)
      const routeWordRegex = /\b([a-zA-Z0-9_$]*(?:router|route))\b/gi;
      let wordM: RegExpExecArray | null;
      while ((wordM = routeWordRegex.exec(content)) !== null) {
        routerVarNames.add(wordM[1]);
      }

      const routerPattern = Array.from(routerVarNames)
        .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("|");

      const lines = content.split(/\r?\n/);

      // 1. Direct route calls: router.get('/path', handler)
      const routeRegex = new RegExp(
        `(?:${routerPattern})\\.(get|post|put|patch|delete|options|head)\\s*\\(\\s*["'\`]?([^"'\`\\s,)]*)["'\`]?`,
        "g"
      );

      // 2. Chained route calls: router.route('/path').get(h1).post(h2)
      const chainedRouteRegex = new RegExp(
        `(?:${routerPattern})\\.route\\s*\\(\\s*["'\`]?([^"'\`\\s,)]*)["'\`]?\\s*\\)((?:\\s*\\.(?:get|post|put|patch|delete|options|head)\\s*\\([^)]*\\))+)`,
        "g"
      );

      const processEndpoint = (
        method: HttpMethod,
        subPath: string,
        lineIndex: number
      ) => {
        let fullRoutePath = cleanPath(
          prefix ? `${prefix}/${subPath || "/"}` : (subPath || "/")
        );
        if (!fullRoutePath.startsWith("/")) {
          fullRoutePath = "/" + fullRoutePath;
        }
        fullRoutePath = normalizeDynamicParam(fullRoutePath);

        const commentInfo = this.extractPrecedingComment(lines, lineIndex);

        const derivedCat = this.deriveCategoryFromPath(fullRoutePath);
        const isEntryFile = /^(?:index|app|server|main)$/i.test(resourceBase);
        const fileCat = resourceBase && !isEntryFile ? resourceBase.charAt(0).toUpperCase() + resourceBase.slice(1) : "";
        const category = derivedCat || fileCat || "General";

        const pathParams = extractPathParams(fullRoutePath);
        const handlerSnippet = lines
          .slice(lineIndex, Math.min(lines.length, lineIndex + 35))
          .join("\n");
        const queryParams = this.extractQueryParams(handlerSnippet, commentInfo.rawComment);
        const requestBody = this.extractRequestBody(
          method,
          fullRoutePath,
          handlerSnippet,
          commentInfo.rawComment
        );
        const responses = this.extractResponses(
          method,
          fullRoutePath,
          handlerSnippet,
          commentInfo.rawComment
        );

        const fullUrl = `${baseUrl}${fullRoutePath}`;
        const howToUse = generateHowToUseSnippets(
          method,
          fullUrl,
          requestBody?.sampleJson
        );

        const name = commentInfo.title || `${method} ${fullRoutePath}`;
        const fileSlug = fileBaseName.toLowerCase().replace(/[^a-z0-9]/g, "-");

        endpoints.push({
          id: `exp-${fileSlug}-${method.toLowerCase()}-${fullRoutePath.replace(/[^a-zA-Z0-9]/g, "-")}-${lineIndex + 1}`,
          method,
          path: fullRoutePath,
          name,
          description: commentInfo.description || undefined,
          category: category.charAt(0).toUpperCase() + category.slice(1),
          sourceFile: relativePath,
          sourceLine: lineIndex + 1,
          pathParams,
          queryParams,
          headers: [
            { key: "Content-Type", value: "application/json" },
            { key: "Accept", value: "application/json" },
          ],
          requestBody,
          responses,
          howToUse,
          framework: "express",
        });
      };

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Match direct route definitions
        let match: RegExpExecArray | null;
        routeRegex.lastIndex = 0;
        while ((match = routeRegex.exec(line)) !== null) {
          const method = match[1].toUpperCase() as HttpMethod;
          const subPath = match[2] || "/";
          processEndpoint(method, subPath, i);
        }

        // Match chained route definitions: router.route('/path').get(...).post(...)
        let chainedMatch: RegExpExecArray | null;
        chainedRouteRegex.lastIndex = 0;
        while ((chainedMatch = chainedRouteRegex.exec(line)) !== null) {
          const subPath = chainedMatch[1] || "/";
          const chainPart = chainedMatch[2];
          const chainMethodRegex = /\.(get|post|put|patch|delete|options|head)\s*\(/g;
          let methodM: RegExpExecArray | null;
          while ((methodM = chainMethodRegex.exec(chainPart)) !== null) {
            const method = methodM[1].toUpperCase() as HttpMethod;
            processEndpoint(method, subPath, i);
          }
        }
      }
    } catch {
      // ignore parsing failure
    }
  }

  /**
   * Parses Next.js App Router API routes:
   * app/api/** /route.ts
   */
  private parseNextAppRoute(
    filePath: string,
    relativePath: string,
    baseUrl: string,
    endpoints: DiscoveredApiEndpoint[]
  ): void {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      const lines = content.split(/\r?\n/);

      // Derive URL path from file path
      // e.g. "src/app/api/workspaces/[id]/route.ts" -> "/api/workspaces/:id"
      const apiIndex = relativePath.indexOf("app/api/");
      const pathPart = relativePath.substring(apiIndex + "app".length);
      const dirPart = pathPart.substring(0, pathPart.lastIndexOf("/route."));
      const routePath = normalizeDynamicParam(cleanPath(dirPart));

      const pathParams = extractPathParams(routePath);
      const category = this.deriveCategoryFromPath(routePath);

      // Find exported handler functions: GET, POST, PUT, DELETE, PATCH
      const exportRegex =
        /export\s+(?:async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s*\(/g;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let m: RegExpExecArray | null;
        exportRegex.lastIndex = 0;

        while ((m = exportRegex.exec(line)) !== null) {
          const method = m[1].toUpperCase() as HttpMethod;
          const commentInfo = this.extractPrecedingComment(lines, i);

          const handlerSnippet = lines.slice(i, Math.min(lines.length, i + 40)).join("\n");
          const queryParams = this.extractQueryParams(handlerSnippet, commentInfo.rawComment);
          const requestBody = this.extractRequestBody(method, routePath, handlerSnippet, commentInfo.rawComment);
          const responses = this.extractResponses(method, routePath, handlerSnippet, commentInfo.rawComment);

          const fullUrl = `${baseUrl}${routePath}`;
          const howToUse = generateHowToUseSnippets(
            method,
            fullUrl,
            requestBody?.sampleJson
          );

          endpoints.push({
            id: `next-app-${method.toLowerCase()}-${routePath.replace(/[^a-zA-Z0-9]/g, "-")}`,
            method,
            path: routePath,
            name: commentInfo.title || `${method} ${routePath}`,
            description: commentInfo.description || undefined,
            category,
            sourceFile: relativePath,
            sourceLine: i + 1,
            pathParams,
            queryParams,
            headers: [{ key: "Content-Type", value: "application/json" }],
            requestBody,
            responses,
            howToUse,
            framework: "nextjs",
          });
        }
      }
    } catch {
      // ignore
    }
  }

  /**
   * Parses Next.js Pages Router API routes:
   * pages/api/**.ts
   */
  private parseNextPagesRoute(
    filePath: string,
    relativePath: string,
    baseUrl: string,
    endpoints: DiscoveredApiEndpoint[]
  ): void {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      const lines = content.split(/\r?\n/);

      const apiIndex = relativePath.indexOf("pages/api/");
      const pathPart = relativePath.substring(apiIndex + "pages".length);
      const routePath = normalizeDynamicParam(
        cleanPath(pathPart.replace(/\.(ts|js|tsx|jsx|mjs)$/, ""))
      );

      const pathParams = extractPathParams(routePath);
      const category = this.deriveCategoryFromPath(routePath);

      // Detect methods inside handler (e.g. req.method === "POST" or case "POST")
      const detectedMethods: HttpMethod[] = [];
      const methodCheck = /req\.method\s*===?\s*["'](GET|POST|PUT|DELETE|PATCH)["']|case\s*["'](GET|POST|PUT|DELETE|PATCH)["']/gi;
      let m: RegExpExecArray | null;

      while ((m = methodCheck.exec(content)) !== null) {
        const met = (m[1] || m[2]).toUpperCase() as HttpMethod;
        if (!detectedMethods.includes(met)) detectedMethods.push(met);
      }

      if (detectedMethods.length === 0) {
        detectedMethods.push("GET");
      }

      for (const method of detectedMethods) {
        const queryParams = this.extractQueryParams(content);
        const requestBody = this.extractRequestBody(method, routePath, content);
        const responses = this.extractResponses(method, routePath, content);

        const fullUrl = `${baseUrl}${routePath}`;
        const howToUse = generateHowToUseSnippets(
          method,
          fullUrl,
          requestBody?.sampleJson
        );

        endpoints.push({
          id: `next-pages-${method.toLowerCase()}-${routePath.replace(/[^a-zA-Z0-9]/g, "-")}`,
          method,
          path: routePath,
          name: `${method} ${routePath}`,
          category,
          sourceFile: relativePath,
          sourceLine: 1,
          pathParams,
          queryParams,
          headers: [{ key: "Content-Type", value: "application/json" }],
          requestBody,
          responses,
          howToUse,
          framework: "nextjs",
        });
      }
    } catch {
      // ignore
    }
  }

  /**
   * Parses NestJS Controller decorators:
   * @Controller('users') + @Get(':id')
   */
  private parseNestJsController(
    filePath: string,
    relativePath: string,
    baseUrl: string,
    endpoints: DiscoveredApiEndpoint[]
  ): void {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      const lines = content.split(/\r?\n/);

      const controllerMatch = content.match(/@Controller\s*\(\s*["']([^"']*)["']\s*\)/);
      if (!controllerMatch) return;

      const prefix = cleanPath(controllerMatch[1] || "");
      const methodRegex =
        /@(Get|Post|Put|Delete|Patch)\s*\(\s*(?:["']([^"']*)["'])?\s*\)/g;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let m: RegExpExecArray | null;
        methodRegex.lastIndex = 0;

        while ((m = methodRegex.exec(line)) !== null) {
          const method = m[1].toUpperCase() as HttpMethod;
          const sub = m[2] || "";
          const fullRoutePath = normalizeDynamicParam(cleanPath(`${prefix}/${sub}`));
          const pathParams = extractPathParams(fullRoutePath);

          const handlerSnippet = lines.slice(i, Math.min(lines.length, i + 25)).join("\n");
          const queryParams = this.extractQueryParams(handlerSnippet);
          const requestBody = this.extractRequestBody(method, fullRoutePath, handlerSnippet);
          const responses = this.extractResponses(method, fullRoutePath, handlerSnippet);

          const fullUrl = `${baseUrl}${fullRoutePath}`;
          const howToUse = generateHowToUseSnippets(
            method,
            fullUrl,
            requestBody?.sampleJson
          );

          endpoints.push({
            id: `nest-${method.toLowerCase()}-${fullRoutePath.replace(/[^a-zA-Z0-9]/g, "-")}`,
            method,
            path: fullRoutePath,
            name: `${method} ${fullRoutePath}`,
            category: this.deriveCategoryFromPath(fullRoutePath),
            sourceFile: relativePath,
            sourceLine: i + 1,
            pathParams,
            queryParams,
            headers: [{ key: "Content-Type", value: "application/json" }],
            requestBody,
            responses,
            howToUse,
            framework: "nestjs",
          });
        }
      }
    } catch {
      // ignore
    }
  }

  /**
   * Parses Python FastAPI / Flask routes:
   * @app.get('/items/{id}')
   */
  private parsePythonRoute(
    filePath: string,
    relativePath: string,
    baseUrl: string,
    endpoints: DiscoveredApiEndpoint[]
  ): void {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      const lines = content.split(/\r?\n/);

      const routeRegex =
        /@(?:app|router)\.(get|post|put|delete|patch)\s*\(\s*["']([^"']+)["']/g;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let m: RegExpExecArray | null;
        routeRegex.lastIndex = 0;

        while ((m = routeRegex.exec(line)) !== null) {
          const method = m[1].toUpperCase() as HttpMethod;
          const routePath = normalizeDynamicParam(cleanPath(m[2]));
          const pathParams = extractPathParams(routePath);

          const handlerSnippet = lines.slice(i, Math.min(lines.length, i + 30)).join("\n");
          const requestBody = this.extractRequestBody(method, routePath, handlerSnippet);
          const responses = this.extractResponses(method, routePath, handlerSnippet);

          const fullUrl = `${baseUrl}${routePath}`;
          const howToUse = generateHowToUseSnippets(
            method,
            fullUrl,
            requestBody?.sampleJson
          );

          endpoints.push({
            id: `py-${method.toLowerCase()}-${routePath.replace(/[^a-zA-Z0-9]/g, "-")}`,
            method,
            path: routePath,
            name: `${method} ${routePath}`,
            category: this.deriveCategoryFromPath(routePath),
            sourceFile: relativePath,
            sourceLine: i + 1,
            pathParams,
            queryParams: [],
            headers: [{ key: "Content-Type", value: "application/json" }],
            requestBody,
            responses,
            howToUse,
            framework: "fastapi",
          });
        }
      }
    } catch {
      // ignore
    }
  }

  /**
   * Scans for OpenAPI / Swagger specifications:
   * swagger.json, openapi.json, openapi.yaml
   */
  private scanOpenApiSpecs(
    projectPath: string,
    baseUrl: string
  ): DiscoveredApiEndpoint[] {
    const candidates = [
      "swagger.json",
      "openapi.json",
      "api-spec.json",
      "docs/swagger.json",
      "docs/openapi.json",
    ];

    for (const rel of candidates) {
      const fullPath = path.join(projectPath, rel);
      if (fs.existsSync(fullPath)) {
        try {
          const content = fs.readFileSync(fullPath, "utf8");
          const spec = JSON.parse(content);
          if (spec.paths && typeof spec.paths === "object") {
            const endpoints: DiscoveredApiEndpoint[] = [];

            for (const [rawPath, methodsObj] of Object.entries(spec.paths)) {
              if (!methodsObj || typeof methodsObj !== "object") continue;

              for (const [rawMethod, operation] of Object.entries(methodsObj as Record<string, any>)) {
                const method = rawMethod.toUpperCase() as HttpMethod;
                if (!["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"].includes(method)) {
                  continue;
                }

                const normPath = normalizeDynamicParam(cleanPath(rawPath));
                const pathParams: ApiParamInfo[] = [];
                const queryParams: ApiParamInfo[] = [];

                if (Array.isArray(operation.parameters)) {
                  for (const p of operation.parameters) {
                    const info: ApiParamInfo = {
                      name: p.name,
                      type: p.schema?.type || p.type || "string",
                      required: Boolean(p.required),
                      description: p.description,
                      sampleValue: p.example || p.schema?.example,
                    };
                    if (p.in === "path") pathParams.push(info);
                    if (p.in === "query") queryParams.push(info);
                  }
                }

                // Request body
                let requestBody: ApiRequestBodyInfo | undefined;
                if (operation.requestBody?.content?.["application/json"]) {
                  const schema = operation.requestBody.content["application/json"].schema;
                  requestBody = {
                    contentType: "application/json",
                    schemaType: schema?.title || "JSON Object",
                    sampleJson: JSON.stringify(
                      operation.requestBody.content["application/json"].example ||
                        this.generateDummyFromSchema(schema),
                      null,
                      2
                    ),
                  };
                }

                // Responses
                const responses: ApiResponseInfo[] = [];
                if (operation.responses) {
                  for (const [code, respObj] of Object.entries(operation.responses as Record<string, any>)) {
                    responses.push({
                      statusCode: parseInt(code, 10) || 200,
                      description: respObj.description,
                    });
                  }
                }

                const fullUrl = `${baseUrl}${normPath}`;
                const howToUse = generateHowToUseSnippets(
                  method,
                  fullUrl,
                  requestBody?.sampleJson
                );

                endpoints.push({
                  id: `oas-${method.toLowerCase()}-${normPath.replace(/[^a-zA-Z0-9]/g, "-")}`,
                  method,
                  path: normPath,
                  name: operation.summary || operation.operationId || `${method} ${normPath}`,
                  description: operation.description,
                  category: operation.tags?.[0] || this.deriveCategoryFromPath(normPath),
                  sourceFile: rel,
                  sourceLine: 1,
                  pathParams,
                  queryParams,
                  headers: [{ key: "Content-Type", value: "application/json" }],
                  requestBody,
                  responses,
                  howToUse,
                  framework: "openapi",
                });
              }
            }

            return endpoints;
          }
        } catch {
          // ignore parsing error
        }
      }
    }

    return [];
  }

  /**
   * Helper to generate dummy JSON from OpenAPI schema.
   */
  private generateDummyFromSchema(schema: any): any {
    if (!schema) return {};
    if (schema.type === "object" && schema.properties) {
      const obj: Record<string, any> = {};
      for (const [key, prop] of Object.entries(schema.properties as Record<string, any>)) {
        if (prop.example !== undefined) {
          obj[key] = prop.example;
        } else if (prop.type === "string") {
          obj[key] = key.toLowerCase().includes("email")
            ? "user@example.com"
            : key.toLowerCase().includes("id")
            ? "123"
            : "sample_value";
        } else if (prop.type === "number" || prop.type === "integer") {
          obj[key] = 1;
        } else if (prop.type === "boolean") {
          obj[key] = true;
        } else if (prop.type === "array") {
          obj[key] = [];
        } else {
          obj[key] = {};
        }
      }
      return obj;
    }
    return {};
  }

  /**
   * Extracts preceding comments (JSDoc or line comments).
   */
  private extractPrecedingComment(
    lines: string[],
    lineIndex: number
  ): { title?: string; description?: string; rawComment?: string } {
    const commentLines: string[] = [];
    let idx = lineIndex - 1;

    while (idx >= 0 && lines[idx].trim().length > 0) {
      const trimmed = lines[idx].trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
        commentLines.unshift(
          trimmed
            .replace(/^\/\/\s*/, "")
            .replace(/^\/\*\*\s*/, "")
            .replace(/^\*\s*/, "")
            .replace(/\*\/$/, "")
            .trim()
        );
        idx--;
      } else {
        break;
      }
    }

    if (commentLines.length === 0) return {};

    const fullComment = commentLines.join(" ").trim();
    // E.g. "GET /api/workspaces - List all saved workspaces with their projects"
    let title: string | undefined;
    let description: string | undefined;

    if (fullComment.includes(" - ")) {
      const parts = fullComment.split(" - ");
      title = parts[1].trim();
      description = fullComment;
    } else {
      title = commentLines[0];
      description = fullComment;
    }

    return { title, description, rawComment: fullComment };
  }

  /**
   * Extracts query parameters from code patterns or comments.
   */
  private extractQueryParams(snippet: string, comment?: string): ApiParamInfo[] {
    const params: ApiParamInfo[] = [];
    const foundNames = new Set<string>();

    // Pattern 1: req.query.paramName or searchParams.get('paramName')
    const queryRegex =
      /(?:req\.query|searchParams\.get)\s*(?:\.([a-zA-Z0-9_]+)|\(\s*["']([^"']+)["']\s*\))/g;
    let m: RegExpExecArray | null;

    while ((m = queryRegex.exec(snippet)) !== null) {
      const name = m[1] || m[2];
      if (name && !foundNames.has(name)) {
        foundNames.add(name);
        params.push({
          name,
          type: "string",
          required: false,
          description: `Query parameter "${name}"`,
          sampleValue: "1",
        });
      }
    }

    // Pattern 2: destructuring: const { limit, page, filter } = req.query
    const destructureMatch = snippet.match(
      /const\s*\{([^}]+)\}\s*=\s*(?:req\.query|searchParams)/
    );
    if (destructureMatch && destructureMatch[1]) {
      const keys = destructureMatch[1].split(",");
      for (const k of keys) {
        const name = k.trim().split(":")[0].trim();
        if (name && !foundNames.has(name)) {
          foundNames.add(name);
          params.push({
            name,
            type: "string",
            required: false,
            description: `Query parameter "${name}"`,
            sampleValue: "1",
          });
        }
      }
    }

    return params;
  }

  /**
   * Extracts expected request body fields and sample JSON.
   */
  private extractRequestBody(
    method: HttpMethod,
    routePath: string,
    snippet: string,
    comment?: string
  ): ApiRequestBodyInfo | undefined {
    if (!["POST", "PUT", "PATCH"].includes(method)) return undefined;

    const fields: ApiParamInfo[] = [];
    let dummyObj: Record<string, any> = {};

    // Check destructuring: const { name, path, content } = req.body or await req.json()
    const bodyDestructure = snippet.match(
      /const\s*\{([^}]+)\}\s*=\s*(?:req\.body|await\s+(?:req|request)\.json\(\))/
    );

    if (bodyDestructure && bodyDestructure[1]) {
      const keys = bodyDestructure[1].split(",");
      for (const k of keys) {
        const key = k.trim().split(":")[0].split("=")[0].trim();
        if (key && !key.startsWith("...")) {
          let sampleVal: any = "sample_value";
          let type = "string";

          if (key.toLowerCase().includes("id")) {
            sampleVal = "id-123";
          } else if (key.toLowerCase().includes("path")) {
            sampleVal = "/sample/path";
          } else if (key.toLowerCase().includes("port")) {
            sampleVal = 3000;
            type = "number";
          } else if (
            key.toLowerCase().includes("enable") ||
            key.toLowerCase().includes("is")
          ) {
            sampleVal = true;
            type = "boolean";
          } else if (
            key.toLowerCase().includes("list") ||
            key.toLowerCase().includes("items")
          ) {
            sampleVal = [];
            type = "array";
          }

          dummyObj[key] = sampleVal;
          fields.push({
            name: key,
            type,
            required: !k.includes("="),
            sampleValue: String(sampleVal),
          });
        }
      }
    }

    // Semantic route keyword fallback if no destructuring found
    if (Object.keys(dummyObj).length === 0) {
      const lower = routePath.toLowerCase();
      if (lower.includes("account")) {
        dummyObj = {
          name: "Acme Media Account",
          platform: "youtube",
          status: "active",
          settings: {
            autoUpload: true,
            notifications: true,
          },
        };
      } else if (lower.includes("video") || lower.includes("download")) {
        dummyObj = {
          videoUrl: "https://www.youtube.com/watch?v=sample123",
          title: "Automated Workflow Demo",
          resolution: "1080p",
          format: "mp4",
        };
      } else if (lower.includes("post")) {
        dummyObj = {
          title: "Announcing Developer Tools v2.0",
          caption: "Check out the latest features in DevDesk! #coding #developer #tools",
          scheduledTime: "2026-10-25T14:30:00Z",
          tags: ["devdesk", "automation", "tech"],
        };
      } else if (lower.includes("login") || lower.includes("auth")) {
        dummyObj = {
          email: "developer@example.com",
          password: "SuperSecretPassword123!",
        };
      } else if (lower.includes("register") || lower.includes("signup")) {
        dummyObj = {
          username: "dev_user",
          email: "developer@example.com",
          password: "SuperSecretPassword123!",
          role: "developer",
        };
      } else if (lower.includes("forgot-password") || lower.includes("reset-password")) {
        dummyObj = {
          email: "developer@example.com",
        };
      } else if (lower.includes("bulk")) {
        dummyObj = {
          action: "batch_process",
          ids: ["item_101", "item_102", "item_103"],
        };
      } else if (lower.includes("workspace") || lower.includes("scan")) {
        dummyObj = {
          path: "/Users/developer/Projects/my-app",
        };
      } else {
        dummyObj = {
          name: "Sample Resource",
          status: "active",
          description: "Example request payload for testing this endpoint.",
        };
      }

      for (const [k, v] of Object.entries(dummyObj)) {
        fields.push({
          name: k,
          type: typeof v,
          required: false,
          sampleValue: typeof v === "object" ? JSON.stringify(v) : String(v),
        });
      }
    }

    const sampleJson = JSON.stringify(dummyObj, null, 2);

    return {
      contentType: "application/json",
      schemaType: "JSON Payload",
      sampleJson,
      fields: fields.length > 0 ? fields : undefined,
    };
  }

  /**
   * Extracts response status codes and sample returns.
   */
  private extractResponses(
    method: HttpMethod,
    routePath: string,
    snippet: string,
    comment?: string
  ): ApiResponseInfo[] {
    const responses: ApiResponseInfo[] = [];
    const foundCodes = new Set<number>();
    const lower = routePath.toLowerCase();

    // Helper to generate realistic 200/201 response JSON
    const generateRealisticSuccessResponse = (statusCode: number) => {
      if (method === "DELETE") {
        return JSON.stringify(
          {
            success: true,
            message: "Resource deleted successfully.",
            deletedId: lower.includes("account")
              ? "acc_1024"
              : lower.includes("post")
              ? "post_5012"
              : lower.includes("video")
              ? "vid_9901"
              : "item_12345",
          },
          null,
          2
        );
      }

      if (lower.includes("account")) {
        return JSON.stringify(
          {
            success: true,
            account: {
              id: "acc_1024",
              name: "Acme Media Account",
              platform: "youtube",
              status: "active",
              updatedAt: "2026-10-23T12:00:00.000Z",
            },
          },
          null,
          2
        );
      }

      if (lower.includes("video") || lower.includes("download")) {
        return JSON.stringify(
          {
            success: true,
            video: {
              id: "vid_9901",
              title: "Automated Workflow Demo",
              status: "ready",
              downloadUrl: "https://storage.example.com/videos/vid_9901.mp4",
            },
          },
          null,
          2
        );
      }

      if (lower.includes("post")) {
        return JSON.stringify(
          {
            success: true,
            post: {
              id: "post_5012",
              title: "Announcing Developer Tools v2.0",
              status: "published",
              publishedAt: "2026-10-23T12:00:00.000Z",
            },
          },
          null,
          2
        );
      }

      if (lower.includes("login") || lower.includes("auth")) {
        return JSON.stringify(
          {
            success: true,
            token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
            user: {
              id: "usr_8820",
              email: "developer@example.com",
            },
          },
          null,
          2
        );
      }

      if (lower === "/me" || lower.endsWith("/me")) {
        return JSON.stringify(
          {
            success: true,
            user: {
              id: "usr_8820",
              name: "Developer",
              email: "developer@example.com",
              role: "admin",
            },
          },
          null,
          2
        );
      }

      if (lower.includes("forgot-password") || lower.includes("reset-password")) {
        return JSON.stringify(
          {
            success: true,
            message: "Password reset instructions dispatched.",
          },
          null,
          2
        );
      }

      return JSON.stringify(
        {
          success: true,
          statusCode,
          message: "Request processed successfully.",
          data: {
            id: "item_1001",
            createdAt: "2026-10-23T12:00:00.000Z",
          },
        },
        null,
        2
      );
    };

    // Find status codes in res.status(200), res.status(404), status: 201
    const statusRegex = /(?:status\(|status:\s*)(\d{3})\)?/g;
    let m: RegExpExecArray | null;

    while ((m = statusRegex.exec(snippet)) !== null) {
      const code = parseInt(m[1], 10);
      if (!foundCodes.has(code)) {
        foundCodes.add(code);
        let desc = "Success response";
        if (code === 201) desc = "Resource successfully created";
        if (code === 400) desc = "Invalid request or validation failure";
        if (code === 401) desc = "Authentication required";
        if (code === 403) desc = "Access forbidden";
        if (code === 404) desc = "Resource not found";
        if (code === 409) desc = "Conflict detected";
        if (code >= 500) desc = "Internal server error";

        responses.push({
          statusCode: code,
          description: desc,
          sampleJson:
            code < 400
              ? generateRealisticSuccessResponse(code)
              : JSON.stringify(
                  {
                    success: false,
                    statusCode: code,
                    error: desc,
                  },
                  null,
                  2
                ),
        });
      }
    }

    // Always ensure at least 200 OK is listed if none detected
    if (responses.length === 0) {
      responses.push({
        statusCode: method === "POST" ? 201 : 200,
        description: "Success response",
        sampleJson: generateRealisticSuccessResponse(method === "POST" ? 201 : 200),
      });
    }

    responses.sort((a, b) => a.statusCode - b.statusCode);
    return responses;
  }

  /**
   * Categorizes endpoints based on path segments:
   * /api/workspaces -> "Workspaces"
   * /api/processes -> "Processes"
   */
  private deriveCategoryFromPath(routePath: string): string {
    const segments = routePath
      .split("/")
      .filter(
        (s) =>
          s.length > 0 &&
          !s.startsWith(":") &&
          !s.startsWith("{") &&
          !s.startsWith("[") &&
          !s.startsWith("*")
      );
    if (segments.length === 0) return "";
    if (segments[0].toLowerCase() === "api" && segments.length > 1) {
      const seg = segments[1];
      return seg.charAt(0).toUpperCase() + seg.slice(1);
    }
    const first = segments[0];
    if (first.toLowerCase() === "api") return "";
    return first.charAt(0).toUpperCase() + first.slice(1);
  }
}

export const apiDiscoveryService = new ApiDiscoveryService();
