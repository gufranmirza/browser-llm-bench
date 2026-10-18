"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Methodology } from "./Methodology";
function QueryMethodology() {
  return <Methodology section={useSearchParams().get("section")} />;
}

export function MethodologyView() {
  return (
    <Suspense fallback={<Methodology section={null} />}>
      <QueryMethodology />
    </Suspense>
  );
}
