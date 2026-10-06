import { Router } from "express";
import projectRoutes from "./projectRoutes.js";

const apiRouter = Router();

apiRouter.use("/projects", projectRoutes);

export default apiRouter;
