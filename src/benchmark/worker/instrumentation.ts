import { clockMs } from "../metrics/browser-profiler";
import type { Phase, Point, ProfileEvent, Signal } from "../schemas/profile";
export function instrumentWorker(
  startedEpochMs: number,
  enabled: boolean,
  getPhase: () => Phase,
  send: (type: string, data: unknown) => void,
  onLost: (message: string) => void,
) {
  // Public API instrumentation, scoped to this dedicated worker only. No internal runtime fields.
  const host = globalThis as any;
  let liveBytes = 0,
    devices = 0,
    gpuHook = false;
  const memories: WeakRef<WebAssembly.Memory>[] = [];
  let wasmHook = false;
  const sig = (
    id: string,
    label: string,
    source: string,
    unit: string,
    status: Signal["status"],
    reason: string,
  ) =>
    send("signal", {
      id,
      label,
      scope: "inference worker",
      source,
      unit,
      status,
      reason,
    } satisfies Signal);
  const mark = (type: ProfileEvent["type"], label: string) =>
    send("event", {
      tMs: Math.max(0, clockMs() - startedEpochMs),
      phase: getPhase(),
      type,
      label,
    });
  try {
    const proto = host.GPUAdapter?.prototype;
    if (proto?.requestDevice) {
      const original = proto.requestDevice;
      proto.requestDevice = async function (...args: unknown[]) {
        const device = await original.apply(this, args);
        devices++;
        if (enabled) {
          const create = device.createBuffer.bind(device);
          const owned = new Set<{ size: number; alive: boolean }>();
          device.createBuffer = (descriptor: any) => {
            const buffer = create(descriptor);
            const rec = { size: buffer.size, alive: true };
            owned.add(rec);
            liveBytes += rec.size;
            const destroy = buffer.destroy.bind(buffer);
            buffer.destroy = () => {
              if (rec.alive) {
                liveBytes -= rec.size;
                rec.alive = false;
                owned.delete(rec);
              }
              return destroy();
            };
            return buffer;
          };
          const destroyDevice = device.destroy.bind(device);
          device.destroy = () => {
            for (const rec of owned) {
              if (rec.alive) {
                liveBytes -= rec.size;
                rec.alive = false;
              }
            }
            owned.clear();
            return destroyDevice();
          };
        }
        device.lost.then((info: { reason: string; message: string }) => {
          const expected = ["unload", "recovery", "finished"].includes(
            getPhase(),
          );
          mark(
            expected ? "device-destroyed" : "device-lost",
            `${info.reason}: ${info.message || "Device lost/destroyed"}`,
          );
          if (!expected)
            onLost(`WebGPU device lost: ${info.reason}: ${info.message}`);
        });
        return device;
      };
      gpuHook = true;
    }
  } catch (e) {
    sig(
      "gpu-buffers",
      "Tracked live GPUBuffer sizes",
      "GPUDevice.createBuffer / GPUBuffer.destroy / GPUDevice.destroy",
      "bytes",
      "unavailable",
      String(e),
    );
  }
  sig(
    "gpu-buffers",
    "Tracked live GPUBuffer sizes",
    "GPUBuffer.size, create/destroy ledger",
    "bytes",
    !enabled ? "disabled" : gpuHook ? "available" : "unavailable",
    !enabled
      ? "Allocation accounting disabled for overhead reference."
      : gpuHook
        ? "Sum of buffer descriptor sizes not explicitly destroyed on this device. Includes runtime pool buffers; excludes textures, driver overhead and physical VRAM residency."
        : "GPUAdapter.requestDevice could not be instrumented.",
  );
  sig(
    "device-loss",
    "GPU device lifecycle",
    "Actual inference GPUDevice.lost promise",
    "event",
    gpuHook ? "available" : "unavailable",
    gpuHook
      ? "Unexpected loss is a failed run; destroy during unload is an expected lifecycle event."
      : "GPU device promise hook unavailable; runtime errors still retained.",
  );
  if (enabled) {
    try {
      const capture = (value: any) => {
        const instance = value?.instance ?? value;
        for (const x of Object.values(instance?.exports ?? {})) {
          if (
            x instanceof WebAssembly.Memory &&
            !memories.some((w) => w.deref() === x)
          )
            memories.push(new WeakRef(x));
        }
        return value;
      };
      const instantiate = WebAssembly.instantiate;
      host.WebAssembly.instantiate = async (...args: any[]) =>
        capture(await (instantiate as any)(...args));
      if (WebAssembly.instantiateStreaming) {
        const streaming = WebAssembly.instantiateStreaming;
        host.WebAssembly.instantiateStreaming = async (...args: any[]) =>
          capture(await (streaming as any)(...args));
      }
      wasmHook = true;
    } catch (e) {
      sig(
        "worker-wasm",
        "Reachable WASM linear memory",
        "WebAssembly.Memory.buffer.byteLength",
        "bytes",
        "unavailable",
        String(e),
      );
    }
  }
  sig(
    "worker-wasm",
    "Reachable WASM linear memory",
    "Exported WebAssembly.Memory.buffer.byteLength (weak references)",
    "bytes",
    !enabled ? "disabled" : wasmHook ? "pending" : "unavailable",
    "Linear address-space length, not resident RAM. A retained buffer after unload does not prove a leak; garbage collection is not forced.",
  );
  const perf = performance as Performance & {
    memory?: { usedJSHeapSize: number };
  };
  sig(
    "worker-heap",
    "Worker JS heap",
    "worker performance.memory.usedJSHeapSize",
    "bytes",
    !enabled ? "disabled" : perf.memory ? "available" : "unavailable",
    perf.memory
      ? "Browser-reported worker heap estimate; not WASM or GPU resident memory."
      : "performance.memory is not exposed in this worker.",
  );
  sig(
    "worker-lag",
    "Worker timer delay",
    "1-second setInterval scheduling drift",
    "ms",
    enabled ? "available" : "disabled",
    "Worker responsiveness; includes scheduling and synchronous work, not CPU usage.",
  );
  let prev = performance.now();
  let wasmReported = false;
  const sample = () => {
    if (!enabled) return;
    const t = performance.now();
    const sizes = memories.flatMap((w) => {
      const m = w.deref();
      return m ? [m.buffer.byteLength] : [];
    });
    if (sizes.length && !wasmReported) {
      wasmReported = true;
      sig(
        "worker-wasm",
        "Reachable WASM linear memory",
        "Exported WebAssembly.Memory.buffer.byteLength (weak references)",
        "bytes",
        "available",
        "Linear address-space length, not resident RAM; may remain reachable after unload. No forced GC.",
      );
    }
    const heap = perf.memory?.usedJSHeapSize;
    const point: Point = {
      tMs: Math.max(0, clockMs() - startedEpochMs),
      scope: "worker",
      phase: getPhase(),
      heapBytes: typeof heap === "number" ? heap : null,
      wasmBytes: sizes.length ? sizes.reduce((a, b) => a + b, 0) : null,
      gpuBufferBytes: gpuHook ? Math.max(0, liveBytes) : null,
      eventLoopDelayMs: Math.max(0, t - prev - 1000),
      samplerCostMs: 0,
    };
    prev = t;
    point.samplerCostMs = performance.now() - t;
    send("point", point);
  };
  sample();
  const timer = enabled ? setInterval(sample, 1000) : undefined;
  return {
    sample,
    stop() {
      sample();
      clearInterval(timer);
      if (enabled && !wasmReported)
        sig(
          "worker-wasm",
          "Reachable WASM linear memory",
          "WebAssembly exports",
          "bytes",
          "unavailable",
          "No exported WebAssembly.Memory was observed.",
        );
    },
    get deviceCount() {
      return devices;
    },
  };
}
