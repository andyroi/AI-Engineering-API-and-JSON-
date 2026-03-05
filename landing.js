// ── landing.js ───────────────────────────────────────────────
// 1. Gradient hue-shift on scroll (Blue → Purple → Rose)
// 2. IntersectionObserver scroll-reveal for .reveal elements
// 3. Hide scroll-hint after first scroll
// ─────────────────────────────────────────────────────────────

(function () {
    'use strict';

    const heroBlur   = document.getElementById('hero-blur');
    const scrollHint = document.getElementById('scroll-hint');

    // ── 1. Gradient colour shift ─────────────────────────────
    // Blobs start at blue (~220) and shift through purple (~280)
    // to rose (~340) as the user scrolls to the bottom of the page.

    let ticking = false;

    function updateGradient() {
        const scrollY  = window.scrollY;
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        const progress  = Math.min(scrollY / (maxScroll || 1), 1); // 0 → 1

        // Each blob has its own base hue and shifts at a slightly different rate
        // giving the gradient a richer, more organic feel
        const hue1 = 220 + progress * 120;   // 220 (blue)   → 340 (rose)
        const hue2 = 250 + progress * 100;   // 250 (indigo)  → 350 (pink)
        const hue3 = 280 + progress * 80;    // 280 (purple)  → 360 (red-rose)

        heroBlur.style.setProperty('--hue-1', hue1);
        heroBlur.style.setProperty('--hue-2', hue2);
        heroBlur.style.setProperty('--hue-3', hue3);

        ticking = false;
    }

    window.addEventListener('scroll', function () {
        if (!ticking) {
            requestAnimationFrame(updateGradient);
            ticking = true;
        }
    });

    // ── 2. Scroll-reveal (IntersectionObserver) ──────────────
    const reveals = document.querySelectorAll('.reveal');

    if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('in-view');
                    observer.unobserve(entry.target); // only animate once
                }
            });
        }, { threshold: 0.15 });

        reveals.forEach(function (el) {
            observer.observe(el);
        });
    } else {
        // Fallback: just show everything immediately
        reveals.forEach(function (el) {
            el.classList.add('in-view');
        });
    }

    // ── 3. Hide scroll-hint after user scrolls ──────────────
    let hintHidden = false;

    window.addEventListener('scroll', function () {
        if (!hintHidden && window.scrollY > 80) {
            scrollHint.style.opacity = '0';
            scrollHint.style.transition = 'opacity 0.4s';
            hintHidden = true;
        }
    });
})();
