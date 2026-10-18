"use client";
import { BrandMark } from "../BrandMark";
import { brand } from "../../lib/brand";
import { ArrowUpRight } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { SiteLink } from "../SiteLink";
import { Button } from "../ui/button";
export function Header() {
  const path = usePathname();
  const header = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const element = header.current;
    if (!element) return;
    const measure = () =>
      document.documentElement.style.setProperty(
        "--site-header-offset",
        `${element.getBoundingClientRect().height}px`,
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <header ref={header}>
      <div className="header-inner">
        <SiteLink
          className="brand index-brand"
          href="/"
          aria-label={`${brand.name} home`}
        >
          <BrandMark />
          <span>{brand.name}</span>
        </SiteLink>
        <nav aria-label="Main navigation">
          {[
            ["/", "Leaderboard"],
            ["/methodology/", "Methodology"],
          ].map(([href, label]) => (
            <SiteLink
              key={href}
              href={href}
              className={path === href ? "nav-active" : ""}
            >
              {label}
            </SiteLink>
          ))}
        </nav>
        <Button size="sm" asChild>
          <SiteLink href="/run/">
            Run benchmark <ArrowUpRight size={15} />
          </SiteLink>
        </Button>
      </div>
    </header>
  );
}
