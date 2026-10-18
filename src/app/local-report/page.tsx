import { pageMetadata } from "../../lib/metadata";
import { LocalReportView } from "../../features/local-results/LocalReportView";
export const metadata = pageMetadata({
  title: "Private benchmark report",
  description:
    "Inspect the performance and resource measurements from your private browser benchmark.",
  path: "/local-report/",
  index: false,
});
export default function Page() {
  return <LocalReportView />;
}
