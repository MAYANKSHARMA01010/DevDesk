import pkg from "node-sql-parser";
import type { AST } from "node-sql-parser";
import { DatabaseEngine } from "../../types/database.js";

const Parser = (pkg as any).Parser || (pkg as any).default?.Parser || (pkg as any);

export class SqlValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SqlValidationError";
  }
}

const FORBIDDEN_KEYWORDS = [
  /\bINTO\s+(OUTFILE|DUMPFILE)\b/i,
  /\bCOPY\s+.*\s+TO\b/i,
  /\bpg_read_file\b/i,
  /\bpg_write_file\b/i,
  /\blo_export\b/i,
  /\blo_import\b/i,
  /\bload_file\b/i,
  /\bFOR\s+UPDATE\b/i,
  /\bpg_sleep\b/i,
  /\bbenchmark\s*\(/i,
];

/**
 * Validates that an arbitrary user-submitted SQL query is strictly a single, read-only SELECT statement.
 */
export function validateReadOnlySelect(
  sql: string,
  engine: DatabaseEngine = "postgres"
): string {
  if (!sql || typeof sql !== "string" || sql.trim().length === 0) {
    throw new SqlValidationError("Query cannot be empty.");
  }

  const trimmed = sql.trim();

  // Pre-check forbidden filesystem, shell, and lock patterns
  for (const pattern of FORBIDDEN_KEYWORDS) {
    if (pattern.test(trimmed)) {
      throw new SqlValidationError(
        "Query contains forbidden operation or locking clause."
      );
    }
  }

  const parser = new Parser();
  const dbDialect = engine === "postgres" ? "Postgresql" : "MySQL";

  let ast: AST | AST[];
  try {
    ast = parser.astify(trimmed, { database: dbDialect });
  } catch (err: unknown) {
    // If dialect parse failed, try fallback with generic standard SQL
    try {
      ast = parser.astify(trimmed);
    } catch {
      const msg = err instanceof Error ? err.message : "Invalid SQL syntax";
      throw new SqlValidationError(`SQL syntax error: ${msg}`);
    }
  }

  // Reject multiple statements
  if (Array.isArray(ast)) {
    if (ast.length > 1) {
      throw new SqlValidationError(
        "Multiple SQL statements are not permitted in read-only execution."
      );
    }
    if (ast.length === 0) {
      throw new SqlValidationError("No valid SQL statement found.");
    }
    ast = ast[0];
  }

  // Strict check on statement type: must be 'select'
  const statementType = (ast as any).type?.toLowerCase();
  if (statementType !== "select") {
    throw new SqlValidationError(
      `Only read-only SELECT statements are permitted (received ${statementType ? statementType.toUpperCase() : "UNKNOWN"}).`
    );
  }

  // Check for INTO (table write or file write)
  const selectAst = ast as any;
  if (
    selectAst.into &&
    (selectAst.into.keyword ||
      selectAst.into.type ||
      selectAst.into.position ||
      selectAst.into.table)
  ) {
    throw new SqlValidationError(
      "SELECT INTO (file export or table creation) statements are not permitted."
    );
  }

  // Check for locking reads
  if (selectAst.locking_read) {
    throw new SqlValidationError(
      "Locking reads (FOR UPDATE / FOR SHARE) are not permitted in read-only mode."
    );
  }

  return trimmed;
}
