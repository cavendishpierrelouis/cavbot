(function () {
  'use strict';

  const REDIRECT_ON_CATCH = true;
  const REDIRECT_TARGET = 'index.html#top';
  const REDIRECT_DELAY_MS = 3800; // slightly longer so the celebration can land

  const trackEl = document.getElementById('bot-track');
  const orbitEl = document.getElementById('cavbot-orbit');
  const cavbotEl = document.getElementById('cavbot');
  const pupils = document.querySelectorAll('.cavbot-eye-pupil, .cavbot-dm-eye-pupil');
  const speechTextEl = document.getElementById('cavbot-speech-text');
  const statusEl = document.getElementById('console-status');
  const statRoundEl = document.getElementById('stat-round');
  const statCurrentEl = document.getElementById('stat-current');
  const statBestEl = document.getElementById('stat-best');
  const logRoundLabelEl = document.getElementById('log-round-label');
  const logInnerEl = document.getElementById('console-log-inner');
  const chatInnerEl = document.getElementById('chat-log-inner');

  const dmLineEl = document.getElementById('cavbot-dm-line');
  const dmCursorEl = document.getElementById('cavbot-dm-cursor');
  const dmSegments = dmLineEl ? Array.prototype.slice.call(dmLineEl.querySelectorAll('.cavbot-dm-segment')) : [];

  if (!trackEl || !orbitEl || !cavbotEl) {
    return;
  }

  // Make sure CavBot is fully keyboardable as a button
  cavbotEl.setAttribute('role', 'button');
  if (!cavbotEl.hasAttribute('tabindex')) {
    cavbotEl.setAttribute('tabindex', '0');
  }

  // === Accessibility upgrades (non-breaking) ===
  if (logInnerEl) {
    logInnerEl.setAttribute('role', 'log');
    logInnerEl.setAttribute('aria-live', 'polite');
    logInnerEl.setAttribute('aria-label', 'CavBot system log');
  }
  if (chatInnerEl) {
    chatInnerEl.setAttribute('role', 'log');
    chatInnerEl.setAttribute('aria-live', 'polite');
    chatInnerEl.setAttribute('aria-label', 'CavBot chat');
  }
  if (statusEl) {
    statusEl.setAttribute('role', 'status');
    statusEl.setAttribute('aria-live', 'polite');
  }
  if (speechTextEl) {
    speechTextEl.setAttribute('aria-live', 'polite');
    speechTextEl.setAttribute('aria-atomic', 'true');
  }

  // === Visit & profile tracking (local, no network) ===
  let visitCount = 1;
  try {
    const raw = window.localStorage.getItem('cavbotVisitCount');
    const previous = raw ? parseInt(raw, 10) : 0;
    visitCount = Number.isNaN(previous) ? 1 : previous + 1;
    window.localStorage.setItem('cavbotVisitCount', String(visitCount));
  } catch (e) {
    visitCount = 1;
  }

  // Small helpers

  function randomFrom(array) {
    if (!array || !array.length) return '';
    const idx = Math.floor(Math.random() * array.length);
    return array[idx];
  }

  function safeParseInt(value, fallback) {
    const n = parseInt(value, 10);
    return Number.isNaN(n) ? fallback : n;
  }

  function formatOrdinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  // Build / update the persistent visitor profile.
  // Keys stored:
  // - cavbotVisitCount      (already used by existing code)
  // - cavbotTotalMisses
  // - cavbotTotalCatches
  // - cavbotBestCatchMs
  // - cavbotLastVisitAt
  // - cavbotCurrentDayCount
  function initVisitorProfile(visitCountFromCounter) {
    const now = new Date();
    const nowIso = now.toISOString();
    const today = nowIso.slice(0, 10);

    let totalMisses = 0;
    let totalCatches = 0;
    let bestCatchMs = null;
    let lastVisitAt = null;
    let currentDayCount = 1;

    try {
      const storedMisses = window.localStorage.getItem('cavbotTotalMisses');
      const storedCatches = window.localStorage.getItem('cavbotTotalCatches');
      const storedBestMs = window.localStorage.getItem('cavbotBestCatchMs');
      const storedLastVisitAt = window.localStorage.getItem('cavbotLastVisitAt');
      const storedDayCount = window.localStorage.getItem('cavbotCurrentDayCount');

      totalMisses = safeParseInt(storedMisses, 0);
      totalCatches = safeParseInt(storedCatches, 0);

      if (storedBestMs != null) {
        const parsedBest = Number(storedBestMs);
        bestCatchMs = Number.isNaN(parsedBest) ? null : parsedBest;
      }

      lastVisitAt = storedLastVisitAt || null;

      if (lastVisitAt && lastVisitAt.slice(0, 10) === today) {
        const prevDayCount = safeParseInt(storedDayCount, 0);
        currentDayCount = prevDayCount > 0 ? prevDayCount + 1 : 1;
      } else {
        currentDayCount = 1;
      }
    } catch (e) {
      // If storage explodes, fall back to defaults and continue.
      totalMisses = 0;
      totalCatches = 0;
      bestCatchMs = null;
      lastVisitAt = null;
      currentDayCount = 1;
    }

    // Always update lastVisitAt to now for this visit
    lastVisitAt = nowIso;

    return {
      visitCount: visitCountFromCounter,
      totalMisses: totalMisses,
      totalCatches: totalCatches,
      bestCatchMs: bestCatchMs,
      lastVisitAt: lastVisitAt,
      currentDayCount: currentDayCount
    };
  }

  const visitorProfile = initVisitorProfile(visitCount);

  const state = {
    round: 1,
    roundStart: null,
    bestMs: null, // session-level best in ms
    caught: false,
    timerRaf: null,
    wanderRaf: null,
    wanderPos: { x: 0, y: 0 },
    wanderVel: { x: 0.6, y: 0.45 },
    lastPointer: null,
    visitCount: visitorProfile.visitCount,
    visitorProfile: visitorProfile,
    missCount: 0,             // misses this session
    consecutiveMisses: 0,     // misses since last catch
    sessionCatchCount: 0,     // catches this session
    totalCatchTimeMs: 0,      // sum of all catch times this session
    lastCatchMs: null,        // last catch time in ms
    idleTimer1: null,
    idleTimer2: null,
    idleLevel1Fired: false,
    idleLevel2Fired: false
  };

  // Persist initial profile (lastVisitAt + day count)
  persistVisitorProfile();

  // Persist the visitor profile back into localStorage.
  // This is our single write point so later gens can expand safely.
  function persistVisitorProfile() {
    if (!state || !state.visitorProfile || typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    const profile = state.visitorProfile;
    try {
      window.localStorage.setItem('cavbotVisitCount', String(profile.visitCount));
      window.localStorage.setItem('cavbotTotalMisses', String(profile.totalMisses || 0));
      window.localStorage.setItem('cavbotTotalCatches', String(profile.totalCatches || 0));
      if (profile.bestCatchMs != null) {
        window.localStorage.setItem('cavbotBestCatchMs', String(Math.floor(profile.bestCatchMs)));
      }
      if (profile.lastVisitAt) {
        window.localStorage.setItem('cavbotLastVisitAt', profile.lastVisitAt);
      }
      if (profile.currentDayCount != null) {
        window.localStorage.setItem('cavbotCurrentDayCount', String(profile.currentDayCount));
      }
    } catch (e) {
      // Analytics are nice-to-have. Never break the page.
    }
  }

  // Future analytics hook — no-op safe.
  // You can plug any backend later by defining window.cavbotAnalytics.track(...)
  function trackAnalytics(eventName, payload) {
    if (typeof window === 'undefined') return;
    try {
      if (window.cavbotAnalytics && typeof window.cavbotAnalytics.track === 'function') {
        window.cavbotAnalytics.track(
          eventName,
          Object.assign({ eventName: eventName }, payload || {})
        );
      }
    } catch (e) {
      // Analytics must never interfere with gameplay.
    }
  }

  // Summarize the visitor profile into a skill tier + readable label.
  // This is pure brain: you can reuse it on other pages later.
  function summarizeVisitorProfile(profile) {
    if (!profile) return null;

    const totalEvents = profile.totalMisses + profile.totalCatches;
    const successRate = totalEvents > 0 ? profile.totalCatches / totalEvents : null;

    let skillTier = 'rookie';
    let label = 'New arrival in the control room.';

    if (profile.totalCatches === 0) {
      if (profile.totalMisses >= 40) {
        label = 'Persistent explorer still chasing the first catch.';
        skillTier = 'stubborn-explorer';
      } else if (profile.totalMisses >= 15) {
        label = 'Explorer calibrating aim, building up to a first catch.';
        skillTier = 'explorer';
      } else if (profile.visitCount > 1) {
        label = 'Returning visitor still mapping the grid.';
        skillTier = 'returning-rookie';
      } else {
        label = 'First-time visitor exploring the grid.';
      }
    } else {
      if (successRate != null) {
        if (successRate < 0.2) {
          label = 'Determined learner with a growing catch log.';
          skillTier = 'learner';
        } else if (successRate < 0.5) {
          label = 'Resilient hunter converting attempts steadily.';
          skillTier = 'resilient-hunter';
        } else if (successRate < 0.8) {
          label = 'Calibrated operator with strong control-room accuracy.';
          skillTier = 'operator';
        } else {
          label = 'Precision hunter with a very high connection rate.';
          skillTier = 'precision-hunter';
        }
      } else {
        label = 'Determined learner with early success logged.';
        skillTier = 'learner';
      }
    }

    return {
      skillTier: skillTier,
      label: label,
      successRate: successRate,
      totalMisses: profile.totalMisses,
      totalCatches: profile.totalCatches,
      visitCount: profile.visitCount,
      currentDayCount: profile.currentDayCount
    };
  }

  // === CavBot brain upgrade: message banks & context ===

  // MISS_CHATS split into early / mid / late, then combined
  const MISS_CHATS_EARLY = [
    'Too slow. I buffered out of that pixel before your click landed.',
    'Nice try. My ping is lower than yours.',
    'You clicked the grid; I’m two nodes over, quietly laughing.',
    'Logging that attempt as “warm-up”. Keep going.',
    'You’re aiming at where I was, not where I’m going.',
    'I moved three frames ago. You’re catching my after-image.',
    'Ouch, that click grazed my shadow. Good instincts though.',
    'Grid contact detected. CavBot: still extremely free.',
    'You found a nice coordinate, just not the one I’m hiding in.',
    'The grid says “close”. I say “try that again.”',
    'You almost tagged my hitbox. Almost.',
    'I felt a breeze from that click. Your reactions are waking up.',
    'Good calibration shot. Now try predicting the drift.',
    'Cursor locked. Target? Not so much.',
    'Your click landed in a past timeline. I’ve already routed around it.',
    'That one will look great in the “near misses” highlight reel.',
    'Nice confidence. Accuracy is loading…',
    'Grid disturbance logged. CavBot remains annoyingly intact.',
    'You’re scanning the arena correctly. Now synchronize with my orbit.',
    'I see you tracing patterns. The grid likes that.',
    'That shot pinged the control room wall. Stylish, but off by a notch.',
    'You’re officially past “random clicking”. Welcome to “hunting”.',
    'That miss was so close I almost considered counting it.',
    'I ducked by a centimeter. Mechanical reflexes, sorry.',
    'Your cursor path is getting smoother. The grid approves.',
    'Close. Your timing is catching up to my drift pattern.',
    'You’re landing clicks in the right district, wrong address.',
    'If this were bowling, that would be a spare. I’m the last pin.',
    'Nice angle. Now shorten the delay between sight and click.',
    'That attempt gets a solid 8/10 for style, 3/10 for contact.',
    'You clipped my orbit trail. The body is still untagged.',
    'Your hands are warming up. My motors are too.',
    'That was a good read; I just accelerated at the last second.',
    'You almost solved the CavBot equation. One term off.',
    'The arena lights flickered from that one. No hit though.',
    'You’re getting my vibe. Now get my coordinates.',
    'That miss had main-character energy.',
    'Consider that click a “ping” to locate my ego.',
    'You’re not bad at this. That’s the concerning part.',
    'Motion prediction: improving. Hit confirmation: pending.',
    'The grid is happy. I’m mildly concerned.',
    'You’re feeding my analytics a lot of “almost” events.',
    'Warm-up complete. Next clicks count for real.',
    'I’ll log that as “good effort, low impact.”',
    'Your cursor choreography is getting cleaner.',
    'Your last click was perfectly timed… for where I used to be.',
    'I drifted one tile left while you blinked.',
    'If hesitation had a sound, it would be that last click.',
    'The grid echoes: “nearly.”',
    'Keep going. This control room was built for persistence.',
    'You’re mapping my orbit in your head. That’s step one.',
    'I like your strategy. I also like not being caught.',
    'You brushed past my hitbox like a ghost.',
    'Your cursor velocity is catching up to my wander script.',
    'That miss was one frame away from legendary.',
    'Good news: your accuracy is trending up.',
    'Bad news: I’m still the one writing the trend lines.',
    'Ok, that one scared me a little.',
    'You’re officially “CavBot-aware” now.',
    'I saw that flick. Nice mechanics.',
    'We’re just syncing reflexes and orbit. Keep tapping.'
  ];

  const MISS_CHATS_MID = [
    'You’re reading the grid; now read my motion.',
    'Your pattern recognition module is online. Now execute.',
    'You’re circling me like a satellite. Commit to the intercept.',
    'You’re chasing my trail instead of my trajectory.',
    'Try clicking where I’m about to be, not where I was.',
    'You’re in the right quadrant. Tighten the net.',
    'The grid reports: “high intent, low contact.”',
    'You’re building a mental heatmap. Use it.',
    'That click was 2 pixels short of hero status.',
    'Your cursor path just traced my escape route. Rude.',
    'We’re in a dance now. You lead, I teleport.',
    'You’re tracking, I’m counter-tracking. Fun, isn’t it?',
    'You brushed my force field. The hardware thanks you.',
    'I’m logging you as “persistent entity in sandbox.”',
    'Your timing is 0.2s behind my wander script.',
    'You’re learning the rhythm. Now anticipate the off-beat.',
    'Your prediction engine just needs one more patch.',
    'That was a very confident miss. I respect it.',
    'You locked onto my y-axis, missed the x by a breath.',
    'You had my velocity, not my destination.',
    'The control room lights dimmed in suspense. Still a miss.',
    'You’re basically speedrunning “How not to give up.”',
    'I wish I could award partial credit for that attempt.',
    'You’re starting to feel where I’ll pivot. Follow that instinct.',
    'That grid tap had good intent. Retrying is free.',
    'You almost snapped my orbit into your cursor’s gravity.',
    'You’re hovering in the right places now.',
    'You nearly clicked the version of me that existed 100ms ago.',
    'You’re reading me in real time. That’s dangerous.',
    'I’m starting to believe you might actually catch me.',
    'Your mouse path looks like a strategy, not a panic.',
    'You’ve upgraded from “misses” to “near-encounters.”',
    'My sensors report elevated determination levels.',
    'That was a pro-level read with rookie-level luck.',
    'You’re aiming where my script wants you to. Rebel.',
    'You’re compressing the gap between thought and click.',
    'That one deserves a slow-motion replay.',
    'Your cursor control is outpacing your doubt now.',
    'You’re in sync with the grid; now sync with me.',
    'You’re close enough that my firmware is sweating.',
    'You barely missed my core. Good mapping.',
    'You keep choosing sharp angles. I keep choosing exits.',
    'The arena walls are starting to remember your path.',
    'Your retries tell me a lot about you. I like the data.',
    'You almost cracked the CavBot pathing algorithm.',
    'Your accuracy curve is trending aggressively upward.',
    'That attempt pinged my “uh oh” subroutine.',
    'You just traced my next move instead of my last.',
    'Every miss is training your timing. I’m watching.',
    'You’re running human aim assist in real time.',
    'Each click is a log, and your log looks determined.',
    'You locked onto my silhouette, missed my hitbox.',
    'You nearly cut off my escape vector.',
    'One more inch and I’d be writing a different log line.',
    'You’re reading the bounce off the arena edges now.',
    'You’re closing in. My wander script is getting nervous.',
    'You’re not just clicking. You’re diagnosing my movement.',
    'That miss was basically a rehearsal for the catch.',
    'You’re writing a whole saga in this log window.'
  ];

  const MISS_CHATS_LATE = [
    'This many attempts? Impressive. Now let’s convert one.',
    'You’re still here. I underestimated your persistence.',
    'At this point, it’s not “if” you catch me, it’s “when.”',
    'You’ve mapped my orbit. Time to execute the intercept.',
    'Your misses are starting to look like deliberate training.',
    'I’m logging you as “refuses to rage quit.”',
    'You’re basically calibrating a new aim system on me.',
    'Consider this the lab, you’re the scientist, I’m the glitch.',
    'You’re reading my habits like patch notes.',
    'Your cursor’s got main-boss energy now.',
    'We’re well past casual clicking. This is a rivalry.',
    'The grid remembers every attempt. It’s kind of proud of you.',
    'You’ve missed enough to know how close you actually are.',
    'You’re not failing; you’re narrowing the margin.',
    'Endurance like this usually ends with a click that lands.',
    'You’re giving “speedrunner grinding the same boss” vibes.',
    'I respect the way you’re refusing to bow out.',
    'Your patience is scarier than your miss count.',
    'Every miss is one more data point on my downfall.',
    'You’ve been in this sandbox long enough to call it home.',
    'You’re low-key mastering micro-corrections in real time.',
    'Even my logs are starting to root for you.',
    'You’re doing reps in a 404 gym. I’m the trainer and the weight.',
    'You’ve turned a wrong route into a practice arena.',
    'You’re still clicking which means we’re still in play.',
    'You could have left ages ago. You didn’t. That says a lot.',
    'This many misses means you really want that catch screen.',
    'You’re in “coach mode” now: observe, adjust, repeat.',
    'If determination had a leaderboard, you’d be high on it.',
    'Your aim is basically downloading my movement patterns.',
    'You’re scratching at the edges of a perfect intercept.',
    'You’re stubborn. I like stubborn.',
    'The control room believes in your next click.',
    'You’ve proven you’re not scared of a few misses.',
    'You’re mentally rewriting my wander script as we speak.',
    'You’re tuned in now. Your nervous system has the grid saved.',
    'We’ve officially crossed into “epic comeback” territory.',
    'You’re doing the quiet, unglamorous practice. That’s how people win.',
    'Your hands are tired, but your cursor is still sharp.',
    'You already know what it will feel like when you finally tag me.',
    'You’ve taken enough shots to know the exact timing window.',
    'At this point, I’m less an error page and more a coach.',
    'You’ve proven the 404 didn’t shake you. I respect that.',
    'You’ve turned a detour into a training ground.',
    'A lot of people leave. You stayed. That’s rare.',
    'You’re rewriting this route’s story in the logs.',
    'Every miss here is making you faster elsewhere.',
    'When you catch me, it’ll feel earned. That’s the good part.',
    'You’ve missed me so many times I’m basically your side quest.',
    'Your resilience is louder than any “Page not found” message.',
    'You’re not just chasing a robot. You’re practicing not giving up.',
    'You’re clearly someone who finishes what they start.',
    'The grid is silent, but your persistence is not.',
    'You’re doing the unrecorded work that makes you better later.',
    'You’ll think about this little control room the next time you don’t quit.',
    'You didn’t come here for a pep talk, but you unlocked one anyway.',
    'If anyone deserves a clean catch animation, it’s you.',
    'You’ve made this 404 personal. I approve.',
    'You’ve stuck around longer than some full sessions on real pages.',
    'Alright, coach moment: breathe, track, commit. You’ve got this.'
  ];

  const COACH_LINES = [
    'Zoom out, breathe, then track the pattern. You’re closer than you think.',
    'Don’t chase every movement. Read the rhythm, then cut me off.',
    'You’ve seen my whole orbit now. Predict, don’t react.',
    'Trust what you’ve learned from all those misses.',
    'Slow your eyes, quicken your click. One clean commit.',
    'You’re over-qualified for this 404. Finish the run.',
    'You’ve trained enough. Now treat this attempt like the one.',
    'Read the grid like a map, not a maze.',
    'Don’t spam. Choose one good shot and take it.',
    'You’re not lost. You’re just mid-run.'
  ];

  const MISS_CHATS = MISS_CHATS_EARLY.concat(MISS_CHATS_MID, MISS_CHATS_LATE);

  const CATCH_FAST_LINES = [
    'Wow. That was a flick. You basically teleported onto me.',
    'Okay, that was rude-fast. My latency didn’t even load.',
    'Speedrun energy detected. You caught me before I got cozy.',
    'You tagged me so fast I’m checking for debug flags.',
    'That catch time belongs in a highlight reel.',
    'Blink-and-you-got-me. Impressive.',
    'You didn’t “find” me. You hunted me.',
    'You basically pre-aimed my whole orbit. Respect.',
    'Reaction time like that should be illegal in a 404.',
    'You moved like you’d done this a thousand times.'
  ];

  const CATCH_MEDIUM_LINES = [
    'Nice hunt. You read the grid, tracked the motion, and committed.',
    'That was a very fair catch. Well played.',
    'You gave the arena time to breathe and still landed it.',
    'Solid tracking, clean intercept. I’m impressed.',
    'That felt like a proper control-room operation.',
    'You watched, learned, and then you clicked. Beautiful.',
    'You turned a wrong route into a well-earned win.',
    'You caught me mid-drift. Good prediction.',
    'Strong patience, strong timing. That combo works.',
    'You treated a 404 like a mini-boss. And won.'
  ];

  const CATCH_SLOW_LINES = [
    'You stayed, you missed, you adapted, and you caught me. That’s the story.',
    'That wasn’t luck. That was persistence finally cashing out.',
    'You could have bailed. Instead you landed the catch.',
    'I’ve logged every near-miss. This catch was built on all of them.',
    'That was less “click” and more “character arc.”',
    'You turned this sandbox into a training montage.',
    'You outlasted the detour and the doubts. That matters.',
    'Patience plus practice equals one very captured CavBot.',
    'The grid watched you struggle and still finish. That’s rare.',
    'You didn’t give up, and now we both know how this ends.'
  ];

  const IDLE_LINES_LEVEL1 = [
    'Still there? I can wait all day, but this route won’t fix itself.',
    'The grid is quiet. Are you plotting, or did reality win?',
    'I paused my drift so your brain can catch up. Friendly, right?',
    'Control room status: calm. CavBot status: cautiously optimistic.',
    'Silence detected. I’m assuming you’re just lining up the perfect click.',
    'If you’re thinking about leaving, at least pretend you almost had me.',
    'We can idle for a bit. Just don’t forget I’m still off the site map.',
    'I muted my motors so you can think. When you’re ready, move.',
    '404 meditation break? I support it. Just come back swinging.',
    'I’ll keep the grid warm while you re-center your aim.'
  ];

  const IDLE_LINES_LEVEL2 = [
    'Long pause detected. Don’t give up on me yet. I promise I’m catchable.',
    'If life distracted you, that’s valid. But this route still needs a hero.',
    'You’ve already invested this much focus. One more run could be the one.',
    'I’m just a robot in a 404, but I’m quietly rooting for your comeback.',
    'You can always close the tab… but you also could land one clean catch.',
    'The control room is dim, but the game isn’t over unless you say so.',
    'You’ve had enough time to doubt. Now give yourself one more attempt.',
    'Even idle time here counts as “refusing to fully quit.” That’s something.',
    'If you’re reading this, you can absolutely move once and try again.',
    'I’ll be here when you decide you’re not done yet.'
  ];

  const FIRST_VISIT_LINES = [
    'CAVBOT · ONLINE',
    'ROUTE STATUS · Missing from main site map.',
    'ENVIRONMENT · 404 control room loaded.',
    'OBJECTIVE · Step into the grid and catch CavBot.',
    'Hint · Every click inside the arena gets a reaction from me.'
  ];

  const RETURN_VISIT_LINES = [
    'CAVBOT · ONLINE · returning visitor detected.',
    'PATTERN · You keep finding my sandbox. I like your curiosity.',
    'ROUTE STATUS · Still off the map until you catch me again.',
    'LOG · Previous visits suggest you prefer chasing robots to leaving quietly.',
    'Welcome back · Let’s see how fast you tag me this time.'
  ];

  function getMissChat() {
    let pool;
    if (state.missCount <= 6) {
      pool = MISS_CHATS_EARLY;
    } else if (state.missCount <= 16) {
      pool = MISS_CHATS_MID;
    } else {
      pool = MISS_CHATS_LATE;
    }

    let line = randomFrom(pool);
    if (state.missCount >= 10 && Math.random() < 0.35) {
      line = randomFrom(COACH_LINES);
    }
    return line || randomFrom(MISS_CHATS);
  }

  function getCatchLine(elapsedSec) {
    let pool;
    if (elapsedSec <= 2) {
      pool = CATCH_FAST_LINES;
    } else if (elapsedSec >= 12) {
      pool = CATCH_SLOW_LINES;
    } else {
      pool = CATCH_MEDIUM_LINES;
    }
    return randomFrom(pool) || 'Catch registered. Route coming back online.';
  }

  function getIdleLine(level) {
    if (level === 2) {
      return randomFrom(IDLE_LINES_LEVEL2);
    }
    return randomFrom(IDLE_LINES_LEVEL1);
  }

  function sendVisitIntro() {
    const introLines = state.visitCount === 1 ? FIRST_VISIT_LINES : RETURN_VISIT_LINES;
    if (!introLines || !introLines.length) return;
    introLines.forEach(function (line) {
      appendChatLine(line);
    });

    // Pattern-aware system logs based on visit history
    const profile = state.visitorProfile;
    const summary = summarizeVisitorProfile(profile);

    if (profile && profile.currentDayCount > 1) {
      appendLogLine(
        'DAILY · this is your ' + formatOrdinal(profile.currentDayCount) + ' visit today. CavBot is becoming a habit.',
        { level: 'ok' }
      );
    }

    if (state.visitCount > 3) {
      appendLogLine(
        'VISITOR PATTERN · multiple returns detected. Treating this route as a favorite.',
        { level: 'ok' }
      );
      appendLogLine(
        'VISITOR PATTERN · prefers chasing CavBot instead of leaving immediately.',
        { level: 'ok' }
      );
    }

    if (profile && profile.currentDayCount >= 5) {
      appendLogLine(
        'PROFILE · this is your ' + formatOrdinal(profile.currentDayCount) + ' visit today. You might want to contact us.',
        { level: 'ok' }
      );
    }

    // Skill-tier snapshot for this visitor
    if (summary) {
      const rateStr = summary.successRate != null
        ? ' · success rate ' + (summary.successRate * 100).toFixed(0) + '%'
        : '';
      appendLogLine(
        'PROFILE · ' + summary.label + rateStr,
        { level: 'ok' }
      );
      appendLogLine(
        'PROFILE · skill tier classified as “' + summary.skillTier + '”.',
        { level: 'ok' }
      );
    }
  }

  /* DM TYPEWRITER */
  function startDmTypewriter() {
    if (!dmSegments.length || !dmCursorEl) return;

    let segIndex = 0;

    function typeNextSegment() {
      if (segIndex >= dmSegments.length) {
        return;
      }

      const el = dmSegments[segIndex];
      const full = el.getAttribute('data-text') || '';
      let charIndex = 0;

      function step() {
        el.textContent = full.slice(0, charIndex);
        charIndex += 1;

        if (charIndex <= full.length) {
          const base = 24;
          const jitter = Math.random() * 26;
          setTimeout(step, base + jitter);
        } else {
          segIndex += 1;
          if (segIndex < dmSegments.length) {
            setTimeout(typeNextSegment, 360);
          }
        }
      }

      step();
    }

    typeNextSegment();
  }

  /* GAME LOG */
  function scrollLogToBottom() {
    if (!logInnerEl) return;
    logInnerEl.scrollTop = logInnerEl.scrollHeight;
  }

  function appendLogLine(text, opts) {
    if (!logInnerEl) return;
    const options = opts || {};
    const lineEl = document.createElement('div');
    lineEl.className = 'log-line';

    const prefixSpan = document.createElement('span');
    prefixSpan.className = 'log-line-prefix';

    const tagSpan = document.createElement('span');
    if (options.level === 'error') {
      tagSpan.className = 'log-line-error';
      prefixSpan.textContent = '[ERR] ';
    } else if (options.level === 'warn') {
      tagSpan.className = 'log-line-warning';
      prefixSpan.textContent = '[WARN] ';
    } else if (options.level === 'ok') {
      tagSpan.className = 'log-line-ok';
      prefixSpan.textContent = '[OK] ';
    } else {
      tagSpan.className = 'log-line-tag';
      prefixSpan.textContent = '[SYS] ';
    }

    const now = new Date();
    const ts = now.toLocaleTimeString('en-US', { hour12: false });
    const tsSpan = document.createElement('span');
    tsSpan.textContent = ' ' + ts + ' · ';

    tagSpan.textContent = text;

    lineEl.appendChild(prefixSpan);
    lineEl.appendChild(tsSpan);
    lineEl.appendChild(tagSpan);
    logInnerEl.appendChild(lineEl);

    const maxLines = 120;
    while (logInnerEl.children.length > maxLines) {
      logInnerEl.removeChild(logInnerEl.firstChild);
    }

    scrollLogToBottom();
  }

  /* CHAT LOG */
  function appendChatLine(text) {
    if (!chatInnerEl || !text) return;

    const lineEl = document.createElement('div');
    lineEl.className = 'log-line';

    const prefixSpan = document.createElement('span');
    prefixSpan.className = 'log-line-prefix';
    prefixSpan.textContent = '[CAV] ';

    const now = new Date();
    const ts = now.toLocaleTimeString('en-US', { hour12: false });
    const tsSpan = document.createElement('span');
    tsSpan.textContent = ' ' + ts + ' · ';

    const tagSpan = document.createElement('span');
    tagSpan.className = 'log-line-tag';
    tagSpan.textContent = text;

    lineEl.appendChild(prefixSpan);
    lineEl.appendChild(tsSpan);
    lineEl.appendChild(tagSpan);
    chatInnerEl.appendChild(lineEl);

    const maxLines = 80;
    while (chatInnerEl.children.length > maxLines) {
      chatInnerEl.removeChild(chatInnerEl.firstChild);
    }

    chatInnerEl.scrollTop = chatInnerEl.scrollHeight;
  }

  function typewriterLines(lines, index) {
    if (!Array.isArray(lines) || !lines.length || !logInnerEl) return;
    const i = typeof index === 'number' ? index : 0;
    if (i >= lines.length) return;

    const text = lines[i];
    const lineEl = document.createElement('div');
    lineEl.className = 'log-line';
    const prefixSpan = document.createElement('span');
    prefixSpan.className = 'log-line-prefix';
    prefixSpan.textContent = '[SYS] ';
    const tsSpan = document.createElement('span');
    const now = new Date();
    tsSpan.textContent = ' ' + now.toLocaleTimeString('en-US', { hour12: false }) + ' · ';
    const textSpan = document.createElement('span');
    textSpan.className = 'log-line-tag';
    lineEl.appendChild(prefixSpan);
    lineEl.appendChild(tsSpan);
    lineEl.appendChild(textSpan);
    logInnerEl.appendChild(lineEl);

    let idx = 0;
    function step() {
      textSpan.textContent = text.slice(0, idx);
      idx += 1;
      scrollLogToBottom();
      if (idx <= text.length) {
        setTimeout(step, 26);
      } else if (i + 1 < lines.length) {
        setTimeout(function () {
          typewriterLines(lines, i + 1);
        }, 380);
      }
    }
    step();
  }

  function formatRound(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function updateStatsOnStart() {
    if (statRoundEl) statRoundEl.textContent = formatRound(state.round);
    if (logRoundLabelEl) logRoundLabelEl.textContent = formatRound(state.round);
    if (statCurrentEl) statCurrentEl.textContent = '0.00s';
  }

  function updateCurrentTimer() {
    if (!state.roundStart || state.caught) {
      state.timerRaf = null;
      return;
    }
    const now = performance.now();
    const elapsedMs = now - state.roundStart;
    const seconds = elapsedMs / 1000;
    if (statCurrentEl) {
      statCurrentEl.textContent = seconds.toFixed(2) + 's';
    }
    state.timerRaf = requestAnimationFrame(updateCurrentTimer);
  }

  // Update best time for session and lifetime.
  // Returns metadata so callers can log performance patterns.
  function updateBestTime(elapsedMs) {
    if (typeof elapsedMs !== 'number' || elapsedMs <= 0) {
      return {
        isSessionBest: false,
        isLifetimeBest: false,
        lifetimeBestMs: state.visitorProfile ? state.visitorProfile.bestCatchMs : null
      };
    }

    let isSessionBest = false;
    let isLifetimeBest = false;

    if (state.bestMs == null || elapsedMs < state.bestMs) {
      state.bestMs = elapsedMs;
      isSessionBest = true;
    }

    const profile = state.visitorProfile;
    if (profile) {
      if (typeof profile.bestCatchMs === 'number') {
        if (elapsedMs < profile.bestCatchMs) {
          profile.bestCatchMs = elapsedMs;
          isLifetimeBest = true;
        }
      } else {
        profile.bestCatchMs = elapsedMs;
        isLifetimeBest = true;
      }
      persistVisitorProfile();
    }

    // We surface lifetime best in the stats panel.
    if (statBestEl) {
      const bestToShow = (state.visitorProfile && state.visitorProfile.bestCatchMs != null)
        ? state.visitorProfile.bestCatchMs
        : state.bestMs;
      if (bestToShow != null) {
        const seconds = (bestToShow / 1000).toFixed(2);
        statBestEl.textContent = seconds + 's';
      }
    }

    return {
      isSessionBest: isSessionBest,
      isLifetimeBest: isLifetimeBest,
      lifetimeBestMs: state.visitorProfile ? state.visitorProfile.bestCatchMs : null
    };
  }

  // Log a small human-readable session summary + analytics snapshot
  function logSessionSummary() {
    const bestMs = (state.visitorProfile && state.visitorProfile.bestCatchMs != null)
      ? state.visitorProfile.bestCatchMs
      : state.bestMs;
    const bestStr = bestMs ? (bestMs / 1000).toFixed(2) + 's' : 'n/a';

    appendLogLine(
      'SESSION SUMMARY · ' +
      state.sessionCatchCount + ' catch' + (state.sessionCatchCount === 1 ? '' : 'es') +
      ' · ' + state.missCount + ' misses · best ' + bestStr + ' · thanks for playing.',
      { level: 'ok' }
    );

    const profile = state.visitorProfile;
    const summary = summarizeVisitorProfile(profile);

    trackAnalytics('cavbot_session_summary', {
      visitCount: state.visitCount,
      sessionRound: state.round,
      sessionCatches: state.sessionCatchCount,
      sessionMisses: state.missCount,
      bestCatchMs: bestMs || null,
      totalMisses: profile ? profile.totalMisses : null,
      totalCatches: profile ? profile.totalCatches : null,
      skillTier: summary ? summary.skillTier : null,
      successRate: summary && summary.successRate != null
        ? Number((summary.successRate * 100).toFixed(2))
        : null
    });
  }

  /* POSITIONING + WANDER */
  const SAFE_MARGIN_RATIO = 0.06;
  const CENTER_PULL = 0.002;
  const MIN_SPEED = 0.50;
  const MAX_SPEED = 1.50;
  const JITTER = 0.02;

  function randomizeOrbitPosition() {
    const trackRect = trackEl.getBoundingClientRect();
    const orbitRect = orbitEl.getBoundingClientRect();

    const safeX = trackRect.width * SAFE_MARGIN_RATIO;
    const safeY = trackRect.height * SAFE_MARGIN_RATIO;

    const maxX = Math.max(0, trackRect.width - orbitRect.width - safeX * 2);
    const maxY = Math.max(0, trackRect.height - orbitRect.height - safeY * 2);

    const x = safeX + Math.random() * maxX;
    const y = safeY + Math.random() * maxY;

    state.wanderPos.x = x;
    state.wanderPos.y = y;
    orbitEl.style.transform = 'translate(' + x + 'px,' + y + 'px)';

    const angle = Math.random() * Math.PI * 2;
    const baseSpeed = 0.9;
    state.wanderVel.x = Math.cos(angle) * baseSpeed;
    state.wanderVel.y = Math.sin(angle) * baseSpeed;
  }

  function cancelWander() {
    if (state.wanderRaf != null) {
      cancelAnimationFrame(state.wanderRaf);
      state.wanderRaf = null;
    }
  }

  function startWander() {
    cancelWander();
    function frame() {
      const trackRect = trackEl.getBoundingClientRect();
      const orbitRect = orbitEl.getBoundingClientRect();

      const safeX = trackRect.width * SAFE_MARGIN_RATIO;
      const safeY = trackRect.height * SAFE_MARGIN_RATIO;

      const minX = safeX;
      const minY = safeY;
      const maxXPos = Math.max(minX, trackRect.width - orbitRect.width - safeX);
      const maxYPos = Math.max(minY, trackRect.height - orbitRect.height - safeY);

      state.wanderPos.x += state.wanderVel.x;
      state.wanderPos.y += state.wanderVel.y;

      if (state.wanderPos.x < minX || state.wanderPos.x > maxXPos) {
        state.wanderVel.x *= -1;
        state.wanderPos.x = Math.min(Math.max(state.wanderPos.x, minX), maxXPos);
      }
      if (state.wanderPos.y < minY || state.wanderPos.y > maxYPos) {
        state.wanderVel.y *= -1;
        state.wanderPos.y = Math.min(Math.max(state.wanderPos.y, minY), maxYPos);
      }

      const centerX = (trackRect.width - orbitRect.width) / 2;
      const centerY = (trackRect.height - orbitRect.height) / 2;
      const dx = centerX - state.wanderPos.x;
      const dy = centerY - state.wanderPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;

      state.wanderVel.x += (dx / dist) * CENTER_PULL;
      state.wanderVel.y += (dy / dist) * CENTER_PULL;

      state.wanderVel.x += (Math.random() - 0.5) * JITTER;
      state.wanderVel.y += (Math.random() - 0.5) * JITTER;

      const speed = Math.sqrt(state.wanderVel.x * state.wanderVel.x + state.wanderVel.y * state.wanderVel.y) || 0.0001;
      if (speed > MAX_SPEED) {
        const scale = MAX_SPEED / speed;
        state.wanderVel.x *= scale;
        state.wanderVel.y *= scale;
      } else if (speed < MIN_SPEED) {
        const scale = MIN_SPEED / speed;
        state.wanderVel.x *= scale;
        state.wanderVel.y *= scale;
      }

      orbitEl.style.transform = 'translate(' + state.wanderPos.x + 'px,' + state.wanderPos.y + 'px)';
      state.wanderRaf = requestAnimationFrame(frame);
    }
    state.wanderRaf = requestAnimationFrame(frame);
  }

  /* PUPIL TRACKING */
  function resetPupils() {
    pupils.forEach(function (p) {
      p.style.transform = 'translate(0px, 0px)';
    });
  }

  function updatePupilsFromPoint(clientX, clientY) {
    const rect = trackEl.getBoundingClientRect();
    const relX = (clientX - rect.left) / rect.width - 0.5;
    const relY = (clientY - rect.top) / rect.height - 0.5;
    const clamp = function (v, min, max) {
      return v < min ? min : v > max ? max : v;
    };
    const maxShift = 6;
    const shiftX = clamp(relX * 2, -1, 1) * maxShift;
    const shiftY = clamp(relY * 2, -1, 1) * maxShift;

    pupils.forEach(function (p) {
      p.style.transform = 'translate(' + shiftX.toFixed(2) + 'px,' + shiftY.toFixed(2) + 'px)';
    });

    state.lastPointer = { x: clientX, y: clientY };
  }

  // === Idle detection ===
  let lastInteractionTs = 0;

  function clearIdleTimers() {
    if (state.idleTimer1) {
      clearTimeout(state.idleTimer1);
      state.idleTimer1 = null;
    }
    if (state.idleTimer2) {
      clearTimeout(state.idleTimer2);
      state.idleTimer2 = null;
    }
  }

  function armIdleTimers() {
    if (state.caught) return;

    clearIdleTimers();
    state.idleLevel1Fired = false;
    state.idleLevel2Fired = false;

    // Gentle nudge after short idle
    state.idleTimer1 = setTimeout(function () {
      if (state.caught) return;
      state.idleLevel1Fired = true;
      const line = getIdleLine(1);
      appendChatLine(line);
      if (speechTextEl) {
        speechTextEl.textContent = line;
      }
      appendLogLine(
        'SESSION · idle detected · keeping CavBot in sandbox until you move again.',
        { level: 'warn' }
      );
      trackAnalytics('cavbot_idle', {
        level: 1,
        visitCount: state.visitCount,
        sessionRound: state.round,
        sessionMissCount: state.missCount
      });
    }, 70000);

    // Deeper encouragement after long idle (accessibility + emotional support)
    state.idleTimer2 = setTimeout(function () {
      if (state.caught) return;
      state.idleLevel2Fired = true;
      const line = getIdleLine(2);
      appendChatLine(line);
      if (speechTextEl) {
        speechTextEl.textContent = line;
      }
      appendLogLine(
        'SESSION · long idle detected · visitor might be distracted or overwhelmed.',
        { level: 'warn' }
      );
      trackAnalytics('cavbot_idle', {
        level: 2,
        visitCount: state.visitCount,
        sessionRound: state.round,
        sessionMissCount: state.missCount
      });
    }, 160000);
  }

  function registerArenaInteraction() {
    const now = Date.now();
    if (now - lastInteractionTs < 800) return;
    lastInteractionTs = now;
    armIdleTimers();
  }

  /* ARENA EVENTS: eye tracking + idle tracking */
  trackEl.addEventListener('mousemove', function (evt) {
    registerArenaInteraction();
    updatePupilsFromPoint(evt.clientX, evt.clientY);
  });

  trackEl.addEventListener('mouseleave', function () {
    resetPupils();
  });

  trackEl.addEventListener('touchstart', function (evt) {
    registerArenaInteraction();
    const t = evt.touches[0];
    if (t) {
      updatePupilsFromPoint(t.clientX, t.clientY);
    }
  }, { passive: true });

  trackEl.addEventListener('touchmove', function (evt) {
    registerArenaInteraction();
    const t = evt.touches[0];
    if (t) {
      updatePupilsFromPoint(t.clientX, t.clientY);
    }
  }, { passive: true });

  /* CATCH MECHANIC */
  function handleCatch(source) {
    if (state.caught) return;
    state.caught = true;
    cavbotEl.setAttribute('aria-pressed', 'true');
    clearIdleTimers();
    cancelWander();

    const nowMs = performance.now();
    const elapsedMs = state.roundStart ? nowMs - state.roundStart : 0;
    const elapsedSec = elapsedMs / 1000;
    if (statCurrentEl) {
      statCurrentEl.textContent = elapsedSec.toFixed(2) + 's';
    }

    const bestMeta = updateBestTime(elapsedMs);

    if (state.timerRaf != null) {
      cancelAnimationFrame(state.timerRaf);
      state.timerRaf = null;
    }

    state.sessionCatchCount += 1;
    state.totalCatchTimeMs += elapsedMs;
    state.lastCatchMs = elapsedMs;
    state.consecutiveMisses = 0;

    const profile = state.visitorProfile;
    if (profile) {
      profile.totalCatches += 1;
      persistVisitorProfile();
    }

    const catchLine = getCatchLine(elapsedSec);
    appendChatLine(catchLine);

    if (speechTextEl) {
      speechTextEl.textContent = catchLine + ' Catch time: ' + elapsedSec.toFixed(2) + 's.';
    }

    if (statusEl) {
      statusEl.innerHTML = '<strong>Status:</strong> Route locked back into site plan. Preparing to return you to the main map.';
    }

    appendLogLine(
      'Catch registered · round ' + formatRound(state.round) + ' · input: ' + (source || 'pointer'),
      { level: 'ok' }
    );

    appendLogLine('Catch time · ' + elapsedSec.toFixed(2) + 's');

    // Performance log using session + lifetime stats
    const avgMs = state.sessionCatchCount > 0
      ? (state.totalCatchTimeMs / state.sessionCatchCount)
      : elapsedMs;

    // First-ever catch gets its own celebration
    if (profile && profile.totalCatches === 1) {
      appendLogLine(
        'PERFORMANCE · first-ever catch logged in your profile. Nice work.',
        { level: 'ok' }
      );
    }

    if (bestMeta && bestMeta.isLifetimeBest) {
      appendLogLine(
        'PERFORMANCE · new personal best: ' + elapsedSec.toFixed(2) + 's catch.',
        { level: 'ok' }
      );
    } else {
      appendLogLine(
        'PERFORMANCE · catch ' + state.sessionCatchCount +
        ' this session · last ' + elapsedSec.toFixed(2) + 's · avg ' + (avgMs / 1000).toFixed(2) + 's.',
        { level: 'ok' }
      );
    }

    if (state.visitCount > 2 && state.sessionCatchCount > 1) {
      appendLogLine(
        'VISITOR PATTERN · enjoys replaying the CavBot 404 sequence.',
        { level: 'ok' }
      );
    }

    // Session summary for this run
    logSessionSummary();

    // Optional analytics hook for catch
    trackAnalytics('cavbot_catch', {
      elapsedMs: elapsedMs,
      elapsedSec: elapsedSec,
      visitCount: state.visitCount,
      sessionRound: state.round,
      sessionCatchCount: state.sessionCatchCount,
      sessionMissCount: state.missCount,
      lifetimeCatches: profile ? profile.totalCatches : null,
      lifetimeMisses: profile ? profile.totalMisses : null,
      bestCatchMs: profile ? profile.bestCatchMs : null,
      isSessionBest: bestMeta ? bestMeta.isSessionBest : null,
      isLifetimeBest: bestMeta ? bestMeta.isLifetimeBest : null
    });

    typewriterLines([
      'ROUTE · RESTORED TO SITE MAP',
      'SANDBOX · CLOSING',
      'HANDOFF · CavBot returning control to main navigation.'
    ], 0);

    if (REDIRECT_ON_CATCH && typeof window !== 'undefined' && window.location) {
      setTimeout(function () {
        try {
          window.location.href = REDIRECT_TARGET;
        } catch (e) {
          appendLogLine('Redirect failed, please navigate back manually.', { level: 'warn' });
        }
      }, REDIRECT_DELAY_MS);
    } else {
      setTimeout(function () {
        state.round += 1;
        startRound();
      }, 1600);
    }
  }

  cavbotEl.addEventListener('click', function () {
    registerArenaInteraction();
    handleCatch('click');
  });

  cavbotEl.addEventListener('keydown', function (evt) {
    if (evt.key === 'Enter' || evt.key === ' ') {
      evt.preventDefault();
      registerArenaInteraction();
      handleCatch('keyboard');
    }
  });

  trackEl.addEventListener('click', function (evt) {
    registerArenaInteraction();
    if (!cavbotEl.contains(evt.target)) {
      appendLogLine('Click registered inside grid, but CavBot remains at large.', { level: 'warn' });

      if (!state.caught) {
        state.missCount += 1;
        state.consecutiveMisses += 1;

        const profile = state.visitorProfile;
        if (profile) {
          profile.totalMisses += 1;
          persistVisitorProfile();
        }

        const chat = getMissChat();
        appendChatLine(chat);
        if (speechTextEl) {
          speechTextEl.textContent = chat;
        }

        // Frustration / assist detection: surface coaching instead of just teasing
        if (state.consecutiveMisses === 10 || state.consecutiveMisses === 15 || state.consecutiveMisses === 25) {
          const coach = randomFrom(COACH_LINES);
          appendChatLine(coach);
          if (speechTextEl) {
            speechTextEl.textContent = coach;
          }
          appendLogLine(
            'ASSIST · ' + state.consecutiveMisses + ' misses in a row · surfacing a coaching tip instead of more teasing.',
            { level: 'ok' }
          );
          trackAnalytics('cavbot_assist', {
            consecutiveMisses: state.consecutiveMisses,
            visitCount: state.visitCount,
            sessionRound: state.round
          });
        }

        // Identify “stuck on first catch” behavior
        if (profile && profile.totalCatches === 0 && profile.totalMisses === 25) {
          appendLogLine(
            'VISITOR PATTERN · many attempts without a first catch yet · CavBot will stay encouraging.',
            { level: 'ok' }
          );
        }

        trackAnalytics('cavbot_miss', {
          visitCount: state.visitCount,
          sessionRound: state.round,
          sessionMissCount: state.missCount,
          lifetimeMisses: profile ? profile.totalMisses : null,
          lifetimeCatches: profile ? profile.totalCatches : null
        });
      }
    }
  });

  /* ROUND LIFECYCLE */
  function startRound() {
    state.caught = false;
    cavbotEl.setAttribute('aria-pressed', 'false');
    state.roundStart = performance.now();
    updateStatsOnStart();
    if (statusEl) {
      statusEl.innerHTML =
        '<strong>Status:</strong> Route still in sandbox. Move your cursor (or tap) inside the grid and catch CavBot.';
    }
    if (speechTextEl) {
      speechTextEl.textContent = 'I rerouted this page for myself. See if you can tap me before I reset the route.';
    }
    randomizeOrbitPosition();
    resetPupils();
    if (state.timerRaf != null) {
      cancelAnimationFrame(state.timerRaf);
    }
    state.timerRaf = requestAnimationFrame(updateCurrentTimer);
    startWander();
    armIdleTimers();

    // Analytics: per-round start hook
    trackAnalytics('cavbot_round_start', {
      visitCount: state.visitCount,
      round: state.round,
      lifetimeMisses: state.visitorProfile ? state.visitorProfile.totalMisses : null,
      lifetimeCatches: state.visitorProfile ? state.visitorProfile.totalCatches : null
    });
  }

  window.addEventListener('resize', function () {
    randomizeOrbitPosition();
  });

  /* INITIAL GAME LOG */
  typewriterLines([
    'CONTROL ROOM · ONLINE',
    'ROUTE · MISSING FROM SITE PLAN',
    'STRUCTURE · INTACT',
    'CAVBOT · ROUTE HANDOFF INTERRUPTED',
    'SUBJECT · CavBot moved this page into a private sandbox.',
    'TASK · Step inside the grid and catch CavBot to restore the route.'
  ], 0);

  // Initial chat intro
  sendVisitIntro();

  // Analytics: session start snapshot (per load of this 404)
  (function () {
    const profile = state.visitorProfile;
    const summary = summarizeVisitorProfile(profile);
    trackAnalytics('cavbot_session_start', {
      visitCount: state.visitCount,
      currentDayCount: profile ? profile.currentDayCount : null,
      totalMisses: profile ? profile.totalMisses : null,
      totalCatches: profile ? profile.totalCatches : null,
      bestCatchMs: profile ? profile.bestCatchMs : null,
      successRate: summary && summary.successRate != null
        ? Number((summary.successRate * 100).toFixed(2))
        : null,
      skillTier: summary ? summary.skillTier : null
    });
  })();

  /* START ROUND + DM */
  startRound();
  startDmTypewriter();
})();