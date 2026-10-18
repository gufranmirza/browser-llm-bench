import Link from "next/link";
import type { ComponentProps } from "react";
import { appUrl } from "../lib/urls";
export function SiteLink({ href = "", ...props }: ComponentProps<"a">) {
  if (/^(?:https?:|mailto:|#(?!\/))/.test(href))
    return <a href={href} {...props} />;
  return <Link href={appUrl(href)} prefetch={false} {...props} />;
}
