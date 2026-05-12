import type { RuntimeDetectionResult } from "@/features/platform/api";

/** If package.json exists but detection picked Dockerfile/compose, coerce hints to Node (PM2 / forms need real app commands). */
export function withNodeHintsIfApplicable(d: RuntimeDetectionResult): RuntimeDetectionResult {
  const r = String(d.runtime ?? "").toLowerCase();
  if (r !== "dockerfile" && r !== "compose") {
    return d;
  }
  const matched = d.matched_files ?? [];
  if (!matched.some((f) => f.replace(/\\/g, "/").endsWith("package.json"))) {
    return d;
  }
  return { ...d, runtime: "node" };
}

/** Prefer app start command over Docker placeholders when we coerce dockerfile→node. */
export function resolvedStartCommand(detected: RuntimeDetectionResult): string {
  const raw = String(detected.runtime ?? "").toLowerCase();
  let cmd = (detected.start_command ?? "").trim();
  const hinted = withNodeHintsIfApplicable(detected);
  if ((raw === "dockerfile" || raw === "compose") && String(hinted.runtime).toLowerCase() === "node") {
    if (cmd === "" || stringsIncludesDockerRun(cmd)) {
      cmd = "";
    }
  }
  return cmd || suggestStartCommand(hinted);
}

function stringsIncludesDockerRun(s: string): boolean {
  const t = s.toLowerCase();
  return t.includes("docker run") || t.includes("docker compose");
}

/** When /runtime/detect omits start_command, mirror server-side defaults where possible. */
export function suggestStartCommand(d: RuntimeDetectionResult): string {
  const existing = (d.start_command ?? "").trim();
  if (existing) return existing;
  const r = String(d.runtime ?? "").toLowerCase();
  const pm = String(d.package_manager ?? "npm").toLowerCase();
  const fw = String(d.framework ?? "").toLowerCase();

  const npmLike = (script: "start" | "dev") => {
    if (pm === "pnpm") return script === "start" ? "pnpm start" : "pnpm run dev";
    if (pm === "yarn") return script === "start" ? "yarn start" : "yarn dev";
    if (pm === "bun") return script === "start" ? "bun run start" : "bun run dev";
    return script === "start" ? "npm start" : "npm run dev";
  };

  switch (r) {
    case "node":
      if (fw.includes("next")) return "npm run start";
      return npmLike("start");
    case "bun":
      return "bun run start";
    case "python":
      return "python -m uvicorn main:app --host 0.0.0.0 --port 8000";
    case "go":
      return "go run .";
    case "php":
      return "php -S 0.0.0.0:8080 -t public";
    case "java":
      return "java -jar target/app.jar";
    default:
      return "";
  }
}
