import { SiteLink } from "../components/SiteLink";
export default function NotFound() {
  return (
    <div className="empty">
      <h1>Page not found.</h1>
      <SiteLink href="/">Return to the leaderboard</SiteLink>
    </div>
  );
}
