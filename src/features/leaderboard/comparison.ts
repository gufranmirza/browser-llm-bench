import { comparisonKey } from "../../benchmark/metrics/resources";
import type { Row } from "./data";

/** The same default comparison setup is used by static HTML and interactive views. */
export function comparisonGroups(rows: readonly Row[]) {
  const groups = new Map<string, Row[]>();
  for (const row of rows.filter((r) => r.source === "measured" && r.report)) {
    const key = comparisonKey(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups]
    .map(([key, rows]) => ({ key, rows }))
    .sort(
      (a, b) =>
        Number(!!b.rows[0].report?.profile?.plan.countSchedule) -
          Number(!!a.rows[0].report?.profile?.plan.countSchedule) ||
        b.rows.length - a.rows.length,
    );
}

/** A saved report identifies its comparison without depending on group order. */
export function selectComparison(
  groups: ReturnType<typeof comparisonGroups>,
  reportId: string,
) {
  return (
    groups.find((group) =>
      group.rows.some((row) => row.report?.id === reportId),
    ) ?? groups[0]
  );
}
