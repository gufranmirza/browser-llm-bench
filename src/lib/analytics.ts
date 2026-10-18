/** Only published pages on the production domain participate in analytics. */
export function analyticsPage(href: string): string | null {
  try {
    const url = new URL(href);
    if (url.origin !== "https://browserllm.dev") return null;
    if (
      !/^\/(?:$|leaderboard\/?$|methodology\/?$|compatibility\/?$|models\/[a-z0-9-]+\/?)$/.test(
        url.pathname,
      )
    )
      return null;
    return url.origin + url.pathname;
  } catch {
    return null;
  }
}

/** Referrers contribute their origin only; never search terms or report IDs. */
export function analyticsReferrer(referrer: string): string {
  try {
    return new URL(referrer).origin + "/";
  } catch {
    return "";
  }
}
