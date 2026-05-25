/**
 * Environment variable parsing and sanitization utilities
 */

export interface ParseEnvOptions {
  trimValues?: boolean;
  normalizeLineEndings?: boolean;
  removeComments?: boolean;
  ignoreDuplicates?: boolean;
  validateFormat?: boolean;
}

export interface ParseEnvResult {
  env: Record<string, string>;
  errors?: string[];
  warnings?: string[];
}

/**
 * Parses environment variable text in KEY=VALUE format with robust error handling
 * @param raw Raw environment text (can contain newlines, Windows/Unix line endings, comments)
 * @param options Configuration for parsing behavior
 * @returns Parsed environment object with optional errors/warnings
 */
export function parseEnvText(
  raw: string,
  options: ParseEnvOptions = {}
): ParseEnvResult {
  const {
    trimValues = true,
    normalizeLineEndings = true,
    removeComments = false,
    ignoreDuplicates = true,
    validateFormat = true,
  } = options;

  const result: ParseEnvResult = {
    env: {},
    errors: [],
    warnings: [],
  };

  if (!raw || typeof raw !== "string") {
    return result;
  }

  // Normalize line endings: \r\n → \n, \r → \n
  let text = normalizeLineEndings ? raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n") : raw;

  // Split into lines
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Trim leading/trailing whitespace
    line = line.trim();

    // Skip empty lines
    if (!line) {
      continue;
    }

    // Skip comments (lines starting with #)
    if (removeComments && line.startsWith("#")) {
      continue;
    }

    // Find the = sign
    const eqIdx = line.indexOf("=");

    // Validate format
    if (validateFormat) {
      if (eqIdx <= 0) {
        result.warnings?.push(`Line ${i + 1}: Invalid format (no '=' found or empty key). Skipping: "${line}"`);
        continue;
      }
    } else if (eqIdx <= 0) {
      continue;
    }

    // Extract key and value
    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1);

    // Trim value if requested
    if (trimValues) {
      value = value.trim();
    }

    // Validate key
    if (!key) {
      result.warnings?.push(`Line ${i + 1}: Empty key. Skipping line.`);
      continue;
    }

    // Check for invalid key characters (basic validation)
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      result.warnings?.push(`Line ${i + 1}: Invalid key format "${key}". Environment variable keys must start with letter or underscore.`);
      continue;
    }

    // Check for duplicates
    if (key in result.env && !ignoreDuplicates) {
      result.warnings?.push(`Line ${i + 1}: Duplicate key "${key}". Keeping original value.`);
      continue;
    }

    // Store the value (last occurrence wins if duplicates ignored)
    result.env[key] = value;
  }

  return result;
}

/**
 * Simple wrapper for backward compatibility - just returns the env object
 * @param raw Raw environment text
 * @returns Environment object or undefined if empty
 */
export function parseEnvTextSimple(raw: string): Record<string, string> | undefined {
  const result = parseEnvText(raw, {
    trimValues: true,
    normalizeLineEndings: true,
    removeComments: true,
    ignoreDuplicates: true,
    validateFormat: false,
  });
  return Object.keys(result.env).length > 0 ? result.env : undefined;
}

/**
 * Parses environment lines from markdown or plain text.
 * Accepts explicit ENV declarations, export assignments, KEY=VALUE, and JSON objects.
 */
export function parseEnvTextStrict(raw: string): Record<string, string> | undefined {
  if (!raw || typeof raw !== "string") return undefined;

  const result: Record<string, string> = {};
  const lines = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  for (const originalLine of lines) {
    const line = originalLine.trim();
    if (!line) continue;

    const stripped = stripMarkdownPrefix(line);

    const envMatch = stripped.match(/^ENV\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/i);
    if (envMatch) {
      const v = unquoteEnvValue(envMatch[2]);
      if (isLikelyCommentOrNoise(v)) continue;
      result[envMatch[1]] = v;
      continue;
    }

    const exportMatch = stripped.match(/^export\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/i);
    if (exportMatch) {
      result[exportMatch[1]] = unquoteEnvValue(exportMatch[2]);
      continue;
    }

    const kvMatch = stripped.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
    if (kvMatch) {
      const v = unquoteEnvValue(kvMatch[2]);
      if (isLikelyCommentOrNoise(v)) continue;
      result[kvMatch[1]] = v;
      continue;
    }

    if (stripped.startsWith("{") && stripped.endsWith("}")) {
      try {
        const parsed = JSON.parse(line);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          for (const [key, value] of Object.entries(parsed)) {
            if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
              result[key] = String(value ?? "");
            }
          }
        }
      } catch {
        // ignore invalid JSON
      }
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function stripMarkdownPrefix(line: string) {
  return line
    .replace(/^>\s?/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .trim();
}

function unquoteEnvValue(value: string) {
  const trimmed = value.trim();
  // Remove surrounding single/double quotes
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function isLikelyCommentOrNoise(v: string) {
  if (!v) return true;
  const t = v.trim();
  // values that start with a comment marker or look like SQL/snippets are noise
  if (t.startsWith('#')) return true;
  if (t.startsWith('//')) return true;
  if (/^\s*select\s+/i.test(t)) return true;
  if (/;\s*$/.test(t)) return true;
  return false;
}

/**
 * Sanitizes environment variable text for storage/display
 * Removes duplicates, normalizes line endings, trims whitespace
 * @param raw Raw environment text
 * @returns Clean, normalized environment text
 */
export function sanitizeEnvText(raw: string): string {
  const result = parseEnvText(raw, {
    trimValues: true,
    normalizeLineEndings: true,
    removeComments: false,
    ignoreDuplicates: true,
    validateFormat: false,
  });

  // Reconstruct as formatted text
  return Object.entries(result.env)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

/**
 * Validates environment variable text and returns detailed feedback
 * @param raw Raw environment text
 * @returns Validation result with errors/warnings
 */
export function validateEnvText(raw: string): ParseEnvResult {
  return parseEnvText(raw, {
    trimValues: true,
    normalizeLineEndings: true,
    removeComments: false,
    ignoreDuplicates: false,
    validateFormat: true,
  });
}
