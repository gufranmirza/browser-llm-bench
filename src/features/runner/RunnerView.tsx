"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { MODEL } from "../../benchmark/schemas/report";
import { useReports } from "../../components/layout/AppProvider";
import Runner from "./Runner";
function RunnerBody({ artifact = MODEL }: { artifact?: string }) {
  const { addLocal } = useReports();
  return <Runner onReport={addLocal} initialModel={artifact} />;
}
function QueryRunner() {
  return <RunnerBody artifact={useSearchParams().get("artifact") ?? MODEL} />;
}
export function RunnerView() {
  return (
    <Suspense fallback={<RunnerBody />}>
      <QueryRunner />
    </Suspense>
  );
}
