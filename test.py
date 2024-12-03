import os
import unittest

if __name__ == "__main__":
    loader = unittest.TestLoader()
    start_dir = "tests"
    pattern = "*_test.py"

    print(f"Starting test discovery in: {os.path.abspath(start_dir)}")
    suite = loader.discover(start_dir, pattern=pattern)

    if suite.countTestCases() == 0:
        print("No tests found.")
    else:
        print(f"Found {suite.countTestCases()} tests.")

    runner = unittest.TextTestRunner()
    runner.run(suite)
