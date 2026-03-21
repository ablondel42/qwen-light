/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import { Readable, Writable } from 'node:stream';
import {
  FileDescriptorService,
  initializeFileDescriptorService,
  getFileDescriptorService,
  isFileDescriptorServiceInitialized,
} from './fileDescriptorService.js';

describe('FileDescriptorService', () => {
  describe('constructor', () => {
    it('should use default FDs when not specified', () => {
      const service = new FileDescriptorService();
      expect(service.getInputFd()).toBe(0);
      expect(service.getOutputFd()).toBe(1);
      expect(service.getErrorFd()).toBe(2);
    });

    it('should use custom FDs when specified', () => {
      const service = new FileDescriptorService(3, 4, 5);
      expect(service.getInputFd()).toBe(3);
      expect(service.getOutputFd()).toBe(4);
      expect(service.getErrorFd()).toBe(5);
    });
  });

  describe('initialize', () => {
    let service: FileDescriptorService;

    afterEach(() => {
      service?.close();
    });

    it('should not create streams for default FDs', () => {
      service = new FileDescriptorService(0, 1, 2);
      service.initialize();
      // Default FDs should not create streams
      expect(() => service.getInputStream()).not.toThrow();
      expect(() => service.getOutputStream()).not.toThrow();
      expect(() => service.getErrorStream()).not.toThrow();
    });

    it('should create streams for custom FDs', () => {
      service = new FileDescriptorService(3, 4, 5);
      service.initialize();
      // Custom FDs should create streams
      expect(service.getInputStream()).toBeInstanceOf(Readable);
      expect(service.getOutputStream()).toBeInstanceOf(Writable);
      expect(service.getErrorStream()).toBeInstanceOf(Writable);
    });
  });

  describe('getInputStream', () => {
    let service: FileDescriptorService;

    afterEach(() => {
      service?.close();
    });

    it('should return process.stdin for FD 0', () => {
      service = new FileDescriptorService(0, 1, 2);
      service.initialize();
      expect(service.getInputStream()).toBe(process.stdin);
    });

    it('should return custom stream for non-zero FD', () => {
      service = new FileDescriptorService(3, 1, 2);
      service.initialize();
      const stream = service.getInputStream();
      expect(stream).not.toBe(process.stdin);
      expect(stream).toBeInstanceOf(Readable);
    });
  });

  describe('getOutputStream', () => {
    let service: FileDescriptorService;

    afterEach(() => {
      service?.close();
    });

    it('should return process.stdout for FD 1', () => {
      service = new FileDescriptorService(0, 1, 2);
      service.initialize();
      expect(service.getOutputStream()).toBe(process.stdout);
    });

    it('should return custom stream for non-one FD', () => {
      service = new FileDescriptorService(0, 4, 2);
      service.initialize();
      const stream = service.getOutputStream();
      expect(stream).not.toBe(process.stdout);
      expect(stream).toBeInstanceOf(Writable);
    });
  });

  describe('getErrorStream', () => {
    let service: FileDescriptorService;

    afterEach(() => {
      service?.close();
    });

    it('should return process.stderr for FD 2', () => {
      service = new FileDescriptorService(0, 1, 2);
      service.initialize();
      expect(service.getErrorStream()).toBe(process.stderr);
    });

    it('should return custom stream for non-two FD', () => {
      service = new FileDescriptorService(0, 1, 5);
      service.initialize();
      const stream = service.getErrorStream();
      expect(stream).not.toBe(process.stderr);
      expect(stream).toBeInstanceOf(Writable);
    });
  });

  describe('writeOutput', () => {
    let service: FileDescriptorService;

    afterEach(() => {
      service?.close();
    });

    it('should write to process.stdout for default FD', () => {
      service = new FileDescriptorService(0, 1, 2);
      service.initialize();
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      
      service.writeOutput('test');
      
      expect(writeSpy).toHaveBeenCalledWith('test');
      writeSpy.mockRestore();
    });

    it('should write to custom stream for non-default FD', () => {
      service = new FileDescriptorService(0, 4, 2);
      service.initialize();
      const customStream = service.getOutputStream() as Writable;
      const writeSpy = vi.spyOn(customStream, 'write').mockImplementation(() => true);
      
      service.writeOutput('test');
      
      expect(writeSpy).toHaveBeenCalledWith('test');
      writeSpy.mockRestore();
    });
  });

  describe('writeError', () => {
    let service: FileDescriptorService;

    afterEach(() => {
      service?.close();
    });

    it('should write to process.stderr for default FD', () => {
      service = new FileDescriptorService(0, 1, 2);
      service.initialize();
      const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      
      service.writeError('error');
      
      expect(writeSpy).toHaveBeenCalledWith('error');
      writeSpy.mockRestore();
    });

    it('should write to custom stream for non-default FD', () => {
      service = new FileDescriptorService(0, 1, 5);
      service.initialize();
      const customStream = service.getErrorStream() as Writable;
      const writeSpy = vi.spyOn(customStream, 'write').mockImplementation(() => true);
      
      service.writeError('error');
      
      expect(writeSpy).toHaveBeenCalledWith('error');
      writeSpy.mockRestore();
    });
  });

  describe('close', () => {
    it('should not close default FD streams', () => {
      const service = new FileDescriptorService(0, 1, 2);
      service.initialize();
      
      // Should not throw
      expect(() => service.close()).not.toThrow();
      
      // Streams should still be accessible
      expect(service.getInputStream()).toBe(process.stdin);
      expect(service.getOutputStream()).toBe(process.stdout);
      expect(service.getErrorStream()).toBe(process.stderr);
    });
  });
});

describe('global file descriptor service', () => {
  beforeEach(() => {
    // Reset global state
    vi.resetModules();
  });

  it('should not be initialized by default', async () => {
    const { isFileDescriptorServiceInitialized } = await import('./fileDescriptorService.js');
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
    const { getFileDescriptorService } = await import('./fileDescriptorService.js');
    
    expect(() => getFileDescriptorService()).toThrow(
      'FileDescriptorService not initialized'
    );
  });
});
