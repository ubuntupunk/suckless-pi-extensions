import type { Theme } from "@mariozechner/pi-coding-agent";
import type { Component } from "@mariozechner/pi-tui";
import { truncateToWidth } from "@mariozechner/pi-tui";

export interface LlmTelemetryData {
  resolvedModel?: { provider: string; id: string };
  usage?: {
    outputTokens?: number;
    totalCost?: number;
  };
  toolCalls?: Array<{ status: "running" | "done" | "error" }>;
  totalDurationMs?: number;
}

export class ToolLlmTelemetryFooter implements Component {
  constructor(
    private theme: Theme,
    private data: LlmTelemetryData,
  ) {}

  handleInput(_data: string): boolean {
    return false;
  }

  invalidate(): void {}

  updateData(data: LlmTelemetryData): void {
    this.data = data;
  }

  render(width: number): string[] {
    const th = this.theme;
    const { resolvedModel, usage, toolCalls, totalDurationMs } = this.data;
    const parts: string[] = [];

    if (resolvedModel) {
      parts.push(`${resolvedModel.provider}/${resolvedModel.id}`);
    }

    if (usage?.outputTokens !== undefined) {
      parts.push(`${formatTokenCount(usage.outputTokens)} tokens`);
    }

    if (usage?.totalCost !== undefined && usage.totalCost > 0) {
      parts.push(formatCost(usage.totalCost));
    }

    if (totalDurationMs !== undefined) {
      parts.push(formatDuration(totalDurationMs));
    }

    const totalCalls = toolCalls?.length ?? 0;
    const failedCalls =
      toolCalls?.filter((toolCall) => toolCall.status === "error").length ?? 0;

    parts.push(
      failedCalls > 0
        ? `${totalCalls} calls (${failedCalls} failed)`
        : `${totalCalls} calls`,
    );

    return [truncateToWidth(th.fg("muted", parts.join(" - ")), width)];
  }
}

function formatTokenCount(tokens: number): string {
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
  return `${tokens}`;
}

function formatCost(cost: number): string {
  if (cost < 0.01) return "<$0.01";
  if (cost < 1) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) return `${durationMs}ms`;
  if (durationMs < 60_000) return `${(durationMs / 1000).toFixed(2)}s`;
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = ((durationMs % 60_000) / 1000).toFixed(1);
  return `${minutes}m ${seconds}s`;
}
