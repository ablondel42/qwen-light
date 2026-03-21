/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { createInterface } from 'node:readline/promises';
import type { Readable } from 'node:stream';
import process from 'node:process';
import { createDebugLogger } from '@qwen-code/qwen-code-core';
import type {
  CLIControlRequest,
  CLIControlResponse,
  CLIMessage,
  ControlCancelRequest,
} from '../types.js';
import {
  getFileDescriptorService,
  isFileDescriptorServiceInitialized,
} from '../../utils/fileDescriptorService.js';

const debugLogger = createDebugLogger('STREAM_JSON_INPUT');

export type StreamJsonInputMessage =
  | CLIMessage
  | CLIControlRequest
  | CLIControlResponse
  | ControlCancelRequest;

export class StreamJsonParseError extends Error {}

export class StreamJsonInputReader {
  private readonly input: Readable;

  constructor(input?: Readable) {
    // Use custom FD service if initialized, otherwise use provided input or default to process.stdin
    if (input) {
      this.input = input;
    } else if (isFileDescriptorServiceInitialized()) {
      this.input = getFileDescriptorService().getInputStream();
    } else {
      this.input = process.stdin;
    }
  }

  async *read(): AsyncGenerator<StreamJsonInputMessage> {
    const rl = createInterface({
      input: this.input,
      crlfDelay: Number.POSITIVE_INFINITY,
      terminal: false,
    });

    try {
      for await (const rawLine of rl) {
        const line = rawLine.trim();
        if (!line) {
          continue;
        }

        yield this.parse(line);
      }
    } catch (error) {
      // Handle stream errors or parse errors during iteration
      if (error instanceof StreamJsonParseError) {
        throw error;
      }
      const reason = error instanceof Error ? error.message : String(error);
      throw new StreamJsonParseError(`Stream error: ${reason}`);
    } finally {
      try {
        rl.close();
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        debugLogger.warn(`Failed to close readline interface: ${errorMsg}`);
      }
    }
  }

  private parse(line: string): StreamJsonInputMessage {
    try {
      const parsed = JSON.parse(line) as StreamJsonInputMessage;
      if (!parsed || typeof parsed !== 'object') {
        throw new StreamJsonParseError('Parsed value is not an object');
      }
      if (!('type' in parsed) || typeof parsed.type !== 'string') {
        throw new StreamJsonParseError('Missing required "type" field');
      }
      return parsed;
    } catch (error) {
      if (error instanceof StreamJsonParseError) {
        throw error;
      }
      const reason = error instanceof Error ? error.message : String(error);
      throw new StreamJsonParseError(
        `Failed to parse stream-json line: ${reason}`,
      );
    }
  }
}
