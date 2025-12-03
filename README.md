# CavBot · Reliability Copilot for the Modern Web

CavBot is a disciplined, event-first reliability copilot for modern websites.  
It watches your routes, 404s, SEO, and runtime feel — and turns dead ends into signal.

This repository contains:

- The **CavBot marketing & product pages** (static, fast, SEO-ready).
- The **404 Control Room mini-game**, where CavBot turns a miss into an arcade moment.
- The **CavBot brain script** (`cavbotbrain.js`), which powers local analytics, game logic, and future backend hooks.
- The initial contract for **CavBot Analytics** — a privacy-respectful event backend.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Local Development](#local-development)
  - [Static Hosting](#static-hosting)
- [CavBot Analytics Events](#cavbot-analytics-events)
- [Backend Roadmap](#backend-roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

CavBot’s job is simple:

> **Watch how your site behaves in production** and give you a clear, human-readable signal when something quietly breaks.

It does this by combining:

- A **404 Control Room** page that replaces boring 404s with a small interactive arcade moment.
- A **site-level badge** that shows your project is “under guard”.
- A **console view** (CavCore Console) that presents metrics like 404 density, SEO health, and runtime feel.
- An **event-first analytics layer** that sends structured events to a backend (spec defined, implementation coming next).

No cookies for ad-tech. No invasive fingerprinting. Just the operational data you need to keep journeys clean.

---

## Features

### Frontend & UX

- 🔁 **404 Control Room mini-game**
  - Converts a dead route into a small arcade moment.
  - Logs `catch`, `miss`, and `idle` behavior.
  - Designed to be fun for visitors and useful for operators.

- 🛡 **CavBot badge**
  - Small corner badge (planned / in progress) that shows a project is under guard.
  - Will be used to open quick snapshots and status overlays.

- 📊 **CavCore Console preview**
  - Product page includes a console mock that shows:
    - Events, 404 density, slow critical pages, and SEO regressions.
  - Gives a clear picture of how analytics are intended to look and feel.

### Analytics & Events

- ✅ **Event-first contract** for CavBot Analytics:
  - `window.cavbotAnalytics.track(eventName, payload)`
  - Well-defined event names for 404 game interactions and page views.
- 🔒 **Privacy-first design**
  - Anonymous IDs only (`anonymousId`, `sessionKey`).
  - No emails, no PII required.
  - Events are append-only and meant for operational visibility, not user profiling.

---

## Project Structure

> Note: filenames may vary slightly depending on how you organize the repo. This is the intended shape.

```text
/
├─ index.html                # (optional) Landing / redirect
├─ product.html              # CavBot Product page ("Reliability copilot for the modern web")
├─ how-it-works.html         # Deep dive into how CavBot behaves under the hood
├─ cavcore-console.html      # Console / analytics story (preview or future page)
├─ 404.html                  # CavBot 404 Control Room mini-game
│
├─ cavbotcore/
│  ├─ cavbotbrain.js         # CavBot brain: game logic, local analytics, event hooks
│  └─ head.css               # Shared CavBot head / UI styling
│
├─ cavcore/
│  └─ badge.css              # CavCore badge styling
│
└─ assets/                   # Icons, favicons, images (optional)
The repo is intentionally framework-free: plain HTML, CSS, and vanilla JavaScript — easy to host anywhere.

Getting Started

Prerequisites

You can run CavBot in two ways:
	•	Simplest: Open the HTML files directly in a browser (for quick visual checks).
	•	Recommended: Use a tiny static server so routes behave more like production (especially for 404.html).

You’ll want:
	•	Any modern browser (Chrome, Firefox, Safari, Edge).
	•	Optional: Node.js ≥ 18 if you want a local dev server via npx.

⸻

Local Development
	1.	Clone the repository

git clone https://github.com/<your-username>/<your-cavbot-repo>.git
cd <your-cavbot-repo>

2.	Run a local static server (recommended)
Using serve:

npx serve .

or using Python:

# Python 3
python -m http.server 4173

3.	Open the product page
	•	Product page:
http://localhost:4173/product.html (or whatever port your server uses)
	•	404 Control Room demo:
http://localhost:4173/404.html
	4.	Verify the CavBot brain
	•	Open DevTools → Console.
	•	Interact with the 404 Control Room.
	•	You should see CavBot logging events (e.g. cavbot_catch, cavbot_miss, etc.) through the cavbotbrain.js script.

⸻

Static Hosting

CavBot is static and can be hosted on any static host:
	•	Cloudflare Pages (recommended)
	•	Netlify
	•	Vercel (static mode)
	•	GitHub Pages
	•	Any S3 / object storage with static hosting

Basic steps (Cloudflare-style):
	1.	Push this repository to GitHub.
	2.	In Cloudflare Pages, create a new project from this repo.
	3.	Select no build command (pure static) or npm run build if you later add tooling.
	4.	Set the output directory to / (root).
	5.	Configure your custom domain (e.g. cavbot.com) and point DNS via Cloudflare.

⸻

CavBot Analytics Events

CavBot exposes a frontend helper:

window.cavbotAnalytics = window.cavbotAnalytics || {
  track(eventName, payload) {
    // v1: local logging
    // v2: send to CavBot Analytics backend via POST /v1/events
    console.log('[CavBot]', eventName, payload);
  }
};

Core 404 Control Room Events

All of these will eventually be sent to the backend with component = "404-game" and pageType = "404-control-room".

cavbot_404_view
Fired when the 404 Control Room loads and CavBot becomes visible.

cavbotAnalytics.track('cavbot_404_view', {
  visitCount: 4,
  currentDayCount: 2,
  referrer: document.referrer || null
});

cavbot_session_start
Fired when a new game round/session starts.

cavbotAnalytics.track('cavbot_session_start', {
  visitCount: 4,
  sessionRound: 1,
  pageUrl: window.location.href,
  pageType: '404-control-room'
});

cavbot_catch
Fired when CavBot is successfully caught.

cavbotAnalytics.track('cavbot_catch', {
  elapsedMs: 1820,
  elapsedSec: 1.82,
  visitCount: 4,
  sessionRound: 3,
  sessionCatchCount: 2,
  sessionMissCount: 19,
  lifetimeCatches: 5,
  lifetimeMisses: 47,
  bestCatchMs: 1800
});

cavbot_miss
Fired when the user clicks inside the grid but misses CavBot.

cavbotAnalytics.track('cavbot_miss', {
  visitCount: 4,
  sessionRound: 3,
  sessionMissCount: 20,
  lifetimeMisses: 48
});

cavbot_idle
Fired when a configured idle threshold is hit.

cavbotAnalytics.track('cavbot_idle', {
  level: 1, // 1 = gentle, 2 = deeper idle
  visitCount: 4,
  sessionRound: 3,
  sessionMissCount: 20
});

This contract is designed to feed directly into a backend like:

POST /v1/events
X-Project-Key: <public-project-key>
Content-Type: application/json

with a JSON body containing project, visitor, session, and events[].

⸻

Backend Roadmap

CavBot Analytics backend (spec defined, implementation WIP):
	•	Database: PostgreSQL, event-first schema with projects, visitors, sessions, events, and daily_aggregates.
	•	Multi-tenant: each site/app is a project, authenticated via hashed API keys.
	•	REST API:
	•	POST /v1/events to ingest batches of events.
	•	GET /v1/projects/:id/overview for high-level metrics.
	•	GET /v1/projects/:id/404-summary for 404 Control Room performance.
	•	Privacy:
	•	Anonymous IDs only.
	•	Append-only event streams.
	•	Retention tuned for operational signal, not user profiling.

The frontend in this repo is already structured to plug directly into that backend — no API schema changes required.

⸻

Contributing

Right now CavBot is in an early, tightly-guided phase.

If you’d like to:
	•	Suggest improvements to the 404 game,
	•	Help shape the analytics backend,
	•	Or contribute to documentation/design,

you can open an issue or submit a pull request. Please keep changes small, focused, and aligned with the core principles:
	•	Event-first
	•	Privacy-respectful
	•	Minimal, production-ready UX

⸻

License

MIT (or your preferred license here).

You’re free to use CavBot concepts for your own sites, experiments, and reliability projects. Please preserve attribution where appropriate.
