import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { configLoader, listPlans, savePlan, parseFrontmatter, stringifyPlan } from "./core";
import { selectPlan } from "./components/plan-selector";
import { executeAskUserQuestion } from "./components/decision-dialog";

/**
 * Planning Extension
 * 
 * Provides tools for plan-driven development and structured decision making.
 * Commands: /plans:list, /plans:save
 * Tools: ask_structured_decision
 */
export default async function planningExtension(pi: ExtensionAPI) {
  await configLoader.load();

  // 1. Tool: ask_structured_decision
  pi.registerTool({
    name: "ask_structured_decision",
    label: "Ask Structured Decision",
    description: "Gather user input through structured multiple-choice questions.",
    parameters: Type.Object({
      questions: Type.Array(Type.Object({
        question: Type.String(),
        header: Type.String(),
        multiSelect: Type.Boolean(),
        options: Type.Array(Type.Object({
          label: Type.String(),
          description: Type.String(),
        }))
      }))
    }),
    async execute(_id, params, _sig, _up, ctx) {
      return executeAskUserQuestion(ctx, params as any);
    }
  });

  // 2. Commands
  pi.registerCommand("plans:list", {
    description: "List and select development plans",
    handler: async (_args, ctx) => {
      const plans = await listPlans(ctx.cwd);
      if (plans.length === 0) {
        ctx.ui.notify("No plans found in .pi/plans", "warning");
        return;
      }
      const selected = await selectPlan(ctx, plans);
      if (selected) {
        ctx.ui.notify(`Selected plan: ${selected.title}`, "success");
        // Additional logic to load plan context can go here
      }
    }
  });

  pi.registerCommand("plans:save", {
    description: "Save current task as a plan",
    handler: async (args, ctx) => {
      const slug = args.trim() || `plan-${Date.now()}`;
      const path = await savePlan(ctx.cwd, slug, { date: new Date().toISOString().split('T')[0], status: "pending" }, "# Plan\n\n- [ ] Task 1");
      ctx.ui.notify(`Plan saved to ${path}`, "success");
    }
  });
}
