import { pageMetadata } from "../../lib/metadata";
import { CompatibilityView } from "../../features/capabilities/CompatibilityView";
export const metadata = pageMetadata({
  title: "Browser compatibility",
  description:
    "Check browser-reported WebGPU, memory, storage and runtime capabilities before running an on-device LLM benchmark.",
  path: "/compatibility/",
  index: true,
});
export default function Page() {
  return <CompatibilityView />;
}
