const SAFE_FETCH_SITES = new Set(["same-origin", "same-site", "none"]);

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || "";
}

function normalizedHost(value: string) {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

export function requestIpAddress(request: Request) {
  const candidates = [
    request.headers.get("cf-connecting-ip"),
    request.headers.get("x-real-ip"),
    firstHeaderValue(request.headers.get("x-forwarded-for")),
  ];
  const value = candidates.find((candidate) => candidate && candidate.trim())?.trim() || "local";
  return value.replace(/[^0-9a-f:.,_-]/gi, "").slice(0, 80) || "local";
}

export function requestUsesHttps(request: Request) {
  const forwardedProtocol = firstHeaderValue(request.headers.get("x-forwarded-proto")).toLowerCase();
  return forwardedProtocol === "https" || new URL(request.url).protocol === "https:";
}

export function validMutationOrigin(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase() || "";
  if (fetchSite && !SAFE_FETCH_SITES.has(fetchSite)) return false;

  const origin = request.headers.get("origin");
  if (!origin) {
    // Browsers attach Origin to fetch/XHR mutations. Missing Origin is kept for
    // trusted CLI/server integrations and tests, while Sec-Fetch-Site still
    // blocks cross-site browser requests.
    return true;
  }

  try {
    const expectedHost = normalizedHost(
      firstHeaderValue(request.headers.get("x-forwarded-host"))
      || request.headers.get("host")
      || new URL(request.url).host,
    );
    const originUrl = new URL(origin);
    if (normalizedHost(originUrl.host) !== expectedHost) return false;

    const expectedProtocol = firstHeaderValue(request.headers.get("x-forwarded-proto"))
      || new URL(request.url).protocol.replace(":", "");
    return originUrl.protocol === `${expectedProtocol}:`;
  } catch {
    return false;
  }
}

export function mutationOriginError() {
  return Response.json({ error: "请求来源无效，请刷新页面后再试。" }, { status: 403 });
}
