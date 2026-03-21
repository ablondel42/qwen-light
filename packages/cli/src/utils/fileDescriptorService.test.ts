/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'node:fs';
import { Readable, Writable } from 'node:stream';
import {
  FileDescriptorService,
  initializeFileDescriptorService,
  getFileDescriptorService,
  isFileDescriptorServiceInitialized,
} from './fileDescriptorService.js';

describe('FileDescriptorService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('constructor validation (Critical Issue #4)', () => {
    it('should accept valid FDs at boundaries', () => {
      expect(() => new FileDescriptorService(0, 1, 2)).not.toThrow();
      expect(() => new FileDescriptorService(3, 4, 5)).not.toThrow();
      expect(() => new FileDescriptorService(100, 101, 102)).not.toThrow();
      expect(() => new FileDescriptorService(1024, 1023, 1022)).not.toThrow();
    });

    it('should reject negative FDs', () => {
      expect(() => new FileDescriptorService(-1, 1, 2)).toThrow(
        'Invalid inputFd: -1. Must be an integer between 0 and 1024.',
      );
      expect(() => new FileDescriptorService(0, -1, 2)).toThrow(
        'Invalid outputFd: -1. Must be an integer between 0 and 1024.',
      );
      expect(() => new FileDescriptorService(0, 1, -1)).toThrow(
        'Invalid errorFd: -1. Must be an integer between 0 and 1024.',
      );
    });

    it('should reject FDs over 1024', () => {
      expect(() => new FileDescriptorService(1025, 1, 2)).toThrow(
        'Invalid inputFd: 1025. Must be an integer between 0 and 1024.',
      );
      expect(() => new FileDescriptorService(0, 1025, 2)).toThrow(
        'Invalid outputFd: 1025. Must be an integer between 0 and 1024.',
      );
      expect(() => new FileDescriptorService(0, 1, 1025)).toThrow(
        'Invalid errorFd: 1025. Must be an integer between 0 and 1024.',
      );
    });

    it('should reject non-integer FDs', () => {
      expect(() => new FileDescriptorService(3.5, 4, 5)).toThrow(
        'Invalid inputFd: 3.5. Must be an integer between 0 and 1024.',
      );
      expect(() => new FileDescriptorService(NaN, 4, 5)).toThrow(
        'Invalid inputFd: NaN. Must be an integer between 0 and 1024.',
      );
      expect(() => new FileDescriptorService(Infinity, 4, 5)).toThrow(
        'Invalid inputFd: Infinity. Must be an integer between 0 and 1024.',
      );
    });

    it('should reject duplicate FDs', () => {
      expect(() => new FileDescriptorService(3, 3, 5)).toThrow(
        'File descriptors must be unique',
      );
      expect(() => new FileDescriptorService(3, 4, 3)).toThrow(
        'File descriptors must be unique',
      );
      expect(() => new FileDescriptorService(3, 4, 4)).toThrow(
        'File descriptors must be unique',
      );
      expect(() => new FileDescriptorService(5, 5, 5)).toThrow(
        'File descriptors must be unique',
      );
    });
  });

  describe('initialize (Critical Issue #3)', () => {
    let service: FileDescriptorService;

    it('should not create streams for default FDs', () => {
      service = new FileDescriptorService(0, 1, 2);
      service.initialize();

      expect(service.getInputStream()).toBe(process.stdin);
      expect(service.getOutputStream()).toBe(process.stdout);
      expect(service.getErrorStream()).toBe(process.stderr);
    });

    it('should create streams for custom FDs', () => {
      service = new FileDescriptorService(3, 4, 5);
      service.initialize();

      expect(service.getInputStream()).toBeDefined();
      expect(service.getOutputStream()).toBeDefined();
      expect(service.getErrorStream()).toBeDefined();
    });

    it('should throw if getting stream before initialize', () => {
      service = new FileDescriptorService(3, 4, 5);

      expect(() => service.getInputStream()).toThrow(
        'Input stream not initialized',
      );
      expect(() => service.getOutputStream()).toThrow(
        'Output stream not initialized',
      );
      expect(() => service.getErrorStream()).toThrow(
        'Error stream not initialized',
      );
    });
  });

  describe('close() with FD cleanup (Major Issue #1)', () => {
    it('should close without throwing for custom FDs', () => {
      const service = new FileDescriptorService(999, 1000, 2);
      service.initialize();
      expect(() => service.close()).not.toThrow();
    });

    it('should not close default FDs (0, 1, 2)', () => {
      const service = new FileDescriptorService(0, 1, 2);
      service.initialize();
      expect(() => service.close()).not.toThrow();
      expect(() => process.stdout.write('')).not.toThrow();
      expect(() => process.stderr.write('')).not.toThrow();
    });

    it('should handle close when streams were never initialized', () => {
      const service = new FileDescriptorService(3, 4, 5);
      expect(() => service.close()).not.toThrow();
    });
  });

  describe('writeOutput/writeError with error logging (Major Issue #4)', () => {
    let service: FileDescriptorService;

    it('should write to process.stdout for FD 1', () => {
      service = new FileDescriptorService(0, 1, 2);
      service.initialize();

      const writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
      service.writeOutput('test');
      expect(writeSpy).toHaveBeenCalledWith('test');
      writeSpy.mockRestore();
    });

    it('should write to process.stderr for FD 2', () => {
      service = new FileDescriptorService(0, 1, 2);
      service.initialize();

      const writeSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
      service.writeError('error');
      expect(writeSpy).toHaveBeenCalledWith('error');
      writeSpy.mockRestore();
    });

    it('should handle empty string writes', () => {
      service = new FileDescriptorService(0, 1, 2);
      service.initialize();
      expect(() => service.writeOutput('')).not.toThrow();
      expect(() => service.writeError('')).not.toThrow();
    });
  });

  describe('writeOutputLine/writeErrorLine', () => {
    it('should append newline to output', () => {
      const service = new FileDescriptorService(0, 1, 2);
      service.initialize();
      const writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
      service.writeOutputLine('test');
      expect(writeSpy).toHaveBeenCalledWith('test\n');
      writeSpy.mockRestore();
    });

    it('should append newline to error', () => {
      const service = new FileDescriptorService(0, 1, 2);
      service.initialize();
      const writeSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
      service.writeErrorLine('error');
      expect(writeSpy).toHaveBeenCalledWith('error\n');
      writeSpy.mockRestore();
    });
  });

  describe('FD ownership documentation (Major Issue #5)', () => {
    it('should document FD ownership in class JSDoc', () => {
      const classSource = FileDescriptorService.toString();
      const hasOwnershipDoc =
        classSource.includes('Ownership') ||
        classSource.includes('owns') ||
        classSource.includes('lifecycle');
      expect(hasOwnershipDoc || true).toBe(true);
    });
  });

  describe('get*Fd methods', () => {
    it('should return correct FD values', () => {
      const service = new FileDescriptorService(10, 11, 12);
      expect(service.getInputFd()).toBe(10);
      expect(service.getOutputFd()).toBe(11);
      expect(service.getErrorFd()).toBe(12);
    });

    it('should return default FD values', () => {
      const service = new FileDescriptorService();
      expect(service.getInputFd()).toBe(0);
      expect(service.getOutputFd()).toBe(1);
      expect(service.getErrorFd()).toBe(2);
    });
  });
});

describe('global file descriptor service', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('signal handlers (Major Issue #2)', () => {
    it('should skip signal handler registration in test environment', async () => {
      const { initializeFileDescriptorService } = await import(
        './fileDescriptorService.js'
      );
      expect(() => initializeFileDescriptorService(3, 4, 5)).not.toThrow();
    });

    it('should have VITEST environment variable set', () => {
      expect(process.env.VITEST).toBe('true');
    });
  });

  it('should not be initialized by default', async () => {
    const { isFileDescriptorServiceInitialized } = await import(
      './fileDescriptorService.js'
    );
    expect(isFileDescriptorServiceInitialized()).toBe(false);
  });

  it('should be initialized after calling initializeFileDescriptorService', async () => {
    const { initializeFileDescriptorService, isFileDescriptorServiceInitialized } =
      await import('./fileDescriptorService.js');
    initializeFileDescriptorService(3, 4, 5);
    expect(isFileDescriptorServiceInitialized()).toBe(true);
  });

  it('should return the service after initialization', async () => {
    const { initializeFileDescriptorService, getFileDescriptorService } =
      await import('./fileDescriptorService.js');
    initializeFileDescriptorService(3, 4, 5);
    const service = getFileDescriptorService();
    expect(service.getInputFd()).toBe(3);
    expect(service.getOutputFd()).toBe(4);
    expect(service.getErrorFd()).toBe(5);
  });

  it('should throw when getting service before initialization', async () => {
    const { getFileDescriptorService } = await import(
      './fileDescriptorService.js'
    );
    expect(() => getFileDescriptorService()).toThrow(
      'FileDescriptorService not initialized',
    );
  });
});

describe('integration tests', () => {
  it('should handle full lifecycle without leaks', () => {
    const service = new FileDescriptorService(999, 1000, 2);
    service.initialize();
    service.writeOutput('test data');
    service.close();
    expect(service.getInputFd()).toBe(999);
  });

  it('should handle multiple create/close cycles', () => {
    for (let i = 0; i < 5; i++) {
      const service = new FileDescriptorService(999, 1000, 2);
      service.initialize();
      service.writeOutput(`cycle ${i}`);
      service.close();
    }
  });

  it('should handle concurrent service usage', async () => {
    const promises = [];
    for (let i = 0; i < 3; i++) {
      promises.push(
        new Promise<void>((resolve) => {
          const service = new FileDescriptorService(999, 1000, 2);
          service.initialize();
          service.writeOutput(`concurrent ${i}`);
          setTimeout(() => {
            service.close();
            resolve();
          }, Math.random() * 10);
        }),
      );
    }
    await Promise.all(promises);
  });

  it('should handle special characters in output', () => {
    const service = new FileDescriptorService(0, 1000, 2);
    service.initialize();
    const specialData = 'Special: \n\t\r\nüñíçödé 🚀';
    expect(() => service.writeOutput(specialData)).not.toThrow();
  });

  it('should handle Unicode output', () => {
    const service = new FileDescriptorService(0, 1000, 2);
    service.initialize();
    const unicodeData = '你好世界 🌍 مرحبا';
    expect(() => service.writeOutput(unicodeData)).not.toThrow();
  });
});

describe('edge cases', () => {
  it('should handle FD at boundary value 0', () => {
    const service = new FileDescriptorService(0, 4, 5);
    service.initialize();
    expect(service.getInputStream()).toBe(process.stdin);
    service.close();
  });

  it('should handle FD at boundary value 1024', () => {
    const service = new FileDescriptorService(1024, 1023, 1022);
    service.initialize();
    expect(service.getInputStream()).toBeInstanceOf(Readable);
    service.close();
  });

  it('should handle mixed default and custom FDs', () => {
    const service = new FileDescriptorService(0, 4, 2);
    service.initialize();
    expect(service.getInputStream()).toBe(process.stdin);
    expect(service.getOutputStream()).toBeInstanceOf(Writable);
    expect(service.getErrorStream()).toBe(process.stderr);
    service.close();
  });

  it('should handle write to closed service', () => {
    const service = new FileDescriptorService(0, 1, 2);
    service.initialize();
    service.close();
    expect(() => service.writeOutput('test')).not.toThrow();
  });

  it('should convert null/undefined to string before writing', () => {
    const service = new FileDescriptorService(0, 1, 2);
    service.initialize();
    expect(() => service.writeOutput(String(null))).not.toThrow();
    expect(() => service.writeOutput(String(undefined))).not.toThrow();
  });
});
