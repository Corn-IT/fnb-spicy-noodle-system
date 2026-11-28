#!/usr/bin/env python3
"""Unified test suite delegating to modular scripts/monitoring/tests/ suite."""

from __future__ import annotations

import unittest
from pathlib import Path


def load_tests(loader: unittest.TestLoader, tests: unittest.TestSuite, pattern: str | None) -> unittest.TestSuite:
    tests_dir = Path(__file__).resolve().parent / "tests"
    return loader.discover(str(tests_dir), pattern=pattern or "test_*.py", top_level_dir=str(tests_dir.parent))


if __name__ == "__main__":
    unittest.main()
