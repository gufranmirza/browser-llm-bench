import { BrandMark } from "../BrandMark";
import { brand } from "../../lib/brand";
import { ArrowUpRight, Github } from "lucide-react";
import { SiteLink } from "../SiteLink";
export function Footer() {
  return (
    <footer>
      <SiteLink className="footer-brand" href="/">
        <BrandMark size={24} />
        <span>{brand.name}</span>
      </SiteLink>
      <nav className="footer-links" aria-label="Footer navigation">
        <SiteLink href="/methodology/">
          Methodology <ArrowUpRight size={13} />
        </SiteLink>
        <a
          href="https://github.com/gufranmirza/browser-llm-bench"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Github size={15} /> Source code
        </a>
      </nav>
    </footer>
  );
}
