// cavcore-console.js
// Wires CavCore Console UI to the live summary API.
// Reads metrics like pageViews24h, avgLcpMs, and topRoutes and paints them into the DOM.

(function () {
  const SUMMARY_URL = "https://api.cavbot.io/v1/projects/1/summary";
  const PROJECT_KEY = "cavbot_pk_web_main_01J9X0ZK3P";
  const REFRESH_INTERVAL_MS = 60_000; // refresh every 60s to keep console alive

  // ---------- Helpers ----------

  function pickMetricsPayload(data) {
    if (!data || typeof data !== "object") return {};
    // Expected shape: { project: {...}, window: {...}, metrics: {...} }
    if (data.metrics && typeof data.metrics === "object") return data.metrics;
    if (data.project && data.project.metrics) return data.project.metrics;
    // Fallback: treat root as metrics
    return data;
  }

  function isNumber(value) {
    return typeof value === "number" && !Number.isNaN(value);
  }

  function formatNumber(value) {
    if (!isNumber(value)) return "—";
    try {
      return Number(value).toLocaleString();
    } catch {
      return String(value);
    }
  }

  function formatMs(value) {
    if (!isNumber(value)) return "—";
    try {
      return Math.round(Number(value)).toLocaleString() + " ms";
    } catch {
      return Math.round(Number(value)) + " ms";
    }
  }

  // ---------- Renderers ----------

  // Total events / page views (24h)
  function renderPageViews(metrics) {
    // NOTE: this matches your HTML: data-metric="pageviews-24h"
    const el = document.querySelector('[data-metric="pageviews-24h"]');
    if (!el) return;

    const value = metrics.pageViews24h;
    el.textContent = isNumber(value) ? formatNumber(value) : "—";
  }

  // Average LCP in ms (desktop)
  function renderAvgLcp(metrics) {
    const el = document.querySelector('[data-metric="avg-lcp-ms"]');
    if (!el) return;

    const value = metrics.avgLcpMs;
    el.textContent = formatMs(value);
  }

  // Top routes list (expects a <ul data-metric="topRoutes"> in your HTML)
  function renderTopRoutes(metrics) {
    const list = document.querySelector('[data-metric="topRoutes"]');
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
        route.route_path ||
        route.path ||
        route.url ||
        "(unknown route)";

      const views = isNumber(route.views)
        ? route.views
        : isNumber(route.count)
        ? route.count
        : 0;

      const link = document.createElement("a");
      link.href = path;
      link.textContent = path;
      link.rel = "noopener noreferrer";

      const meta = document.createElement("span");
      meta.textContent = ` — ${formatNumber(views)} views (24h)`;

      li.appendChild(link);
      li.appendChild(meta);
      list.appendChild(li);
    });
  }

  // ---------- Load + wire metrics ----------

  async function loadSummary() {
    try {
      const res = await fetch(SUMMARY_URL, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-Project-Key": PROJECT_KEY
        },
        credentials: "omit", // no cookies; anonymous analytics only
        cache: "no-store"
      });

      if (!res.ok) {
        throw new Error(`Bad response from summary API: ${res.status}`);
      }

      const data = await res.json();
      const metrics = pickMetricsPayload(data);

      renderPageViews(metrics);
      renderAvgLcp(metrics);
      renderTopRoutes(metrics);
    } catch (err) {
      console.error("CavCore Console: failed to load summary", err);

      // Soft-fail UI so it's obvious that live data isn't flowing
      const pv = document.querySelector('[data-metric="pageviews-24h"]');
      if (pv) pv.textContent = "—";

      const lcp = document.querySelector('[data-metric="avg-lcp-ms"]');
      if (lcp) lcp.textContent = "—";

      const list = document.querySelector('[data-metric="topRoutes"]');
      if (list && !list.children.length) {
        const li = document.createElement("li");
        li.textContent = "Couldn’t load live data (check API / CORS).";
        list.appendChild(li);
      }
    }
  }

  // ---------- Boot + auto-refresh ----------

  function boot() {
    loadSummary();
    // Keep the dashboard alive: re-pull metrics every minute
    setInterval(loadSummary, REFRESH_INTERVAL_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();