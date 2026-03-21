/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, type ChildProcess, type StdioOptions } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createDebugLogger } from '@qwen-code/qwen-code-core';

const debugLogger = createDebugLogger('SUBPROCESS');

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliEntryPath = join(__dirname, '..', 'index.ts');

/**
 * Options for spawning the CLI as a subprocess.
 */
export interface SubprocessOptions {
  /** Arguments to pass to the CLI */
  args: string[];
  /** Custom input file descriptor (default: 0) */
  inputFd?: number;
  /** Custom output file descriptor (default: 1) */
  outputFd?: number;
  /** Custom error file descriptor (default: 2) */
  errorFd?: number;
  /** Working directory for the subprocess */
  cwd?: string;
  /** Environment variables to pass to the subprocess */
  env?: Record<string, string | undefined>;
  /** Whether to run in development mode (uses tsx) */
  devMode?: boolean;
}

/**
 * Result of spawning a subprocess.
 */
export interface SubprocessResult {
  /** The child process instance */
  child: ChildProcess;
  /** Promise that resolves when the process exits */
  onExit: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  /** Kill the subprocess */
  kill: (signal?: NodeJS.Signals) => void;
  /** PID of the subprocess */
  pid: number;
}

/**
 * Spawns the CLI as a subprocess with custom file descriptor redirection.
 *
 * This allows the CLI to read/write from arbitrary file descriptors,
 * enabling integration with other processes and tools.
 *
 * @example
 * ```ts
 * // Spawn CLI with custom FDs
 * const result = await spawnCliSubprocess({
 *   args: ['-p', 'hello'],
 *   inputFd: 3,
 *   outputFd: 4,
 *   errorFd: 5,
 * });
 *
 * // Wait for completion
 * const { code } = await result.onExit;
 * ```
 *
 * @example
 * ```ts
 * // Use with pipe() for FD passing
 * const [readFd, writeFd] = pipe();
 * const result = await spawnCliSubprocess({
 *   args: ['-p', 'hello'],
 *   inputFd: readFd,
 *   outputFd: 1, // stdout
 * });
 * ```
 */
export async function spawnCliSubprocess(
  options: SubprocessOptions,
): Promise<SubprocessResult> {
  const {
    args,
    inputFd = 0,
    outputFd = 1,
    errorFd = 2,
    cwd = process.cwd(),
    env = process.env,
    devMode = process.env['DEV'] === 'true',
  } = options;

  // Build stdio array for custom FD mapping
  // Node.js spawn stdio can be an array where each element corresponds to fd 0, 1, 2, ...
  // We need to map our custom FDs to the appropriate positions
  const stdio: StdioOptions = [
    inputFd,
    outputFd,
    errorFd,
  ];

  // Determine the command and arguments
  let command: string;
  let cliArgs: string[];

  if (devMode) {
    // In dev mode, use tsx to run TypeScript directly
    command = 'tsx';
    cliArgs = [cliEntryPath, ...args];
  } else {
    // In production mode, use the built CLI
    // Check if dist exists, otherwise fall back to dev mode
    const { existsSync } = await import('node:fs');
    const distPath = join(__dirname, '..', 'dist', 'index.js');
    
    if (existsSync(distPath)) {
      command = 'node';
      cliArgs = [distPath, ...args];
    } else {
      // Fall back to dev mode if dist doesn't exist
      command = 'tsx';
      cliArgs = [cliEntryPath, ...args];
    }
  }

  // Merge environment variables
  const subprocessEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      subprocessEnv[key] = value;
    }
  }

  // Spawn the subprocess
  const child = spawn(command, cliArgs, {
    stdio,
    cwd,
    env: subprocessEnv,
    shell: process.platform === 'win32',
  });

  // Create exit promise
  const onExit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolve) => {
      child.on('exit', (code, signal) => {
        resolve({ code, signal });
      });

      child.on('error', (error) => {
        // Log error message without exposing full error object (may contain sensitive paths)
        debugLogger.error(`Subprocess error: ${error.message}`);
        resolve({ code: null, signal: null });
      });
    }
  );

  // Create kill function
  const kill = (signal: NodeJS.Signals = 'SIGTERM') => {
    if (child.pid) {
      child.kill(signal);
    }
  };

  return {
    child,
    onExit,
    kill,
    pid: child.pid!,
  };
}

/**
 * Spawns the CLI subprocess and waits for it to complete.
 * Convenience wrapper around spawnCliSubprocess.
 *
 * @returns The exit code of the subprocess
 */
export async function runCliSubprocess(
  options: SubprocessOptions,
): Promise<number> {
  const result = await spawnCliSubprocess(options);
  const { code } = await result.onExit;
  return code ?? 1;
}
