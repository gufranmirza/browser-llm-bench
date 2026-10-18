import { parseReports } from "../benchmark/schemas/report";

import type { Report } from "../benchmark/schemas/report";

const LEGACY_KEY = "fieldwork-reports";
export class ReportStorageError extends Error {}
export interface ReportBackend {
  read(): Promise<unknown>;
  write(reports: Report[]): Promise<void>;
}

export function legacyReports(
  storage: Pick<Storage, "getItem"> = globalThis.localStorage,
): Report[] {
  try {
    const value = JSON.parse(storage.getItem(LEGACY_KEY) || "[]");
    return Array.isArray(value) && !value.length ? [] : parseReports(value);
  } catch {
    return [];
  }
}

let database: Promise<IDBDatabase> | undefined;
function openDatabase() {
  if (!database)
    database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("browser-inference-bench", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("saved-reports");
      request.onerror = () => {
        database = undefined;
        reject(request.error);
      };
      request.onblocked = () => {
        database = undefined;
        reject(new Error("Another tab is blocking report storage."));
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          database = undefined;
        };
        resolve(db);
      };
    });
  return database;
}
const browserBackend: ReportBackend = {
  async read() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("saved-reports", "readonly");
      const request = transaction.objectStore("saved-reports").get("reports");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  async write(reports) {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("saved-reports", "readwrite");
      transaction.objectStore("saved-reports").put(reports, "reports");
      // A request succeeding is not a committed transaction. Report success
      // only after the durable browser-store transaction completes.
      transaction.oncomplete = () => resolve();
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Report save was aborted."));
      transaction.onerror = () => reject(transaction.error);
    });
  },
};

export async function loadSavedReports(
  legacy: Report[],
  backend = browserBackend,
): Promise<Report[]> {
  try {
    const saved = await backend.read();
    if (saved !== undefined)
      return Array.isArray(saved) && !saved.length ? [] : parseReports(saved);
    if (legacy.length) await backend.write(legacy);
    // Keep the original localStorage value as a migration backup.
    return legacy;
  } catch (e) {
    throw new ReportStorageError(
      "Could not load saved reports. The original browser-storage backup is unchanged. " +
        (e instanceof Error ? e.message : ""),
    );
  }
}

export async function saveReports(
  reports: Report[],
  backend = browserBackend,
): Promise<void> {
  try {
    await backend.write(reports);
  } catch (e) {
    throw new ReportStorageError(
      "Could not save this report in browser storage. Export its JSON to keep it. " +
        (e instanceof Error ? e.message : ""),
    );
  }
}
