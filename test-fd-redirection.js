/**
 * Test script to verify FD redirection works correctly
 */

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';

console.log('Testing CLI with custom FD redirection...\n');

// Create temporary files for FD redirection (simpler than pipes for testing)
const inputFile = '/tmp/qwen-test-input-' + Date.now();
const outputFile = '/tmp/qwen-test-output-' + Date.now();

// Write test input to input file
const testInput = 'What is 2 + 2?';
fs.writeFileSync(inputFile, testInput);

console.log(`Test input: "${testInput}"`);
console.log(`Input file: ${inputFile}`);
console.log(`Output file: ${outputFile}\n`);

// Open file descriptors
const inputFd = fs.openSync(inputFile, 'r');
const outputFd = fs.openSync(outputFile, 'w');

// Spawn CLI with custom FDs
// stdio: [stdin, stdout, stderr, fd3, fd4]
// We want:
// - stdin (0): ignore (we use fd3)
// - stdout (1): pipe (to capture for verification)
// - stderr (2): pipe (to capture errors)
// - fd3 (3): inputFd (CLI reads from this)
// - fd4 (4): outputFd (CLI writes to this)
const child = spawn('node', ['scripts/dev.js', '--input-fd', '3', '--output-fd', '4', '--prompt', 'hello'], {
  stdio: ['ignore', 'pipe', 'pipe', inputFd, outputFd],
  cwd: process.cwd(),
});

console.log(`Spawned CLI with PID: ${child.pid}`);

// Track output
let outputData = '';
let errorData = '';

// Read from stderr for debugging
child.stderr.setEncoding('utf8');
child.stderr.on('data', (chunk) => {
  console.log('⚠️  stderr:', chunk.trim());
  errorData += chunk;
});

// Read from stdout for debugging (should be empty since we use fd4)
child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  console.log('📝 stdout (should be empty):', chunk.trim());
});

// Wait for process to exit
child.on('close', (code) => {
  console.log(`\n✅ CLI exited with code: ${code}`);
  
  // Close FDs
  fs.closeSync(inputFd);
  fs.closeSync(outputFd);
  
  // Read output file
  try {
    outputData = fs.readFileSync(outputFile, 'utf8');
  } catch (e) {
    console.log('Could not read output file:', e.message);
  }
  
  // Cleanup temp files
  try {
    fs.unlinkSync(inputFile);
    fs.unlinkSync(outputFile);
  } catch (e) {
    // Ignore cleanup errors
  }
  
  console.log('\n--- Summary ---');
  console.log(`Output file content: ${outputData.length > 0 ? 'YES' : 'NO'}`);
  console.log(`Output length: ${outputData.length} bytes`);
  console.log(`Errors received: ${errorData.length > 0 ? 'YES' : 'NO'}`);
  
  if (outputData.length > 0) {
    console.log('\n✅ SUCCESS: Custom FD redirection is working!');
    console.log('\nOutput content:');
    console.log(outputData);
  } else {
    console.log('\n❌ FAILURE: No output received on custom FD');
    if (errorData) {
      console.log('\nError output:');
      console.log(errorData);
    }
  }
  
  process.exit(code ?? 0);
});

child.on('error', (err) => {
  console.error('❌ Spawn error:', err.message);
  fs.closeSync(inputFd);
  fs.closeSync(outputFd);
  try { fs.unlinkSync(inputFile); } catch {}
  try { fs.unlinkSync(outputFile); } catch {}
  process.exit(1);
});
