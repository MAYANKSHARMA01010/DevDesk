import { Router } from "express";
import projectRoutes from "./projectRoutes.js";
import workspaceRoutes from "./workspaceRoutes.js";
import processRoutes from "./processRoutes.js";
import gitRoutes from "./gitRoutes.js";
import apiTesterRoutes from "./apiTesterRoutes.js";
import envEditorRoutes from "./envEditorRoutes.js";
import databaseRoutes from "./databaseRoutes.js";
import diagnosticRoutes from "./diagnosticRoutes.js";

const apiRouter = Router();

apiRouter.use("/projects", projectRoutes);
apiRouter.use("/workspaces", workspaceRoutes);
apiRouter.use("/processes", processRoutes);
apiRouter.use("/git", gitRoutes);
apiRouter.use("/api-tester", apiTesterRoutes);
apiRouter.use("/env-editor", envEditorRoutes);
apiRouter.use("/database", databaseRoutes);
apiRouter.use("/diagnostics", diagnosticRoutes);

export default apiRouter;
