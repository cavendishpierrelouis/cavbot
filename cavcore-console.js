// cavcore-console.js
// Wires CavCore Console UI to the live summary API.
// Reads metrics like pageViews24h, avgLcpMs, topRoutes and paints them into the DOM.

(function () {
  const SUMMARY_URL = "https://api.cavbot.io/v1/projects/1/summary";
  const PROJECT_KEY = "cavbot_pk_web_main_01J9X0ZK3P";
  const REFRESH_MS = 60_000; // refresh every 60s so it doesn't feel static

  // ---------- Helpers ----------------------------------------------------

  function pickMetricsPayload(data) {
    if (!data || typeof data !== "object") return {};
    // Expected shape from your Worker:
    // { project: {...}, window: {...}, metrics: {...} }
    if (data.metrics && typeof data.metrics === "object") return data.metrics;
    if (data.project && data.project.metrics) return data.project.metrics;
    // Fallback: treat root as metrics
    return data;
  }

  function formatNumber(value) {
    if (value == null || isNaN(value)) return "—";
    return Number(value).toLocaleString();
  }

  function formatMs(value) {
    if (value == null || isNaN(value)) return "—";
    return Math.round(Number(value)).toLocaleString() + " ms";
  }

  function markConsoleLoaded() {
    document.documentElement.classList.add("cavcore-console-loaded");
  }

  // ---------- Renderers --------------------------------------------------

  // Total events / page views (24h) – wired to your "Total events" tile
  function renderPageViews(metrics) {
    // IMPORTANT: this matches your HTML exactly:
    // <div class="metric-value" data-metric="pageviews-24h">284,930</div>
    const el = document.querySelector('[data-metric="pageviews-24h"]');
    if (!el) return;

    const value = metrics.pageViews24h;
    if (typeof value === "number") {
      el.textContent = formatNumber(value);
    }
    // If it's missing, we just leave whatever was there (no "—" overwrite)
  }

  // Average LCP (desktop) – wired to:
  // <div class="perf-value" data-metric="avg-lcp-ms">1,980 ms</div>
  function renderAvgLcp(metrics) {
    const el = document.querySelector('[data-metric="avg-lcp-ms"]');
    if (!el) return;

    const value = metrics.avgLcpMs;
    if (typeof value === "number") {
      el.textContent = formatMs(value);
    }
  }

  // Optional: top routes list if you add:
  // <ul class="mini-list" data-metric="top-routes-list"></ul>
  function renderTopRoutes(metrics) {
    const list = document.querySelector('[data-metric="top-routes-list"]');
    if (!list) return;

    const routes = Array.isArray(metrics.topRoutes) ? metrics.topRoutes : [];
    list.innerHTML = "";

    if (!routes.length) {
      const li = document.createElement("li");
      li.textContent = "No recent route data yet.";
      list.appendChild(li);
      return;
    }

    routes.slice(0, 5).forEach((route) => {
      const li = document.createElement("li");
      const path =
        route.route_path || route.path || route.url || "(unknown route)";
      const views =
        typeof route.views === "number"
          ? route.views
          : typeof route.count === "number"
          ? route.count
          : 0;

      li.textContent = `${path} — ${formatNumber(views)} views (24h)`;
      list.appendChild(li);
    });
  }

  // ---------- Loader -----------------------------------------------------

  async function loadSummaryOnce() {
    try {
      const res = await fetch(SUMMARY_URL, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-Project-Key": PROJECT_KEY, // must match your Worker
        },
        credentials: "omit",
      });

      if (!res.ok) {
        throw new Error(`Bad response from summary API: ${res.status}`);
      }

      const data = await res.json();
      const metrics = pickMetricsPayload(data);

      console.debug("CavCore Console summary payload:", metrics);

      renderPageViews(metrics);
      renderAvgLcp(metrics);
      renderTopRoutes(metrics);

      markConsoleLoaded();
    } catch (err) {
      console.error("CavCore Console: failed to load summary", err);
      // We DON'T wipe your numbers to "—" here to avoid fake static feel.
    }
  }

  function boot() {
    loadSummaryOnce();
    // Keep it feeling alive: refresh every minute
    setInterval(loadSummaryOnce, REFRESH_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
