#!/usr/bin/env python3
"""
Qwen CLI File Descriptor Runner

Runs the Qwen CLI in non-interactive mode and captures output.
Uses proper OS file descriptor management.

Usage:
    python qwen_fd_runner.py "your prompt here"
    
Output:
    Results written to out.txt
"""

import os
import sys
import subprocess
import tempfile
import uuid


def main():
    # Get prompt from command line
    if len(sys.argv) < 2:
        print("Usage: python qwen_fd_runner.py <prompt>", file=sys.stderr)
        sys.exit(1)
    
    prompt = sys.argv[1]
    session_id = str(uuid.uuid4())
    
    # Create temp file for output
    output_path = tempfile.mktemp(suffix='.qwen-output')
    
    # Open output file and get a real FD from the OS
    output_fd = os.open(output_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o644)
    
    # Open /dev/null for stdin to force non-interactive mode
    null_fd = os.open('/dev/null', os.O_RDONLY)
    
    try:
        print(f"Session ID: {session_id}", file=sys.stderr)
        print(f"Using FDs: stdin={null_fd}, output={output_fd}", file=sys.stderr)
        print(f"Running CLI with prompt: {prompt}", file=sys.stderr)
        
        # Build command
        cmd = [
            'node', '-r', 'tsx/esm', 'packages/cli/index.ts',
            '--output-fd', str(output_fd),
            '--session-id', session_id,
            '--prompt', prompt,
        ]
        
        # Set environment - disable relaunch to prevent EBADF with custom FDs
        env = os.environ.copy()
        env['QWEN_CODE_NO_RELAUNCH'] = 'true'
        
        # Spawn CLI subprocess
        # pass_fds ensures output_fd is inherited by the child process
        # stdin=null_fd forces non-interactive mode
        proc = subprocess.Popen(
            cmd,
            stdin=null_fd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            pass_fds=(output_fd,),
            cwd=os.path.dirname(os.path.abspath(__file__)),
            env=env,
        )
        
        # Wait for completion
        exit_code = proc.wait()
        print(f"CLI exited with code: {exit_code}", file=sys.stderr)
        
        # Close FDs before reading
        os.close(output_fd)
        os.close(null_fd)
        
        # Read output
        try:
            with open(output_path, 'r') as f:
                output = f.read()
        except FileNotFoundError:
            output = ""
        
        # Write to out.txt
        with open('out.txt', 'w') as f:
            f.write(output)
        
        print(f"\nOutput written to out.txt", file=sys.stderr)
        if output:
            print(f"\n=== OUTPUT ===", file=sys.stderr)
            print(output, file=sys.stderr)
        else:
            print("\n=== OUTPUT (empty) ===", file=sys.stderr)
        
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        raise
    finally:
        # Cleanup FDs (might already be closed)
        try:
            os.close(output_fd)
        except OSError:
            pass
        try:
            os.close(null_fd)
        except OSError:
            pass
        
        # Cleanup temp files
        try:
            os.unlink(output_path)
        except OSError:
            pass
        
        print("Cleanup complete.", file=sys.stderr)


if __name__ == '__main__':
    main()
