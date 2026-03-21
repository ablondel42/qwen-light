/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import { Readable, Writable } from 'node:stream';

/**
 * File descriptor service for managing custom stdin/stdout/stderr streams.
 *
 * This service allows the CLI to read/write from arbitrary file descriptors,
 * enabling integration with other processes and tools.
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
   */
  constructor(
    inputFd: number = 0,
    outputFd: number = 1,
    errorFd: number = 2,
  ) {
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
    // For default FDs, we'll return the standard process streams
    if (this.inputFd !== 0) {
      this.inputStream = fs.createReadStream('', {
        fd: this.inputFd,
        autoClose: false,
      });
    }

    if (this.outputFd !== 1) {
      this.outputStream = fs.createWriteStream('', {
        fd: this.outputFd,
        autoClose: false,
      });
    }

    if (this.errorFd !== 2) {
      this.errorStream = fs.createWriteStream('', {
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
      process.stdout.write(data);
    } else {
      // Use synchronous write for custom FDs to ensure data is flushed
      try {
        fs.writeSync(this.outputFd, data);
      } catch (error) {
        // Fallback to stdout if custom FD write fails
        process.stdout.write(data);
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
      process.stderr.write(data);
    } else {
      // Use synchronous write for custom FDs to ensure data is flushed
      try {
        fs.writeSync(this.errorFd, data);
      } catch (error) {
        // Fallback to stderr if custom FD write fails
        process.stderr.write(data);
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
   * Closes all file descriptor streams.
   * Should be called during cleanup.
   * Note: Does not close default FDs (0, 1, 2).
   */
  close(): void {
    if (this.inputStream && this.inputFd !== 0) {
      this.inputStream.destroy();
      this.inputStream = null;
    }
    if (this.outputStream && this.outputFd !== 1) {
      this.outputStream.end();
      this.outputStream = null;
    }
    if (this.errorStream && this.errorFd !== 2) {
      this.errorStream.end();
      this.errorStream = null;
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
