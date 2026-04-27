type Env = {
  PLAYNC_PROXY_TOKEN?: string;
};

const PLAYNC_DETAIL_URL = "https://aion2.plaync.com/api/character/info";
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, x-proxy-token",
};

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
      ...(init?.headers ?? {}),
    },
  });
}

function hasValidToken(request: Request, env: Env) {
  const expected = env.PLAYNC_PROXY_TOKEN?.trim();
  if (!expected) {
    return true;
  }

  const authorization = request.headers.get("authorization") ?? "";
  const bearerToken = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
  const headerToken = request.headers.get("x-proxy-token")?.trim() ?? "";
  return bearerToken === expected || headerToken === expected;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== "GET") {
      return jsonResponse({ error: "Method Not Allowed" }, { status: 405 });
    }

    if (!hasValidToken(request, env)) {
      return jsonResponse({ error: "Unauthorized" }, { status: 401 });
    }

    const requestUrl = new URL(request.url);
    const characterId = requestUrl.searchParams.get("characterId")?.trim() ?? "";
    const serverId = requestUrl.searchParams.get("serverId")?.trim() ?? "";
    const lang = requestUrl.searchParams.get("lang")?.trim() || "ko-kr";

    if (!characterId || !serverId) {
      return jsonResponse({ error: "characterId/serverId are required" }, { status: 400 });
    }

    const upstreamUrl = new URL(PLAYNC_DETAIL_URL);
    upstreamUrl.searchParams.set("lang", lang);
    upstreamUrl.searchParams.set("characterId", characterId);
    upstreamUrl.searchParams.set("serverId", serverId);
    upstreamUrl.searchParams.set("t", String(Date.now()));

    const refererCharacterId = encodeURIComponent(characterId);
    const response = await fetch(upstreamUrl.toString(), {
      headers: {
        "accept": "application/json, text/plain, */*",
        "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "origin": "https://aion2.plaync.com",
        "referer": `https://aion2.plaync.com/ko-kr/characters/${serverId}/${refererCharacterId}`,
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "x-requested-with": "XMLHttpRequest",
      },
    });

    const contentType = response.headers.get("content-type") ?? "";
    const text = await response.text();

    if (!response.ok) {
      return jsonResponse(
        {
          error: `PlayNC detail failed: HTTP ${response.status}`,
          contentType,
          preview: text.slice(0, 240),
        },
        { status: 502 },
      );
    }

    try {
      JSON.parse(text);
    } catch {
      return jsonResponse(
        {
          error: "PlayNC detail returned non-JSON",
          contentType,
          preview: text.slice(0, 240),
        },
        { status: 502 },
      );
    }

    return new Response(text, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        ...CORS_HEADERS,
      },
    });
  },
};
