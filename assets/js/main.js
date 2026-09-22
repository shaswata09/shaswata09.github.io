/* ============================================================
   Shaswata Mitra — portfolio behaviour
   No dependencies. Everything here degrades to a working page
   if it fails: the content is in the HTML, not built by JS.
   ============================================================ */
;(function () {
  'use strict'

  /* ---------- Theme ----------
     Mirrors the pre-paint resolver inlined in index.html. The storage
     key and the dark fallback must stay in sync with it. */
  var STORAGE_KEY = 'sm.theme'
  var root = document.documentElement

  function readPref() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY)
      if (stored === 'light' || stored === 'dark') return stored
      if (stored === 'system') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      }
    } catch (e) {
      /* private mode / storage blocked */
    }
    return 'dark'
  }

  function applyTheme(theme) {
    root.dataset.theme = theme
    root.style.colorScheme = theme
    var toggle = document.getElementById('theme-toggle')
    if (toggle) {
      toggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme')
    }
    // neural-bg.js keeps its own palette and needs to know.
    document.dispatchEvent(new CustomEvent('sm:themechange', { detail: { theme: theme } }))
  }

  applyTheme(readPref())

  var themeToggle = document.getElementById('theme-toggle')
  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      var next = root.dataset.theme === 'dark' ? 'light' : 'dark'
      applyTheme(next)
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch (e) {
        /* the in-memory switch above still stands for this session */
      }
    })
  }

  /* ---------- Mobile menu ----------
     Below 640px the links are a disclosure panel; above it the button is
     display:none and this all stays inert. */
  var burger = document.getElementById('nav-toggle')
  var menu = document.getElementById('nav-menu')

  if (burger && menu) {
    var setMenu = function (open) {
      burger.setAttribute('aria-expanded', open ? 'true' : 'false')
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu')
      if (open) {
        menu.dataset.open = 'true'
      } else {
        delete menu.dataset.open
      }
    }

    burger.addEventListener('click', function () {
      setMenu(burger.getAttribute('aria-expanded') !== 'true')
    })

    // Following a link navigates anyway; closing keeps the back button sane.
    menu.addEventListener('click', function (e) {
      if (e.target.closest('a')) setMenu(false)
    })

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && burger.getAttribute('aria-expanded') === 'true') {
        setMenu(false)
        burger.focus()
      }
    })

    document.addEventListener('click', function (e) {
      if (burger.getAttribute('aria-expanded') !== 'true') return
      if (menu.contains(e.target) || burger.contains(e.target)) return
      setMenu(false)
    })

    // Crossing back to the desktop layout must not leave a stuck panel.
    window.matchMedia('(min-width: 641px)').addEventListener('change', function (ev) {
      if (ev.matches) setMenu(false)
    })
  }

  /* ---------- Nav: hairline appears only once the page has moved ---------- */
  var nav = document.getElementById('nav')
  if (nav) {
    var setStuck = function () {
      nav.dataset.stuck = window.scrollY > 8 ? 'true' : 'false'
    }
    setStuck()
    window.addEventListener('scroll', setStuck, { passive: true })
  }

  /* ---------- Reveal on scroll ----------
     Skipped entirely when the visitor asks for reduced motion — the
     elements are then already visible via the CSS media query. */
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  var revealables = document.querySelectorAll('.reveal')

  if (!reduced && 'IntersectionObserver' in window) {
    var revealer = new IntersectionObserver(
      function (entries, observer) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return
          entry.target.classList.add('is-in')
          observer.unobserve(entry.target)
        })
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 }
    )
    Array.prototype.forEach.call(revealables, function (el) {
      revealer.observe(el)
    })
  } else {
    Array.prototype.forEach.call(revealables, function (el) {
      el.classList.add('is-in')
    })
  }

  /* ---------- Publication filter ---------- */
  var filters = Array.prototype.slice.call(document.querySelectorAll('.filter'))
  var pubs = Array.prototype.slice.call(document.querySelectorAll('.pub'))

  if (filters.length && pubs.length) {
    filters.forEach(function (button) {
      button.addEventListener('click', function () {
        var want = button.dataset.filter

        filters.forEach(function (other) {
          other.setAttribute('aria-pressed', other === button ? 'true' : 'false')
        })

        pubs.forEach(function (pub) {
          pub.hidden = want !== 'all' && pub.dataset.type !== want
        })
      })
    })
  }

  /* ---------- Footer year ---------- */
  var year = document.getElementById('year')
  if (year) year.textContent = String(new Date().getFullYear())
})()
