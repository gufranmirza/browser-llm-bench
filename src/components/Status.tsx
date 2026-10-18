"use client";
export function Status({ value }: { value: string }) {
  return (
    <span className={"status " + value.toLowerCase()}>
      <span className="dot" />
      {value}
    </span>
  );
}
