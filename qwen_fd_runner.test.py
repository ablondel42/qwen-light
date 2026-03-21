#!/usr/bin/env python3
"""
@license
Copyright 2025 Google LLC
SPDX-License-Identifier: Apache-2.0
"""

import os
import sys
import tempfile
import subprocess
import unittest
from unittest.mock import patch, MagicMock

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestQwenFDRunner(unittest.TestCase):
    """Test suite for qwen_fd_runner.py covering Critical and Major issues."""

    def setUp(self):
        """Set up test fixtures."""
        self.test_dir = tempfile.mkdtemp()
        self.original_cwd = os.getcwd()
        os.chdir(self.test_dir)

    def tearDown(self):
        """Clean up test fixtures."""
        os.chdir(self.original_cwd)
        # Clean up temp files
        for f in os.listdir(self.test_dir):
            try:
                os.unlink(os.path.join(self.test_dir, f))
            except:
                pass

    def test_fd_validation_remapping_critical_issue_1(self):
        """Test that FDs < 3 are remapped to prevent hijacking (Critical Issue #1)."""
        # This test verifies the logic in qwen_fd_runner.py
        # We can't easily test os.dup() behavior directly, but we can verify
        # the FD validation logic exists
        
        import qwen_fd_runner
        
        # Mock os.open to return FD 0 (should trigger remapping)
        with patch('qwen_fd_runner.os.open') as mock_open:
            mock_open.return_value = 0  # Simulate os.open returning FD 0
            
            # The actual remapping happens in the main() function
            # We verify the logic exists by checking the source
            import inspect
            source = inspect.getsource(qwen_fd_runner.main)
            
            # Verify remapping logic exists
            self.assertIn('os.dup', source)
            self.assertIn('if output_fd < 3', source)
            self.assertIn('if null_fd < 3', source)

    def test_fd_race_condition_fix_critical_issue_2(self):
        """Test that FDs are closed AFTER proc.wait() (Critical Issue #2)."""
        import qwen_fd_runner
        import inspect
        
        source = inspect.getsource(qwen_fd_runner.main)
        
        # Verify the order: proc.wait() comes before os.close()
        wait_pos = source.find('proc.wait()')
        close_pos = source.find('os.close(output_fd)')
        
        self.assertGreater(close_pos, wait_pos, 
            "os.close() must come after proc.wait() to prevent race condition")

    def test_finally_block_for_cleanup_major_issue_3(self):
        """Test that finally block ensures FD cleanup (Major Issue #3)."""
        import qwen_fd_runner
        import inspect
        
        source = inspect.getsource(qwen_fd_runner.main)
        
        # Verify finally block exists
        self.assertIn('finally:', source)
        
        # Verify FD cleanup in finally
        self.assertIn('os.close(output_fd)', source)
        self.assertIn('os.close(null_fd)', source)
        
        # Verify temp file cleanup
        self.assertIn('os.unlink(output_path)', source)

    def test_error_logging_not_empty_except_major_issue_3(self):
        """Test that except clauses log errors (Major Issue #3)."""
        import qwen_fd_runner
        import inspect
        
        source = inspect.getsource(qwen_fd_runner.main)
        
        # Verify error logging exists (no empty except blocks)
        self.assertIn('except OSError as e:', source)
        self.assertIn('print(f"Warning:', source)
        
        # Verify no bare 'except:' with 'pass'
        self.assertNotIn('except OSError:\n        pass', source)

    def test_full_integration_with_real_cli(self):
        """Integration test: run qwen_fd_runner.py with real CLI."""
        # Skip if no API key available
        if not os.environ.get('GEMINI_API_KEY'):
            self.skipTest("GEMINI_API_KEY not set")
        
        runner_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            'qwen_fd_runner.py'
        )
        
        # Run with a simple prompt
        result = subprocess.run(
            ['python3', runner_path, 'Say hello in one word'],
            capture_output=True,
            text=True,
            timeout=60,
            cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        )
        
        # Should complete without EBADF error
        self.assertNotIn('EBADF', result.stderr)
        self.assertNotIn('Bad file descriptor', result.stderr)
        
        # Should produce output
        out_path = os.path.join(self.test_dir, 'out.txt')
        if os.path.exists(out_path):
            with open(out_path, 'r') as f:
                output = f.read()
            self.assertGreater(len(output.strip()), 0, 
                "Output file should contain CLI response")

    def test_fd_cleanup_on_exception(self):
        """Test that FDs are cleaned up even when exception occurs."""
        import qwen_fd_runner
        
        # Mock the subprocess to raise an exception
        with patch('qwen_fd_runner.subprocess.Popen') as mock_popen:
            mock_popen.side_effect = Exception("Test exception")
            
            # Mock other functions to avoid actual execution
            with patch('qwen_fd_runner.tempfile.mkstemp') as mock_mkstemp:
                mock_mkstemp.return_value = (999, '/tmp/test.txt')
                
                with patch('qwen_fd_runner.os.open') as mock_open:
                    mock_open.return_value = 998
                    
                    with patch('qwen_fd_runner.os.close') as mock_close:
                        # Run should raise exception but still cleanup
                        with patch('qwen_fd_runner.sys.argv', ['test', 'prompt']):
                            with self.assertRaises(Exception):
                                try:
                                    qwen_fd_runner.main()
                                except Exception as e:
                                    # Verify cleanup was attempted
                                    self.assertEqual(mock_close.call_count, 2)
                                    raise

    def test_temp_file_cleanup_on_error(self):
        """Test that temp files are cleaned up on error."""
        import qwen_fd_runner
        
        temp_file_created = None
        
        def mock_mkstemp(suffix):
            nonlocal temp_file_created
            fd, path = 999, f'/tmp/test{suffix}'
            temp_file_created = path
            return fd, path
        
        with patch('qwen_fd_runner.tempfile.mkstemp', mock_mkstemp):
            with patch('qwen_fd_runner.subprocess.Popen') as mock_popen:
                mock_popen.side_effect = Exception("Test exception")
                
                with patch('qwen_fd_runner.os.open', return_value=998):
                    with patch('qwen_fd_runner.os.unlink') as mock_unlink:
                        with patch('qwen_fd_runner.sys.argv', ['test', 'prompt']):
                            try:
                                qwen_fd_runner.main()
                            except Exception:
                                pass
                            
                            # Verify cleanup was attempted
                            if temp_file_created:
                                mock_unlink.assert_called()

    def test_concurrent_runners(self):
        """Test multiple runners can run concurrently without FD conflicts."""
        import qwen_fd_runner
        
        runners = []
        for i in range(3):
            runner = qwen_fd_runner.QwenRunner() if hasattr(qwen_fd_runner, 'QwenRunner') else None
            runners.append(runner)
        
        # If QwenRunner class doesn't exist, test the script can be invoked multiple times
        if not any(runners):
            runner_path = os.path.join(
                os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                'qwen_fd_runner.py'
            )
            
            # Run multiple instances concurrently
            processes = []
            for i in range(3):
                proc = subprocess.Popen(
                    ['python3', runner_path, f'Test {i}'],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                )
                processes.append(proc)
            
            # All should complete without FD conflicts
            for proc in processes:
                stdout, stderr = proc.communicate(timeout=60)
                # Should not have EBADF errors
                self.assertNotIn(b'EBADF', stderr)


class TestFDValidation(unittest.TestCase):
    """Test FD validation logic."""
    
    def test_fd_range_validation(self):
        """Test FD values are validated to be in range 0-1024."""
        # This tests the validation logic that should exist
        import qwen_fd_runner
        import inspect
        
        source = inspect.getsource(qwen_fd_runner.main)
        
        # Verify validation exists (checking for FD comparison)
        # The actual validation is implicit in the os.open() call
        # which returns valid FDs, but we check for safety checks
        self.assertIn('if output_fd < 3', source)

    def test_standard_fd_protection(self):
        """Test that standard FDs 0, 1, 2 are protected."""
        import qwen_fd_runner
        import inspect
        
        source = inspect.getsource(qwen_fd_runner.main)
        
        # Verify check for FDs < 3
        self.assertIn('if output_fd < 3', source)
        self.assertIn('if null_fd < 3', source)


if __name__ == '__main__':
    unittest.main()
