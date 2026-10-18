"use client";
import { ArrowLeft, ArrowRight, MessageSquare } from "lucide-react";
import { useRef, useState } from "react";
import type { Sample } from "../../benchmark/schemas/report";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { numberLabel, secondsLabel } from "../leaderboard/data";
export function RequestExplorer({ samples }: { samples: Sample[] }) {
  const [filter, setFilter] = useState("measured");
  const [selected, setSelected] = useState<number | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const measured = samples.filter((s) => !s.warmup),
    warmups = samples.filter((s) => s.warmup);
  const visible = samples
    .map((s, index) => ({ s, index }))
    .filter(
      ({ s }) =>
        filter === "all" || (filter === "warmup" ? s.warmup : !s.warmup),
    );
  const sample = selected === null ? undefined : samples[selected];
  const title = (s: Sample, index: number) =>
    s.warmup
      ? "Warmup"
      : `Request ${s.requestIndex ?? samples.slice(0, index + 1).filter((x) => !x.warmup).length}`;
  const position = visible.findIndex((x) => x.index === selected);
  return (
    <Dialog
      open={selected !== null}
      onOpenChange={(open) => {
        if (!open) setSelected(null);
      }}
    >
      <Card className="v2-request-explorer">
        <CardHeader>
          <div className="v2-card-eyebrow">
            <span>Request samples</span>
            <span>
              {measured.length} measured · {warmups.length} warmup
            </span>
          </div>
          <CardTitle>
            <h3>Prompts and responses</h3>
          </CardTitle>
          <CardDescription>
            Select a request to read its prompt and response.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={filter} onValueChange={setFilter}>
            <TabsList aria-label="Request filter">
              <TabsTrigger value="measured">
                Measured ({measured.length})
              </TabsTrigger>
              <TabsTrigger value="warmup">
                Warmup ({warmups.length})
              </TabsTrigger>
              <TabsTrigger value="all">All ({samples.length})</TabsTrigger>
            </TabsList>
          </Tabs>
          <div
            className="v2-request-scroll"
            tabIndex={0}
            role="region"
            aria-label="Scrollable request table"
          >
            <Table>
              <TableHeader>
                <TableRow>
                  {[
                    "Request",
                    "Input tokens",
                    "Output tokens",
                    "First output",
                    "Decode tok/s",
                    "Response",
                    "Result",
                  ].map((h) => (
                    <TableHead key={h}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map(({ s, index }) => (
                  <TableRow
                    key={index}
                    onClick={(e) => {
                      trigger.current = e.currentTarget.querySelector("button");
                      setSelected(index);
                    }}
                    data-state={selected === index ? "selected" : undefined}
                  >
                    <TableCell>
                      <button
                        aria-label={`Inspect ${title(s, index).toLowerCase()}`}
                        className="v2-request-link"
                        onClick={(e) => {
                          trigger.current = e.currentTarget;
                          setSelected(index);
                        }}
                      >
                        <MessageSquare size={14} />
                        {title(s, index)}
                        <ArrowRight size={13} />
                      </button>
                    </TableCell>
                    <TableCell>{numberLabel(s.inputTokens, "", 0)}</TableCell>
                    <TableCell>{numberLabel(s.outputTokens, "", 0)}</TableCell>
                    <TableCell>{numberLabel(s.firstOutputMs, "ms")}</TableCell>
                    <TableCell>
                      {numberLabel(s.decodeTokensPerSecond, "", 1)}
                    </TableCell>
                    <TableCell>{secondsLabel(s.responseMs)}</TableCell>
                    <TableCell>
                      <span
                        className={`v2-tag ${s.valid ? "v2-good" : "v2-warning"}`}
                      >
                        {s.valid ? "Valid" : "Invalid"}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!visible.length && (
              <p className="v2-empty">No requests in this category.</p>
            )}
          </div>
          <p className="v2-chart-note">
            Runtime token counts. Warmup is excluded from performance summaries.
            “Valid” means basic output checks passed, not task accuracy.
          </p>
        </CardContent>
      </Card>
      <DialogContent
        className="v2-prompt-dialog"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          trigger.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{sample && title(sample, selected!)}</DialogTitle>
          <DialogDescription>
            {sample?.warmup
              ? "Warmup · excluded from measured summaries"
              : "Exact saved prompt and generated output"}
          </DialogDescription>
        </DialogHeader>
        {sample && (
          <>
            <div className="v2-dialog-metrics">
              <span>{numberLabel(sample.inputTokens, "input tokens", 0)}</span>
              <ArrowRight size={13} />
              <span>
                {numberLabel(sample.outputTokens, "output tokens", 0)}
              </span>
              <span>
                {sample.finishReason === "length"
                  ? "Output limit reached"
                  : `Finish: ${sample.finishReason}`}
              </span>
            </div>
            <div className="v2-prompt-content">
              <h3>Prompt</h3>
              <pre>{sample.prompt || "No prompt recorded."}</pre>
              <h3>Output</h3>
              <pre>{sample.output || "No output recorded."}</pre>
            </div>
            <div className="v2-dialog-footer">
              <Button
                variant="outline"
                disabled={position <= 0}
                onClick={() => setSelected(visible[position - 1].index)}
              >
                <ArrowLeft size={14} />
                Previous
              </Button>
              <span>
                {position + 1} of {visible.length}
              </span>
              <Button
                variant="outline"
                disabled={position < 0 || position >= visible.length - 1}
                onClick={() => setSelected(visible[position + 1].index)}
              >
                Next
                <ArrowRight size={14} />
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
