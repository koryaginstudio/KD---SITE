const SAME_ORIGIN_FETCH_SITES = new Set(["same-origin", "none"]);

export function rejectCrossOriginMutation(request: Request): Response | null {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();

  if (origin && origin !== requestUrl.origin) {
    return forbiddenOrigin();
  }

  if (fetchSite && !SAME_ORIGIN_FETCH_SITES.has(fetchSite)) {
    return forbiddenOrigin();
  }

  return null;
}

function forbiddenOrigin() {
  return Response.json(
    { error: "Запрос отклонён: неверный источник" },
    {
      status: 403,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
