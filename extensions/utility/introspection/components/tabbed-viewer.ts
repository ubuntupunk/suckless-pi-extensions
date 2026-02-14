import { type PanelTab, TabbedScrollablePanel } from "@aliou/pi-utils-ui";
import type { Theme } from "@mariozechner/pi-coding-agent";
import type { Component, TUI } from "@mariozechner/pi-tui";

export interface Tab {
  label: string;
  subtitle?: string;
  buildContent: (width: number, theme: Theme) => string[];
}

export class TabbedViewer implements Component {
  private panel: TabbedScrollablePanel;

  constructor(
    title: string,
    tabs: Tab[],
    tui: TUI,
    theme: Theme,
    onClose: () => void,
  ) {
    this.panel = new TabbedScrollablePanel(
      {
        title,
        tabs: tabs as PanelTab[],
        maxVisible: 16,
        keymap: "vim",
        onClose,
      },
      tui,
      theme,
    );
  }

  handleInput(data: string): boolean {
    return this.panel.handleInput(data);
  }

  invalidate(): void {
    this.panel.invalidate();
  }

  render(width: number): string[] {
    return this.panel.render(width);
  }
}
