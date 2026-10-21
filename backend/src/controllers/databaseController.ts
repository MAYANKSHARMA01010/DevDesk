import { Request, Response } from "express";
import { databaseService } from "../services/database/databaseService.js";
import { SqlValidationError } from "../services/database/sqlValidator.js";

/**
 * Strips any sensitive authentication tokens or passwords from error messages.
 */
function cleanErrorMessage(err: unknown, fallback: string): string {
  if (!err) return fallback;
  const msg = err instanceof Error ? err.message : String(err);
  // Redact password=... patterns if present
  return msg.replace(/password=[^;\s&]+/gi, "password=***");
}

export async function getConnectionsController(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    const profiles = databaseService.getProfiles();
    res.status(200).json({ success: true, data: profiles });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      error: cleanErrorMessage(err, "Failed to retrieve connection profiles."),
    });
  }
}

export async function createConnectionController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const input = req.body;
    if (!input || typeof input !== "object") {
      res.status(400).json({ success: false, error: "Invalid request payload." });
      return;
    }

    const created = databaseService.createProfile(input);
    res.status(201).json({ success: true, data: created });
  } catch (err: unknown) {
    const msg = cleanErrorMessage(err, "Failed to create connection profile.");
    res.status(400).json({ success: false, error: msg });
  }
}

export async function getConnectionController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const id = req.params.id as string;
    const profile = databaseService.getProfileById(id);
    if (!profile) {
      res.status(404).json({ success: false, error: `Connection profile not found: "${id}".` });
      return;
    }

    res.status(200).json({ success: true, data: profile });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      error: cleanErrorMessage(err, "Failed to retrieve connection profile."),
    });
  }
}

export async function updateConnectionController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const id = req.params.id as string;
    const input = req.body;
    if (!input || typeof input !== "object") {
      res.status(400).json({ success: false, error: "Invalid request payload." });
      return;
    }

    const updated = databaseService.updateProfile(id, input);
    res.status(200).json({ success: true, data: updated });
  } catch (err: unknown) {
    const msg = cleanErrorMessage(err, "Failed to update connection profile.");
    if (msg.includes("not found")) {
      res.status(404).json({ success: false, error: msg });
    } else {
      res.status(400).json({ success: false, error: msg });
    }
  }
}

export async function deleteConnectionController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const id = req.params.id as string;
    const deleted = await databaseService.deleteProfile(id);
    if (!deleted) {
      res.status(404).json({ success: false, error: `Connection profile not found: "${id}".` });
      return;
    }

    res.status(200).json({ success: true, message: "Connection profile deleted." });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      error: cleanErrorMessage(err, "Failed to delete connection profile."),
    });
  }
}

export async function testConnectionController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const id = req.params.id as string;
    const { password } = req.body || {};

    let targetProfile = null;
    if (id && id !== "adhoc") {
      targetProfile = databaseService.getProfileById(id);
      if (!targetProfile) {
        res.status(404).json({ success: false, error: `Connection profile not found: "${id}".` });
        return;
      }
    } else {
      // Ad-hoc test from form
      targetProfile = req.body;
    }

    const result = await databaseService.testConnection(targetProfile, password);
    res.status(200).json({ success: true, data: result });
  } catch (err: unknown) {
    res.status(400).json({
      success: false,
      error: cleanErrorMessage(err, "Connection test failed."),
    });
  }
}

export async function connectDatabaseController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const id = req.params.id as string;
    const { password } = req.body || {};

    const status = await databaseService.connect(id, password);
    res.status(200).json({ success: true, data: status });
  } catch (err: unknown) {
    const msg = cleanErrorMessage(err, "Failed to connect to database.");
    if (msg.includes("not found")) {
      res.status(404).json({ success: false, error: msg });
    } else {
      res.status(400).json({ success: false, error: msg });
    }
  }
}

export async function disconnectDatabaseController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const id = req.params.id as string;
    const status = await databaseService.disconnect(id);
    res.status(200).json({ success: true, data: status });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      error: cleanErrorMessage(err, "Failed to disconnect database."),
    });
  }
}

export async function getConnectionStatusController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const id = req.params.id as string;
    const status = databaseService.getConnectionStatus(id);
    res.status(200).json({ success: true, data: status });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      error: cleanErrorMessage(err, "Failed to get connection status."),
    });
  }
}

export async function listSchemasController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const id = req.params.id as string;
    const schemas = await databaseService.listSchemas(id);
    res.status(200).json({ success: true, data: schemas });
  } catch (err: unknown) {
    const msg = cleanErrorMessage(err, "Failed to list schemas.");
    if (msg.includes("not connected")) {
      res.status(400).json({ success: false, error: msg });
    } else {
      res.status(500).json({ success: false, error: msg });
    }
  }
}

export async function listTablesController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const id = req.params.id as string;
    const schema = req.query.schema as string | undefined;

    const tables = await databaseService.listTables(id, schema);
    res.status(200).json({ success: true, data: tables });
  } catch (err: unknown) {
    const msg = cleanErrorMessage(err, "Failed to list tables.");
    if (msg.includes("not connected")) {
      res.status(400).json({ success: false, error: msg });
    } else {
      res.status(500).json({ success: false, error: msg });
    }
  }
}

export async function describeTableController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const id = req.params.id as string;
    const table = req.params.table as string;
    const schema = req.query.schema as string | undefined;

    if (!table || typeof table !== "string") {
      res.status(400).json({ success: false, error: "Table name is required." });
      return;
    }

    const columns = await databaseService.describeTable(id, table, schema);
    res.status(200).json({ success: true, data: columns });
  } catch (err: unknown) {
    const msg = cleanErrorMessage(err, "Failed to describe table.");
    if (msg.includes("not connected")) {
      res.status(400).json({ success: false, error: msg });
    } else {
      res.status(500).json({ success: false, error: msg });
    }
  }
}

export async function sampleTableRowsController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const id = req.params.id as string;
    const table = req.params.table as string;
    const schema = req.query.schema as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;

    if (!table || typeof table !== "string") {
      res.status(400).json({ success: false, error: "Table name is required." });
      return;
    }

    const data = await databaseService.sampleTableRows(id, table, schema, limit);
    res.status(200).json({ success: true, data });
  } catch (err: unknown) {
    const msg = cleanErrorMessage(err, "Failed to retrieve sample rows.");
    if (msg.includes("not connected")) {
      res.status(400).json({ success: false, error: msg });
    } else {
      res.status(500).json({ success: false, error: msg });
    }
  }
}

export async function executeQueryController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const id = req.params.id as string;
    const { query, maxRows } = req.body || {};

    if (!query || typeof query !== "string") {
      res.status(400).json({ success: false, error: "SQL query string is required." });
      return;
    }

    const limit = maxRows ? parseInt(maxRows, 10) : 500;
    const result = await databaseService.executeQuery(id, query, limit);
    res.status(200).json({ success: true, data: result });
  } catch (err: unknown) {
    if (err instanceof SqlValidationError) {
      res.status(400).json({ success: false, error: err.message });
      return;
    }
    const msg = cleanErrorMessage(err, "Failed to execute query.");
    if (msg.includes("not connected") || msg.includes("syntax error") || msg.includes("Only read-only")) {
      res.status(400).json({ success: false, error: msg });
    } else {
      res.status(500).json({ success: false, error: msg });
    }
  }
}
