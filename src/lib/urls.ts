/** Static assets and links also work when deployed below a repository base path. */
export const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(
  /\/$/,
  "",
);
export function assetUrl(path: string) {
  return `${basePath}/${path.replace(/^\//, "")}`;
}
export function appUrl(value: string) {
  if (/^(?:https?:|mailto:|#(?!\/))/.test(value)) return value;
  let path = value
    .replace(/^#/, "")
    .replace(/^\/leaderboard(?=\/|\?|$)/, "/")
    .replace(/^\/reports(?=\/|\?|$)/, "/local-results");
  path = path.replace(
    /^\/local-report\/([^/?]+)(?:\?(.*))?$/,
    (_, id, query) =>
      `/local-report/?id=${encodeURIComponent(id)}${query ? `&${query}` : ""}`,
  );
  const [pathname, query] = path.split("?");
  const normalized = pathname === "/" ? "/" : `${pathname.replace(/\/$/, "")}/`;
  return `${normalized.startsWith(basePath + "/") && basePath ? "" : basePath}${normalized}${query !== undefined ? `?${query}` : ""}`;
}
export function currentUrl() {
  return typeof window === "undefined"
    ? "/"
    : window.location.pathname + window.location.search;
}
export function replaceUrl(url: string) {
  window.history.replaceState(null, "", appUrl(url));
}
export function navigate(url: string) {
  window.location.assign(appUrl(url));
}
