"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { Info, X } from "lucide-react";
import dynamic from "next/dynamic";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Report } from "../../benchmark/schemas/report";
import { loadRepositoryReports } from "../../lib/published-reports";
import {
  legacyReports,
  loadSavedReports,
  saveReports,
} from "../../lib/report-storage";
import { appUrl } from "../../lib/urls";
const ReportDetail = dynamic(
  () =>
    import("../../features/model-report/ReportDetail").then(
      (m) => m.ReportDetail,
    ),
  { ssr: false },
);
type State = {
  published: Report[];
  local: Report[];
  publishedReady: boolean;
  localReady: boolean;
  saveLocal: (reports: Report[]) => Promise<void>;
  addLocal: (report: Report) => void;
  inspect: (report: Report) => void;
  notify: (message: string) => void;
};
const Context = createContext<State | null>(null);
export function useReports() {
  const state = useContext(Context);
  if (!state) throw Error("Report provider is missing");
  return state;
}
export function AppProvider({ children }: { children: ReactNode }) {
  const [published, setPublished] = useState<Report[]>([]),
    [local, setLocal] = useState<Report[]>([]),
    [publishedReady, setPublishedReady] = useState(false),
    [localReady, setLocalReady] = useState(false),
    [notice, notify] = useState(""),
    [selected, inspect] = useState<Report | null>(null);
  useEffect(() => {
    let disposed = false;
    void loadRepositoryReports()
      .then((rows) => {
        if (!disposed) setPublished(rows);
      })
      .catch((e) => {
        if (!disposed) notify(String(e));
      })
      .finally(() => {
        if (!disposed) setPublishedReady(true);
      });
    const legacy = legacyReports();
    void loadSavedReports(legacy)
      .catch((e) => {
        if (!disposed) notify(String(e));
        return legacy;
      })
      .then((rows) => {
        if (!disposed) {
          setLocal(rows);
          setLocalReady(true);
        }
      });
    // Preserve links exported by the earlier hash-routed app.
    if (window.location.hash.startsWith("#/"))
      window.location.replace(
        appUrl(window.location.hash.replace(/^#\/models-v2\//, "/models/")),
      );
    return () => {
      disposed = true;
    };
  }, []);
  async function saveLocal(rows: Report[]) {
    setLocal(rows);
    await saveReports(rows);
  }
  function addLocal(report: Report) {
    setLocal((previous) => {
      const next = [
        report,
        ...previous.filter((r) => r.id !== report.id),
      ].slice(0, 100);
      void saveReports(next).catch(() =>
        notify(
          "This result is available in this tab, but browser storage failed. Download it to keep a copy.",
        ),
      );
      return next;
    });
  }
  return (
    <Context.Provider
      value={{
        published,
        local,
        publishedReady,
        localReady,
        saveLocal,
        addLocal,
        inspect,
        notify,
      }}
    >
      {children}
      {notice && (
        <div className="toast" role="status">
          <Info size={17} />
          <span>{notice}</span>
          <button aria-label="Dismiss notification" onClick={() => notify("")}>
            <X size={16} />
          </button>
        </div>
      )}
      <Dialog.Root
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) inspect(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog">
            <Dialog.Close className="dialog-close" aria-label="Close report">
              <X size={20} />
            </Dialog.Close>
            <div className="section-kicker">CAPTURED REPORT</div>
            <Dialog.Title>{selected?.model}</Dialog.Title>
            <Dialog.Description>
              Recorded settings, prompts, responses and timing boundaries.
            </Dialog.Description>
            {selected && <ReportDetail report={selected} />}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </Context.Provider>
  );
}
