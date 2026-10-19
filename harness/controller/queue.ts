export type SavedRun = {
  id: string;
  model: string;
  file: string;
  status: string;
};

export function completedModels(saved: SavedRun[]) {
  return new Set(
    saved.filter((run) => run.status === "complete").map((run) => run.model),
  );
}
