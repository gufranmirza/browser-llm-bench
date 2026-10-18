"use client";
import type { LucideIcon } from "lucide-react";
import {
  CheckCircle2,
  Cpu,
  Download,
  Globe,
  HardDrive,
  Info,
  Laptop,
  MemoryStick,
  MinusCircle,
  Monitor,
  RefreshCw,
  Zap,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { SiteLink } from "../../components/SiteLink";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../../components/ui/accordion";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import type { BrowserCapabilities } from "./detect";
import { detectBrowserCapabilities } from "./detect";

import { downloadJson } from "../../lib/download";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../../components/ui/dialog";
const gib = (n: number | null) =>
  n === null
    ? "Not exposed"
    : `${(n / 2 ** 30).toLocaleString(undefined, { maximumFractionDigits: 1 })} GiB`;
const usage = (n: number | null) =>
  n === null
    ? "Not exposed"
    : n < 2 ** 30
      ? `${(n / 2 ** 20).toLocaleString(undefined, { maximumFractionDigits: 1 })} MiB`
      : gib(n);
export function useBrowserCapabilities() {
  const [value, setValue] = useState<BrowserCapabilities | null>(null),
    [checking, setChecking] = useState(true),
    [revision, setRevision] = useState(0),
    [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setChecking(true);
    setError("");
    void detectBrowserCapabilities()
      .then((v) => {
        if (!cancelled) setValue(v);
      })
      .catch(() => {
        if (!cancelled)
          setError(
            "Some capability checks were blocked by the browser. You can still inspect model requirements below.",
          );
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [revision]);
  return { value, checking, error, refresh: () => setRevision((n) => n + 1) };
}
function CapabilityDetail({
  label,
  value,
  detail,
  children,
}: {
  label: string;
  value?: string;
  detail: string;
  children: ReactNode;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="capability-info-dialog">
        <DialogTitle>{label}</DialogTitle>
        {value && <p className="capability-info-value">{value}</p>}
        <DialogDescription>{detail}</DialogDescription>
      </DialogContent>
    </Dialog>
  );
}
function Fact({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="capability-fact">
      <Icon size={16} aria-hidden="true" />
      <span>{label}</span>
      <strong title={value}>{value}</strong>
      <CapabilityDetail label={label} value={value} detail={detail}>
        <button
          type="button"
          className="capability-info"
          aria-label={`About ${label.toLowerCase()}`}
          title={detail}
        >
          <Info size={14} />
        </button>
      </CapabilityDetail>
    </div>
  );
}
export function BrowserCapabilitiesCard({
  value,
  checking,
  error,
  refresh,
  active,
}: {
  value: BrowserCapabilities | null;
  checking: boolean;
  error: string;
  refresh: () => void;
  active: boolean;
}) {
  return (
    <Card className="browser-capabilities">
      <CardHeader>
        <div className="capability-heading">
          <div>
            <CardTitle>Browser capabilities</CardTitle>
            <CardDescription>
              Browser and device information, checked locally. No capability
              data is uploaded.
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="ghost"
            disabled={checking || active}
            onClick={refresh}
            aria-label="Refresh browser capabilities"
          >
            <RefreshCw size={15} />
            {checking ? "Checking…" : "Refresh"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && <p role="status">{error}</p>}
        {!value ? (
          <p role="status">{error || "Checking browser capabilities…"}</p>
        ) : (
          <>
            <div className="capability-facts">
              <Fact
                icon={Globe}
                label="Browser"
                value={value.browser}
                detail={value.browserSource}
              />
              <Fact
                icon={Laptop}
                label="Platform"
                value={value.platform}
                detail={value.platformSource}
              />
              <Fact
                icon={Cpu}
                label="Logical CPUs"
                value={
                  value.logicalCpus === null
                    ? "Not exposed"
                    : String(value.logicalCpus)
                }
                detail="navigator.hardwareConcurrency. Logical processors reported to this browser, not physical cores or CPUs reserved for the model."
              />
              <Fact
                icon={MemoryStick}
                label="RAM estimate"
                value={
                  value.memoryGiB === null
                    ? "Not exposed"
                    : `≈ ${value.memoryGiB} GiB`
                }
                detail="navigator.deviceMemory. Rounded and capped for privacy; not exact installed RAM, available RAM or browser memory usage."
              />
              <Fact
                icon={HardDrive}
                label="Site storage"
                value={`${usage(value.storage.usageBytes)} / ${gib(value.storage.quotaBytes)}`}
                detail="navigator.storage.estimate(): used space / quota for this origin. Approximate, shared across this site's caches and databases; not disk capacity or free RAM."
              />
              <Fact
                icon={Monitor}
                label="GPU hint"
                value={value.gpu.label}
                detail={`${value.gpu.source}. May identify a backend or shared adapter rather than an exact GPU model. No GPU cores or dedicated capacity are inferred.`}
              />
            </div>
            <div className="capability-feature-heading">
              <Zap size={16} />
              <strong>Feature support</strong>
              <span>Select a feature for details</span>
            </div>
            <div className="capability-features">
              {value.features.map((f) => (
                <CapabilityDetail
                  key={f.name}
                  label={f.name}
                  value={f.status}
                  detail={f.detail}
                >
                  <button
                    type="button"
                    className={`capability-chip ${f.status}`}
                    title={`${f.status}: ${f.detail}`}
                    aria-label={`${f.name}: ${f.status}. ${f.detail}`}
                  >
                    {f.status === "available" || f.status === "exposed" ? (
                      <CheckCircle2 size={12} />
                    ) : (
                      <MinusCircle size={12} />
                    )}
                    <span>{f.name}</span>
                    {f.status === "downloadable" && (
                      <small>download needed</small>
                    )}
                  </button>
                </CapabilityDetail>
              ))}
            </div>
            <Accordion type="single" collapsible>
              <AccordionItem value="details">
                <AccordionTrigger>All capability details</AccordionTrigger>
                <AccordionContent>
                  <div className="capability-details">
                    <dl>
                      <dt>Architecture hint</dt>
                      <dd>{value.architecture || "Not exposed"}</dd>
                      <dt>Device model</dt>
                      <dd>{value.deviceModel || "Not exposed"}</dd>
                      <dt>WebGPU adapter</dt>
                      <dd>
                        {[
                          value.gpu.vendor,
                          value.gpu.architecture,
                          value.gpu.device,
                          value.gpu.description,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Not exposed"}
                      </dd>
                      <dt>WebGL renderer hint</dt>
                      <dd>{value.gpu.webglRenderer || "Not exposed"}</dd>
                      <dt>WebGPU buffer limit</dt>
                      <dd>
                        {gib(value.gpu.maxBufferSize)} per buffer · not GPU
                        memory capacity
                      </dd>
                      <dt>WebGPU features</dt>
                      <dd>{value.gpu.features.join(", ") || "None exposed"}</dd>
                      <dt>Persistent site storage</dt>
                      <dd>
                        {value.storage.persisted === null
                          ? "Not exposed"
                          : value.storage.persisted
                            ? "Granted"
                            : "Not granted; the browser may evict stored files"}
                      </dd>
                    </dl>
                    <ul>
                      {value.features.map((f) => (
                        <li key={f.name}>
                          <strong>
                            {f.name} · {f.status}
                          </strong>
                          <span>{f.detail}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="capability-bottom">
                    <span>
                      Checked {new Date(value.checkedAt).toLocaleTimeString()}.
                      Capabilities can change with browser policy.
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        downloadJson(value, "browser-capabilities.json")
                      }
                    >
                      <Download size={14} />
                      Download JSON
                    </Button>
                  </div>
                  <p className="field-note">
                    API references:{" "}
                    <SiteLink
                      href="https://developer.mozilla.org/en-US/docs/Web/API/Navigator/deviceMemory"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Memory estimates
                    </SiteLink>{" "}
                    ·{" "}
                    <SiteLink
                      href="https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Storage estimates
                    </SiteLink>{" "}
                    ·{" "}
                    <SiteLink
                      href="https://developer.chrome.com/docs/ai/get-started"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Built-in AI availability
                    </SiteLink>
                  </p>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </>
        )}
      </CardContent>
    </Card>
  );
}
