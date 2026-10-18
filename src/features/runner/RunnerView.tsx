"use client";
import { useSearchParams } from "next/navigation";
import { MODEL } from "../../benchmark/schemas/report";
import { useReports } from "../../components/layout/AppProvider";
import Runner from "./Runner";
export function RunnerView() {
  const params = useSearchParams();
  const { addLocal } = useReports();
  return (
    <Runner
      onReport={addLocal}
      initialModel={params.get("artifact") ?? MODEL}
    />
  );
}
