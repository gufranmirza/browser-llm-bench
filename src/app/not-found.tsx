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
      <h1>Page not found.</h1>
      <SiteLink href="/">Return to the leaderboard</SiteLink>
    </div>
  );
}
