import { ArrowUpRight } from "lucide-react";
import { SiteLink } from "../SiteLink";
export function Footer() {
  return (
    <footer>
      <SiteLink className="footer-brand" href="/">
        Browser Inference Bench
      </SiteLink>
      <span>Performance. Compatibility. Reliability.</span>
      <SiteLink className="text-link" href="/methodology/">
        Methodology <ArrowUpRight size={13} />
      </SiteLink>
      <span className="mono">WEBGPU / v0.2</span>
    </footer>
  );
}
