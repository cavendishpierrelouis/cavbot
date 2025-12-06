// cavcore-console.js
// Wires CavCore Console UI to the live summary API.
// Reads metrics like pageViews24h, avgLcpMs, topRoutes and paints them into the DOM.

(function () {
  const SUMMARY_URL = "https://api.cavbot.io/v1/projects/1/summary";
  const PROJECT_KEY = "cavbot_pk_web_main_01J9X0ZK3P";

  // ---- Helpers ----------------------------------------------------------

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
    try {
      return Number(value).toLocaleString();
    } catch {
      return String(value);
    }
  }

  function formatMs(value) {
    if (value == null || isNaN(value)) return "—";
    return Math.round(Number(value)).toLocaleString() + " ms";
  }

  // Adds a little “data loaded” class so you can fade things in via CSS if you want
  function markConsoleLoaded() {
    document.documentElement.classList.add("cavcore-console-loaded");
  }

  // ---- Renderers --------------------------------------------------------

  // Total events / page views (24h) – wired to your "Total events" tile
  function renderPageViews(metrics) {
    // IMPORTANT: this matches your HTML: data-metric="pageviews-24h"
    const el = document.querySelector('[data-metric="pageviews-24h"]');
    if (!el) return;

    const value = metrics.pageViews24h;
    if (typeof value === "number") {
      el.textContent = formatNumber(value);
    } else {
      el.textContent = "—";
    }
  }

  // Average LCP (desktop) – wired to your "Average LCP (desktop)" pill
  function renderAvgLcp(metrics) {
    // IMPORTANT: this matches your HTML: data-metric="avg-lcp-ms"
    const el = document.querySelector('[data-metric="avg-lcp-ms"]');
    if (!el) return;

    const value = metrics.avgLcpMs;
    el.textContent = formatMs(value);
  }

  // Optional: list the top routes in a UL if you add one
  function renderTopRoutes(metrics) {
    // Add somewhere in HTML:
    // <ul class="mini-list" data-metric="top-routes-list"></ul>
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

  // ---- Main loader ------------------------------------------------------

  async function loadSummary() {
    try {
      const res = await fetch(SUMMARY_URL, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-Project-Key": PROJECT_KEY, // CRITICAL: this matches your Worker
        },
        credentials: "omit", // Everything is anonymous
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

      // Soft-fail states so you can *see* it's not wired
      const pv = document.querySelector('[data-metric="pageviews-24h"]');
      if (pv) pv.textContent = "—";

      const lcp = document.querySelector('[data-metric="avg-lcp-ms"]');
      if (lcp) lcp.textContent = "—";

      const list = document.querySelector('[data-metric="top-routes-list"]');
      if (list && !list.children.length) {
        const li = document.createElement("li");
        li.textContent = "Couldn’t load live data (check API / CORS / project key).";
        list.appendChild(li);
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadSummary);
  } else {
    loadSummary();
  }
})();
