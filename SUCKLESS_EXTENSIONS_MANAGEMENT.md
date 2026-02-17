# Suckless Extensions Management

> Philosophy: **Convention over configuration. Auto-discover. Disable only what you don't want.**
>
> **Less is more:** No managedExtensions list. Drop files in `extensions/`, they're auto-loaded.

---

## System Stats

| Component | LOC | Description |
|-----------|-----|-------------|
| `conf-parser.ts` | 241 | Parse .conf files with error reporting |
| `alias-api.ts` | 115 | Wrap ExtensionAPI for aliases |
| `index.ts` | 229 | Auto-discovery + loader |
| **Manager Total** | **585** | Pure TypeScript, no deps |
| | | |
| `extensions.conf` | 22 | Only disabled extensions (4 lines) |
| `commands.conf` | 27 | Project aliases (minimal) |
| **Config Total** | **49** | Plain text, grep-able |
| | | |
| **Grand Total** | **634** | Without docs |
| **With Docs** | **~1000** | Including this file |

### Comparison

| Approach | LOC | Complexity |
|----------|-----|------------|
| **Suckless Manager** | 586 | Auto-discover, disable-only config |
| With managedExtensions | ~650 | Duplication of config |
| Database/Registry | ~2000+ | Schema, migrations, deps |
| Full Plugin System | ~5000+ | Lifecycle, hooks, sandbox |
| Pi Built-in (est.) | ~10000+ | Complete framework |

**We chose less.** 586 lines gives us:
- Auto-discovery of extensions (no list to maintain)
- Enable/disable via simple config
- Command aliases
- Groups and hiding
- User overrides (~/.pi/)
- Zero runtime overhead
- No dependencies
- Grep-able configs

---

## Quick Start

### For Users: Personal Aliases

Create `~/.pi/commands.conf`:

```bash
mkdir -p ~/.pi
cat > ~/.pi/commands.conf << 'EOF'
# My personal shortcuts
alias ws /brave-search
alias fb /browse
alias rw /review
EOF
```

### For Teams: Project Defaults

Edit `.pi/extensions.conf` in your repo to set team defaults.

---

## Problem Statement

Current extension loading has these issues:

1. **No enable/disable** - All extensions in `package.json` load automatically
2. **No command aliases** - Can't shorten `/brave-search` → `/ws`
3. **Flat command list** - No grouping or organization
4. **No hiding** - Can't hide internal/debug commands
5. **Direct editing** - Must modify `package.json` to manage extensions

## Solution: `.conf` Files

Follow Unix tradition: **package.json defines what's installed, `.conf` files define what's active.**

---

## Architecture

```
~/.pi/
├── extensions.conf          # User overrides (gitignored)
└── commands.conf            # Personal aliases (gitignored)

suckless-pi-extensions/
├── .pi/
│   ├── extensions.conf      # Project defaults (versioned)
│   ├── commands.conf        # Project aliases (versioned)
│   └── commands.conf.user-template  # Template for users
├── packages/
│   └── manager/             # Extension loader (~350 LOC)
│       ├── index.ts         # Main entry
│       ├── conf-parser.ts   # Parse .conf files
│       └── alias-api.ts     # Wrap ExtensionAPI for aliases
└── extensions/              # Your extensions
```

### Load Order

1. **Project defaults** from `repo/.pi/`
2. **User overrides** from `~/.pi/`
3. **Merge:** User config takes precedence

```
User alias "ws" → Project alias "fb" → Original "/brave-search"
User disable → Project enable → Extension DISABLED
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

## Implementation Plan

### Phase 1: Conf Parser (`conf-parser.ts`)

```typescript
interface ExtensionConfig {
  enabled: Set<string>;
  disabled: Set<string>;
}

interface CommandConfig {
  aliases: Map<string, string>;      // ws → /brave-search
  groups: Map<string, string[]>;      // search → [/brave-search, /web-search]
  hidden: Set<string>;                // [/debug-verbose]
}

function parseExtensionsConf(content: string): ExtensionConfig;
function parseCommandsConf(content: string): CommandConfig;
```

**LOC:** ~80  
**Features:**
- Ignore comments (`#`) and empty lines
- Validate format, warn on errors
- Return strongly-typed config objects

---

### Phase 2: Extension Loader (`index.ts`)

```typescript
export function loadExtensions(pi: ExtensionAPI): void {
  const extConfig = parseExtensionsConf(readFile('.pi/extensions.conf'));
  const pkg = readJSON('package.json');
  
  for (const extPath of pkg.pi.extensions) {
    if (extConfig.disabled.has(extPath)) continue;
    if (extConfig.enabled.has(extPath) || extConfig.enabled.size === 0) {
      import(extPath).then(mod => mod.default(pi));
    }
  }
}
```

**LOC:** ~60  
**Features:**
- Filter extensions by config
- Default: load all if no config exists
- Log skipped extensions

---

### Phase 3: Alias API (`alias-api.ts`)

```typescript
class AliasAPI implements ExtensionAPI {
  constructor(
    private api: ExtensionAPI,
    private aliases: Map<string, string>
  ) {}
  
  registerCommand(name: string, def: CommandDef): void {
    // Register original
    this.api.registerCommand(name, def);
    
    // Register aliases
    for (const [alias, target] of this.aliases) {
      if (target === name || target === `/${name}`) {
        this.api.registerCommand(alias, {
          ...def,
          handler: def.handler,
          description: `${def.description} (alias: ${name})`
        });
      }
    }
  }
}
```

**LOC:** ~120  
**Features:**
- Wrap ExtensionAPI
- Auto-register aliases
- Preserve original command

---

### Phase 4: Command Groups & Help

```typescript
// In status-bar or new help extension
function renderHelp(config: CommandConfig): string {
  const lines = ['Commands:\n'];
  
  for (const [group, commands] of config.groups) {
    lines.push(`  ${group}:`);
    for (const cmd of commands) {
      lines.push(`    ${cmd}`);
    }
  }
  
  return lines.join('\n');
}
```

**LOC:** ~90  
**Features:**
- Grouped help display
- Hide hidden commands from listing
- Optional: `/help <group>` for details

---

## Migration Path

### Step 1: Create Project Config Files

```bash
cd suckless-pi-extensions

# Already done! Files created in .pi/
# .pi/extensions.conf - project defaults
# .pi/commands.conf - project aliases
# .pi/commands.conf.user-template - template for users
```

### Step 2: Create User Config (Optional)

```bash
# Copy template to home directory
mkdir -p ~/.pi
cp .pi/commands.conf.user-template ~/.pi/commands.conf

# Edit with your personal shortcuts
nano ~/.pi/commands.conf
```

### Step 3: Implement Manager

```bash
mkdir -p packages/manager
# Create: index.ts, conf-parser.ts, alias-api.ts
```

### Step 4: Update package.json

```json
{
  "pi": {
    "extensions": [
      "packages/manager/index.ts",  // Load first
      "extensions/suckless/status-bar.ts",
      // ... rest become inert (manager loads them)
    ]
  }
}
```

### Step 5: Deprecate Direct Loading

Extensions loaded via manager check config. Direct loads warned:

```
⚠ Extension loaded directly. Use packages/manager for config support.
```

---

## Usage Examples

### Disable Extension Temporarily

```bash
# User override (takes precedence over project defaults)
echo "disable extensions/utility/brave-search/index.ts" >> ~/.pi/extensions.conf

# Re-enable
sed -i '/^disable.*brave-search/d' ~/.pi/extensions.conf
echo "enable extensions/utility/brave-search/index.ts" >> ~/.pi/extensions.conf
```

### Add Personal Alias

```bash
# User config
echo "alias ws /brave-search" >> ~/.pi/commands.conf
```

### View Active Extensions

```bash
# See project defaults
grep "^enable" .pi/extensions.conf | wc -l
# 20

# See user overrides
grep "^disable" ~/.pi/extensions.conf
# disable extensions/functional/ralph-loop.ts
```

### Quick Status

```bash
# One-liner to see enabled extensions
grep "^enable" .pi/extensions.conf | cut -d' ' -f2 | xargs -I{} basename -a {}
```

### Setup User Config

```bash
# First time setup
mkdir -p ~/.pi
cp .pi/commands.conf.user-template ~/.pi/commands.conf
nano ~/.pi/commands.conf  # Edit with your shortcuts
```

---

## Design Decisions

### Why `.conf` Files?

| Approach | Pros | Cons |
|----------|------|------|
| `.conf` files | grep-able, simple, Unix tradition | Multiple files to manage |
| JSON config | Single file, structured | Harder to edit manually |
| YAML config | Comments, readable | Parser dependency |
| Env vars | Simple | Not persistent |

**Decision:** `.conf` files follow `/etc/` tradition, work with standard tools.

### Why Not Modify package.json?

- `package.json` = **security boundary** (what's installed)
- `.conf` = **user preference** (what's active)
- Separation allows version control of defaults vs local overrides

### Why Not Database/Registry?

- Adds complexity (schema, migrations, deps)
- Overkill for ~25 extensions
- Plain text is debuggable with `cat` and `grep`

---

## TODO

- [ ] **Phase 1:** Create `packages/manager/conf-parser.ts`
  - [ ] Parse `extensions.conf`
  - [ ] Parse `commands.conf`
  - [ ] Error handling with line numbers
  
- [ ] **Phase 2:** Create `packages/manager/index.ts`
  - [ ] Load extension config
  - [ ] Filter package.json extensions
  - [ ] Import and initialize enabled extensions
  
- [ ] **Phase 3:** Create `packages/manager/alias-api.ts`
  - [ ] Wrap ExtensionAPI
  - [ ] Implement command aliasing
  - [ ] Handle groups and hiding
  
- [ ] **Phase 4:** Generate config files
  - [ ] Create `.pi/extensions.conf` from package.json
  - [ ] Create `.pi/commands.conf` with examples
  
- [ ] **Phase 5:** Update documentation
  - [ ] Update README.md
  - [ ] Add migration guide
  - [ ] Document in each extension's README

---

## Progress Log

### 2026-02-17 - Suckless Auto-Discovery
- [x] Auto-discover extensions from `extensions/` directory
- [x] Remove managedExtensions from package.json
- [x] Simplify extensions.conf to disable-only
- [x] Update documentation (586 LOC total)
- [ ] Test with existing extensions
- [ ] Create /extensions-status command
- [ ] Update README.md

### System Stats (Final)
- **Manager:** 585 LOC (3 files)
- **Config:** 49 LOC (2 files, 4 lines active)
- **Total:** 634 LOC
- **With docs:** ~1000 LOC

**Suckless win:** No duplication. Drop files in `extensions/`, auto-loaded.

---

## Related

- [SUCKLESS.md](./SUCKLESS.md) - Overall project philosophy
- [CONTRIBUTING.md](./CONTRIBUTING.md) - Extension development guide
- [extensions/functional/files-widget/](./extensions/functional/files-widget/) - Example extension
