# Qwen Code - Project Context

## Project Overview

Qwen Code is an AI-powered coding assistant CLI built with TypeScript, React (Ink for terminal UI), and the Google GenAI SDK. It provides an interactive terminal interface for code assistance, with support for extensions, MCP (Model Context Protocol) servers, and various authentication providers.

## Architecture

### Monorepo Structure (Workspaces)

```
qwen-light/
├── packages/
│   ├── cli/              # Main CLI application (Ink-based terminal UI)
│   ├── core/             # Core backend logic, tools, and AI integration
│   └── web-templates/    # HTML templates for web-based features
├── scripts/              # Build and development scripts
├── dist/                 # Built output (after bundle)
└── node_modules/         # Dependencies
```

### Key Dependencies

- **UI Framework**: Ink (React for CLI) + React 19
- **AI SDK**: `@google/genai` (v1.30.0)
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Build Tools**: esbuild, TypeScript, tsx (dev)
- **Package Manager**: npm with workspaces

### Entry Points

- **CLI Entry**: `packages/cli/index.ts` - Main entry point with shebang
- **Main Logic**: `packages/cli/src/gemini.tsx` - Contains `main()` function
- **Config**: `packages/cli/src/config/config.ts` - Yargs-based argument parsing
- **Core**: `packages/core/index.ts` - Core backend exports

## Building and Running

### Development Mode (TypeScript, no build required)

```bash
npm run dev                    # Interactive mode
npm run dev -- -p "hello"      # With prompt
npm run dev -- --help          # Show help
```

Uses `tsx` with custom loader to run TypeScript directly from source.

### Production Mode (requires build)

```bash
npm run build                  # Build all packages
npm run bundle                 # Bundle with esbuild for distribution
npm start                      # Run built CLI
npm start -- -p "hello"        # With prompt
```

### Build Process

1. **Generate git commit info**: `npm run generate`
2. **Build packages** (in dependency order):
   - `packages/core` (foundation)
   - `packages/web-templates` (used by cli)
   - `packages/cli` (depends on both)
3. **Bundle** (optional): Creates single `dist/cli.js` using esbuild

### Type Checking

```bash
npm run typecheck              # Root typecheck
npm run typecheck --workspace=packages/cli
npm run typecheck --workspace=packages/core
```

## CLI Options

### Core Options

```
-p, --prompt              Prompt for non-interactive mode
-i, --prompt-interactive  Execute prompt and continue interactively
-m, --model               Model to use
-o, --output-format       Output format: text, json, stream-json
--input-format            Input format: text, stream-json
--approval-mode           plan | default | auto-edit | yolo
-y, --yolo                Auto-approve all tools
--sandbox, -s             Run in sandbox mode
--debug, -d               Debug mode
```

### Session Management

```
-c, --continue            Resume most recent session
-r, --resume <id>         Resume specific session by UUID
--session-id <id>         Specify session ID for new session
--max-session-turns       Limit session turns
```

### Authentication

```
--auth-type               USE_OPENAI | USE_ANTHROPIC | QWEN_OAUTH | USE_GEMINI | USE_VERTEX_AI
```

### MCP & Extensions

```
--allowed-mcp-server-names  Allow specific MCP servers
--extensions, -e            Enable specific extensions
--list-extensions, -l       List available extensions
```

### Subcommands

```
qwen mcp add|remove|list   Manage MCP servers
qwen auth status|login     Manage authentication
qwen hooks enable|disable  Manage lifecycle hooks
qwen extensions            Manage extensions
```

## Configuration Files

### Settings (JSON)

Located in user config directory, supports hierarchical settings:
- `settings.json` - Main configuration
- Supports workspace-specific overrides

### Telemetry

Configurable via settings or CLI flags:
- Target: local or GCP
- OTLP endpoint and protocol (grpc/http)
- Prompt logging toggle
- Output file redirection

## Key Features

### Interactive Mode
- React Ink-based terminal UI
- Kitty keyboard protocol support
- Screen reader accessibility
- Vim mode integration
- Session management with checkpointing

### Non-Interactive Mode
- Pipe input via stdin
- Multiple output formats (text, json, stream-json)
- Suitable for CI/CD integration

### Extensions
- Discoverable extension system
- Enable/disable per workspace
- Extension-specific settings

### MCP Integration
- Model Context Protocol support
- External tool integration
- Server management commands

## Development Conventions

### Code Style
- TypeScript strict mode enabled
- ES modules (NodeNext module resolution)
- React JSX for UI components
- Functional components with hooks

### Testing
- Test files: `*.test.ts` / `*.test.tsx`
- Run tests: `npm test` (when available)
- Integration tests in `config/` and `services/`

### File Naming
- Components: PascalCase (`.tsx`)
- Utilities: camelCase (`.ts`)
- Tests: `*.test.ts` alongside source

### Import Conventions
- Use `.js` extension for relative imports (ESM compatibility)
- Absolute imports for package internals
- Third-party imports without modification

## Environment Variables

```
DEBUG=true              Enable debug mode
DEBUG_MODE=true         Alternative debug flag
CLI_VERSION             Override version string
DEV=true                Development mode flag
QWEN_CODE_NO_RELAUNCH   Prevent process relaunch
QWEN_WORKING_DIR        Override working directory
```

## Debugging

### Debug Mode
```bash
npm run dev -- --debug
# or
DEBUG=true npm run dev
```

### VS Code Debugger
- Uses `scripts/start.js` for launch
- Supports `--inspect-brk` when DEBUG is set
- Debug port: 9229 (configurable via DEBUG_PORT)

### Logging
- Debug logs written to: `~/.qwen/logs/debug-<session-id>.log`
- OpenAI API logging available via `--openai-logging`

## Common Tasks

### Adding a CLI Flag
1. Add to `CliArgs` interface in `config/config.ts`
2. Add `.option()` definition in `parseArguments()`
3. Use in relevant component/service

### Adding a Command
1. Create command file in `commands/` directory
2. Export yargs CommandModule
3. Register in `parseArguments()` via `.command()`

### Modifying Core Logic
1. Edit files in `packages/core/src/`
2. Changes reflected immediately in dev mode
3. Rebuild for production: `npm run build --workspace=packages/core`

### UI Component Changes
1. Edit components in `packages/cli/src/ui/`
2. Use Ink components for terminal rendering
3. Context providers for shared state

## Troubleshooting

### Build Issues
- Clean and reinstall: `rm -rf node_modules && npm install --legacy-peer-deps`
- Remove nested node_modules before building
- Use `--legacy-peer-deps` for dependency conflicts

### TypeScript Errors
- Run `npm run typecheck` to identify issues
- Check strict mode compliance
- Verify import paths use `.js` extension

### Debugging Relaunch Issues
- Set `QWEN_CODE_NO_RELAUNCH=true` to prevent relaunch
- Use `DEBUG=true` for verbose startup logging

## Testing Patterns

### Unit Tests
- Co-located with source: `file.test.ts` next to `file.ts`
- Use ES modules syntax
- Mock external dependencies

### Integration Tests
- Located in `config/` and `services/` directories
- Test config parsing and service interactions
- Use temporary directories for isolation

### Test Utilities
- `packages/cli/src/test-utils/` - Shared test utilities
- Mock config and settings helpers

## Performance Considerations

### Memory Management
- Auto-relaunch with increased heap if needed (50% of total memory)
- Configurable via `--max-old-space-size`

### Startup Optimization
- Lazy load heavy dependencies
- Defer config initialization for stream-json mode
- Parallel initialization where possible

## Security

### Folder Trust
- Workspace trust verification
- Controlled access to sensitive directories

### Authentication
- Multiple auth provider support
- OAuth flow for Google services
- API key management for third-party services

### Sandbox Mode
- Optional containerized execution
- Configurable sandbox image
- Tool execution isolation

## Qwen Added Memories
- Qwen Code project development rules: 1) Use ES Modules with .js extensions in relative imports, 2) TypeScript strict mode - no any types, pass typecheck, 3) File naming: PascalCase.tsx for components, camelCase.ts for utilities, *.test.ts for tests, 4) Import order: Node built-ins → externals → internal → types, 5) Error handling: use FatalInputError etc., log via writeStderrLine(), 6) FD management: never hardcode FD numbers, use os.open(), close in finally blocks, set QWEN_CODE_NO_RELAUNCH=true, 7) Testing: co-locate tests, use vitest, test success and error paths, 8) Build before commit: run npm run build and typecheck, 9) Keep CLAUDE.md under 200 lines, use .claude/rules/ for topics, 10) Subprocess safety: pass_fds for custom FDs, redirect stdin from /dev/null, cleanup in finally blocks
