import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { SelectItem } from "@mariozechner/pi-tui";
import { ThemeSelector } from "./components/theme-selector";

export default function (pi: ExtensionAPI) {
  registerThemeCommand(pi);
  pi.registerCommand("theme_test", {
    description: "Test if theme selector extension is loaded",
    handler: async (_args, ctx) => {
      ctx.ui.notify("Theme selector extension is LOADED", "info");
    },
  });
}

export function registerThemeCommand(pi: ExtensionAPI) {
  pi.registerCommand("themer", {
    description: "Select theme with preview",
    handler: async (_args, ctx) => {
      const allThemes = ctx.ui?.getAllThemes();
      if (!allThemes || allThemes.length === 0) {
        ctx.ui?.notify("No themes available", "warning");
        return;
      }

      // Pre-load theme objects to avoid disk I/O during preview
      const themeMap = new Map<string, any>();
      for (const t of allThemes) {
        try {
          const themeObj = ctx.ui.getTheme(t.name);
          if (themeObj) themeMap.set(t.name, themeObj);
        } catch {}
      }

      // Store original theme to restore on cancel
      const originalTheme = ctx.ui.theme;

      // Find current theme index
      let currentIndex = 0;
      for (const [i, t] of allThemes.entries()) {
        if (t.name === originalTheme.name) {
          currentIndex = i;
          break;
        }
      }

      const options: SelectItem[] = allThemes.map((t) => ({
        value: t.name,
        label: t.name,
        description: t.path ? "Custom" : "Built-in",
      }));

      let debounceTimer: ReturnType<typeof setTimeout> | null = null;

      let selected: string | null | undefined = await ctx.ui.custom<
        string | null
      >((_tui, _theme, _keybindings, done) => {
        return new ThemeSelector(
          options,
          currentIndex,
          (value) => {
            if (debounceTimer) clearTimeout(debounceTimer);
            const t = themeMap.get(value);
            if (t) ctx.ui.setTheme(t);
            else ctx.ui.setTheme(value);
            done(value);
          },
          () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            ctx.ui.setTheme(originalTheme);
            done(null);
          },
          (value) => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
              const t = themeMap.get(value);
              if (t) ctx.ui.setTheme(t);
              else ctx.ui.setTheme(value);
            }, 10);
          },
        );
      });

      // RPC fallback: use select dialog
      if (selected === undefined) {
        const themeNames = allThemes.map((t) => t.name);
        selected = await ctx.ui.select(
          `Select theme (${allThemes.length} available)`,
          themeNames,
        );
        if (selected) {
          ctx.ui.setTheme(selected);
        }
      }

      if (selected) {
        ctx.ui.notify(`Theme: ${selected}`, "info");
      }
    },
  });
}
