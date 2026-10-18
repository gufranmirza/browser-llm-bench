import Link from "next/link";
import type { ComponentProps } from "react";
import { routeUrl } from "../lib/urls";
export function SiteLink({ href = "", ...props }: ComponentProps<"a">) {
  if (/^(?:https?:|mailto:|#(?!\/))/.test(href))
    return <a href={href} {...props} />;
  return <Link href={routeUrl(href)} prefetch={false} {...props} />;
}
