#!/usr/bin/env python3
"""Hermetic tests for agents-lab/D-langgraph-agent/agent.py calculator + read_text_file."""

import ast
import sys
import tempfile
import unittest
import unittest.mock
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import agent


class TestCalculator(unittest.TestCase):
    def test_simple(self):
        tree = agent._eval_node(ast.parse("2 + 3", mode="eval").body)
        self.assertEqual(tree, 5)

    def test_division(self):
        tree = agent._eval_node(ast.parse("10 / 4", mode="eval").body)
        self.assertEqual(tree, 2.5)

    def test_power_capped(self):
        with self.assertRaises(ValueError):
            agent._eval_node(ast.parse("99999 ** 2", mode="eval").body)

    def test_power_small_ok(self):
        tree = agent._eval_node(ast.parse("2 ** 10", mode="eval").body)
        self.assertEqual(tree, 1024)

    def test_unsupported_op(self):
        with self.assertRaises(ValueError):
            agent._eval_node(ast.parse("1 & 1", mode="eval").body)


class TestReadTextFile(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.mkdtemp()
        self._patch = unittest.mock.patch.object(agent, "AGENT_DIR", Path(self._tmp).resolve())
        self._patch.start()
        (Path(self._tmp) / "hello.txt").write_text("hi from test", encoding="utf-8")

    def tearDown(self):
        self._patch.stop()
        import shutil
        shutil.rmtree(self._tmp, ignore_errors=True)

    def test_reads_file_in_dir(self):
        out = agent.read_text_file.func("hello.txt")
        self.assertIn("hi from test", out)

    def test_traversal_blocked(self):
        result = agent.read_text_file.func("../outside.txt")
        self.assertTrue(result.startswith("Error"))
        self.assertIn("path must stay inside", result)


if __name__ == "__main__":
    unittest.main()

