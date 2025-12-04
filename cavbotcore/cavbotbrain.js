// CavBot · CavCore Brain (Gen 1.0)
// Analytics + suggestion engine + site intelligence (no game logic)

(function () {
  'use strict';

  // ===== Shared Utilities & Analytics (no network) =====

  function randomFrom(array) {
    if (!array || !array.length) return '';
    const idx = Math.floor(Math.random() * array.length);
    return array[idx];
  }

  function safeParseJSON(raw, fallback) {
    if (!raw) return fallback;
    try {
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object') ? parsed : fallback;
    } catch (e) {
      return fallback;
    }
  }

  const ANALYTICS_KEY = 'cavbotMetrics';
  const VISIT_KEY = 'cavbotVisitCount';
  const SESSION_KEY = 'cavbotSessionId';
  const EVENT_LOG_KEY = 'cavbotEventLogV1';

  function createSessionId() {
    return 'sess-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function getOrCreateSessionId() {
    try {
      const existing = window.sessionStorage.getItem(SESSION_KEY);
      if (existing) return existing;
      const fresh = createSessionId();
      window.sessionStorage.setItem(SESSION_KEY, fresh);
      return fresh;
    } catch (e) {
      // sessionStorage not available, fall back to ephemeral id
      return createSessionId();
    }
  }

  // Device-level analytics snapshot (local only)
  const analytics = {
    visitCount: 1,
    lifetimeCatches: 0,
    lifetimeMisses: 0,
    lifetimeRounds: 0,
    bestMs: null,
    bestRuns: [], // [{ ms, at }]
    lastVisit: null
  };

  // Session-level info (per browser session / tab)
  const session = {
    id: getOrCreateSessionId(),
    startedAt: new Date().toISOString(),
    catches: 0,
    misses: 0,
    rounds: 0,
    bestMs: null
  };

  function persistAnalytics() {
    try {
      window.localStorage.setItem(ANALYTICS_KEY, JSON.stringify(analytics));
    } catch (e) {
      // storage not available, fail silently
    }
  }

  function persistEventLog(events) {
    try {
      window.localStorage.setItem(EVENT_LOG_KEY, JSON.stringify(events));
    } catch (e) {
      // ignore
    }
  }

  function forwardToGlobalAnalytics(eventName, payload) {
    try {
      if (
        window.cavbotAnalytics &&
        typeof window.cavbotAnalytics.track === 'function'
      ) {
        window.cavbotAnalytics.track(eventName, payload);
      }
    } catch (e) {
      // never let analytics break the game
    }
  }

  function trackEvent(eventName, payload) {
    const evt = {
      name: eventName,
      ts: Date.now(),
      sessionId: session.id,
      path: (typeof window !== 'undefined' && window.location)
        ? window.location.pathname + window.location.search
        : '',
      referrer: (typeof document !== 'undefined') ? (document.referrer || '') : '',
      payload: payload || {}
    };

    // In-memory queue for quick access
    if (!trackEvent.queue) {
      trackEvent.queue = [];
    }
    trackEvent.queue.push(evt);
    if (trackEvent.queue.length > 80) {
      trackEvent.queue.shift();
    }

    // Compact local event log (device-local only)
    try {
      const existing = safeParseJSON(
        window.localStorage.getItem(EVENT_LOG_KEY),
        []
      ) || [];
      existing.push(evt);
      while (existing.length > 120) {
        existing.shift();
      }
      persistEventLog(existing);
    } catch (e) {
      // ignore storage issues
    }

    // Forward to global analytics runtime when you wire your backend
    forwardToGlobalAnalytics(eventName, evt);
  }

  // ===== CavBot Site Intelligence · Suggestion Engine (SEO / A11y / UX / Perf / Engagement) =====

  const SUGGESTION_SEVERITY_WEIGHT = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
    note: 0
  };

  function clampNumber(value, min, max) {
    if (typeof value !== 'number' || isNaN(value)) return min;
    if (value < min) return min;
    if (value > max) return max;
    return value;
  }

  function coerceScore(value, fallback) {
    if (typeof value === 'number' && !isNaN(value)) {
      return clampNumber(value, 0, 100);
    }
    return fallback;
  }

  function pushSuggestion(list, spec) {
    if (!list) return;
    var suggestion = {
      id: spec.id || null,
      category: spec.category || 'seo',
      severity: spec.severity || 'medium',
      message: spec.message || '',
      hint: spec.hint || '',
      metric: spec.metric || null,
      scoreImpact: typeof spec.scoreImpact === 'number' ? spec.scoreImpact : 0,
      context: spec.context || null
    };
    list.push(suggestion);
  }

  // --- SEO suggestions (on-page + structure) ---

  function buildSeoSuggestions(diag) {
    const suggestions = [];
    if (!diag || typeof diag !== 'object') return suggestions;

    // Basic signals (your original base, upgraded to pushSuggestion)
    if (!diag.hasTitle) {
      pushSuggestion(suggestions, {
        id: 'missing_title',
        category: 'seo',
        severity: 'high',
        message: 'Add a clear, unique <title> tag for this page.',
        hint: 'Aim for 45–60 characters that naturally include your primary keyword and feel human to read.',
        metric: 'title',
        scoreImpact: 8
      });
    }

    if (typeof diag.titleLength === 'number' && diag.hasTitle) {
      if (diag.titleLength < 25) {
        pushSuggestion(suggestions, {
          id: 'short_title',
          category: 'seo',
          severity: 'medium',
          message: 'Title is very short.',
          hint: 'Give search engines and users more context; aim for a descriptive, compelling title, not just 1–2 words.',
          metric: 'titleLength',
          scoreImpact: 3
        });
      } else if (diag.titleLength > 65) {
        pushSuggestion(suggestions, {
          id: 'long_title',
          category: 'seo',
          severity: 'medium',
          message: 'Title is likely to be truncated in search results.',
          hint: 'Keep titles within roughly 45–65 characters so the most important part remains visible.',
          metric: 'titleLength',
          scoreImpact: 3
        });
      }
    }

    if (!diag.hasMetaDescription) {
      pushSuggestion(suggestions, {
        id: 'missing_meta_description',
        category: 'seo',
        severity: 'high',
        message: 'Add a meta description.',
        hint: 'Write 140–160 characters that summarize the page and encourage clicks from search results.',
        metric: 'metaDescription',
        scoreImpact: 6
      });
    }

    if (typeof diag.metaDescriptionLength === 'number' && diag.hasMetaDescription) {
      if (diag.metaDescriptionLength < 80) {
        pushSuggestion(suggestions, {
          id: 'short_meta_description',
          category: 'seo',
          severity: 'medium',
          message: 'Meta description is quite short.',
          hint: 'Use the meta description to answer “Why should I click?” in 1–2 concise sentences.',
          metric: 'metaDescriptionLength',
          scoreImpact: 2
        });
      } else if (diag.metaDescriptionLength > 180) {
        pushSuggestion(suggestions, {
          id: 'long_meta_description',
          category: 'seo',
          severity: 'low',
          message: 'Meta description may be too long.',
          hint: 'Keep descriptions roughly in the 140–160 character range to avoid truncation.',
          metric: 'metaDescriptionLength',
          scoreImpact: 1
        });
      }
    }

    if (diag.indexable === false) {
      pushSuggestion(suggestions, {
        id: 'noindex',
        category: 'seo',
        severity: 'critical',
        message: 'This page is currently not indexable.',
        hint: 'Remove noindex from the robots meta or HTTP header if you want this page to appear in search.',
        metric: 'indexable',
        scoreImpact: 12
      });
    }

    if (diag.h1Count === 0) {
      pushSuggestion(suggestions, {
        id: 'missing_h1',
        category: 'seo',
        severity: 'medium',
        message: 'Add a primary H1 heading.',
        hint: 'Use a single H1 that clearly states the main topic of the page and matches search intent.',
        metric: 'h1Count',
        scoreImpact: 4
      });
    } else if (diag.h1Count > 1) {
      pushSuggestion(suggestions, {
        id: 'multiple_h1',
        category: 'seo',
        severity: 'medium',
        message: 'Multiple H1 headings detected.',
        hint: 'Limit each page to one H1 and use H2 / H3 to build a clear content hierarchy.',
        metric: 'h1Count',
        scoreImpact: 3
      });
    }

    if (typeof diag.wordCount === 'number' && diag.wordCount < 150) {
      pushSuggestion(suggestions, {
        id: 'thin_content',
        category: 'seo',
        severity: 'medium',
        message: 'Content is very thin.',
        hint: 'Expand the page with genuinely useful, descriptive content that answers the questions users bring.',
        metric: 'wordCount',
        scoreImpact: 4
      });
    }

    if (typeof diag.wordCount === 'number' && diag.wordCount >= 150 && diag.wordCount < 400) {
      pushSuggestion(suggestions, {
        id: 'light_content',
        category: 'seo',
        severity: 'low',
        message: 'Content is somewhat light.',
        hint: 'Consider adding a bit more depth—examples, FAQs, or supporting sections—to strengthen relevance.',
        metric: 'wordCount',
        scoreImpact: 2
      });
    }

    if (diag.imageCount > 0 && typeof diag.imagesMissingAlt === 'number') {
      const ratio = diag.imagesMissingAlt / diag.imageCount;
      if (ratio > 0.3) {
        pushSuggestion(suggestions, {
          id: 'missing_alt_text',
          category: 'seo',
          severity: 'medium',
          message: 'Many images are missing alt text.',
          hint: 'Add short, descriptive alt attributes so search engines and screen readers understand each image.',
          metric: 'imagesMissingAlt',
          scoreImpact: 4
        });
      }
    }

    if (!diag.hasViewport) {
      pushSuggestion(suggestions, {
        id: 'missing_viewport',
        category: 'seo',
        severity: 'medium',
        message: 'Missing responsive viewport meta tag.',
        hint: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to improve mobile experience and SEO.',
        metric: 'viewport',
        scoreImpact: 3
      });
    }

    if (!diag.hasLang) {
      pushSuggestion(suggestions, {
        id: 'missing_lang',
        category: 'accessibility',
        severity: 'low',
        message: 'Missing lang attribute on <html>.',
        hint: 'Add lang="en" or the correct language code to help screen readers and search engines interpret the page.',
        metric: 'htmlLang',
        scoreImpact: 2
      });
    }

    if (!diag.hasOg || !diag.hasTwitter) {
      pushSuggestion(suggestions, {
        id: 'social_tags',
        category: 'seo',
        severity: 'low',
        message: 'Social sharing tags are incomplete.',
        hint: 'Add Open Graph and Twitter meta tags so links to this page render strong, branded previews.',
        metric: 'socialMeta',
        scoreImpact: 2
      });
    }

    // Advanced SEO structure / technical

    if (diag.hasCanonical === false) {
      pushSuggestion(suggestions, {
        id: 'missing_canonical',
        category: 'seo',
        severity: 'medium',
        message: 'No canonical URL specified for this page.',
        hint: 'Add a <link rel="canonical"> pointing to the preferred URL to consolidate ranking signals.',
        metric: 'canonical',
        scoreImpact: 3
      });
    }

    if (diag.canonicalConflict === true) {
      pushSuggestion(suggestions, {
        id: 'canonical_conflict',
        category: 'seo',
        severity: 'high',
        message: 'Canonical URL may conflict with the requested URL.',
        hint: 'Verify that the canonical points to the correct version of this content and that you’re not self-cannibalizing rankings.',
        metric: 'canonical',
        scoreImpact: 6
      });
    }

    if (typeof diag.urlLength === 'number' && diag.urlLength > 120) {
      pushSuggestion(suggestions, {
        id: 'long_url',
        category: 'seo',
        severity: 'low',
        message: 'URL path is very long.',
        hint: 'Shorten the URL where possible to keep it readable and shareable while retaining important keywords.',
        metric: 'urlLength',
        scoreImpact: 2
      });
    }

    if (typeof diag.urlDepth === 'number' && diag.urlDepth > 4) {
      pushSuggestion(suggestions, {
        id: 'deep_url',
        category: 'seo',
        severity: 'low',
        message: 'This URL is deeply nested.',
        hint: 'Consider simplifying your directory depth for better crawlability and a clearer information architecture.',
        metric: 'urlDepth',
        scoreImpact: 2
      });
    }

    if (typeof diag.internalLinkCount === 'number' && diag.internalLinkCount < 3) {
      pushSuggestion(suggestions, {
        id: 'few_internal_links',
        category: 'seo',
        severity: 'medium',
        message: 'Very few internal links point to or from this page.',
        hint: 'Add contextual internal links so this page is woven into your site structure and easier for crawlers and users to reach.',
        metric: 'internalLinkCount',
        scoreImpact: 4
      });
    }

    if (typeof diag.brokenLinkCount === 'number' && diag.brokenLinkCount > 0) {
      pushSuggestion(suggestions, {
        id: 'broken_links',
        category: 'seo',
        severity: diag.brokenLinkCount > 3 ? 'high' : 'medium',
        message: 'Broken links detected.',
        hint: 'Fix or remove broken internal and external links to avoid sending users into dead ends and wasting crawl budget.',
        metric: 'brokenLinkCount',
        scoreImpact: 5
      });
    }

    if (diag.duplicateTitle === true) {
      pushSuggestion(suggestions, {
        id: 'duplicate_title',
        category: 'seo',
        severity: 'medium',
        message: 'Page title appears to be duplicated on multiple URLs.',
        hint: 'Differentiate this page with a unique, intent-matched title to avoid internal competition in search.',
        metric: 'duplicateTitle',
        scoreImpact: 4
      });
    }

    if (diag.duplicateMetaDescription === true) {
      pushSuggestion(suggestions, {
        id: 'duplicate_meta_description',
        category: 'seo',
        severity: 'low',
        message: 'Meta description appears to be reused on other pages.',
        hint: 'Write a description that reflects the specific value of this page instead of reusing generic copy.',
        metric: 'duplicateMetaDescription',
        scoreImpact: 2
      });
    }

    if (diag.hasStructuredData === false && diag.contentType) {
      pushSuggestion(suggestions, {
        id: 'missing_structured_data',
        category: 'seo',
        severity: 'low',
        message: 'Structured data is missing for this content type.',
        hint: 'Consider adding schema.org structured data (e.g. Article, Product, LocalBusiness) to unlock richer search results.',
        metric: 'structuredData',
        scoreImpact: 3
      });
    }

    return suggestions;
  }

  // --- Accessibility suggestions ---

  function buildAccessibilitySuggestions(a11y) {
    const suggestions = [];
    if (!a11y || typeof a11y !== 'object') return suggestions;

    if (typeof a11y.colorContrastIssues === 'number' && a11y.colorContrastIssues > 0) {
      pushSuggestion(suggestions, {
        id: 'color_contrast',
        category: 'accessibility',
        severity: a11y.colorContrastIssues > 5 ? 'high' : 'medium',
        message: 'Color contrast issues detected.',
        hint: 'Increase contrast between text and background to meet WCAG guidelines, especially for body copy and buttons.',
        metric: 'colorContrastIssues',
        scoreImpact: 7
      });
    }

    if (typeof a11y.missingAlt === 'number' && a11y.missingAlt > 0) {
      pushSuggestion(suggestions, {
        id: 'a11y_missing_alt',
        category: 'accessibility',
        severity: 'medium',
        message: 'Images without alt text detected.',
        hint: 'Add meaningful alt attributes for images that convey information. Decorative images can use empty alt="" attributes.',
        metric: 'missingAlt',
        scoreImpact: 4
      });
    }

    if (typeof a11y.missingFormLabels === 'number' && a11y.missingFormLabels > 0) {
      pushSuggestion(suggestions, {
        id: 'missing_form_labels',
        category: 'accessibility',
        severity: 'high',
        message: 'Form inputs without labels detected.',
        hint: 'Associate every input with a visible <label> or ARIA label so assistive technologies can announce it properly.',
        metric: 'missingFormLabels',
        scoreImpact: 8
      });
    }

    if (typeof a11y.focusVisibleIssues === 'number' && a11y.focusVisibleIssues > 0) {
      pushSuggestion(suggestions, {
        id: 'focus_visible',
        category: 'accessibility',
        severity: 'medium',
        message: 'Keyboard focus states are difficult to see or missing.',
        hint: 'Ensure interactive elements have a clearly visible focus outline so keyboard users can track their position.',
        metric: 'focusVisibleIssues',
        scoreImpact: 5
      });
    }

    if (typeof a11y.keyboardTrapCount === 'number' && a11y.keyboardTrapCount > 0) {
      pushSuggestion(suggestions, {
        id: 'keyboard_trap',
        category: 'accessibility',
        severity: 'critical',
        message: 'Potential keyboard trap detected.',
        hint: 'Review dialogs/menus so keyboard users can both reach and exit them using Tab/Shift+Tab and Escape.',
        metric: 'keyboardTrapCount',
        scoreImpact: 12
      });
    }

    if (a11y.headingOrderIssues === true) {
      pushSuggestion(suggestions, {
        id: 'heading_order',
        category: 'accessibility',
        severity: 'medium',
        message: 'Heading levels may be out of logical order.',
        hint: 'Use headings in sequence (H1 → H2 → H3) to reflect the actual structure of the content.',
        metric: 'headingOrderIssues',
        scoreImpact: 4
      });
    }

    if (a11y.landmarkIssues === true) {
      pushSuggestion(suggestions, {
        id: 'landmarks',
        category: 'accessibility',
        severity: 'low',
        message: 'Landmark regions are incomplete or missing.',
        hint: 'Add ARIA landmarks (main, nav, header, footer) to help assistive tech users navigate by regions.',
        metric: 'landmarkIssues',
        scoreImpact: 2
      });
    }

    if (a11y.hasSkipLink === false) {
      pushSuggestion(suggestions, {
        id: 'skip_link',
        category: 'accessibility',
        severity: 'low',
        message: 'Skip-to-content link not detected.',
        hint: 'Consider adding a “Skip to main content” link at the top of the page for keyboard users.',
        metric: 'hasSkipLink',
        scoreImpact: 2
      });
    }

    if (a11y.prefersReducedMotionRespected === false) {
      pushSuggestion(suggestions, {
        id: 'reduced_motion',
        category: 'accessibility',
        severity: 'medium',
        message: 'Prefers-reduced-motion is not fully respected.',
        hint: 'Honor the prefers-reduced-motion media query by toning down or disabling large animations where possible.',
        metric: 'prefersReducedMotion',
        scoreImpact: 4
      });
    }

    return suggestions;
  }

  // --- Performance suggestions (runtime feel / loading) ---

  function buildPerformanceSuggestions(perf) {
    const suggestions = [];
    if (!perf || typeof perf !== 'object') return suggestions;

    if (typeof perf.lcpMs === 'number') {
      if (perf.lcpMs > 4000) {
        pushSuggestion(suggestions, {
          id: 'lcp_slow',
          category: 'performance',
          severity: 'high',
          message: 'Largest Contentful Paint (LCP) is slow.',
          hint: 'Optimize your hero image, critical CSS, and server response so the main content appears within ~2.5s.',
          metric: 'lcpMs',
          scoreImpact: 8
        });
      } else if (perf.lcpMs > 2500) {
        pushSuggestion(suggestions, {
          id: 'lcp_borderline',
          category: 'performance',
          severity: 'medium',
          message: 'Largest Contentful Paint could be faster.',
          hint: 'Audit above-the-fold content and defer non-critical scripts to bring LCP closer to 2.5s.',
          metric: 'lcpMs',
          scoreImpact: 4
        });
      }
    }

    if (typeof perf.cls === 'number' && perf.cls > 0.1) {
      pushSuggestion(suggestions, {
        id: 'cls_high',
        category: 'performance',
        severity: perf.cls > 0.25 ? 'high' : 'medium',
        message: 'Cumulative Layout Shift (CLS) is high.',
        hint: 'Reserve space for images and embeds, and avoid inserting content above existing content after load.',
        metric: 'cls',
        scoreImpact: 7
      });
    }

    if (typeof perf.totalBlockingTimeMs === 'number' && perf.totalBlockingTimeMs > 300) {
      pushSuggestion(suggestions, {
        id: 'tbt_high',
        category: 'performance',
        severity: 'high',
        message: 'Long tasks are blocking the main thread.',
        hint: 'Split heavy JavaScript into smaller chunks and defer non-critical work so the UI stays responsive.',
        metric: 'totalBlockingTimeMs',
        scoreImpact: 8
      });
    }

    if (typeof perf.javascriptBytesKb === 'number' && perf.javascriptBytesKb > 300) {
      pushSuggestion(suggestions, {
        id: 'js_bundle_size',
        category: 'performance',
        severity: 'medium',
        message: 'JavaScript bundle size is heavy.',
        hint: 'Remove unused libraries, tree-shake imports, and lazy-load routes to keep shipped JS lean.',
        metric: 'javascriptBytesKb',
        scoreImpact: 5
      });
    }

    if (typeof perf.imageBytesKb === 'number' && perf.imageBytesKb > 1000) {
      pushSuggestion(suggestions, {
        id: 'large_images',
        category: 'performance',
        severity: 'medium',
        message: 'Images contribute a lot of weight.',
        hint: 'Use modern formats (WebP/AVIF), compress images, and avoid sending full-resolution assets where not needed.',
        metric: 'imageBytesKb',
        scoreImpact: 5
      });
    }

    if (perf.usesLazyLoading === false && perf.imageCountAboveFold > 0) {
      pushSuggestion(suggestions, {
        id: 'lazy_loading',
        category: 'performance',
        severity: 'low',
        message: 'Images below the fold are not lazy-loaded.',
        hint: 'Enable loading="lazy" for non-critical images to delay their loading until needed.',
        metric: 'usesLazyLoading',
        scoreImpact: 3
      });
    }

    return suggestions;
  }

  // --- UX suggestions (layout, navigation, interaction) ---

  function buildUxSuggestions(ux) {
    const suggestions = [];
    if (!ux || typeof ux !== 'object') return suggestions;

    if (ux.navDepth && ux.navDepth > 3) {
      pushSuggestion(suggestions, {
        id: 'deep_navigation',
        category: 'ux',
        severity: 'medium',
        message: 'Navigation may feel deep or complex.',
        hint: 'Flatten key navigation paths so important pages are accessible within 1–2 clicks.',
        metric: 'navDepth',
        scoreImpact: 3
      });
    }

    if (ux.hasCompetingPrimaryButtons === true) {
      pushSuggestion(suggestions, {
        id: 'competing_ctas',
        category: 'ux',
        severity: 'medium',
        message: 'Multiple primary CTAs compete for attention.',
        hint: 'Choose a single primary action per view and downgrade others to secondary styles.',
        metric: 'hasCompetingPrimaryButtons',
        scoreImpact: 3
      });
    }

    if (ux.heroAboveFoldMessageWeak === true) {
      pushSuggestion(suggestions, {
        id: 'weak_hero_message',
        category: 'ux',
        severity: 'medium',
        message: 'Hero section may not clearly state what this page is about.',
        hint: 'Refine your main headline and subcopy so a new visitor understands the product within a few seconds.',
        metric: 'heroClarity',
        scoreImpact: 4
      });
    }

    if (ux.hasAutoPlayingMedia === true && ux.mutedByDefault === false) {
      pushSuggestion(suggestions, {
        id: 'autoplay_media',
        category: 'ux',
        severity: 'medium',
        message: 'Autoplaying media with sound can be disruptive.',
        hint: 'Avoid auto-playing audio; let users choose when to play and keep sound muted by default if autoplay is necessary.',
        metric: 'autoplayMedia',
        scoreImpact: 3
      });
    }

    if (ux.modalCountOnLoad && ux.modalCountOnLoad > 0) {
      pushSuggestion(suggestions, {
        id: 'onload_modals',
        category: 'ux',
        severity: ux.modalCountOnLoad > 1 ? 'medium' : 'low',
        message: 'Modals or popups appear immediately on page load.',
        hint: 'Consider showing modals after engagement (scroll, time on page) rather than blocking the initial experience.',
        metric: 'modalCountOnLoad',
        scoreImpact: 3
      });
    }

    return suggestions;
  }

  // --- Engagement suggestions (clicks, scroll, behavior) ---

  function buildEngagementSuggestions(eng) {
    const suggestions = [];
    if (!eng || typeof eng !== 'object') return suggestions;

    if (typeof eng.bounceRate === 'number' && eng.bounceRate > 0.6) {
      pushSuggestion(suggestions, {
        id: 'high_bounce',
        category: 'engagement',
        severity: 'medium',
        message: 'Bounce rate looks high.',
        hint: 'Check whether the page answers the query quickly, loads fast, and offers a clear next step above the fold.',
        metric: 'bounceRate',
        scoreImpact: 4
      });
    }

    if (typeof eng.avgScrollDepth === 'number' && eng.avgScrollDepth < 0.4) {
      pushSuggestion(suggestions, {
        id: 'shallow_scroll',
        category: 'engagement',
        severity: 'medium',
        message: 'Most users are not scrolling very far.',
        hint: 'Bring key content and CTAs higher on the page and reduce “hero-only” fluff that blocks progression.',
        metric: 'avgScrollDepth',
        scoreImpact: 3
      });
    }

    if (typeof eng.primaryCtaImpressions === 'number' &&
        eng.primaryCtaImpressions > 30 &&
        typeof eng.primaryCtaClicks === 'number') {
      const ctr = eng.primaryCtaClicks / Math.max(1, eng.primaryCtaImpressions);
      if (ctr < 0.05) {
        pushSuggestion(suggestions, {
          id: 'low_cta_ctr',
          category: 'engagement',
          severity: 'medium',
          message: 'Primary call-to-action button has a low click-through rate.',
          hint: 'Experiment with clearer copy (e.g. “Start free trial” instead of “Learn more”), stronger contrast, and positioning above the fold.',
          metric: 'primaryCtaCtr',
          scoreImpact: 4,
          context: { ctr: ctr }
        });
      }
    }

    if (typeof eng.returnVisitorShare === 'number' && eng.returnVisitorShare < 0.1) {
      pushSuggestion(suggestions, {
        id: 'low_return_visitors',
        category: 'engagement',
        severity: 'low',
        message: 'Few visitors are coming back.',
        hint: 'Consider adding content worth returning for—blog posts, release notes, or resources—and simple ways to follow or subscribe.',
        metric: 'returnVisitorShare',
        scoreImpact: 2
      });
    }

    return suggestions;
  }

  // --- Aggregator + scoring + coach voice ---

  function buildCavbotSuggestions(snapshot) {
    snapshot = snapshot || {};
    const all = [];

    const seoSuggestions = buildSeoSuggestions(snapshot.seo);
    const a11ySuggestions = buildAccessibilitySuggestions(snapshot.accessibility);
    const perfSuggestions = buildPerformanceSuggestions(snapshot.performance);
    const uxSuggestions = buildUxSuggestions(snapshot.ux);
    const engagementSuggestions = buildEngagementSuggestions(snapshot.engagement);

    Array.prototype.push.apply(all, seoSuggestions);
    Array.prototype.push.apply(all, a11ySuggestions);
    Array.prototype.push.apply(all, perfSuggestions);
    Array.prototype.push.apply(all, uxSuggestions);
    Array.prototype.push.apply(all, engagementSuggestions);

    // Sort by severity (critical → low), then category
    all.sort(function (a, b) {
      const wa = SUGGESTION_SEVERITY_WEIGHT[a.severity] || 0;
      const wb = SUGGESTION_SEVERITY_WEIGHT[b.severity] || 0;
      if (wa !== wb) return wb - wa;
      if (a.category < b.category) return -1;
      if (a.category > b.category) return 1;
      return 0;
    });

    return all;
  }

  function computeHealthScores(snapshot) {
    snapshot = snapshot || {};
    const seoScore = coerceScore(snapshot.seo && snapshot.seo.seoScore, 80);
    const perfScore = coerceScore(
      snapshot.performance &&
      (snapshot.performance.perfScore || snapshot.performance.runtimeFeelScore),
      80
    );
    const a11yScore = coerceScore(
      snapshot.accessibility && snapshot.accessibility.accessibilityScore,
      80
    );
    const uxScore = coerceScore(snapshot.ux && snapshot.ux.uxScore, 80);
    const engagementScore = coerceScore(
      snapshot.engagement && snapshot.engagement.engagementScore,
      80
    );

    const weights = {
      seo: 0.35,
      performance: 0.20,
      accessibility: 0.20,
      ux: 0.15,
      engagement: 0.10
    };

    const overall = Math.round(
      seoScore * weights.seo +
      perfScore * weights.performance +
      a11yScore * weights.accessibility +
      uxScore * weights.ux +
      engagementScore * weights.engagement
    );

    return {
      overall: clampNumber(overall, 0, 100),
      seo: seoScore,
      performance: perfScore,
      accessibility: a11yScore,
      ux: uxScore,
      engagement: engagementScore
    };
  }

  function buildCoachMessage(snapshot) {
    const suggestions = buildCavbotSuggestions(snapshot || {});
    const scores = computeHealthScores(snapshot || {});

    if (!suggestions.length) {
      return 'System check: this page looks healthy. No high-severity issues detected. I’d still keep an eye on performance and accessibility as you ship new changes.';
    }

    const countsBySeverity = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      note: 0
    };
    const countsByCategory = {};

    suggestions.forEach(function (s) {
      if (countsBySeverity[s.severity] != null) {
        countsBySeverity[s.severity] += 1;
      }
      const cat = s.category || 'other';
      countsByCategory[cat] = (countsByCategory[cat] || 0) + 1;
    });

    const topCategories = Object.keys(countsByCategory)
      .sort(function (a, b) {
        return countsByCategory[b] - countsByCategory[a];
      })
      .slice(0, 2);

    const totalCritical = countsBySeverity.critical;
    const totalHigh = countsBySeverity.high;
    const totalMedium = countsBySeverity.medium;

    var line1 = 'Health snapshot · overall ' + scores.overall + '/100.';
    var line2 = '';
    var line3 = '';

    if (totalCritical + totalHigh > 0) {
      line2 =
        'I’m seeing ' +
        (totalCritical > 0 ? totalCritical + ' critical ' : '') +
        (totalCritical > 0 && totalHigh > 0 ? 'and ' : '') +
        (totalHigh > 0 ? totalHigh + ' high-severity ' : '') +
        'items to fix first.';
    } else if (totalMedium > 0) {
      line2 =
        'Most issues here are medium impact. Cleaning them up will steadily push this page into the 90s.';
    } else {
      line2 =
        'Remaining issues are mostly low impact—good spot to refine once core features are stable.';
    }

    if (topCategories.length) {
      line3 =
        'Biggest leverage right now is in ' +
        topCategories.join(' & ') +
        '. Start there, then we can fine-tune the rest.';
    } else {
      line3 =
        'Tackle the highest severity items first, then iterate on the rest as you ship.';
    }

    return line1 + ' ' + line2 + ' ' + line3;
  }

  // ===== Init core visit analytics =====

  (function initAnalytics() {
    try {
      // Legacy visit count key
      const rawVisits = window.localStorage.getItem(VISIT_KEY);
      const prevVisits = rawVisits ? parseInt(rawVisits, 10) : 0;
      analytics.visitCount = Number.isNaN(prevVisits) ? 1 : prevVisits + 1;
      window.localStorage.setItem(VISIT_KEY, String(analytics.visitCount));

      // New metrics key
      const rawMetrics = window.localStorage.getItem(ANALYTICS_KEY);
      const parsed = safeParseJSON(rawMetrics, null);
      if (parsed) {
        if (typeof parsed.lifetimeCatches === 'number') {
          analytics.lifetimeCatches = parsed.lifetimeCatches;
        }
        if (typeof parsed.lifetimeMisses === 'number') {
          analytics.lifetimeMisses = parsed.lifetimeMisses;
        }
        if (typeof parsed.lifetimeRounds === 'number') {
          analytics.lifetimeRounds = parsed.lifetimeRounds;
        }
        if (typeof parsed.bestMs === 'number') {
          analytics.bestMs = parsed.bestMs;
        }
        if (typeof parsed.lastVisit === 'string') {
          analytics.lastVisit = parsed.lastVisit;
        }
        if (Array.isArray(parsed.bestRuns)) {
          analytics.bestRuns = parsed.bestRuns.slice(0, 5);
        }
      }

      analytics.lastVisit = new Date().toISOString();
      persistAnalytics();

      trackEvent('cavbot_control_room_visit', {
        visitCount: analytics.visitCount,
        lifetimeCatches: analytics.lifetimeCatches,
        lifetimeMisses: analytics.lifetimeMisses,
        lifetimeRounds: analytics.lifetimeRounds,
        bestMs: analytics.bestMs
      });
    } catch (e) {
      // localStorage not available, we’ll just run with in-memory values
    }
  })();

  // ===== Public brain API for other pages / future backend & console =====

  try {
    window.cavbotBrain = window.cavbotBrain || {};

    window.cavbotBrain.getSnapshot = function () {
      return {
        analytics: Object.assign({}, analytics),
        session: Object.assign({}, session),
        recentEvents: (trackEvent.queue || []).slice(-40)
      };
    };

    window.cavbotBrain.getSessionId = function () {
      return session.id;
    };

    window.cavbotBrain.getDeviceRecords = function () {
      return {
        bestMs: analytics.bestMs,
        bestRuns: analytics.bestRuns.slice()
      };
    };

    // New: full suggestion + scoring API
    window.cavbotBrain.buildSuggestions = function (snapshot) {
      return buildCavbotSuggestions(snapshot || {});
    };

    window.cavbotBrain.getHealthScores = function (snapshot) {
      return computeHealthScores(snapshot || {});
    };

    window.cavbotBrain.getCoachMessage = function (snapshot) {
      return buildCoachMessage(snapshot || {});
    };

    window.cavbotBrain.trackSiteSnapshot = function (snapshot, context) {
      snapshot = snapshot || {};
      const scores = computeHealthScores(snapshot);
      const suggestions = buildCavbotSuggestions(snapshot);

      trackEvent('cavbot_site_snapshot', {
        scores: scores,
        suggestions: suggestions,
        snapshot: snapshot,
        context: context || {}
      });

      return {
        scores: scores,
        suggestions: suggestions
      };
    };

    // Internal bridge for game modules (404 arena / future games)
    window.cavbotBrain._internal = {
      analytics: analytics,
      session: session,
      persistAnalytics: persistAnalytics,
      trackEvent: trackEvent
    };
  } catch (e) {
    // ignore if window not available
  }

})();