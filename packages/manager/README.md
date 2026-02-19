# Extension Manager

> **Philosophy:** Convention over configuration. Auto-discover. Disable only what you don't want.
>
> **Less is more:** No managedExtensions list. Drop files in `extensions/`, they're auto-loaded.

---

## Quick Start

### Enable Debug Mode

```bash
# Temporary (one command)
PI_MANAGER_DEBUG=1 pi

# Persistent (terminal session)
export PI_MANAGER_DEBUG=1
pi

# Permanent (add to ~/.bashrc or ~/.zshrc)
echo 'export PI_MANAGER_DEBUG=1' >> ~/.bashrc
source ~/.bashrc
```

**Debug output:**
```
[manager:debug] Scanning: /path/to/extensions
[manager:debug] Categories: functional, suckless, utility
[manager:debug] functional: 8 entries
[manager:debug] Found: functional/files-widget/index.ts
[manager:debug] Loaded: functional/files-widget/index.ts
```

### User Configuration

Create `~/.pi/extensions.conf` for personal overrides:

```bash
mkdir -p ~/.pi
cat > ~/.pi/extensions.conf << 'EOF'
# My personal overrides
disable extensions/functional/memory-mode.ts
enable extensions/utility/brave-search/index.ts
EOF
```

Create `~/.pi/commands.conf` for personal aliases:

```bash
cat > ~/.pi/commands.conf << 'EOF'
# My personal shortcuts
alias ws /brave-search
alias fb /browse
alias rw /review
EOF
```

---

## System Stats

| Component | LOC | Description |
|-----------|-----|-------------|
| `conf-parser.ts` | 241 | Parse .conf files with error reporting |
| `alias-api.ts` | 115 | Wrap ExtensionAPI for aliases |
| `index.ts` | 229 | Auto-discovery + loader |
| `debug.ts` | 44 | Debug logging utility |
| **Manager Total** | **629** | Pure TypeScript, no deps |
| | | |
| `extensions.conf` | ~25 | Only disabled extensions |
| `commands.conf` | ~30 | Project aliases |
| **Config Total** | **~55** | Plain text, grep-able |
| | | |
| **Grand Total** | **~684** | Without docs |

### Comparison

| Approach | LOC | Complexity |
|----------|-----|------------|
| **Suckless Manager** | 629 | Auto-discover, disable-only config |
| With managedExtensions | ~650 | Duplication of config |
| Database/Registry | ~2000+ | Schema, migrations, deps |
| Full Plugin System | ~5000+ | Lifecycle, hooks, sandbox |
| Pi Built-in (est.) | ~10000+ | Complete framework |

**We chose less.** 629 lines gives us:
- Auto-discovery of extensions (no list to maintain)
- Enable/disable via simple config
- Command aliases
- Groups and hiding
- User overrides (`~/.pi/`)
- Zero runtime overhead
- No dependencies
- Grep-able configs
- Debug mode for troubleshooting

---

## Architecture

```
~/.pi/
├── extensions.conf          # User overrides (gitignored)
└── commands.conf            # Personal aliases (gitignored)

suckless-pi-extensions/
├── .pi/
│   ├── extensions.conf      # Project defaults (versioned)
│   └── commands.conf        # Project aliases (versioned)
├── packages/
│   └── manager/
│       ├── index.ts         # Main entry point
│       ├── conf-parser.ts   # Parse .conf files
│       ├── alias-api.ts     # Wrap ExtensionAPI for aliases
│       └── debug.ts         # Debug logging utility
└── extensions/              # Auto-discovered extensions
    ├── functional/
    ├── suckless/
    └── utility/
```

### Load Order

1. **Project defaults** from `repo/.pi/`
2. **User overrides** from `~/.pi/`
3. **Merge:** User config takes precedence

```
User disable → Project enable → Extension DISABLED
User enable  → Project disable → Extension ENABLED
```

---

## Configuration Files

### `extensions.conf`

Enable or disable extensions. **Default: ALL enabled.**

**Location:** `.pi/extensions.conf` (project) or `~/.pi/extensions.conf` (user)

```ini
# Format: disable <path>
# Default: ALL extensions enabled automatically
# Only list what you want to DISABLE

# Experimental / unstable
disable extensions/functional/memory-mode.ts
disable extensions/functional/ralph-loop.ts

# Development / testing
disable extensions/functional/test-ext/index.ts

# Debugging tools
disable extensions/utility/introspection/index.ts
```

**To enable an extension:** Just drop it in `extensions/` - no config needed!

**To disable:** Add one line to `extensions.conf`.

**To override project disable (enable):**
```ini
# In ~/.pi/extensions.conf (user config)
enable extensions/suckless/status-bar.ts
```

### `commands.conf`

Organize and alias commands.

**Location:** `.pi/commands.conf` (project) or `~/.pi/commands.conf` (user)

```ini
# Format:
#   alias <shortcut> <original-command>
#   group <name> <command1> [command2...]
#   hide <command>

# Personal shortcuts
alias ws /brave-search
alias fb /browse
alias rw /review
alias ctx /context

# Organize into groups (for /help display)
group search /brave-search /web-search
group files /browse /files /readfiles
group review /review /diff /compare
group dev /extension-dev /reload-extension

# Hide internal/debug commands
hide /debug-verbose
hide /internal-check
hide /test-command
```

---

## Usage

### View Extension Status

```bash
/suckless status
```

**Output:**
```
━━━ Suckless Extensions Status ━━━

Loaded: 23 enabled, 3 disabled

Config: /home/user/.pi/extensions.conf (overrides project)

Disabled:
  • extensions/functional/memory-mode.ts
  • extensions/functional/test-ext/index.ts
  • extensions/utility/introspection/index.ts

💡 Tip: /suckless disable writes to ~/.pi/extensions.conf
```

### List All Extensions

```bash
/suckless list
```

**Output:**
```
━━━ Available Extensions ━━━

  ● brave-search              [Utility]
  ● breadcrumbs               [Utility]
  ● checkpoint                [Utility]
  ○ introspection             [Utility]
  ○ memory-mode               [Functional]
  ● neovim                    [Utility]
  ...
```

**Legend:**
- `●` (green) = Enabled
- `○` (dim) = Disabled

### Enable/Disable Extensions

```bash
# Disable an extension
/suckless disable status-bar

# Enable an extension
/suckless enable status-bar
```

**Note:** Changes require Pi restart to apply.

### Debug Mode

```bash
# Enable debug logging
export PI_MANAGER_DEBUG=1

# Run Pi
pi

# Disable debug logging
unset PI_MANAGER_DEBUG
```

**Debug output shows:**
- Which config files are loaded
- Extension discovery process
- Each extension being loaded
- Path resolution details

---

## Troubleshooting

### Extension Not Loading

1. **Check if disabled:**
   ```bash
   /suckless status
   ```

2. **Enable it:**
   ```bash
   /suckless enable <extension-name>
   ```

3. **Check debug logs:**
   ```bash
   export PI_MANAGER_DEBUG=1
   # Restart Pi
   # Look for: [manager:debug] Found: <extension-path>
   ```

4. **Verify extension has default export:**
   ```typescript
   // Extension must have:
   export default function(pi: ExtensionAPI) { ... }
   ```

### Config Not Working

1. **Check file location:**
   - Project: `repo/.pi/extensions.conf`
   - User: `~/.pi/extensions.conf`

2. **Check format:**
   ```ini
   # Correct:
   disable extensions/suckless/status-bar.ts
   
   # Wrong (missing extensions/ prefix in config):
   disable suckless/status-bar.ts
   ```

3. **Check path normalization:**
   - Config paths: `extensions/suckless/status-bar.ts` (with prefix)
   - Discovered paths: `suckless/status-bar.ts` (normalized)
   - Manager automatically normalizes for matching

### Debug Mode Not Working

1. **Verify env var is set:**
   ```bash
   echo $PI_MANAGER_DEBUG
   # Should output: 1
   ```

2. **Restart Pi** after setting env var

3. **Check for typos:**
   ```bash
   # Correct:
   export PI_MANAGER_DEBUG=1
   
   # Wrong:
   export PI_MANAGER_DEBUG=true  # Must be "1"
   export PI_MANAGER_DEBUG=on    # Must be "1"
   ```

---

## API Reference

### Environment Variables

| Variable | Values | Default | Description |
|----------|--------|---------|-------------|
| `PI_MANAGER_DEBUG` | `1`, `true` | (unset) | Enable debug logging |

### Config Format

**extensions.conf:**
```ini
# Comment
disable extensions/path/to/extension.ts
enable extensions/path/to/extension.ts
```

**commands.conf:**
```ini
# Comment
alias shortcut /original-command
group name /command1 /command2
hide /command-to-hide
```

### /suckless Command

| Subcommand | Arguments | Description |
|------------|-----------|-------------|
| `status` | (none) | Show enabled/disabled counts |
| `list` | (none) | List all extensions with status |
| `enable` | `<name>` | Enable an extension |
| `disable` | `<name>` | Disable an extension |
| `reload` | (none) | Show restart reminder |

---

## Related

- [SUCKLESS.md](../../SUCKLESS.md) - Overall project philosophy
- [CONTRIBUTING.md](../../CONTRIBUTING.md) - Extension development guide
- [PI_RUNTIME_FIX.md](../../PI_RUNTIME_FIX.md) - Pi API compatibility fixes
