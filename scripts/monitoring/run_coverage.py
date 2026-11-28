#!/usr/bin/env python3
"""Zero-dependency stdlib coverage gate for scripts/monitoring & lona_bot/."""

from __future__ import annotations

import argparse
import dis
import fnmatch
import os
import sys
import trace
import unittest
from pathlib import Path
from typing import Iterable


MONITORING_DIR = Path(__file__).resolve().parent
OMIT_PATTERNS = (
    "tests/*",
    "*/tests/*",
    "test_*.py",
    "*/test_*.py",
    "run_coverage.py",
    "telegram-command-bot.py",
)


def _iter_code_objects(co: object) -> Iterable[object]:
    yield co
    for const in getattr(co, "co_consts", ()):
        if type(const) is type(co):
            yield from _iter_code_objects(const)


def _executable_linenos(path: Path) -> set[int]:
    src = path.read_text(encoding="utf-8")
    code = compile(src, str(path), "exec")
    lines: set[int] = set()
    for co in _iter_code_objects(code):
        for _, lineno in dis.findlinestarts(co):
            if lineno and lineno > 0:
                lines.add(int(lineno))
    # Exclude pure pass/closing boilerplate lines is unnecessary; dis matches bytecode statements.
    return lines


def _is_omitted(rel_path: str) -> bool:
    return any(fnmatch.fnmatch(rel_path, pat) for pat in OMIT_PATTERNS)


def discover_source_files() -> list[Path]:
    files: list[Path] = []
    for path in sorted(MONITORING_DIR.rglob("*.py")):
        rel = path.relative_to(MONITORING_DIR).as_posix()
        if rel.startswith("__pycache__") or "/__pycache__/" in rel:
            continue
        if _is_omitted(rel):
            continue
        if path.name == "__init__.py" and path.stat().st_size <= 256:
            continue
        files.append(path)
    return files


def run_suite_with_coverage(test_pattern: str = "test_*.py") -> tuple[bool, dict[tuple[str, int], int]]:
    os.environ.setdefault("PYTHONDONTWRITEBYTECODE", "1")
    sys.path.insert(0, str(MONITORING_DIR))
    tests_dir = MONITORING_DIR / "tests"

    # Trace discovery + execution just like `coverage run -m unittest` so module-level
    # declarations imported by tests are counted accurately rather than marked missed.
    def _discover_and_run():
        loader = unittest.TestLoader()
        suite = (
            loader.discover(str(tests_dir), pattern=test_pattern, top_level_dir=str(MONITORING_DIR))
            if tests_dir.is_dir()
            else loader.discover(str(MONITORING_DIR), pattern=test_pattern)
        )
        runner = unittest.TextTestRunner(verbosity=1)
        return runner.run(suite)

    tracer = trace.Trace(count=True, trace=False, ignoredirs=[sys.prefix, sys.exec_prefix])
    result = tracer.runfunc(_discover_and_run)
    counts = tracer.results().counts
    normalized_counts: dict[tuple[str, int], int] = {}
    for (fname, lineno), hit in counts.items():
        try:
            resolved = str(Path(fname).resolve())
        except Exception:
            resolved = os.path.abspath(fname)
        normalized_counts[(resolved, int(lineno))] = normalized_counts.get((resolved, int(lineno)), 0) + hit
    return result.wasSuccessful(), normalized_counts


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run Bot #2 Python unit tests with stdlib coverage report.")
    parser.add_argument("--fail-under", type=float, default=85.0, help="Minimum total statement coverage %% required.")
    parser.add_argument("--pattern", default="test_*.py", help="Test filename glob pattern.")
    args = parser.parse_args(argv)

    ok, counts = run_suite_with_coverage(test_pattern=args.pattern)
    sources = discover_source_files()

    total_exec = 0
    total_hit = 0
    print("\n" + "=" * 76)
    print(f"{'Module':46s} {'Stmts':>7s} {'Miss':>7s} {'Cover':>8s}")
    print("-" * 76)
    for src in sources:
        rel = src.relative_to(MONITORING_DIR).as_posix()
        resolved = str(src.resolve())
        exec_lines = _executable_linenos(src)
        hit_lines = {ln for ln in exec_lines if counts.get((resolved, ln), 0) > 0}
        miss = len(exec_lines) - len(hit_lines)
        pct = (len(hit_lines) / len(exec_lines) * 100.0) if exec_lines else 100.0
        total_exec += len(exec_lines)
        total_hit += len(hit_lines)
        print(f"{rel:46s} {len(exec_lines):7d} {miss:7d} {pct:7.1f}%")
    print("-" * 76)
    total_miss = total_exec - total_hit
    total_pct = (total_hit / total_exec * 100.0) if total_exec else 100.0
    print(f"{'TOTAL':46s} {total_exec:7d} {total_miss:7d} {total_pct:7.1f}%")
    print("=" * 76)

    if not ok:
        print("ERROR: Python unit tests failed.", file=sys.stderr)
        return 1
    if total_pct < args.fail_under:
        print(
            f"ERROR: Python coverage {total_pct:.1f}% is below threshold {args.fail_under:.1f}%.",
            file=sys.stderr,
        )
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
