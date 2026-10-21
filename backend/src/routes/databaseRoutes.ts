import { Router } from "express";
import {
  getConnectionsController,
  createConnectionController,
  getConnectionController,
  updateConnectionController,
  deleteConnectionController,
  testConnectionController,
  connectDatabaseController,
  disconnectDatabaseController,
  getConnectionStatusController,
  listSchemasController,
  listTablesController,
  describeTableController,
  sampleTableRowsController,
  executeQueryController,
} from "../controllers/databaseController.js";

const router = Router();

// Connection Profile Management
router.get("/connections", getConnectionsController);
router.post("/connections", createConnectionController);
router.get("/connections/:id", getConnectionController);
router.put("/connections/:id", updateConnectionController);
router.delete("/connections/:id", deleteConnectionController);

// Ad-hoc connection test
router.post("/test", testConnectionController);

// Connection Lifecycle
router.post("/connections/:id/test", testConnectionController);
router.post("/connections/:id/connect", connectDatabaseController);
router.post("/connections/:id/disconnect", disconnectDatabaseController);
router.get("/connections/:id/status", getConnectionStatusController);

// Schema and Table Inspection
router.get("/connections/:id/schemas", listSchemasController);
router.get("/connections/:id/tables", listTablesController);
router.get("/connections/:id/tables/:table/columns", describeTableController);
router.get("/connections/:id/tables/:table/rows", sampleTableRowsController);

// Read-only Query Execution
router.post("/connections/:id/query", executeQueryController);

export default router;
