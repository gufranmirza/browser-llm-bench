import { pageMetadata } from "../../lib/metadata";
import { LocalResultsView } from "../../features/local-results/LocalResultsView";
export const metadata = pageMetadata({
  title: "Private local reports",
  description:
    "View and download benchmark reports stored only in this browser.",
  path: "/local-results/",
  index: false,
});
export default function Page() {
  return <LocalResultsView />;
}
