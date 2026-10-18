"use client";
import { FlaskConical, Info } from "lucide-react";
import { useEffect } from "react";
import { SiteLink } from "../../components/SiteLink";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../../components/ui/accordion";

export function Methodology({ section }: { section: string | null }) {
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (section)
        document
          .querySelector(`.method-layout section[id="${CSS.escape(section)}"]`)
          ?.scrollIntoView({ block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [section]);
  const sections = [
    ["scope", "What we measure"],
    ["protocol", "Run protocol"],
    ["timing", "Performance formulas"],
    ["resources", "Resource accounting"],
    ["scoring", "Scoring · planned"],
    ["evidence", "Comparison rules"],
  ];
  return (
    <>
      <div className="section-kicker">
        METHODOLOGY / UPDATED 18 OCTOBER 2026
      </div>
      <div className="page-heading">
        <div>
          <h1>How we measure browser inference.</h1>
          <p>Performance, resource usage and scoring definitions.</p>
        </div>
        <span className="badge">
          <FlaskConical size={14} /> Measurements available · scoring planned
        </span>
      </div>
      <div className="method-layout">
        <aside aria-label="Methodology sections">
          {sections.map(([id, label], i) => (
            <SiteLink key={id} href={`/methodology/?section=${id}`}>
              {String(i + 1).padStart(2, "0")} &nbsp; {label}
            </SiteLink>
          ))}
        </aside>
        <article>
          <section id="scope">
            <span className="section-number">01 /</span>
            <h2>Measured on an exact configuration.</h2>
            <p>
              Inference runs locally in a dedicated Web Worker using WebLLM and
              WebGPU. Model files come from external hosts; prompts and outputs
              are not sent to a model API. Each report identifies the artifact,
              quantization, runtime, browser, environment, workload and cache
              observations.
            </p>
            <div className="dataset-notice local">
              <Info size={16} />
              <span>
                <strong>Today:</strong> measured performance and scoped resource
                traces. <strong>Later:</strong> task accuracy and browser
                suitability. No intelligence index, resource score or overall
                model score is currently calculated.
              </span>
            </div>
            <p>
              A fast model is not necessarily a suitable model. Browser
              deployment also depends on memory headroom, page responsiveness,
              startup cost and resources consumed while working or idle.
            </p>
          </section>
          <section id="protocol">
            <span className="section-number">02 /</span>
            <h2>One model. Three request windows.</h2>
            <div className="panel table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Stage</th>
                    <th>Current 60-request session</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Setup</td>
                    <td>
                      15-second baseline → model loading → one warmup, excluded
                      from measured requests.
                    </td>
                  </tr>
                  <tr>
                    <td>Use</td>
                    <td>
                      20 back-to-back requests → 90 seconds loaded idle → 20
                      requests → 90 seconds loaded idle → 20 requests.
                    </td>
                  </tr>
                  <tr>
                    <td>Release</td>
                    <td>
                      30 seconds loaded idle → unload → 15 seconds of
                      observation after unload.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              Only one request runs at a time. The next starts as soon as the
              previous request finishes; no deliberate delay is inserted inside
              a window. Slower models take longer to complete the same count.
              The model remains loaded between windows: these are three periods
              of use, not three independent experiments or browser states.
            </p>
            <p>
              The current batch repeats one short autumn prompt 60 times.
              Temperature 0, top-p 1, seed 42, 4,096-token context, up to 64
              output tokens per measured request and 16 for warmup. Chat resets
              before every request. Qwen3 thinking is configured off. Actual
              text, token counts and finish reasons remain in the report; early
              stopping and truncation are not normalized away.
            </p>
            <Accordion type="single" collapsible>
              <AccordionItem value="protocol-details">
                <AccordionTrigger>
                  Reproducibility, cache and safety bounds
                </AccordionTrigger>
                <AccordionContent>
                  <p>
                    Ten four-bit variants and an FP16 SmolLM2 control use pinned
                    WebLLM 0.2.82 artifacts. Model/library revisions and
                    weight-manifest hashes are recorded; downloaded weight bytes
                    are not separately content-hash verified. A seed and
                    temperature 0 do not guarantee identical execution across
                    devices.
                  </p>
                  <p>
                    Requests have a 60-second safety limit; counted sessions
                    have a 30-minute total deadline. A timeout or partial
                    session is not a completed 60-request run. Session modes
                    continue while hidden and record visibility changes. Unload
                    confirmation is explicit; it does not prove the OS
                    immediately reclaimed memory.
                  </p>
                  <p>
                    Cache checks describe observed weight-cache presence, not a
                    fully cold or fully cached browser. Older reports retain
                    their original pacing and time limits, including three
                    40-second windows. Other workloads include short/long
                    prompts, longer generation and context sweeps; compare them
                    separately.
                  </p>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </section>
          <section id="timing">
            <span className="section-number">03 /</span>
            <h2>Performance: definitions and formulas.</h2>
            <p>
              For request <code>i</code>, <code>startᵢ</code> is measured after
              chat reset, immediately before the streaming completion call;{" "}
              <code>firstᵢ</code> is the first non-empty text chunk;{" "}
              <code>endᵢ</code> is stream exhaustion. Durations below use
              seconds unless labeled otherwise.
            </p>
            <dl className="method-definitions">
              <dt>First-output latency</dt>
              <dd>
                <code>Lᵢ = firstᵢ − startᵢ</code>
                <br />
                Headline: median of valid measured Lᵢ, displayed in ms. A chunk
                may contain multiple tokens. This measures worker output
                availability, before screen presentation.
              </dd>
              <dt>End-to-end response</dt>
              <dd>
                <code>Tᵢ = endᵢ − startᵢ</code>
                <br />
                Headline: median of valid measured Tᵢ. Includes input processing
                and generation, excludes model loading and the preceding chat
                reset. Reported for the actual generated response length.
              </dd>
              <dt>Output speed</dt>
              <dd>
                <code>D = median(runtime decode_tokens_per_sᵢ)</code>
                <br />
                WebLLM supplies its internal decode throughput. It is not
                recomputed as output tokens ÷ total response time. Native
                tokenizer counts differ across models.
              </dd>
              <dt>Loading</dt>
              <dd>
                <code>load = engine ready − initialization start</code>
                <br />
                Includes required network/cache reads and runtime
                initialization. The first warmup duration is shown separately
                and includes generation, not just compilation.
              </dd>
              <dt>
                Sequential throughput
                <br />
                (derived definition)
              </dt>
              <dd>
                <code>
                  requests/s = completed requests ÷ Σ request-window seconds
                </code>
                <br />
                <code>
                  output tokens/s = Σ output tokens ÷ Σ request-window seconds
                </code>
                <br />
                Includes dispatch/reset overhead inside request windows;
                excludes loading, warmup and the 90-second idle gaps. This
                derived batch metric is distinct from runtime decode speed.
              </dd>
            </dl>
            <p>
              Missing values stay missing. Summary medians exclude warmup and
              invalid requests; failed runs and context sweeps do not enter
              aggregate performance ordering. For an even number of values, the
              median is the mean of the two middle sorted values. Sixty repeats
              of one prompt describe timing variability, not sixty distinct
              capability tests.
            </p>
          </section>
          <section id="resources">
            <span className="section-number">04 /</span>
            <h2>Resource usage: scope and calculations.</h2>
            <p>
              Every resource needs a scope, time window and coverage.
              Browser-only reports expose less than reports paired with the
              native macOS collector. A missing native signal is unavailable,
              never zero.
            </p>
            <dl className="method-definitions">
              <dt>Browser memory</dt>
              <dd>
                <code>footprint(t) = Σ accounted process footprint(t)</code>
                <br />
                <code>
                  sampled peak = max footprint(t) within the selected window
                </code>
                <br />
                Dedicated Chrome process tree, including helpers. This sum is
                not deduplicated physical RAM. Main-page JS heap, worker WASM
                memory and tracked GPU buffers are separate views of memory; do
                not add them to the footprint or call buffer allocations
                physical VRAM. MB = bytes ÷ 1,000,000. Sampling may miss brief
                peaks.
              </dd>
              <dt>CPU capacity</dt>
              <dd>
                <code>
                  CPU% = 100 × ΔCPU seconds ÷ (Δwall seconds × logical CPUs)
                </code>
                <br />
                <code>equivalent logical CPUs = CPU% × logical CPUs ÷ 100</code>
                <br />
                ΔCPU is summed CPU time across the dedicated Chrome process
                tree. Equivalent logical CPUs describe average capacity used,
                not reserved cores. Incomplete process intervals are excluded.
              </dd>
              <dt>
                Chrome GPU time
                <br />
                (experimental)
              </dt>
              <dd>
                <code>GPU ms/s = counter delta in ms ÷ interval seconds</code>
                <br />
                Attributed Chrome GPU-client time, checked against Metal System
                Trace in a diagnostic capture. It is not shader occupancy, GPU
                cores used or a percentage of physical capacity; concurrent
                accounting can exceed 1,000 ms/s. Counter discontinuities remain
                gaps. Metal validation applies to the diagnostic capture, not
                every report.
              </dd>
              <dt>Host activity & power</dt>
              <dd>
                Driver GPU activity and CPU/GPU/ANE power are whole-machine
                signals, including other applications. They are neither
                model-only GPU utilization nor device wall-plug power.
              </dd>
              <dt>Page responsiveness</dt>
              <dd>
                <code>
                  timer delay = max(0, actual interval − scheduled interval)
                </code>
                <br />
                Main-page scheduling delay indicates contention. It is not CPU
                utilization or a complete interaction-latency benchmark.
              </dd>
            </dl>
            <Accordion type="single" collapsible>
              <AccordionItem value="resource-formulas">
                <AccordionTrigger>
                  Energy, idle retention and efficiency formulas
                </AccordionTrigger>
                <AccordionContent>
                  <p>
                    <strong>Energy over a named window:</strong>{" "}
                    <code>E = Σ(Pⱼ × overlap secondsⱼ)</code>, in joules, using
                    captured interval-average watts. Overlaps are clipped and
                    not double-counted; uncovered time is not filled.{" "}
                    <code>coverage = covered seconds ÷ window seconds</code>.
                    Lower instantaneous watts do not necessarily mean less
                    energy.
                  </p>
                  <p>
                    <strong>Existing energy totals:</strong> the saved{" "}
                    <code>activeEnergyJoules</code> field integrates the span
                    from first request-window start to last request-window end,
                    including intervening idle gaps. It is session-use host
                    energy, not inference-only energy. Its baseline uses up to
                    five seconds before the run;{" "}
                    <code>Eabove = E − Pbaseline × covered seconds</code>. A
                    negative difference is possible and is not evidence of model
                    energy savings.
                  </p>
                  <p>
                    <strong>Future efficiency comparisons:</strong> integrate
                    only the union of request windows, then divide by completed
                    requests:{" "}
                    <code>CPU seconds/request = Σ CPU seconds ÷ N</code>,{" "}
                    <code>
                      GPU seconds/request = Σ GPU counter milliseconds ÷ (1,000
                      × N)
                    </code>
                    , and <code>host joules/request = Ewindows ÷ N</code>. Use
                    matching workloads, output budgets and coverage; do not
                    divide a partial capture by the full request count or mix
                    idle gaps into inference efficiency. These proposed ratios
                    are not current leaderboard scores; N here means completed
                    requests.
                  </p>
                  <p>
                    <strong>Memory retention:</strong> compare median footprint
                    in explicitly named baseline, loaded-idle and after-unload
                    windows.{" "}
                    <code>
                      retained delta = median(after unload) − median(baseline)
                    </code>
                    . Report the signed change and observation duration; a
                    sampled drop does not prove complete cleanup. These
                    comparison summaries require consistent windows before
                    ranking.
                  </p>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </section>
          <section id="scoring">
            <span className="section-number">05 /</span>
            <h2>Browser suitability: planned, not yet scored.</h2>
            <p>
              <strong>
                The current release publishes measurements, not a suitability
                percentage.
              </strong>{" "}
              Task quality, task indexes and a scored evaluation suite have not
              been implemented. Basic output validity requires non-empty text,
              positive token counts, no Unicode replacement characters and no
              interruption. It does not establish correctness.
            </p>
            <div className="panel" style={{ padding: "20px 24px" }}>
              <strong>Proposed headline formula</strong>
              <p>
                <code>
                  Suitability = 100 × Σ(correctᵢ × withinBudgetsᵢ) ÷ N
                </code>
              </p>
              <p>
                <code>correctᵢ</code> is 1 when the task passes its published
                answer checks, otherwise 0. <code>withinBudgetsᵢ</code> is 1
                only when it meets every required latency, response-time, memory
                and page-responsiveness limit. <code>N</code> is the fixed
                number of scheduled evaluation tasks, not just successful
                responses.
              </p>
            </div>
            <p>
              A versioned profile must define the device class, task suite,
              answer checks, observation windows and limits before evaluation.
              Its budget gate may require <code>Lᵢ ≤ Bfirst</code>,{" "}
              <code>Tᵢ ≤ Bresponse</code>, <code>Mpeak,ᵢ ≤ Bmemory</code> and{" "}
              <code>Uᵢ ≤ Bdelay</code>. Here, Mpeak,ᵢ is sampled peak browser
              footprint and Uᵢ is main-page timer delay over the task’s defined
              window. Each B is the corresponding limit in matching units.
              Thresholds remain unset until a profile is defined.
            </p>
            <p>
              Model failures and timeouts count as unsuccessful scheduled tasks.
              Interrupted evaluations or missing required telemetry make the
              score incomplete, not a pass or a zero measurement. Task quality
              can also be reported separately as{" "}
              <code>Accuracy = 100 × Σ correctᵢ ÷ N</code>. Neither formula can
              be calculated from the existing repeated-prompt sessions.
            </p>
            <p>
              Performance, memory and efficiency will remain visible alongside
              any future score. Experimental GPU counters and whole-host power
              are not model-only resource budgets. Cold and cached startup
              requirements need separate, controlled tests.
            </p>
          </section>
          <section id="evidence">
            <span className="section-number">06 /</span>
            <h2>Rules for fair comparison.</h2>
            <p>
              Compare matching protocols, hardware, browser/runtime versions,
              context, cache, precision, thinking mode and visibility
              conditions. The leaderboard shows one saved result per artifact;
              rows may come from different environments. Token rates use each
              model’s tokenizer, and actual output lengths differ. One session
              cannot establish a population failure rate or variability across
              independent runs.
            </p>
            <p>
              Published JSON reports load automatically from the repository.
              Imported reports remain user-supplied evidence. Charts use
              recorded run boundaries and aligned clocks; counter intervals
              crossing a boundary are excluded, while energy integration uses
              clipped overlap. Missing coverage, clock uncertainty and other
              host activity remain limitations.
            </p>
          </section>
        </article>
      </div>
    </>
  );
}
