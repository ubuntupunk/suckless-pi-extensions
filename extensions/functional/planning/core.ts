import * as fs from "node:fs";
import * as path from "node:path";
import yaml from "yaml";
import { ConfigLoader } from "@aliou/pi-utils-settings";

// ============================================================================
// CONFIG & TYPES
// ============================================================================

export type PlanStatus = "pending" | "in-progress" | "completed" | "cancelled" | "abandoned";

export interface PlanInfo {
  filename: string;
  path: string;
  slug: string;
  date: string;
  title: string;
  directory: string;
  status: PlanStatus;
  dependencies: string[];
}

export interface PlanningConfig {
  plansDir?: string;
  archiveDir?: string;
}

export interface ResolvedPlanningConfig {
  plansDir: string;
  archiveDir: string;
}

const DEFAULT_CONFIG: ResolvedPlanningConfig = {
  plansDir: ".pi/plans",
  archiveDir: ".pi/plans/archive",
};

export const configLoader = new ConfigLoader<PlanningConfig, ResolvedPlanningConfig>(
  "planning",
  DEFAULT_CONFIG,
  { scopes: ["global", "local"] }
);

// ============================================================================
// IO & PARSING
// ============================================================================

export function parseFrontmatter(content: string): { data: any; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: content };
  try {
    return { data: yaml.parse(match[1] || ""), body: match[2] || "" };
  } catch {
    return { data: {}, body: content };
  }
}

export function stringifyPlan(data: any, body: string): string {
  return `---\n${yaml.stringify(data).trim()}\n---\n\n${body.trim()}\n`;
}

export async function listPlans(cwd: string): Promise<PlanInfo[]> {
  const config = configLoader.getConfig();
  const plansDir = path.resolve(cwd, config.plansDir);
  if (!fs.existsSync(plansDir)) return [];

  const files = fs.readdirSync(plansDir).filter(f => f.endsWith(".md"));
  const plans: PlanInfo[] = [];

  for (const file of files) {
    const filePath = path.join(plansDir, file);
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const { data } = parseFrontmatter(content);
      plans.push({
        filename: file,
        path: filePath,
        slug: file.replace(".md", ""),
        date: data.date || "",
        title: data.title || file,
        directory: plansDir,
        status: data.status || "pending",
        dependencies: data.dependencies || [],
      });
    } catch {}
  }
  return plans.sort((a, b) => b.date.localeCompare(a.date));
}

export async function savePlan(cwd: string, slug: string, data: any, body: string): Promise<string> {
  const config = configLoader.getConfig();
  const plansDir = path.resolve(cwd, config.plansDir);
  if (!fs.existsSync(plansDir)) fs.mkdirSync(plansDir, { recursive: true });
  const filePath = path.join(plansDir, `${slug}.md`);
  fs.writeFileSync(filePath, stringifyPlan(data, body));
  return filePath;
}

// ============================================================================
// LOGIC
// ============================================================================

export function tickStep(body: string, stepIndex: number, completed: boolean): string {
  const lines = body.split("\n");
  let currentStep = 0;
  return lines.map(line => {
    if (line.trim().match(/^[-*]\s*\[[ xX]\]/)) {
      if (currentStep === stepIndex) {
        line = line.replace(/\[[ xX]\]/, completed ? "[x]" : "[ ]");
      }
      currentStep++;
    }
    return line;
  }).join("\n");
}
