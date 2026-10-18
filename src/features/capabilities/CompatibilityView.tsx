"use client";
import { useRouter } from "next/navigation";
import { useReports } from "../../components/layout/AppProvider";
import { routeUrl } from "../../lib/urls";
import type { CompatibilityEvidence } from "./Compatibility";
import { Compatibility } from "./Compatibility";
export function CompatibilityView({
  initialEvidence = [],
}: {
  initialEvidence?: CompatibilityEvidence[];
}) {
  const { published, publishedReady } = useReports();
  const router = useRouter();
  return (
    <Compatibility
      reports={
        publishedReady && published.length
          ? [...published].sort(
              (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
            )
          : initialEvidence
      }
      onRun={() => router.push(routeUrl("/run/"))}
    />
  );
}
