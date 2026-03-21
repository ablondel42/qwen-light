# Qwen Code - Minimal Standalone CLI

A minimal, self-contained Qwen Code CLI that can be copied and installed anywhere.

## Quick Start

### Option 1: Copy and Install

```bash
# 1. Copy the src/ folder to your desired location
cp -r /path/to/qwen-code/src /path/to/qwen-standalone

# 2. Navigate to the new location
cd /path/to/qwen-standalone

# 3. Install dependencies
npm install --legacy-peer-deps

# 4. Build the project
npm run build

# 5. Bundle for distribution (optional)
npm run bundle

# 6. Run the CLI
npm start                    # Interactive mode
npm run dev                  # Development mode (from source)
npm run dev -- -p "hello"    # With prompt
node dist/cli.js --version   # Bundled CLI
```

### Option 2: Use Bundled CLI

After running `npm run bundle`, you can run the CLI directly:

```bash
node dist/cli.js -p "your prompt"
```

## Available Commands

```bash
# Development (runs from TypeScript source)
npm run dev                    # Interactive mode
npm run dev -- -p "hello"      # With prompt
npm run dev -- --help          # Show help

# Production (uses built dist/)
npm start                      # Interactive mode
npm start -- -p "hello"        # With prompt

# Build
npm run build                  # Build all packages
npm run bundle                 # Bundle for distribution

# Help
node dist/cli.js --help        # Show all CLI options
node dist/cli.js --version     # Show version
```

## CLI Options

```bash
-p, --prompt           Prompt for non-interactive mode
-m, --model            Model to use (default: qwen3-coder-plus)
--output-format        Output format: text, json, stream-json
--input-fd             Custom input file descriptor (default: 0/stdin)
--output-fd            Custom output file descriptor (default: 1/stdout)
--error-fd             Custom error file descriptor (default: 2/stderr)
--approval-mode        Approval mode: plan, default, auto-edit, yolo
--sandbox              Run in sandbox mode
```

## File Descriptor Redirection

The CLI supports reading from and writing to arbitrary file descriptors, enabling integration with other processes and tools:

```bash
# Use custom file descriptors for input/output
qwen --input-fd 3 --output-fd 4 --error-fd 5 -p "hello"

# Spawn CLI as subprocess with FD redirection
node -e "
  const { spawn } = require('child_process');
  const { pipe } = require('fs');
  
  // Create pipes for FD redirection
  const [readFd, writeFd] = pipe();
  
  // Spawn CLI with custom FDs
  const child = spawn('qwen', ['--input-fd', '3', '--output-fd', '4', '-p', 'hello'], {
    stdio: ['ignore', 'ignore', 'ignore', readFd, 4, 5],
  });
"
```

This is particularly useful for:
- Embedding the CLI in other applications
- Creating custom UIs around the CLI
- Integrating with IDE extensions
- Building testing harnesses

## Project Structure

```
qwen-standalone/
├── package.json           # Root workspace config
├── tsconfig.json          # TypeScript config
├── esbuild.config.js      # Bundle configuration
├── scripts/               # Build scripts
├── packages/
│   ├── cli/               # CLI application
│   ├── core/              # Core backend
│   └── web-templates/     # HTML templates
└── dist/                  # Built output (after build)
```

## Requirements

- Node.js >= 20.0.0
- npm >= 9.0.0

## Size

- Source: ~25MB (without node_modules)
- After install: ~250MB (with node_modules)
- Bundled CLI: ~50MB (dist/ only)

## Troubleshooting

### Missing dependencies after copy

Always run `npm install --legacy-peer-deps` after copying to a new location.

### Build fails with TypeScript errors

Make sure all nested node_modules are removed before installing:
```bash
rm -rf node_modules package-lock.json
rm -rf packages/*/node_modules packages/*/package-lock.json
npm install --legacy-peer-deps
```

### react-devtools-core error

This is handled automatically by the build. If you see errors, make sure you're using `--legacy-peer-deps`.

## License

Apache-2.0 (same as original Qwen Code)
