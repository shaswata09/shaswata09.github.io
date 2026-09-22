# shaswata09.github.io

Personal academic site for **Shaswata Mitra** — Ph.D. candidate in Computer Science at
The University of Alabama, working on generative and agentic AI for autonomous cybersecurity.

Live at <https://shaswata09.github.io/>.

## Stack

Static HTML, CSS and vanilla JS — no build step, no dependencies. GitHub Pages serves the
repository root directly, so a push to `main` is the deploy.

```
index.html                  # home — hero, metrics, explore cards
news.html                   # dated timeline, newest first
research.html               # research threads + code & artefacts + publications
projects.html               # applied work (jojo) + inline SVG architecture diagram
experience.html             # experience, education, honours
service.html                # teaching, peer review, program committee, chairing
contact.html                # contact
assets/css/styles.css       # design tokens + all styling
assets/js/main.js           # theme persistence, reveal, publication filter
assets/js/neural-bg.js      # the hero's animated neural sphere (home only)
assets/img/                 # drop portrait.jpg here (see below)
```

### Shared chrome is duplicated

There is no templating layer, so the `<header class="nav">` and `<footer>` blocks are
copied into all seven pages. **Editing the nav or footer means editing seven files.** Each page
marks its own nav entry with `aria-current="page"`; keep that accurate when adding a page.

## Theme

The design system is ported from [jojo](https://github.com/shaswata09/jojo): shadcn/ui
**neutral**, dark by default. Neutral greys, a monochrome primary, no hue in the chrome.
Surfaces are opaque; depth is a hairline border plus a small shadow. The WCAG contrast
ratios recorded in the token comments come from jojo and were carried over with the values.

Both themes are defined as CSS custom properties at the top of `styles.css`:

- `html[data-theme='light']` — `--page: #f5f5f5`, `--panel: #ffffff`
- `html[data-theme='dark']` — `--page: #0a0a0a`, `--panel: #1f1f1f`

Type is Inter (body) and JetBrains Mono (labels, figures, metadata), matching jojo. The
scale is jojo's, lifted one step at the base because this is a reading document rather than
a dense application, with display steps added above `--text-2xl`.

A small inline script in each page's `<head>` resolves the theme before first paint so there
is no light/dark flash. It mirrors `readPref()` in `main.js` — **if you change the storage
key (`sm.theme`) or the dark fallback, change it in every page and in `main.js`.**

## The hero animation

`assets/js/neural-bg.js` paints a rotating Fibonacci sphere of ~1040 nodes with drifting
glow patches, travelling pulse waves and floating dust. It is a vanilla-JS port of
`NeuralBackground.jsx` from the `neural_block` project; the simulation and draw code are the
original's. What differs:

- **Theme-aware palette.** The original assumes a dark ground and paints light-emitting
  haloes. On this site's light theme those read as white smudges, so light mode switches to
  darker strokes and drops the haloes entirely. `main.js` fires a `sm:themechange` event on
  every toggle so the canvas can follow.
- **Scales with the viewport.** The edge list is O(n²); below ~400k px² of viewport the node
  count drops to 380, and below ~900k to 620, so phones don't build a 540k-pair list.
- **Respects `prefers-reduced-motion`.** It paints one static frame and never starts the
  animation loop.
- It pauses on a hidden tab, and the `<canvas>` is `pointer-events: none`.

The sphere is masked to a soft ellipse and sits under a `.hero::after` scrim that carries
the page ground back under the reading column, so text contrast never depends on where the
sphere happens to have rotated. Adjust both in the `.hero__canvas` block of `styles.css`.

To remove the animation entirely: delete the `<canvas id="neural-bg">` element and the
`neural-bg.js` `<script>` tag from `index.html`.

## Responsive behaviour

Audited at 320 / 360 / 414 / 640 / 768 / 1024 / 1440px across every page: no horizontal
overflow, no tap target under 32px.

- **Below 640px the nav becomes a disclosure menu.** The links used to be `display: none`
  there, which left a seven-page site with no navigation on a phone. `#nav-toggle` opens
  `#nav-menu`; it closes on link click, Escape, an outside click, and on crossing back above
  640px. Keep the button in every page's `.nav__actions`.
- **Below 900px the diagram scrolls sideways.** Scaled to a phone the 880-unit drawing
  rendered its labels at 3–5px, so `.diagram svg` has a `min-width: 720px` floor and the
  figure scrolls instead; the caption is `position: sticky` so it stays put.

## Editing content

Everything is literal markup; nothing is generated at runtime, so every page still reads
correctly with JavaScript disabled.

- **Publications** live in `#publist`, in the `#publications` section of `research.html`. Each entry is an
  `<article class="pub" data-type="…">` where `data-type` is `journal`, `conference` or
  `preprint`. The filter buttons carry hard-coded counts in `.filter__n` — update those when
  you add an entry.
- **Metrics** (citations, h-index, i10-index) are hard-coded in the `.metrics` strip on
  `index.html` and need a manual refresh from Google Scholar.
- **Explore cards** on the home page are hand-written in the `.explore` grid (4 columns).
- **News** items in `news.html` are `.tl__item` blocks grouped by year in `.news__year`.
  Newest first; mark the newest with `data-current="true"` for the green dot.
- **Hero capsules** are `<li class="chip chip--topic">` items carrying an inline Lucide
  glyph. The site has no React or build step, so icons are inlined rather than imported
  from a package.
- **The diagram** on `projects.html` is hand-written inline SVG, painted
  entirely from theme tokens (`var(--info)`, `var(--hairline)` …) via the classes in the
  *Projects* block of `styles.css`. That is why it follows the light/dark toggle with no
  second asset — do not replace it with an exported image. Geometry is plain `viewBox`
  coordinates.
- **Portrait** is `assets/img/profile_dp.png`, shown in `.hero__plate`. That file is
  1080x1080 with a uniform 108px white border baked in, which `.hero__portrait` crops with
  `transform: scale(1.25)` (1080/864). If you re-export it without the border, delete that
  rule. It is also 779 KB for a 216px slot — worth downscaling to ~600px.

## Local preview

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.
