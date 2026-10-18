#!/usr/bin/env python3
"""Read-only macOS telemetry for one explicitly identified Chrome process tree.
No browser automation, process termination, privilege changes or synthetic samples.
"""

import sys
import argparse, ctypes, hashlib, json, os, pathlib, plistlib, re, signal, subprocess, time
from harness.collectors.macos import gpu_time

# Native ABI setup is only needed on macOS. Pure parsing tests can run elsewhere.
if sys.platform == "darwin":
    sdk = pathlib.Path(
        subprocess.check_output(
            ["/usr/bin/xcrun", "--show-sdk-path"], text=True
        ).strip()
    )
    body = re.search(
        r"struct rusage_info_v6 \{(.*?)\};",
        (sdk / "usr/include/sys/resource.h").read_text(),
        re.S,
    ).group(1)
    fields = []
    for typ, name, count in re.findall(
        r"(uint8_t|uint64_t)\s+(\w+)(?:\[(\d+)\])?;", body
    ):
        t = ctypes.c_uint8 if typ == "uint8_t" else ctypes.c_uint64
        fields.append((name, t * int(count) if count else t))

    class Usage(ctypes.Structure):
        _fields_ = fields

    lib = ctypes.CDLL("/usr/lib/libproc.dylib", use_errno=True)
    lib.proc_pid_rusage.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_void_p]
    lib.proc_pid_rusage.restype = ctypes.c_int
else:
    lib = None


def command(argv, timeout=3):
    p = subprocess.run(argv, capture_output=True, timeout=timeout)
    if p.returncode:
        raise RuntimeError(
            p.stderr.decode(errors="replace").strip()
            or f"{argv[0]} exited {p.returncode}"
        )
    return p.stdout


class Timebase(ctypes.Structure):
    _fields_ = [("numer", ctypes.c_uint32), ("denom", ctypes.c_uint32)]


timebase = Timebase(1, 1)
if sys.platform == "darwin":
    ctypes.CDLL("/usr/lib/libSystem.B.dylib").mach_timebase_info(ctypes.byref(timebase))


def ticks_to_ns(ticks):
    return round(ticks * timebase.numer / timebase.denom)


def usage(pid):
    if lib is None:
        raise RuntimeError("Native process collection requires macOS")
    r = Usage()
    if lib.proc_pid_rusage(pid, 6, ctypes.byref(r)) != 0:
        raise OSError(ctypes.get_errno(), os.strerror(ctypes.get_errno()))
    return {
        "startId": str(r.ri_proc_start_abstime),
        "userCpuTicks": r.ri_user_time,
        "systemCpuTicks": r.ri_system_time,
        "userCpuNs": ticks_to_ns(r.ri_user_time),
        "systemCpuNs": ticks_to_ns(r.ri_system_time),
        "footprintBytes": r.ri_phys_footprint,
        "rssBytes": r.ri_resident_size,
        "wiredBytes": r.ri_wired_size,
        "diskReadBytes": r.ri_diskio_bytesread,
        "diskWrittenBytes": r.ri_diskio_byteswritten,
        "kernelEnergyNanojoules": r.ri_energy_nj,
    }


def process_table():
    result = {}
    for line in command(["/bin/ps", "-axo", "pid=,ppid=,comm="]).decode().splitlines():
        bits = line.strip().split(None, 2)
        if len(bits) == 3:
            result[int(bits[0])] = {
                "pid": int(bits[0]),
                "ppid": int(bits[1]),
                "executable": bits[2],
            }
    return result


def descendant_pids(table, root, retained):
    chosen = {root} | {p for p in retained if p in table}
    while True:
        nxt = chosen | {p for p, r in table.items() if r["ppid"] in chosen}
        if nxt == chosen:
            return chosen & table.keys()
        chosen = nxt


def process_args(pid):
    return (
        command(["/bin/ps", "-ww", "-p", str(pid), "-o", "command="]).decode().strip()
    )


def process_role(args):
    match = re.search(r"--type=(\S+)", args)
    if match:
        return match.group(1)
    return "browser" if "/Contents/MacOS/Google Chrome" in args else "helper"


def thermal_state():
    # Foundation API returns a host thermal-pressure category, not degrees C.
    objc = ctypes.CDLL("/usr/lib/libobjc.A.dylib")
    ctypes.CDLL("/System/Library/Frameworks/Foundation.framework/Foundation")
    objc.objc_getClass.argtypes = [ctypes.c_char_p]
    objc.objc_getClass.restype = ctypes.c_void_p
    objc.sel_registerName.argtypes = [ctypes.c_char_p]
    objc.sel_registerName.restype = ctypes.c_void_p
    ptr = ctypes.cast(objc.objc_msgSend, ctypes.c_void_p).value
    get = ctypes.CFUNCTYPE(ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p)(ptr)
    integer = ctypes.CFUNCTYPE(ctypes.c_long, ctypes.c_void_p, ctypes.c_void_p)(ptr)
    info = get(
        objc.objc_getClass(b"NSProcessInfo"), objc.sel_registerName(b"processInfo")
    )
    return integer(info, objc.sel_registerName(b"thermalState"))


def host_signals():
    errors = []
    values = {
        key: None
        for key in [
            "gpuDevices",
            "hostGpuUtilizationPercent",
            "hostGpuAllocatedBytes",
            "hostSwapUsedBytes",
            "hostMemoryPressureLevel",
            "hostFreePagesBytes",
            "hostCompressedStorageBytes",
            "hostThermalState",
        ]
    }
    try:
        d = plistlib.loads(
            command(["/usr/sbin/ioreg", "-r", "-c", "AGXAccelerator", "-a", "-l"])
        )
        stats = [x.get("PerformanceStatistics", {}) for x in d]
        # Each accelerator is retained independently; no averaging across devices.
        values["gpuDevices"] = [
            {
                "name": x.get("IORegistryEntryName"),
                "statistics": x.get("PerformanceStatistics", {}),
            }
            for x in d
        ]
        values["hostGpuUtilizationPercent"] = (
            stats[0].get("Device Utilization %") if len(stats) == 1 else None
        )
        values["hostGpuAllocatedBytes"] = (
            stats[0].get("Alloc system memory") if len(stats) == 1 else None
        )
    except Exception as e:
        errors.append("ioreg: " + str(e))
    try:
        txt = command(
            ["/usr/sbin/sysctl", "vm.swapusage", "kern.memorystatus_vm_pressure_level"]
        ).decode()
        values["sysctlRaw"] = txt
        m = re.search(r"used = ([\d.]+)([MGT])", txt)
        values["hostSwapUsedBytes"] = (
            float(m[1]) * ({"M": 2**20, "G": 2**30, "T": 2**40}[m[2]]) if m else None
        )
        m = re.search(r"kern.memorystatus_vm_pressure_level: (\d+)", txt)
        values["hostMemoryPressureLevel"] = int(m[1]) if m else None
    except Exception as e:
        errors.append("sysctl: " + str(e))
    try:
        txt = command(["/usr/bin/vm_stat"]).decode()
        values["vmStatRaw"] = txt
        page = int(re.search(r"page size of (\d+)", txt)[1])
        counts = {k: int(v) for k, v in re.findall(r"^([^:\n]+):\s+(\d+)\.", txt, re.M)}
        values["hostFreePagesBytes"] = counts.get("Pages free", 0) * page
        values["hostCompressedStorageBytes"] = (
            counts.get("Pages occupied by compressor", 0) * page
        )
    except Exception as e:
        errors.append("vm_stat: " + str(e))
    try:
        values["hostThermalState"] = thermal_state()
    except Exception as e:
        errors.append("Foundation thermalState: " + str(e))
    return values, errors


def collect(args):
    out = pathlib.Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    root = args.pid
    profile = str(pathlib.Path(args.profile).resolve())
    root_args = process_args(root)
    if f"--user-data-dir={profile}" not in root_args:
        raise RuntimeError(
            "Refusing to collect: root PID does not use the exact dedicated profile"
        )
    root_usage = usage(root)
    cpus = int(command(["/usr/sbin/sysctl", "-n", "hw.logicalcpu"]).strip())
    started_wall = time.time() * 1000
    started_mono = time.monotonic_ns()
    meta = {
        "version": "macos-process-tree-v1",
        "rootPid": root,
        "rootStartId": root_usage["startId"],
        "profilePath": profile,
        "rootArguments": root_args,
        "startedEpochMs": started_wall,
        "sampleIntervalMs": 1000,
        "logicalCpus": cpus,
        "machTimebase": {"numer": timebase.numer, "denom": timebase.denom},
        "os": command(["/usr/bin/sw_vers"]).decode(),
        "collectorSha256": hashlib.sha256(
            pathlib.Path(__file__).read_bytes()
        ).hexdigest(),
        "sources": [
            "libproc proc_pid_rusage RUSAGE_INFO_V6",
            "ps PID/PPID ancestry",
            "ioreg AGXAccelerator PerformanceStatistics",
            "sysctl vm.swapusage / kern.memorystatus_vm_pressure_level",
            "vm_stat",
            "NSProcessInfo.thermalState",
        ],
        "scope": "Only the dedicated browser root PID and its observed descendants. Retain children across reparenting; PID + kernel start time prevents PID-reuse contamination. Dedicated workers run within renderer processes, not necessarily separate OS processes.",
        "cpuNormalization": "RUSAGE_INFO CPU counters are Mach absolute ticks, converted using mach_timebase_info. Delta own user+system CPU nanoseconds / elapsed monotonic nanoseconds * 100. 100% = one logical CPU; capacity percent divides by logical CPU count. Child CPU totals are never added again.",
        "memorySemantics": "Footprint is the sum of per-process kernel-accounted phys_footprint values, not a globally deduplicated physical-memory measurement. RSS is retained per process and summed only as a labeled non-deduplicated statistic; shared pages may be counted repeatedly. Never add browser WASM/GPU buffer sizes to either OS metric.",
        "hostScope": "GPU activity, thermal state, pressure, swap and power describe the whole host; other applications remain running. No strict resource reservation or CPU/RAM caps.",
        "gaps": "One-second process-tree snapshots can miss processes that are born and exit between polls. Newly observed and exited processes lack a complete interval; missing intervals are explicitly counted.",
        "kernelEnergySemantics": "Raw ri_energy_nj counter retained for provenance only. Not used as model watts or substituted for powermetrics subsystem power.",
    }
    (out / "collector-metadata.json").write_text(json.dumps(meta, indent=2) + "\n")
    stopped = False

    def stop(*_):
        nonlocal stopped
        stopped = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    meta["sources"].append(gpu_time.SOURCE)
    meta["gpuTimeSemantics"] = gpu_time.SEMANTICS
    meta["gpuTimeCollectorSha256"] = hashlib.sha256(
        pathlib.Path(gpu_time.__file__).read_bytes()
    ).hexdigest()
    (out / "collector-metadata.json").write_text(json.dumps(meta, indent=2) + "\n")
    previous = {}
    known = {}
    events = []
    samples = []
    retained = {}
    tick = 0
    previous_gpu = None
    with (out / "native-samples.jsonl").open("w", buffering=1) as log:
        while (
            not stopped
            and (time.monotonic_ns() - started_mono) / 1e9 < args.max_seconds
            and not (out / "STOP").exists()
        ):
            begin = time.monotonic_ns()
            wall = time.time() * 1000
            errors = []
            table = process_table()
            # Only retain reparented children if the kernel start identifier still matches.
            for pid, startid in list(retained.items()):
                try:
                    if usage(pid)["startId"] != startid:
                        retained.pop(pid)
                except OSError:
                    retained.pop(pid)
            if root in table and usage(root)["startId"] != meta["rootStartId"]:
                raise RuntimeError(
                    "Dedicated root PID was reused; refusing further collection"
                )
            ids = descendant_pids(table, root, retained)
            rows = []
            deltas = []
            intervals = []
            new_count = 0
            for pid in sorted(ids):
                try:
                    u = usage(pid)
                    key = f"{pid}:{u['startId']}"
                    if pid == root and u["startId"] != meta["rootStartId"]:
                        raise RuntimeError("Root PID was reused")
                    retained[pid] = u["startId"]
                    if key not in known:
                        a = process_args(pid)
                        known[key] = {
                            **table[pid],
                            "startId": u["startId"],
                            "arguments": a,
                            "role": process_role(a),
                            "firstSeenEpochMs": wall,
                        }
                        events.append(
                            {
                                "epochMs": wall,
                                "type": "process-observed",
                                "pid": pid,
                                "startId": u["startId"],
                                "role": known[key]["role"],
                            }
                        )
                    known[key]["lastSeenEpochMs"] = wall
                    row = {
                        **u,
                        "pid": pid,
                        "ppid": table[pid]["ppid"],
                        "role": known[key]["role"],
                        "cpuOneCorePercent": None,
                    }
                    old = previous.get(key)
                    if old:
                        ns = begin - old["mono"]
                        delta = u["userCpuNs"] + u["systemCpuNs"] - old["cpu"]
                        if ns > 0 and delta >= 0:
                            row["cpuOneCorePercent"] = delta / ns * 100
                            deltas.append(delta)
                            intervals.append(row["cpuOneCorePercent"])
                    else:
                        new_count += 1
                    previous[key] = {
                        "cpu": u["userCpuNs"] + u["systemCpuNs"],
                        "mono": begin,
                    }
                    rows.append(row)
                except Exception as e:
                    errors.append(f"PID {pid}: {e}")
            keys = {f"{r['pid']}:{r['startId']}" for r in rows}
            exited = set(previous) - keys
            for key in exited:
                if key in known and "exitObservedEpochMs" not in known[key]:
                    known[key]["exitObservedEpochMs"] = wall
                    events.append(
                        {
                            "epochMs": wall,
                            "type": "process-exit-observed",
                            "pid": known[key]["pid"],
                            "startId": known[key]["startId"],
                        }
                    )
                previous.pop(key, None)
            gpu_snapshot = gpu_time.snapshot(
                {str(r["pid"]): r["startId"] for r in rows},
                lambda pid: usage(pid)["startId"],
            )
            gpu_interval = gpu_time.interval(previous_gpu, gpu_snapshot)
            previous_gpu = gpu_snapshot
            host, host_errors = host_signals()
            errors.extend(host_errors)
            sample = {
                "epochMs": wall,
                "monotonicNs": str(begin),
                "elapsedMs": (begin - started_mono) / 1e6,
                "wallClockDriftMs": wall - started_wall - (begin - started_mono) / 1e6,
                "processCount": len(rows),
                "processes": rows,
                "cpuOneCorePercent": sum(intervals) if intervals else None,
                "cpuCapacityPercent": sum(intervals) / cpus if intervals else None,
                "cpuDeltaNs": sum(deltas) if deltas else None,
                "incompleteCpuIntervals": new_count
                + len(exited)
                + len([e for e in errors if e.startswith("PID ")]),
                "footprintBytes": sum(r["footprintBytes"] for r in rows)
                if rows
                else None,
                "rssSumBytes": sum(r["rssBytes"] for r in rows) if rows else None,
                "host": host,
                "errors": errors,
                "collectorCostMs": (time.monotonic_ns() - begin) / 1e6,
            }
            sample["gpuSnapshot"] = gpu_snapshot
            sample["gpuInterval"] = gpu_interval
            samples.append(sample)
            log.write(json.dumps(sample, separators=(",", ":")) + "\n")
            (out / "processes.json").write_text(
                json.dumps(
                    {"processes": list(known.values()), "events": events}, indent=2
                )
                + "\n"
            )
            tick += 1
            target = started_mono / 1e9 + tick
            time.sleep(max(0, min(1, target - time.monotonic())))
    meta.update(
        {
            "endedEpochMs": time.time() * 1000,
            "samples": len(samples),
            "stopReason": "stop-requested"
            if stopped or (out / "STOP").exists()
            else "safety-duration",
        }
    )
    (out / "collector-metadata.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(
        json.dumps(
            {"samples": len(samples), "processes": len(known), "output": str(out)}
        ),
        flush=True,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--pid", type=int, required=True)
    parser.add_argument("--profile", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--max-seconds", type=int, default=900)
    collect(parser.parse_args())
