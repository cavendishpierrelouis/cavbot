// cavcore-console.js
// Wires CavCore Console UI to the live summary API.
// Reads metrics (pageViews24h, avgLcpMs, etc.) and paints them into the DOM.

(function () {
  const SUMMARY_URL = "https://api.cavbot.io/v1/projects/1/summary";
  const PROJECT_KEY = "cavbot_pk_web_main_01J9X0ZK3P";
  const REFRESH_MS = 60_000; // refresh every 60s

  // ---- Helpers ----------------------------------------------------------

  function getMetricsFromResponse(data) {
    if (!data || typeof data !== "object") return {};

    // Expected from your Worker:
    // { project: {...}, window: {...}, metrics: {...} }
    if (data.metrics && typeof data.metrics === "object") return data.metrics;

    if (Array.isArray(data.projects) && data.projects.length > 0) {
      const p = data.projects[0];
      if (p.metrics && typeof p.metrics === "object") return p.metrics;
    }

    // Fallback: treat root as metrics
    return data;
  }

  function resolvePath(obj, path) {
    if (!obj) return undefined;
    const parts = String(path).split(".");
    let cur = obj;
    for (const key of parts) {
      if (cur && Object.prototype.hasOwnProperty.call(cur, key)) {
        cur = cur[key];
      } else {
        return undefined;
      }
    }
    return cur;
  }

  function formatNumber(value) {
    const n = Number(value);
    if (!isFinite(n)) return "—";
    return n.toLocaleString();
  }

  function formatInteger(value) {
    const n = Math.round(Number(value));
    if (!isFinite(n)) return "—";
    return n.toLocaleString();
  }

  function formatMs(value) {
    const n = Math.round(Number(value));
    if (!isFinite(n)) return "—";
    return n.toLocaleString() + " ms";
  }

  function formatPercent(value) {
    const n = Number(value);
    if (!isFinite(n)) return "—";
    return n.toLocaleString(undefined, { maximumFractionDigits: 1 }) + "%";
  }

  // ---- Metric application -----------------------------------------------

  function applyScalarMetrics(metrics) {
    const nodes = document.querySelectorAll("[data-metric]");

    nodes.forEach(function (el) {
      const key = el.getAttribute("data-metric");
      const format = el.getAttribute("data-format") || "number";

      // Special: percent-bar only drives CSS var, not text
      if (format === "percent-bar") {
        const raw = resolvePath(metrics, key);
        if (raw == null || isNaN(raw)) return;
        const n = Number(raw);
        el.style.setProperty("--percent", n + "%");
        return;
      }

      const raw = resolvePath(metrics, key);
      if (raw == null || (typeof raw === "number" && !isFinite(raw))) return;

      let text;
      switch (format) {
        case "ms":
          text = formatMs(raw);
          break;
        case "integer":
          text = formatInteger(raw);
          break;
        case "percent":
          text = formatPercent(raw);
          break;
        case "number":
        default:
          text = formatNumber(raw);
          break;
      }

      el.textContent = text;
    });

    // Composite: catches / misses
    const catchMissEl = document.querySelector(".key-stat-value--catch-miss");
    if (catchMissEl) {
      const catches = resolvePath(metrics, "catchCount30d");
      const misses = resolvePath(metrics, "missCount30d");
      if (typeof catches === "number" && typeof misses === "number") {
        catchMissEl.textContent =
          formatInteger(catches) + " / " + formatInteger(misses);
      }
    }

    // Composite: idle events L1 / L2
    const idleEl = document.querySelector(".key-stat-value--idle-levels");
    if (idleEl) {
      const l1 = resolvePath(metrics, "idleL1Count30d");
      const l2 = resolvePath(metrics, "idleL2Count30d");
      if (typeof l1 === "number" && typeof l2 === "number") {
        idleEl.textContent = formatInteger(l1) + " / " + formatInteger(l2);
      }
    }
  }

  // ---- Optional: Top routes list ---------------------------------------

  // If you add something like:
  //   <ul class="mini-list" data-metric="top-routes-list"></ul>
  // or  <ul data-metric="topRoutes"></ul>
  // this will render metrics.topRoutes into that list.
  function renderTopRoutes(metrics) {
    const list = document.querySelector(
      '[data-metric="topRoutes"], [data-metric="top-routes-list"]'
    );
    if (!list) return;

    const routes = Array.isArray(metrics.topRoutes) ? metrics.topRoutes : [];
    list.innerHTML = "";

    if (!routes.length) {
      const li = document.createElement("li");
      li.textContent = "No recent route data yet.";
      list.appendChild(li);
      return;
    }

    routes.slice(0, 5).forEach(function (route) {
      const li = document.createElement("li");
      const path =
        route.route_path || route.path || route.url || "(unknown route)";
      const views =
        typeof route.views === "number"
          ? route.views
          : typeof route.count === "number"
          ? route.count
          : 0;

      li.textContent = path + " — " + formatNumber(views) + " views (24h)";
      list.appendChild(li);
    });
  }

  // ---- Fetch + refresh --------------------------------------------------

  function fetchAndApply() {
    fetch(SUMMARY_URL, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Project-Key": PROJECT_KEY
      },
      credentials: "omit"
    })
      .then(function (res) {
        if (!res.ok) {
          throw new Error("Bad response from CavBot API: " + res.status);
        }
        return res.json();
      })
      .then(function (data) {
        const metrics = getMetricsFromResponse(data) || {};
        console.debug("CavCore Console summary payload:", metrics);

        applyScalarMetrics(metrics);
        renderTopRoutes(metrics);

        document.documentElement.classList.add("cavcore-console-loaded");
      })
      .catch(function (err) {
        console.error("CavBot metrics fetch failed:", err);
        // On failure, demo numbers stay; no hard "—" everywhere.
      });
  }

  function boot() {
    fetchAndApply();
    setInterval(fetchAndApply, REFRESH_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
