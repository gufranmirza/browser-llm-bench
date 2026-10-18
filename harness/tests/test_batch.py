"""Checks for snapshotting active collectors; these temporary fixtures are not benchmark evidence."""

import unittest, tempfile, pathlib, json
from harness.publishing.finalize_report import read_json, lines


class BatchChecks(unittest.TestCase):
    def test_json_accepts_cli_string_paths(self):
        with tempfile.TemporaryDirectory() as d:
            p = pathlib.Path(d) / "test.json"
            p.write_text('{"ok":true}')
            self.assertEqual(read_json(str(p)), {"ok": True})

    def test_only_incomplete_trailing_frame_can_be_omitted(self):
        with tempfile.TemporaryDirectory() as d:
            p = pathlib.Path(d) / "frames.jsonl"
            p.write_text('{"epochMs":1}\n{"epochMs":')
            self.assertEqual(lines(p), [{"epochMs": 1}])
            p.write_text('{broken}\n{"epochMs":2}\n')
            with self.assertRaises(json.JSONDecodeError):
                lines(p)


if __name__ == "__main__":
    unittest.main()
