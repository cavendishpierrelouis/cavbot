// cavbot-analytics / worker.js
// CavBot Analytics v5 — stub ingestion worker

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // --- Basic CORS headers so CavBot can send from any site ---
    const corsHeaders = {
      "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Project-Key",
      "Access-Control-Max-Age": "86400"
    };

    // --- Preflight (OPTIONS) ---
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    // --- Simple health check ---
    if (url.pathname === "/v1/health") {
      return new Response(
        JSON.stringify({ status: "ok", worker: "cavbot-analytics" }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        }
      );
    }

    // --- MAIN INGESTION: POST /v1/events ---
    if (url.pathname === "/v1/events" && request.method === "POST") {
      const projectKey = request.headers.get("X-Project-Key") || "";
      if (!projectKey) {
        return new Response(
          JSON.stringify({ error: "Missing X-Project-Key header" }),
          {
            status: 401,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json"
            }
          }
        );
      }

      let body;
      try {
        body = await request.json();
      } catch (e) {
        return new Response(
          JSON.stringify({ error: "Invalid JSON body" }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json"
            }
          }
        );
      }

      // Body shape we expect (v1):
      // {
      //   anonymousId: "xyz",
      //   sessionKey: "sess-...",
      //   pageUrl: "https://...",
      //   routePath: "/404",
      //   pageType: "404-control-room",
      //   component: "404-game",
      //   referrer: "...",
      //   userAgent: "...",
      //   events: [
      //      { name: "cavbot_control_room_catch", timestamp: "...", payload: {...} }
      //   ]
      // }

      const events = Array.isArray(body.events) ? body.events : [];

      // For now: just log. Later this will insert into Postgres.
      console.log("CavBot batch:", {
        projectKey: projectKey.slice(0, 8) + "...",
        anonymousId: body.anonymousId,
        sessionKey: body.sessionKey,
        pageType: body.pageType,
        component: body.component,
        pageUrl: body.pageUrl,
        routePath: body.routePath,
        count: events.length
      });

      return new Response(
        JSON.stringify({
          status: "ok",
          accepted: events.length,
          mode: "stub-v1"
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        }
      );
    }

    // --- Fallback 404 ---
    return new Response(
      JSON.stringify({ error: "Not found", path: url.pathname }),
      {
        status: 404,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      }
    );
  }
};
