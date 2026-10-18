"""Small collector correctness checks. Fixtures below are tests, not benchmark data."""

import pathlib, unittest, os, time
import copy, sys
import tempfile
from unittest.mock import patch
from harness.collectors.macos import gpu_time
from harness.collectors.macos import (
    native_collector as collector,
    power_capture as power,
    prepare_native_capture as prepare,
)
from harness.processing import merge_native_report as merge


class Checks(unittest.TestCase):
    def test_power_capture_accepts_one_hour_but_rejects_unbounded_duration(self):
        import argparse

        self.assertEqual(power.MAX_CAPTURE_SECONDS, 3600)
        self.assertEqual(power.capture_seconds("3600"), 3600)
        self.assertEqual(power.capture_seconds("900"), 900)
        for value in ["0", "3601", "forever"]:
            with self.assertRaises(argparse.ArgumentTypeError):
                power.capture_seconds(value)

    def test_launcher_allocates_fresh_directories_and_retains_the_old_stop(self):
        with tempfile.TemporaryDirectory() as d:
            import json

            path = pathlib.Path(d)
            session = path / "current-session.json"
            profile = str((path / "profile").resolve())
            session.write_text(json.dumps({"rootPid": 10, "profilePath": profile}))
            with (
                patch.object(
                    prepare,
                    "process_args",
                    return_value="chrome --user-data-dir=" + profile,
                ),
                patch.object(
                    prepare, "usage", return_value={"startId": "verified-start"}
                ),
            ):
                first = prepare.prepare(session)
                (first / "STOP").touch()
                second = prepare.prepare(session)
            self.assertNotEqual(first, second)
            self.assertTrue((first / "STOP").exists())
            self.assertFalse((second / "STOP").exists())
            self.assertEqual(
                json.loads((path / "current-capture.json").read_text())["capturePath"],
                str(second),
            )
            self.assertEqual(
                json.loads((second / "session.json").read_text())["rootStartId"],
                "verified-start",
            )

    def test_compact_export_keeps_all_measurements_and_hashes_original_raw_files(self):
        with tempfile.TemporaryDirectory() as d:
            capture = pathlib.Path(d)
            (capture / "native-samples.jsonl").write_text("raw evidence\n")
            r = {
                "nativeTrace": {
                    "points": [{"tMs": 10}],
                    "power": [{"tMs": 20}],
                    "gpu": [{"tMs": 30}],
                    "rawSamples": [{"raw": "process"}],
                    "rawPower": [{"raw": "power"}],
                    "provenance": {"rawGpuSnapshots": [{"raw": "gpu"}]},
                }
            }
            original = copy.deepcopy(r)
            compact = merge.compact_report(r, capture)
            self.assertEqual(r, original)
            for key in ["points", "power", "gpu"]:
                self.assertEqual(compact["nativeTrace"][key], r["nativeTrace"][key])
            self.assertEqual(compact["nativeTrace"]["rawSamples"], [])
            self.assertEqual(
                compact["nativeTrace"]["provenance"]["browserStorageCopy"][
                    "omittedRawPowerFrames"
                ],
                1,
            )
            self.assertEqual(
                compact["nativeTrace"]["provenance"]["rawEvidenceFiles"][
                    "native-samples.jsonl"
                ]["bytes"],
                13,
            )

    def test_power_capture_refuses_stale_stop_without_overwriting_data(self):
        with tempfile.TemporaryDirectory() as d:
            out = pathlib.Path(d)
            (out / "STOP").touch()
            (out / "power-raw.log").write_text("previous evidence")
            with self.assertRaisesRegex(ValueError, "fresh capture"):
                power.prepare_output(out)
            self.assertEqual((out / "power-raw.log").read_text(), "previous evidence")

    def test_power_pipe_handles_buffered_lines_and_partial_eof(self):
        r, w = os.pipe()
        with os.fdopen(r, "rb") as stream:
            os.write(w, b"first\nsecond\nlast")
            os.close(w)
            self.assertEqual(
                list(power.pipe_lines(stream, lambda: False, time.monotonic() + 1)),
                ["first\n", "second\n", "last"],
            )

    def test_power_stop_does_not_need_input_or_send_a_signal_during_setup(self):
        r, w = os.pipe()
        started = time.monotonic()
        try:
            with os.fdopen(r, "rb") as stream:
                self.assertEqual(
                    list(
                        power.pipe_lines(
                            stream,
                            lambda: time.monotonic() - started > 0.05,
                            started + 2,
                        )
                    ),
                    [],
                )
                self.assertLess(time.monotonic() - started, 0.5)
        finally:
            os.close(w)

    def gpu_snapshot(self, counter, epoch=1000):
        return {
            "epochMs": epoch,
            "monotonicNs": str(epoch * 1000000),
            "collectionCostMs": 2,
            "processStartIds": {"11": "start"},
            "clients": [
                {
                    "registryId": "client",
                    "pid": 11,
                    "usage": [
                        {
                            "API": "Metal",
                            "accumulatedGPUTime": counter,
                            "lastSubmittedTime": counter,
                        }
                    ],
                }
            ],
        }

    def test_gpu_time_is_scoped_before_aggregation(self):
        entries = [
            {
                "IORegistryEntryID": 1,
                "IOUserClientCreator": "pid 11, Chrome",
                "AppUsage": [],
            },
            {
                "IORegistryEntryID": 2,
                "IOUserClientCreator": "pid 99, Other Chrome",
                "AppUsage": [],
            },
        ]
        self.assertEqual(
            [c["pid"] for c in gpu_time.scoped_clients(entries, {"11": "start"})], [11]
        )

    def test_gpu_time_distinguishes_measured_zero_from_missing(self):
        a = self.gpu_snapshot(100)
        b = self.gpu_snapshot(100, 2000)
        self.assertEqual(gpu_time.interval(a, b)["gpuTimeMs"], 0)
        b["clients"][0]["usage"] = None
        self.assertIsNone(gpu_time.interval(a, b)["gpuTimeMs"])
        self.assertIsNone(gpu_time.interval(None, a)["gpuTimeMs"])

    def test_gpu_time_uses_monotonic_ns_and_does_not_clamp_parallel_work(self):
        a = self.gpu_snapshot(0)
        b = self.gpu_snapshot(2000000000, 2000)
        self.assertEqual(gpu_time.interval(a, b)["gpuTimeMs"], 2000)
        self.assertEqual(gpu_time.interval(a, b)["intervalMs"], 1000)

    def test_gpu_time_rejects_pid_reuse_clients_and_queue_changes(self):
        a = self.gpu_snapshot(100)
        b = self.gpu_snapshot(200, 2000)
        variants = []
        c = copy.deepcopy(b)
        c["processStartIds"]["11"] = "reused"
        variants.append(c)
        c = copy.deepcopy(b)
        c["clients"][0]["registryId"] = "new-client"
        variants.append(c)
        c = copy.deepcopy(b)
        c["clients"][0]["usage"].append(copy.deepcopy(c["clients"][0]["usage"][0]))
        variants.append(c)
        c = copy.deepcopy(b)
        c["error"] = "ioreg failed"
        variants.append(c)
        for c in variants:
            self.assertIsNone(gpu_time.interval(a, c)["gpuTimeMs"])

    def test_gpu_time_does_not_hide_one_queue_regression_in_positive_total(self):
        a = self.gpu_snapshot(100)
        b = self.gpu_snapshot(90, 2000)
        a["clients"][0]["usage"].append(
            {"API": "Metal", "accumulatedGPUTime": 0, "lastSubmittedTime": 0}
        )
        b["clients"][0]["usage"].append(
            {"API": "Metal", "accumulatedGPUTime": 1000, "lastSubmittedTime": 1000}
        )
        self.assertIsNone(gpu_time.interval(a, b)["gpuTimeMs"])

    def test_gpu_time_rejects_clock_jump_and_missed_poll(self):
        a = self.gpu_snapshot(100)
        b = self.gpu_snapshot(200, 2000)
        b["epochMs"] += 100
        self.assertIsNone(gpu_time.interval(a, b)["gpuTimeMs"])
        self.assertIsNone(
            gpu_time.interval(a, self.gpu_snapshot(200, 7000))["gpuTimeMs"]
        )

    @unittest.skipUnless(sys.platform == "darwin", "macOS libproc required")
    def test_cpu_mach_tick_conversion(self):
        before = collector.usage(os.getpid())
        start = time.process_time_ns()
        wall = time.monotonic()
        while time.monotonic() - wall < 0.08:
            pass
        after = collector.usage(os.getpid())
        elapsed = time.process_time_ns() - start
        delta = (
            after["userCpuNs"]
            + after["systemCpuNs"]
            - before["userCpuNs"]
            - before["systemCpuNs"]
        )
        self.assertLess(abs(delta - elapsed) / elapsed, 0.05)

    def test_tree_scope_and_retained_child(self):
        t = {
            10: {"ppid": 1},
            11: {"ppid": 10},
            12: {"ppid": 11},
            20: {"ppid": 1},
            21: {"ppid": 20},
            13: {"ppid": 1},
        }
        self.assertEqual(collector.descendant_pids(t, 10, {13: "id"}), {10, 11, 12, 13})

    def test_power_units_and_missing_are_explicit(self):
        p = power.parse_frame(
            [
                "*** Sampled system activity (1000.00ms elapsed) ***\n",
                "CPU Power: 1250 mW\n",
                "GPU Power: 2 W\n",
                "ANE Power: 0 mW\n",
            ],
            10000,
        )
        self.assertEqual(p["cpuWatts"], 1.25)
        self.assertEqual(p["gpuWatts"], 2)
        self.assertEqual(p["combinedWatts"], 3.25)
        self.assertIsNone(power.parse_frame(["unrecognized format\n"], 10000))

    def test_energy_uses_interval_overlap_not_full_sample(self):
        e, covered = merge.integrate(
            [
                {"tMs": 1000, "intervalMs": 1000, "combinedWatts": 2},
                {"tMs": 2000, "intervalMs": 1000, "combinedWatts": None},
            ],
            500,
            2000,
        )
        self.assertEqual(e, 1)
        self.assertEqual(covered, 500)

    def test_host_signals_are_readable(self):
        v, e = collector.host_signals()
        self.assertFalse(e)
        self.assertIn("hostGpuUtilizationPercent", v)
        self.assertIn("hostThermalState", v)

    def test_energy_does_not_double_count_delivery_jitter(self):
        e, covered = merge.integrate(
            [
                {"tMs": 1000, "intervalMs": 1000, "combinedWatts": 2},
                {"tMs": 1990, "intervalMs": 1000, "combinedWatts": 2},
            ],
            0,
            2000,
        )
        self.assertAlmostEqual(e, 3.98)
        self.assertEqual(covered, 1990)


if __name__ == "__main__":
    unittest.main()
