/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// npm install if node_modules was removed
if (!existsSync(join(root, 'node_modules'))) {
  execSync('npm install', { stdio: 'inherit', cwd: root });
}

// build all workspaces/packages in dependency order
execSync('npm run generate', { stdio: 'inherit', cwd: root });

// Build in dependency order:
// 1. core (foundation package)
// 2. web-templates (embeddable web templates - used by cli)
// 3. cli (depends on core, web-templates)
const buildOrder = [
  'packages/core',
  'packages/web-templates',
  'packages/cli',
];

for (const workspace of buildOrder) {
  execSync(`npm run build --workspace=${workspace}`, {
    stdio: 'inherit',
    cwd: root,
  });
}

// build sandbox if enabled
try {
  execSync('node scripts/sandbox_command.js -q', {
    stdio: 'inherit',
    cwd: root,
  });
  if (
    process.env.BUILD_SANDBOX === '1' ||
    process.env.BUILD_SANDBOX === 'true'
  ) {
    execSync('node scripts/build_sandbox.js -s', {
      stdio: 'inherit',
      cwd: root,
    });
  }
} catch {
  // ignore
}
