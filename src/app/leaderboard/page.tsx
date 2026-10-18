import { PublishedLeaderboard } from "../../features/leaderboard/PublishedLeaderboard";
import { pageMetadata } from "../../lib/metadata";
import { LeaderboardView } from "../../features/leaderboard/LeaderboardView";
export const metadata = pageMetadata({
  title: "Browser LLM leaderboard",
  description:
    "Compare measured browser LLM inference speed, latency, response time and resource usage across model configurations.",
  path: "/",
  index: true,
});
export default function Page() {
  return <LeaderboardView loading={<PublishedLeaderboard />} />;
}
