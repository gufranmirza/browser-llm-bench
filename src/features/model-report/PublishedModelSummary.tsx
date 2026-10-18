import { summarizeResources } from "../../benchmark/metrics/resources";
import { ProviderLogo } from "../../components/ProviderLogo";
import { SiteLink } from "../../components/SiteLink";
import { readPublishedReports } from "../../lib/published-reports.server";
import {
  artifacts,
  catalog,
  primaryReportFor,
  reportRow,
  precision,
} from "../leaderboard/data";
import { assetUrl } from "../../lib/urls";
import "./model-report.css";

export async function PublishedModelSummary({ slug }: { slug: string }) {
  const model = catalog.find((m) => m.slug === slug)!;
  const variants = artifacts.filter((a) => a.model.slug === slug);
  const published = await readPublishedReports();
  const measured = variants.flatMap((a) => {
    const report = primaryReportFor(published, a.model_id);
    return report ? [reportRow(report)] : [];
  });
  const number = (n: number | null, digits = 1) =>
    n === null ? "Not measured" : n.toFixed(digits);
  return (
    <article className="model-v2" data-published-snapshot="model">
      <div className="v2-topline">
        <SiteLink href="/">Back to leaderboard</SiteLink>
      </div>
      <h1 className="model-branded-title">
        <ProviderLogo family={model.family} model={model.name} />
        {model.name}
      </h1>
      <p>
        {model.family} · {model.parameters}B parameters · browser LLM
        configuration and published measurements.
      </p>
      <section>
        <h2>Runtime and model configuration</h2>
        <p>
          Configured weight formats:{" "}
          {variants.map((a) => precision[a.encoding] ?? a.encoding).join("; ")}.
          Inference uses WebLLM and WebGPU in a dedicated browser worker.
        </p>
        <p>
          <SiteLink href={model.card}>Publisher model card</SiteLink> ·{" "}
          <SiteLink
            href={`/run/?artifact=${encodeURIComponent(variants[0].model_id)}`}
          >
            Run benchmark
          </SiteLink>
        </p>
      </section>
      <section>
        <h2>Published benchmark results</h2>
        {measured.length ? (
          measured.map((row) => (
            <div className="panel" key={row.id}>
              <h3>
                {row.artifact.encoding} · {row.runtime}
              </h3>
              <dl className="v2-facts">
                <div>
                  <dt>Median generation speed</dt>
                  <dd>{number(row.decode)} tok/s</dd>
                </div>
                <div>
                  <dt>Median first-output latency</dt>
                  <dd>{number(row.firstOutputMs)} ms</dd>
                </div>
                <div>
                  <dt>Median response time</dt>
                  <dd>
                    {number(
                      row.responseMs === null ? null : row.responseMs / 1000,
                      2,
                    )}{" "}
                    s
                  </dd>
                </div>
                <div>
                  <dt>Sampled peak Chrome footprint</dt>
                  <dd>
                    {number(summarizeResources(row.report).peakMemory, 2)} GB
                  </dd>
                </div>
                <div>
                  <dt>Completed measured requests</dt>
                  <dd>{row.completed}</dd>
                </div>
                <div>
                  <dt>Browser and device</dt>
                  <dd>
                    {row.browser} · {row.device}
                  </dd>
                </div>
              </dl>
              <p>
                <a href={assetUrl(`reports/${row.report!.id}.json`)}>
                  Download JSON report
                </a>
              </p>
            </div>
          ))
        ) : (
          <p>
            No benchmark report is published for this model yet. The listed
            packages are available to test; their performance has not been
            measured here.
          </p>
        )}
        <p>
          Warmup is excluded from performance medians. Tokenizers and output
          lengths differ across models. These measurements do not evaluate task
          quality.{" "}
          <SiteLink href="/methodology/">Measurement definitions</SiteLink>
        </p>
      </section>
    </article>
  );
}
