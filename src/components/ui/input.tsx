"use client";
import * as React from "react";
// Shared shadcn-style input; visual tokens live in the application stylesheet.
export function Input({
  className = "",
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input data-slot="input" className={`ui-input ${className}`} {...props} />
  );
}
