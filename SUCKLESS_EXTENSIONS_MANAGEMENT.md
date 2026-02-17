# Suckless Extensions Management

> Philosophy: **Configuration over convention. Simplicity over elegance.**

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
suckless-pi-extensions/
├── .pi/
│   ├── extensions.conf      # Enable/disable extensions
│   ├── commands.conf        # Aliases, groups, hide
│   └── agent/
│       └── settings.json    # Pi's settings (auto-generated)
├── packages/
│   └── manager/             # Extension loader (~350 LOC)
│       ├── index.ts         # Main entry
│       ├── conf-parser.ts   # Parse .conf files
│       └── alias-api.ts     # Wrap ExtensionAPI for aliases
└── extensions/              # Your extensions
```

---

## Configuration Files

### `extensions.conf`

Enable or disable extensions without editing `package.json`.

```ini
# Format: [enable|disable] <path>
# Lines starting with # are comments

# Core extensions
enable extensions/suckless/status-bar.ts
enable extensions/suckless/core-tools.ts

# Functional extensions
enable extensions/functional/files-widget/index.ts
enable extensions/functional/planning/index.ts
disable extensions/functional/ralph-loop.ts

# Utility extensions
enable extensions/utility/brave-search/index.ts
enable extensions/utility/neovim/index.ts
disable extensions/utility/checkpoint/index.ts

# Development (disable in production)
disable extensions/functional/test-ext/index.ts
disable extensions/utility/introspection/index.ts
```

### `commands.conf`

Organize and alias commands.

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

### Step 1: Create Config Files

```bash
cd suckless-pi-extensions

# Create extensions.conf from current package.json
cat > .pi/extensions.conf << 'EOF'
# Auto-generated from package.json
# All extensions currently enabled
EOF

grep -o '"extensions/[^"]*"' package.json | \
  sed 's/"\(.*\)"/enable \1/' >> .pi/extensions.conf

# Create commands.conf with defaults
cat > .pi/commands.conf << 'EOF'
# Command aliases, groups, and visibility
# See SUCKLESS_EXTENSIONS_MANAGEMENT.md for format

# Example aliases:
# alias ws /brave-search
# alias fb /browse

# Example groups:
# group search /brave-search
# group files /browse /files

# Example hide:
# hide /debug-command
EOF
```

### Step 2: Implement Manager

```bash
mkdir -p packages/manager
# Create: index.ts, conf-parser.ts, alias-api.ts
```

### Step 3: Update package.json

```json
{
  "pi": {
    "extensions": [
      "packages/manager/index.ts",  // Load first
      "extensions/suckless/status-bar.ts",
      // ... rest become inert
    ]
  }
}
```

### Step 4: Deprecate Direct Loading

Extensions loaded via manager check config. Direct loads warned:

```
⚠ Extension loaded directly. Use packages/manager for config support.
```

---

## Usage Examples

### Disable Extension Temporarily

```bash
# Disable brave-search
echo "disable extensions/utility/brave-search/index.ts" >> .pi/extensions.conf

# Re-enable
sed -i '/^disable.*brave-search/d' .pi/extensions.conf
echo "enable extensions/utility/brave-search/index.ts" >> .pi/extensions.conf
```

### Add Personal Alias

```bash
echo "alias ws /brave-search" >> .pi/commands.conf
```

### View Active Extensions

```bash
grep "^enable" .pi/extensions.conf | wc -l
# 18

grep "^disable" .pi/extensions.conf
# disable extensions/functional/ralph-loop.ts
# disable extensions/functional/test-ext/index.ts
```

### Quick Status

```bash
# One-liner to see enabled extensions
grep "^enable" .pi/extensions.conf | cut -d' ' -f2 | xargs -I{} basename -a {}
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

### 2026-02-17
- [x] Document architecture in SUCKLESS_EXTENSIONS_MANAGEMENT.md
- [ ] Implement conf-parser.ts
- [ ] Implement manager/index.ts
- [ ] Implement alias-api.ts
- [ ] Generate initial .conf files
- [ ] Test with existing extensions

---

## Related

- [SUCKLESS.md](./SUCKLESS.md) - Overall project philosophy
- [CONTRIBUTING.md](./CONTRIBUTING.md) - Extension development guide
- [extensions/functional/files-widget/](./extensions/functional/files-widget/) - Example extension
