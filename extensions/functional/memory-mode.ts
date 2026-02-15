/**
 * Memory Mode Extension
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { completeSimple } from "@mariozechner/pi-ai";
import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";
import {
  Key,
  matchesKey,
  type TUI,
  truncateToWidth,
  wrapTextWithAnsi,
} from "@mariozechner/pi-tui";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

class MemoryPreviewComponent {
  private tui: TUI;
  private theme: Theme;
  private filePath: string;
  private state: "loading" | "preview" = "loading";
  private content: string = "";
  private selectedOption: "yes" | "no" = "yes";
  private spinnerFrame = 0;
  private spinnerInterval: ReturnType<typeof setInterval> | null = null;
  private abortController = new AbortController();

  public onDone?: (result: { save: boolean; content: string } | null) => void;

  constructor(tui: TUI, theme: Theme, filePath: string) {
    this.tui = tui;
    this.theme = theme;
    this.filePath = filePath;
    this.startSpinner();
  }

  get signal(): AbortSignal {
    return this.abortController.signal;
  }

  private startSpinner(): void {
    this.spinnerInterval = setInterval(() => {
      this.spinnerFrame = (this.spinnerFrame + 1) % SPINNER_FRAMES.length;
      this.tui.requestRender();
    }, 80);
  }

  private stopSpinner(): void {
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval);
      this.spinnerInterval = null;
    }
  }

  invalidate(): void {}

  setContent(content: string): void {
    this.stopSpinner();
    this.content = content;
    this.state = "preview";
    this.tui.requestRender();
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape)) {
      this.abortController.abort();
      this.onDone?.(null);
      return;
    }
    if (this.state === "preview") {
      if (
        matchesKey(data, Key.left) ||
        matchesKey(data, Key.right) ||
        matchesKey(data, "tab")
      ) {
        this.selectedOption = this.selectedOption === "yes" ? "no" : "yes";
        this.tui.requestRender();
      } else if (matchesKey(data, Key.enter) || data === "y" || data === "Y") {
        this.onDone?.({ save: true, content: this.content });
      } else if (data === "n" || data === "N") {
        this.onDone?.({ save: false, content: this.content });
      }
    }
  }

  render(width: number): string[] {
    const lines: string[] = [];
    if (this.state === "loading") {
      lines.push(
        `  ${this.theme.fg("accent", SPINNER_FRAMES[this.spinnerFrame])} ${this.theme.fg("muted", "Integrating...")}`,
      );
    } else {
      lines.push(`  📄 ${this.theme.bold(this.filePath)}`, "");
      const contentLines = this.content.split("\n").slice(0, 15);
      for (const l of contentLines) {
        lines.push(...wrapTextWithAnsi(`  ${l}`, width - 4));
      }
      lines.push(
        "",
        `  Save? ${this.selectedOption === "yes" ? "[YES]" : " YES "} ${this.selectedOption === "no" ? "[NO]" : " NO "}`,
      );
    }
    return lines.map((l) => truncateToWidth(l, width));
  }
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("mem", {
    description: "Save instruction to AGENTS.md",
    handler: async (_, ctx) => {
      const instruction = await ctx.ui.input("Memory instruction:");
      if (!instruction) return;
      const locations = [
        { label: "Local", path: path.join(ctx.cwd, "AGENTS.local.md") },
        { label: "Project", path: path.join(ctx.cwd, "AGENTS.md") },
        {
          label: "Global",
          path: path.join(
            path.join(process.env.HOME || "", ".pi", "agent"),
            "AGENTS.md",
          ),
        },
      ];
      const selected = await ctx.ui.select(
        "Save to:",
        locations.map((l) => l.label),
      );
      if (!selected) return;
      const loc = locations.find((l) => l.label === selected)!;

      const result = await ctx.ui.custom<{
        save: boolean;
        content: string;
      } | null>((tui, theme, _kb, done) => {
        const comp = new MemoryPreviewComponent(tui, theme, loc.path);
        comp.onDone = done;
        const existing = fs.existsSync(loc.path)
          ? fs.readFileSync(loc.path, "utf-8")
          : "";
        const userPrompt = `Integrate this instruction into AGENTS.md:\n${instruction}\n\nExisting:\n${existing}`;

        const apiKeyPromise = ctx.modelRegistry.getApiKey(ctx.model!);
        apiKeyPromise
          .then((apiKey) => {
            return completeSimple(
              ctx.model!,
              {
                systemPrompt:
                  "Update AGENTS.md with the new instruction. Output ONLY file content.",
                messages: [
                  {
                    role: "user",
                    content: [{ type: "text", text: userPrompt }],
                    timestamp: Date.now(),
                  },
                ],
              },
              { apiKey, signal: comp.signal },
            );
          })
          .then((resp) => {
            const content = resp.content
              .filter((c: any) => c.type === "text")
              .map((c: any) => c.text)
              .join("")
              .replace(/```markdown|```/g, "")
              .trim();
            comp.setContent(content);
          })
          .catch(() => done(null));

        return comp;
      });

      if (result?.save) {
        fs.writeFileSync(loc.path, result.content);
        ctx.ui.notify(`Saved to ${loc.path}`, "info");
      }
    },
  });
}
