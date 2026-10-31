#!/usr/bin/env python3
"""Hermetic tests for scripts/eval_models.py (no network required)."""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from eval_models import t_code, t_math, t_json, t_zh, t_reasoning, TASKS


class TestTCode(unittest.TestCase):
    def test_correct_flatten_passes(self):
        content = (
            "```python\n"
            "def flatten(lst):\n"
            "    out = []\n"
            "    for x in lst:\n"
            "        if isinstance(x, list):\n"
            "            out.extend(flatten(x))\n"
            "        else:\n"
            "            out.append(x)\n"
            "    return out\n"
            "```"
        )
        ok, note = t_code(content)
        self.assertTrue(ok, f"expected pass, got: {note}")

    def test_no_flatten_definition_fails(self):
        ok, note = t_code("this is not python code")
        self.assertFalse(ok)
        self.assertIn("no flatten", note)

    def test_wrong_output_fails(self):
        content = (
            "```python\n"
            "def flatten(lst):\n"
            "    return lst\n"
            "```"
        )
        ok, _ = t_code(content)
        self.assertFalse(ok)

    def test_infinite_loop_killed_by_timeout(self):
        content = (
            "```python\n"
            "def flatten(lst):\n"
            "    while True: pass\n"
            "```"
        )
        ok, note = t_code(content)
        self.assertFalse(ok)
        self.assertIn("timeout", note.lower())


class TestScoringFunctions(unittest.TestCase):
    def test_t_math_correct(self):
        self.assertTrue(t_math("208")[0])

    def test_t_math_wrong(self):
        self.assertFalse(t_math("207")[0])

    def test_t_json_valid(self):
        ok, _ = t_json('{"name": "x", "version": "1", "features": ["a", "b", "c"]}')
        self.assertTrue(ok)

    def test_t_json_wrong_feature_count(self):
        ok, _ = t_json('{"name": "x", "version": "1", "features": ["a", "b"]}')
        self.assertFalse(ok)

    def test_t_zh_chinese_chars(self):
        ok, _ = t_zh("今天天氣很好，我打算去公園走走")
        self.assertTrue(ok)

    def test_t_zh_no_chinese(self):
        ok, _ = t_zh("Just English text here")
        self.assertFalse(ok)

    def test_t_reasoning_yes(self):
        self.assertFalse(t_reasoning("Yes")[0])  # expects "maybe"

    def test_t_reasoning_maybe(self):
        self.assertTrue(t_reasoning("maybe")[0])


class TestTasksRegistry(unittest.TestCase):
    def test_all_tasks_have_three_fields(self):
        for tid, messages, check in TASKS:
            self.assertTrue(callable(check), f"{tid}: check not callable")
            self.assertIsInstance(messages, list)
            self.assertGreater(len(messages), 0)

    def test_task_ids_unique(self):
        ids = [t[0] for t in TASKS]
        self.assertEqual(len(ids), len(set(ids)))


class TestEvalModelsDryRun(unittest.TestCase):
    def test_dry_run_exits_zero(self):
        result = subprocess.run(
            [sys.executable, "-m", "eval_models", "--dry-run", "--tasks", "math"],
            cwd=str(Path(__file__).resolve().parent.parent),
            capture_output=True, text=True, timeout=30,
        )
        self.assertEqual(result.returncode, 0, f"stderr: {result.stderr}")


if __name__ == "__main__":
    unittest.main()
