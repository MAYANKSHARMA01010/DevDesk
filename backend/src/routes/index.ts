import { Router } from "express";
import projectRoutes from "./projectRoutes.js";
import workspaceRoutes from "./workspaceRoutes.js";
import processRoutes from "./processRoutes.js";

const apiRouter = Router();

apiRouter.use("/projects", projectRoutes);
apiRouter.use("/workspaces", workspaceRoutes);
apiRouter.use("/processes", processRoutes);

export default apiRouter;
