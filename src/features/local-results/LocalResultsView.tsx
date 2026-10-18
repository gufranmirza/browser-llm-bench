"use client";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { parseReports } from "../../benchmark/schemas/report";
import { useReports } from "../../components/layout/AppProvider";
import { Button } from "../../components/ui/button";
import { downloadJson } from "../../lib/download";
import { appUrl } from "../../lib/urls";
import { LocalReports } from "./LocalReports";
export function LocalResultsView() {
  const { local, localReady, saveLocal, notify, inspect } = useReports();
  const file = useRef<HTMLInputElement>(null);
  const router = useRouter();
  async function importFile(f?: File) {
    if (!f) return;
    try {
      if (f.size > 5000000) throw Error("File exceeds the 5 MB limit.");
      const rows = parseReports(JSON.parse(await f.text()));
      await saveLocal(
        [
          ...rows,
          ...local.filter((r) => !rows.some((x) => x.id === r.id)),
        ].slice(0, 100),
      );
      notify(`Imported ${rows.length} private report(s).`);
    } catch (e) {
      notify(`Import rejected: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      if (file.current) file.current.value = "";
    }
  }
  return (
    <>
      <input
        ref={file}
        hidden
        type="file"
        accept="application/json,.json"
        onChange={(e) => void importFile(e.target.files?.[0])}
      />
      <div className="section-kicker">YOUR LOCAL EVIDENCE</div>
      <div className="page-heading">
        <div>
          <h1>Your measurement log.</h1>
          <p>
            Private results saved in this browser. They never change the public
            leaderboard.
          </p>
        </div>
        <div className="toolbar-actions">
          <Button variant="outline" onClick={() => file.current?.click()}>
            Import JSON
          </Button>
          <Button
            variant="outline"
            disabled={!local.length}
            onClick={() =>
              downloadJson(local, "browser-inference-bench-reports.json")
            }
          >
            Export all
          </Button>
        </div>
      </div>
      {!localReady ? (
        <p role="status">Loading local measurements…</p>
      ) : (
        <LocalReports
          reports={local}
          onSelect={inspect}
          onRun={() => router.push(appUrl("/run/"))}
        />
      )}
    </>
  );
}
