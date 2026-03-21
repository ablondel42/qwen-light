/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import { RELAUNCH_EXIT_CODE } from './processUtils.js';
import { writeStderrLine } from './stdioHelpers.js';

export async function relaunchOnExitCode(runner: () => Promise<number>) {
  while (true) {
    try {
      const exitCode = await runner();

      if (exitCode !== RELAUNCH_EXIT_CODE) {
        process.exit(exitCode);
      }
    } catch (error) {
      process.stdin.resume();
      writeStderrLine('Fatal error: Failed to relaunch the CLI process.');
      writeStderrLine(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }
}

export async function relaunchAppInChildProcess(
  additionalNodeArgs: string[],
  additionalScriptArgs: string[],
) {
  if (process.env['QWEN_CODE_NO_RELAUNCH']) {
    return;
  }

  const runner = () => {
    // process.argv is [node, script, ...args]
    // We want to construct [ ...nodeArgs, script, ...scriptArgs]
    const script = process.argv[1];
    const scriptArgs = process.argv.slice(2);

    const nodeArgs = [
      ...process.execArgv,
      ...additionalNodeArgs,
      script,
      ...additionalScriptArgs,
      ...scriptArgs,
    ];
    const newEnv = { ...process.env, QWEN_CODE_NO_RELAUNCH: 'true' };

    // The parent process should not be reading from stdin while the child is running.
    process.stdin.pause();

    // Build stdio array to pass through additional file descriptors
    // Start with stdin, stdout, stderr, then add any additional FDs that are open
    const stdio: Array<'inherit' | 'pipe' | 'ignore' | number> = [
      'inherit', // stdin (0)
      'inherit', // stdout (1)
      'inherit', // stderr (2)
    ];

    // Extract custom FDs from CLI arguments instead of probing
    // This ensures we only inherit explicitly requested FDs
    const customFds = new Set<number>();
    const fdArgNames = ['--input-fd', '--output-fd', '--error-fd'];
    for (let i = 0; i < process.argv.length; i++) {
      const arg = process.argv[i];
      if (fdArgNames.includes(arg) && i + 1 < process.argv.length) {
        const fd = parseInt(process.argv[i + 1], 10);
        // Validate FD is in valid range (3-1024)
        if (Number.isInteger(fd) && fd >= 3 && fd <= 1024) {
          customFds.add(fd);
        }
      }
    }

    // Inherit only explicitly requested custom FDs
    // Check up to FD 1024 (typical per-process FD limit start)
    for (let fd = 3; fd <= 1024; fd++) {
      if (customFds.has(fd)) {
        try {
          // Verify FD is actually open before inheriting
          fs.fstatSync(fd);
          stdio.push(fd);
        } catch {
          // FD was requested but not open, use 'ignore'
          stdio.push('ignore');
        }
      } else {
        // FD not requested, use 'ignore'
        stdio.push('ignore');
      }
    }

    const child = spawn(process.execPath, nodeArgs, {
      stdio,
      env: newEnv,
    });

    return new Promise<number>((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (code) => {
        // Resume stdin before the parent process exits.
        process.stdin.resume();
        resolve(code ?? 1);
      });
    });
  };

  await relaunchOnExitCode(runner);
}
