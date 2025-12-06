document.addEventListener('DOMContentLoaded', () => {
  const navToggle   = document.querySelector('.nav-menu-toggle');
  const navOverlay  = document.querySelector('.nav-overlay');
  const navCloseBtn = document.querySelector('.nav-overlay-close');

  // ============================
  // HEADER / MOBILE NAV
  // ============================
  if (navToggle && navOverlay) {
    const openNav = () => {
      navOverlay.classList.add('is-open');
      document.documentElement.classList.add('nav-open');
      document.body.classList.add('nav-open');
    };

    const closeNav = () => {
      navOverlay.classList.remove('is-open');
      document.documentElement.classList.remove('nav-open');
      document.body.classList.remove('nav-open');
    };

    navToggle.addEventListener('click', () => {
      const isOpen = navOverlay.classList.contains('is-open');
      if (isOpen) {
        closeNav();
      } else {
        openNav();
      }
    });

    if (navCloseBtn) {
      navCloseBtn.addEventListener('click', closeNav);
    }

    // Close if you tap outside the panel (on the backdrop)
    navOverlay.addEventListener('click', (e) => {
      if (e.target.classList.contains('nav-overlay-backdrop')) {
        closeNav();
      }
    });

    // Close on ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && navOverlay.classList.contains('is-open')) {
        closeNav();
      }
    });

    // Optional safety: if resized to desktop, hard-close
    window.addEventListener('resize', () => {
      if (window.innerWidth > 960 && navOverlay.classList.contains('is-open')) {
        closeNav();
      }
    });
  }

  // ============================
  // FOOTER ACCORDION (mobile)
  // ============================
  (function () {
    const toggles = document.querySelectorAll('.footer-column-toggle');
    if (!toggles.length) return;

    toggles.forEach((btn) => {
      btn.addEventListener('click', () => {
        const col = btn.closest('.footer-column');
        if (!col) return;
        col.classList.toggle('is-open');
      });
    });
  })();
});