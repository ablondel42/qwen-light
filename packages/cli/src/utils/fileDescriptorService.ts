/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import { Readable, Writable } from 'node:stream';
import { createDebugLogger } from '@qwen-code/qwen-code-core';

const debugLogger = createDebugLogger('FD_SERVICE');

/**
 * File descriptor service for managing custom stdin/stdout/stderr streams.
 *
 * This service allows the CLI to read/write from arbitrary file descriptors,
 * enabling integration with other processes and tools.
 *
 * ## FD Ownership
 *
 * - **Service-created streams**: The service owns the FD lifecycle and closes them in `close()`
 * - **External FDs**: If you pass FDs from outside (e.g., parent process), YOU own closing them
 * - **Default FDs (0, 1, 2)**: Never closed by this service - always owned by the process
 * - **Custom FDs**: Closed by `close()` after stream destruction
 *
 * ## Lifecycle
 *
 * 1. Create service with FD numbers
 * 2. Call `initialize()` to create streams
 * 3. Use `get*Stream()` or `write*()` methods
 * 4. Call `close()` when done (or rely on signal handlers if using global service)
 *
 * @example
 * ```ts
 * // Use custom FDs (3, 4, 5)
 * const fdService = new FileDescriptorService(3, 4, 5);
 *
 * // Get custom input stream
 * const inputStream = fdService.getInputStream();
 *
 * // Get custom output stream
 * const outputStream = fdService.getOutputStream();
 *
 * // Get custom error stream
 * const errorStream = fdService.getErrorStream();
 * ```
 */
export class FileDescriptorService {
  private readonly inputFd: number;
  private readonly outputFd: number;
  private readonly errorFd: number;

  private inputStream: Readable | null = null;
  private outputStream: Writable | null = null;
  private errorStream: Writable | null = null;

  /**
   * Creates a new FileDescriptorService.
   *
   * @param inputFd - Input file descriptor (default: 0/stdin)
   * @param outputFd - Output file descriptor (default: 1/stdout)
   * @param errorFd - Error file descriptor (default: 2/stderr)
   * @throws Error if FDs are invalid (not integers, out of range, or duplicates)
   */
  constructor(
    inputFd: number = 0,
    outputFd: number = 1,
    errorFd: number = 2,
  ) {
    // Validate FDs are positive integers within valid range
    if (!Number.isInteger(inputFd) || inputFd < 0 || inputFd > 1024) {
      throw new Error(`Invalid inputFd: ${inputFd}. Must be an integer between 0 and 1024.`);
    }
    if (!Number.isInteger(outputFd) || outputFd < 0 || outputFd > 1024) {
      throw new Error(`Invalid outputFd: ${outputFd}. Must be an integer between 0 and 1024.`);
    }
    if (!Number.isInteger(errorFd) || errorFd < 0 || errorFd > 1024) {
      throw new Error(`Invalid errorFd: ${errorFd}. Must be an integer between 0 and 1024.`);
    }

    // Check for duplicates
    if (inputFd === outputFd || inputFd === errorFd || outputFd === errorFd) {
      throw new Error('File descriptors must be unique. Got: ' +
        `inputFd=${inputFd}, outputFd=${outputFd}, errorFd=${errorFd}`);
    }

    this.inputFd = inputFd;
    this.outputFd = outputFd;
    this.errorFd = errorFd;
  }

  /**
   * Initializes the file descriptor streams.
   * Must be called before using getStream methods.
   */
  initialize(): void {
    // Create streams for custom FDs
    // Use null as path - Node.js will use the FD directly
    // Type assertion needed because TypeScript types don't include this signature
    if (this.inputFd !== 0) {
      this.inputStream = fs.createReadStream(null as any, {
        fd: this.inputFd,
        autoClose: false,
      });
    }

    if (this.outputFd !== 1) {
      this.outputStream = fs.createWriteStream(null as any, {
        fd: this.outputFd,
        autoClose: false,
      });
    }

    if (this.errorFd !== 2) {
      this.errorStream = fs.createWriteStream(null as any, {
        fd: this.errorFd,
        autoClose: false,
      });
    }
  }

  /**
   * Gets the input stream.
   * Returns process.stdin for default FD (0), or custom stream for custom FD.
   */
  getInputStream(): Readable {
    if (this.inputFd === 0) {
      return process.stdin;
    }
    if (!this.inputStream) {
      throw new Error('Input stream not initialized. Call initialize() first.');
    }
    return this.inputStream;
  }

  /**
   * Gets the output stream.
   * Returns process.stdout for default FD (1), or custom stream for custom FD.
   */
  getOutputStream(): Writable {
    if (this.outputFd === 1) {
      return process.stdout;
    }
    if (!this.outputStream) {
      throw new Error(
        'Output stream not initialized. Call initialize() first.',
      );
    }
    return this.outputStream;
  }

  /**
   * Gets the error stream.
   * Returns process.stderr for default FD (2), or custom stream for custom FD.
   */
  getErrorStream(): Writable {
    if (this.errorFd === 2) {
      return process.stderr;
    }
    if (!this.errorStream) {
      throw new Error('Error stream not initialized. Call initialize() first.');
    }
    return this.errorStream;
  }

  /**
   * Reads all data from the input stream.
   *
   * @returns Promise resolving to the input data as a string
   */
  async readAll(): Promise<string> {
    const stream = this.getInputStream();
    return new Promise((resolve, reject) => {
      let data = '';
      stream.setEncoding('utf8');
      stream.on('data', (chunk) => {
        data += chunk;
      });
      stream.on('end', () => resolve(data));
      stream.on('error', reject);
    });
  }

  /**
   * Writes data to the output stream.
   * Uses synchronous writes for custom FDs to ensure data is flushed before process.exit().
   *
   * @param data - Data to write
   */
  writeOutput(data: string): void {
    if (this.outputFd === 1) {
      const written = process.stdout.write(data);
      if (!written) {
        debugLogger.warn('Failed to write to stdout (backpressure or error)');
      }
    } else {
      // Use synchronous write for custom FDs to ensure data is flushed
      try {
        fs.writeSync(this.outputFd, data);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        debugLogger.warn(`Custom FD write failed (fd=${this.outputFd}): ${errorMsg}`);
        // Still attempt fallback, but log the failure
        try {
          process.stdout.write(data);
        } catch (fallbackError) {
          const fallbackMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
          debugLogger.warn(`Fallback to stdout also failed: ${fallbackMsg}`);
        }
      }
    }
  }

  /**
   * Writes data to the error stream.
   * Uses synchronous writes for custom FDs to ensure data is flushed before process.exit().
   *
   * @param data - Data to write
   */
  writeError(data: string): void {
    if (this.errorFd === 2) {
      const written = process.stderr.write(data);
      if (!written) {
        debugLogger.warn('Failed to write to stderr (backpressure or error)');
      }
    } else {
      // Use synchronous write for custom FDs to ensure data is flushed
      try {
        fs.writeSync(this.errorFd, data);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        debugLogger.warn(`Custom FD write failed (fd=${this.errorFd}): ${errorMsg}`);
        // Still attempt fallback, but log the failure
        try {
          process.stderr.write(data);
        } catch (fallbackError) {
          const fallbackMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
          debugLogger.warn(`Fallback to stderr also failed: ${fallbackMsg}`);
        }
      }
    }
  }

  /**
   * Writes a line to the output stream.
   *
   * @param data - Data to write
   */
  writeOutputLine(data: string): void {
    this.writeOutput(`${data}\n`);
  }

  /**
   * Writes a line to the error stream.
   *
   * @param data - Data to write
   */
  writeErrorLine(data: string): void {
    this.writeError(`${data}\n`);
  }

  /**
   * Closes all file descriptor streams and underlying FDs.
   * Should be called during cleanup.
   * 
   * FD Ownership: This service closes FDs that it created streams for.
   * Default FDs (0, 1, 2) are never closed by this service.
   * Custom FDs are closed with fs.closeSync() after stream destruction.
   */
  close(): void {
    // Close input stream and FD
    if (this.inputStream && this.inputFd !== 0) {
      this.inputStream.destroy();
      this.inputStream = null;
      // Close the underlying FD
      try {
        fs.closeSync(this.inputFd);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        debugLogger.warn(`Failed to close input FD ${this.inputFd}: ${errorMsg}`);
      }
    }
    
    // Close output stream and FD
    if (this.outputStream && this.outputFd !== 1) {
      this.outputStream.end();
      this.outputStream = null;
      // Close the underlying FD
      try {
        fs.closeSync(this.outputFd);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        debugLogger.warn(`Failed to close output FD ${this.outputFd}: ${errorMsg}`);
      }
    }
    
    // Close error stream and FD
    if (this.errorStream && this.errorFd !== 2) {
      this.errorStream.end();
      this.errorStream = null;
      // Close the underlying FD
      try {
        fs.closeSync(this.errorFd);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        debugLogger.warn(`Failed to close error FD ${this.errorFd}: ${errorMsg}`);
      }
    }
  }

  /**
   * Gets the input file descriptor.
   */
  getInputFd(): number {
    return this.inputFd;
  }

  /**
   * Gets the output file descriptor.
   */
  getOutputFd(): number {
    return this.outputFd;
  }

  /**
   * Gets the error file descriptor.
   */
  getErrorFd(): number {
    return this.errorFd;
  }
}

/**
 * Global file descriptor service instance.
 * Initialized during CLI startup based on CLI arguments.
 */
let globalFdService: FileDescriptorService | null = null;

/**
 * Initializes the global file descriptor service.
 * Also registers signal handlers to ensure FD cleanup on process exit.
 * Note: Signal handlers are NOT registered in test environments (vitest) to avoid
 * interfering with the test runner's process management.
 *
 * @param inputFd - Input file descriptor (default: 0)
 * @param outputFd - Output file descriptor (default: 1)
 * @param errorFd - Error file descriptor (default: 2)
 */
export function initializeFileDescriptorService(
  inputFd: number = 0,
  outputFd: number = 1,
  errorFd: number = 2,
): void {
  globalFdService = new FileDescriptorService(inputFd, outputFd, errorFd);
  globalFdService.initialize();

  // Skip signal handler registration in test environments
  // Signal handlers interfere with vitest's worker process management
  const isTestEnvironment = process.env.VITEST === 'true' || 
                            process.env.NODE_ENV === 'test' ||
                            typeof (globalThis as any).vitest !== 'undefined';

  if (isTestEnvironment) {
    debugLogger.debug('Test environment detected, skipping signal handler registration');
    return;
  }

  // Register cleanup handlers for process signals
  // This ensures FDs are closed even if process is killed
  const cleanup = () => {
    try {
      globalFdService?.close();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      debugLogger.warn(`FD cleanup failed: ${errorMsg}`);
    }
  };

  // Handle normal exit
  process.on('exit', cleanup);

  // Handle termination signals
  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);

  // Handle uncaught exceptions
  process.on('uncaughtException', (err) => {
    try {
      cleanup();
    } catch (cleanupError) {
      // Log cleanup failure but don't expose details
      const errorMsg = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
      debugLogger.warn(`Cleanup during error handling failed: ${errorMsg}`);
    }
    // Don't re-throw - let Node.js default handler deal with it
    // Re-throwing can interfere with other handlers
  });
}

/**
 * Gets the global file descriptor service.
 *
 * @returns The global FileDescriptorService instance
 * @throws Error if the service has not been initialized
 */
export function getFileDescriptorService(): FileDescriptorService {
  if (!globalFdService) {
    throw new Error(
      'FileDescriptorService not initialized. Call initializeFileDescriptorService first.',
    );
  }
  return globalFdService;
}

/**
 * Checks if the global file descriptor service is initialized.
 */
export function isFileDescriptorServiceInitialized(): boolean {
  return globalFdService !== null;
}
