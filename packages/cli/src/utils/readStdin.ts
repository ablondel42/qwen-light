/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { writeStderrLine } from './stdioHelpers.js';
import {
  getFileDescriptorService,
  isFileDescriptorServiceInitialized,
} from './fileDescriptorService.js';

export async function readStdin(): Promise<string> {
  const MAX_STDIN_SIZE = 8 * 1024 * 1024; // 8MB

  // Use custom FD service if initialized
  if (isFileDescriptorServiceInitialized()) {
    const fdService = getFileDescriptorService();
    const inputStream = fdService.getInputStream();

    return new Promise((resolve, reject) => {
      let data = '';
      let totalSize = 0;
      inputStream.setEncoding('utf8');

      const pipedInputShouldBeAvailableInMs = 500;
      let pipedInputTimerId: null | NodeJS.Timeout = setTimeout(() => {
        onEnd();
      }, pipedInputShouldBeAvailableInMs);

      const onReadable = () => {
        let chunk;
        while ((chunk = inputStream.read()) !== null) {
          if (pipedInputTimerId) {
            clearTimeout(pipedInputTimerId);
            pipedInputTimerId = null;
          }

          if (totalSize + chunk.length > MAX_STDIN_SIZE) {
            const remainingSize = MAX_STDIN_SIZE - totalSize;
            data += chunk.slice(0, remainingSize);
            writeStderrLine(
              `Warning: stdin input truncated to ${MAX_STDIN_SIZE} bytes.`,
            );
            if (inputStream instanceof require('node:stream').Readable) {
              inputStream.destroy();
            }
            break;
          }
          data += chunk;
          totalSize += chunk.length;
        }
      };

      const onEnd = () => {
        cleanup();
        resolve(data);
      };

      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };

      const cleanup = () => {
        if (pipedInputTimerId) {
          clearTimeout(pipedInputTimerId);
          pipedInputTimerId = null;
        }
        inputStream.removeListener('readable', onReadable);
        inputStream.removeListener('end', onEnd);
        inputStream.removeListener('error', onError);
      };

      inputStream.on('readable', onReadable);
      inputStream.on('end', onEnd);
      inputStream.on('error', onError);
    });
  }

  // Default: use process.stdin
  return new Promise((resolve, reject) => {
    let data = '';
    let totalSize = 0;
    process.stdin.setEncoding('utf8');

    const pipedInputShouldBeAvailableInMs = 500;
    let pipedInputTimerId: null | NodeJS.Timeout = setTimeout(() => {
      onEnd();
    }, pipedInputShouldBeAvailableInMs);

    const onReadable = () => {
      let chunk;
      while ((chunk = process.stdin.read()) !== null) {
        if (pipedInputTimerId) {
          clearTimeout(pipedInputTimerId);
          pipedInputTimerId = null;
        }

        if (totalSize + chunk.length > MAX_STDIN_SIZE) {
          const remainingSize = MAX_STDIN_SIZE - totalSize;
          data += chunk.slice(0, remainingSize);
          writeStderrLine(
            `Warning: stdin input truncated to ${MAX_STDIN_SIZE} bytes.`,
          );
          process.stdin.destroy();
          break;
        }
        data += chunk;
        totalSize += chunk.length;
      }
    };

    const onEnd = () => {
      cleanup();
      resolve(data);
    };

    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };

    const cleanup = () => {
      if (pipedInputTimerId) {
        clearTimeout(pipedInputTimerId);
        pipedInputTimerId = null;
      }
      process.stdin.removeListener('readable', onReadable);
      process.stdin.removeListener('end', onEnd);
      process.stdin.removeListener('error', onError);
    };

    process.stdin.on('readable', onReadable);
    process.stdin.on('end', onEnd);
    process.stdin.on('error', onError);
  });
}
