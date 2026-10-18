"use client";
import { useRouter } from "next/navigation";
import { useReports } from "../../components/layout/AppProvider";
import { routeUrl } from "../../lib/urls";
import { Compatibility } from "./Compatibility";
export function CompatibilityView() {
  const { published } = useReports();
  const router = useRouter();
  return (
    <Compatibility
      reports={published}
      onRun={() => router.push(routeUrl("/run/"))}
    />
  );
}
