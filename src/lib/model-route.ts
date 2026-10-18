const sections: Record<string, string> = {
  performance: "performance",
  speed: "performance",
  latency: "performance",
  response: "performance",
  "memory-evidence": "performance",
  resources: "resources",
  "native-resources": "resources",
  "resource-footprint": "resources",
  "profiling-plan": "resources",
  "resource-behavior": "resources",
  "signal-coverage": "resources",
  requests: "requests",
  "request-evidence": "requests",
  "token-evidence": "requests",
  configuration: "configuration",
  "context-evidence": "configuration",
  "variant-evidence": "configuration",
};

export function modelSection(value: string | null): string | undefined {
  const section = value && sections[value.replace(/^v2-/, "")];
  return section ? `v2-${section}` : undefined;
}

export function canonicalModelRoute(route: string): string {
  const normalized = route.replace(/^#\/models-v2(?=\/|\?|$)/, "#/models");
  if (!normalized.startsWith("#/models/")) return normalized;
  const queryIndex = normalized.indexOf("?");
  if (queryIndex === -1) return normalized;
  const params = new URLSearchParams(normalized.slice(queryIndex + 1));
  const section = modelSection(params.get("section"))?.replace(/^v2-/, "");
  if (!section || section === params.get("section")) return normalized;
  params.set("section", section);
  return `${normalized.slice(0, queryIndex)}?${params}`;
}

export function leaderboardBack(value: string | null): string {
  if (value && /^\/(?:\?.*)?$/.test(value)) return value;
  return value && /^#\/leaderboard(?:\?|$)/.test(value)
    ? value.replace(/^#\/leaderboard/, "/")
    : "/";
}
