/**
 * Test script to verify FD redirection works correctly
 */

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';

console.log('Testing CLI with custom FD redirection...\n');

// Use files for FD redirection
const inputFile = './test-input.txt';
const outputFile = './test-output.txt';

// Clear output file
try { fs.unlinkSync(outputFile); } catch {}

// Open file descriptors
const inputFd = fs.openSync(inputFile, 'r');
const outputFd = fs.openSync(outputFile, 'w');

console.log(`Input file: ${inputFile}`);
console.log(`Output file: ${outputFile}`);
console.log(`Input content: "${fs.readFileSync(inputFile, 'utf8').trim()}"\n`);

// Spawn CLI with custom FDs
// stdio: [stdin, stdout, stderr, fd3, fd4]
const child = spawn('node', ['scripts/dev.js', '--input-fd', '3', '--output-fd', '4', '--prompt', 'hello'], {
  stdio: ['ignore', 'pipe', 'pipe', inputFd, outputFd],
  cwd: process.cwd(),
});

console.log(`Spawned CLI with PID: ${child.pid}\n`);

let errorData = '';

// Read from stderr for debugging
child.stderr.setEncoding('utf8');
child.stderr.on('data', (chunk) => {
  console.log('⚠️  stderr:', chunk.trim());
  errorData += chunk;
});

// Read from stdout (should be empty since we use fd4)
child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  console.log('📝 stdout:', chunk.trim());
});

// Wait for process to exit
child.on('close', (code) => {
  console.log(`\n✅ CLI exited with code: ${code}`);
  
  // Close FDs
  fs.closeSync(inputFd);
  fs.closeSync(outputFd);
  
  // Read output file
  let outputData = '';
  try {
    outputData = fs.readFileSync(outputFile, 'utf8');
  } catch (e) {
    console.log('Could not read output file:', e.message);
  }
  
  // Cleanup
  try { fs.unlinkSync(inputFile); } catch {}
  try { fs.unlinkSync(outputFile); } catch {}
  
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
