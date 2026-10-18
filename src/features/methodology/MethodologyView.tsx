"use client";
import { useSearchParams } from "next/navigation";
import { Methodology } from "./Methodology";
export function MethodologyView() {
  return <Methodology section={useSearchParams().get("section")} />;
}
