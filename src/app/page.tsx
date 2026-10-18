import { brand } from "../lib/brand";
import { pageMetadata, publicUrl } from "../lib/metadata";
import { LeaderboardView } from "../features/leaderboard/LeaderboardView";
export const metadata = pageMetadata();
export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: brand.name,
            url: publicUrl(),
            description: brand.description,
          }).replace(/</g, "\u003c"),
        }}
      />
      <LeaderboardView />
    </>
  );
}
