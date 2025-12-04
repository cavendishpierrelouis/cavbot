(function () {
  const API_URL = "https://api.cavbot.io/v1/events";
  const PROJECT_KEY = "cavbot_pk_dev_demo"; // later: real per-project key

  function getAnonymousId() {
    try {
      const key = "cavbotAnonId";
      const existing = localStorage.getItem(key);
      if (existing) return existing;
      const fresh = "anon-" + Math.random().toString(36).slice(2);
      localStorage.setItem(key, fresh);
      return fresh;
    } catch {
      return "anon-ephemeral";
    }
  }

  function getSessionKey() {
    if (window.cavbotBrain && typeof window.cavbotBrain.getSessionId === "function") {
      return window.cavbotBrain.getSessionId();
    }
    return "sess-" + Math.random().toString(36).slice(2);
  }

  function sendEvent(name, payload) {
    const body = {
      anonymousId: getAnonymousId(),
      sessionKey: getSessionKey(),
      pageUrl: location.href,
      routePath: location.pathname,
      pageType: "404-control-room",  // you can change per page later
      component: "404-game",         // or "badge", "assistant", etc.
      referrer: document.referrer || "",
      userAgent: navigator.userAgent,
      events: [
        {
          name,
          timestamp: new Date().toISOString(),
          payload: payload || {}
        }
      ]
    };

    return fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Project-Key": PROJECT_KEY
      },
      body: JSON.stringify(body)
    }).catch(() => {
      // never break the page if analytics fails
    });
  }

  // CavBot global analytics object used by your Brain
  window.cavbotAnalytics = {
    track: sendEvent
  };
})();