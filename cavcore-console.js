// cavcore-console.js
(function () {
  "use strict";

  // ---- CavBot API config ----
  const SUMMARY_URL = "https://api.cavbot.io/v1/projects/1/summary";
  const PROJECT_KEY = "cavbot_pk_web_main_01J9X0ZK3P";

  // ---------- format helpers ----------

  function formatNumber(value) {
    if (value == null || isNaN(value)) return "—";
    return Number(value).toLocaleString();
  }

  function formatInteger(value) {
    if (value == null || isNaN(value)) return "—";
    return String(Math.round(Number(value)));
  }

  function formatMs(value) {
    if (value == null || isNaN(value)) return "—";
    const num = Number(value);
    return Math.round(num).toLocaleString() + " ms";
  }

  function formatPercent(value) {
    if (value == null || isNaN(value)) return "—";
    const num = Number(value);
    // one decimal if needed
    if (num % 1 === 0) {
      return num.toFixed(0) + "%";
    }
    return num.toFixed(1) + "%";
  }

  // ---------- scalar metric binding ----------

  function applyScalarMetrics(metrics) {
    if (!metrics) return;

    const nodes = document.querySelectorAll("[data-metric]");
    nodes.forEach((el) => {
      const key = el.getAttribute("data-metric");
      if (!key) return;

      const format = el.getAttribute("data-format") || "number";

      // percent-bar: we drive CSS var, not inner text
      if (format === "percent-bar") {
        const raw = metrics[key];
        if (typeof raw !== "number") return;
        el.style.setProperty("--percent", raw.toFixed(1) + "%");
        return;
      }

      const raw = metrics[key];
      if (raw == null) return;

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
  }

  // ---------- trend chart binding ----------

  function applyTrend(trendPoints) {
    const container = document.getElementById("trend-chart");
    if (!container || !Array.isArray(trendPoints) || trendPoints.length === 0) {
      return;
    }

    container.innerHTML = "";

    let maxSessions = 0;
    trendPoints.forEach((p) => {
      if (p.sessions && p.sessions > maxSessions) {
        maxSessions = p.sessions;
      }
    });
    if (maxSessions === 0) maxSessions = 1;

    trendPoints.forEach((p) => {
      const group = document.createElement("div");
      group.className = "trend-bar-group";

      const barSessions = document.createElement("div");
      barSessions.className = "trend-bar trend-bar--sessions";
      const sessionsRatio = Math.max(0, Math.min(1, (p.sessions || 0) / maxSessions));
      const sessionsHeight = 25 + Math.round(sessionsRatio * 55); // 25–80%
      barSessions.style.height = sessionsHeight + "%";

      const bar404 = document.createElement("div");
      bar404.className = "trend-bar trend-bar--404";
      const views404 = p.views404 || 0;
      const viewsRatio = Math.max(0, Math.min(1, views404 / maxSessions));
      const viewsHeight = 10 + Math.round(viewsRatio * 45); // 10–55%
      bar404.style.height = viewsHeight + "%";

      const label = document.createElement("div");
      label.className = "trend-day-label";
      // use MM-DD from "YYYY-MM-DD"
      if (p.day && typeof p.day === "string" && p.day.length >= 10) {
        label.textContent = p.day.slice(5); // "MM-DD"
      } else {
        label.textContent = "—";
      }

      group.appendChild(barSessions);
      group.appendChild(bar404);
      group.appendChild(label);
      container.appendChild(group);
    });
  }

  // ---------- hydrate everything ----------

  function hydrateConsole(summary) {
    if (!summary || !summary.metrics) return;
    const metrics = summary.metrics;

    applyScalarMetrics(metrics);

    if (Array.isArray(metrics.trend7d)) {
      applyTrend(metrics.trend7d);
    }
  }

  // ---------- fetch + poll ----------

  function fetchSummary() {
    fetch(SUMMARY_URL, {
      method: "GET",
      headers: {
        "X-Project-Key": PROJECT_KEY
      }
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error("Bad response from CavBot API: " + res.status);
        }
        return res.json();
      })
      .then(hydrateConsole)
      .catch((err) => {
        console.error("CavCore Console metrics fetch failed:", err);
      });
  }

  function startConsole() {
    // initial load
    fetchSummary();
    // refresh every 60s so it never feels frozen
    setInterval(fetchSummary, 60_000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startConsole);
  } else {
    startConsole();
  }
})();
