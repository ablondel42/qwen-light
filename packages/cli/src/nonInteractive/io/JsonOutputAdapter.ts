/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '@qwen-code/qwen-code-core';
import type { CLIAssistantMessage, CLIMessage } from '../types.js';
import {
  BaseJsonOutputAdapter,
  type JsonOutputAdapterInterface,
  type ResultOptions,
} from './BaseJsonOutputAdapter.js';
import {
  getFileDescriptorService,
  isFileDescriptorServiceInitialized,
} from '../../utils/fileDescriptorService.js';

/**
 * JSON output adapter that collects all messages and emits them
 * as a single JSON array at the end of the turn.
 * Supports both main agent and subagent messages through distinct APIs.
 */
export class JsonOutputAdapter
  extends BaseJsonOutputAdapter
  implements JsonOutputAdapterInterface
{
  private readonly messages: CLIMessage[] = [];

  constructor(config: Config) {
    super(config);
  }

  /**
   * Emits message to the messages array (batch mode).
   * Tracks the last assistant message for efficient result text extraction.
   */
  protected emitMessageImpl(message: CLIMessage): void {
    this.messages.push(message);
    // Track assistant messages for result generation
    if (
      typeof message === 'object' &&
      message !== null &&
      'type' in message &&
      message.type === 'assistant'
    ) {
      this.updateLastAssistantMessage(message as CLIAssistantMessage);
    }
  }

  /**
   * JSON mode does not emit stream events.
   */
  protected shouldEmitStreamEvents(): boolean {
    return false;
  }

  finalizeAssistantMessage(): CLIAssistantMessage {
    return this.finalizeAssistantMessageInternal(
      this.mainAgentMessageState,
      null,
    );
  }

  emitResult(options: ResultOptions): void {
    console.error('[JsonOutputAdapter.emitResult] Called');
    const resultMessage = this.buildResultMessage(
      options,
      this.lastAssistantMessage,
    );
    this.messages.push(resultMessage);
    console.error(`[JsonOutputAdapter.emitResult] resultMessage.is_error=${resultMessage.is_error}, result="${resultMessage.result?.substring(0, 100)}..."`);

    if (this.config.getOutputFormat() === 'text') {
      const output = resultMessage.is_error
        ? `${resultMessage.error?.message || ''}`
        : `${resultMessage.result}`;
      console.error(`[JsonOutputAdapter.emitResult] Writing output: "${output.substring(0, 100)}..."`);
      console.error(`[JsonOutputAdapter.emitResult] FD service initialized: ${isFileDescriptorServiceInitialized()}`);

      if (isFileDescriptorServiceInitialized()) {
        const fdService = getFileDescriptorService();
        console.error(`[JsonOutputAdapter.emitResult] FD service outputFd=${fdService.getOutputFd()}`);
        if (resultMessage.is_error) {
          fdService.writeError(output);
        } else {
          fdService.writeOutput(output);
        }
        console.error('[JsonOutputAdapter.emitResult] writeOutput called');
      } else {
        if (resultMessage.is_error) {
          process.stderr.write(output);
        } else {
          process.stdout.write(output);
        }
      }
    } else {
      // Emit the entire messages array as JSON (includes all main agent + subagent messages)
      const json = JSON.stringify(this.messages);
      const output = `${json}\n`;
      
      if (isFileDescriptorServiceInitialized()) {
        getFileDescriptorService().writeOutput(output);
      } else {
        process.stdout.write(output);
      }
    }
  }

  emitMessage(message: CLIMessage): void {
    // In JSON mode, messages are collected in the messages array
    // This is called by the base class's finalizeAssistantMessageInternal
    // but can also be called directly for user/tool/system messages
    this.messages.push(message);
  }
}
