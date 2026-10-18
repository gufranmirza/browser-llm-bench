import { Button } from "../components/ui/button";
import { SiteLink } from "../components/SiteLink";
export const metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};
export default function NotFound() {
  return (
    <div className="empty">
      <h1>Page not found</h1>
      <p>The requested page is not available.</p>
      <Button asChild variant="outline">
        <SiteLink href="/">Back to leaderboard</SiteLink>
      </Button>
    </div>
  );
}
