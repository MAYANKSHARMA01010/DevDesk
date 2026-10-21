import crypto from "crypto";
import { getDatabase } from "../../config/database.js";
import { DiscoveredProject, PackageManager, ProjectType } from "../../types/project.js";
import { SavedProject, WorkspaceWithProjects } from "../../types/workspace.js";

interface WorkspaceRow {
  id: string;
  root_path: string;
  last_opened_at: string;
  last_scanned_at: string;
  created_at: string;
  updated_at: string;
}

interface ProjectRow {
  id: string;
  workspace_id: string;
  name: string;
  path: string;
  type: string;
  package_manager: string;
  updated_at: string;
}

function mapProjectRow(row: ProjectRow): SavedProject {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    path: row.path,
    type: row.type as ProjectType,
    packageManager: row.package_manager as PackageManager,
    updatedAt: row.updated_at,
  };
}

function mapWorkspaceRow(
  workspaceRow: WorkspaceRow,
  projectRows: ProjectRow[]
): WorkspaceWithProjects {
  return {
    id: workspaceRow.id,
    rootPath: workspaceRow.root_path,
    lastOpenedAt: workspaceRow.last_opened_at,
    lastScannedAt: workspaceRow.last_scanned_at,
    createdAt: workspaceRow.created_at,
    updatedAt: workspaceRow.updated_at,
    projects: projectRows.map(mapProjectRow),
  };
}

export class WorkspaceRepository {
  /**
   * Retrieves all workspaces ordered by most recently opened.
   */
  public getAll(): WorkspaceWithProjects[] {
    const db = getDatabase();

    const workspaceRows = db
      .prepare<[], WorkspaceRow>(
        "SELECT * FROM workspaces ORDER BY last_opened_at DESC"
      )
      .all();

    if (workspaceRows.length === 0) {
      return [];
    }

    const projectStmt = db.prepare<[string], ProjectRow>(
      "SELECT * FROM projects WHERE workspace_id = ? ORDER BY name ASC"
    );

    return workspaceRows.map((ws) => {
      const projects = projectStmt.all(ws.id);
      return mapWorkspaceRow(ws, projects);
    });
  }

  /**
   * Retrieves a single workspace by ID.
   */
  public getById(id: string): WorkspaceWithProjects | null {
    const db = getDatabase();

    const ws = db
      .prepare<[string], WorkspaceRow>(
        "SELECT * FROM workspaces WHERE id = ?"
      )
      .get(id);

    if (!ws) {
      return null;
    }

    const projects = db
      .prepare<[string], ProjectRow>(
        "SELECT * FROM projects WHERE workspace_id = ? ORDER BY name ASC"
      )
      .all(ws.id);

    return mapWorkspaceRow(ws, projects);
  }

  /**
   * Retrieves a single workspace by root path.
   */
  public getByPath(rootPath: string): WorkspaceWithProjects | null {
    const db = getDatabase();

    const ws = db
      .prepare<[string], WorkspaceRow>(
        "SELECT * FROM workspaces WHERE root_path = ?"
      )
      .get(rootPath);

    if (!ws) {
      return null;
    }

    const projects = db
      .prepare<[string], ProjectRow>(
        "SELECT * FROM projects WHERE workspace_id = ? ORDER BY name ASC"
      )
      .all(ws.id);

    return mapWorkspaceRow(ws, projects);
  }

  /**
   * Creates or updates a workspace record, and replaces its stored projects in a single transaction.
   */
  public upsertWithProjects(
    rootPath: string,
    discoveredProjects: DiscoveredProject[]
  ): WorkspaceWithProjects {
    const db = getDatabase();
    const now = new Date().toISOString();

    const transaction = db.transaction(() => {
      // 1. Check if workspace exists
      const existing = db
        .prepare<[string], WorkspaceRow>(
          "SELECT * FROM workspaces WHERE root_path = ?"
        )
        .get(rootPath);

      let workspaceId: string;
      let createdAt: string;

      if (existing) {
        workspaceId = existing.id;
        createdAt = existing.created_at;
        db.prepare(
          `UPDATE workspaces 
           SET last_opened_at = ?, last_scanned_at = ?, updated_at = ? 
           WHERE id = ?`
        ).run(now, now, now, workspaceId);
      } else {
        workspaceId = crypto.randomUUID();
        createdAt = now;
        db.prepare(
          `INSERT INTO workspaces (id, root_path, last_opened_at, last_scanned_at, created_at, updated_at) 
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(workspaceId, rootPath, now, now, createdAt, now);
      }

      // 2. Remove previous projects for this workspace
      db.prepare("DELETE FROM projects WHERE workspace_id = ?").run(workspaceId);

      // 3. Insert newly discovered projects
      const insertProjectStmt = db.prepare(
        `INSERT INTO projects (id, workspace_id, name, path, type, package_manager, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );

      for (const project of discoveredProjects) {
        insertProjectStmt.run(
          crypto.randomUUID(),
          workspaceId,
          project.name,
          project.path,
          project.type,
          project.packageManager,
          now
        );
      }

      // 4. Fetch inserted project rows
      const insertedProjectRows = db
        .prepare<[string], ProjectRow>(
          "SELECT * FROM projects WHERE workspace_id = ? ORDER BY name ASC"
        )
        .all(workspaceId);

      const workspaceRow: WorkspaceRow = {
        id: workspaceId,
        root_path: rootPath,
        last_opened_at: now,
        last_scanned_at: now,
        created_at: createdAt,
        updated_at: now,
      };

      return mapWorkspaceRow(workspaceRow, insertedProjectRows);
    });

    return transaction();
  }

  /**
   * Updates a workspace's last opened timestamp.
   */
  public updateLastOpened(id: string): boolean {
    const db = getDatabase();
    const now = new Date().toISOString();

    const result = db
      .prepare(
        "UPDATE workspaces SET last_opened_at = ?, updated_at = ? WHERE id = ?"
      )
      .run(now, now, id);

    return result.changes > 0;
  }

  /**
   * Deletes a workspace and cascades deletion to associated projects.
   * NEVER modifies or deletes files on the filesystem.
   */
  public delete(id: string): boolean {
    const db = getDatabase();

    const deleteTx = db.transaction(() => {
      // Cascades automatically via PRAGMA foreign_keys = ON, but explicit delete guarantees cleanup
      db.prepare("DELETE FROM projects WHERE workspace_id = ?").run(id);
      const result = db.prepare("DELETE FROM workspaces WHERE id = ?").run(id);
      return result.changes > 0;
    });

    return deleteTx();
  }

  /**
   * Retrieves a single saved project by ID.
   */
  public getProjectById(projectId: string): SavedProject | null {
    const db = getDatabase();
    const row = db
      .prepare<[string], ProjectRow>(
        "SELECT * FROM projects WHERE id = ?"
      )
      .get(projectId);

    return row ? mapProjectRow(row) : null;
  }
}

export const workspaceRepository = new WorkspaceRepository();
