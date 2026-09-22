/* ============================================================
   Neural background — a rotating Fibonacci sphere of nodes with
   drifting glow patches, travelling pulse waves and floating dust.

   Ported to vanilla JS from NeuralBackground.jsx in the neural_block
   project (ui/src/extensions/builtins/ProjectOpener). The simulation
   and draw code are the original's; what changed here:

     - React refs/effects → a plain init function over one <canvas>
     - The palette is theme-aware. The original assumes a dark ground
       and paints light-emitting haloes; on this site's light theme
       those read as white smudges, so light mode uses darker strokes
       and drops the haloes.
     - Node count scales with viewport area, so phones don't build a
       1040-node O(n²) edge list.
     - prefers-reduced-motion paints ONE static frame and never starts
       the RAF loop.
   ============================================================ */
;(function () {
  'use strict'

  /* ── Config ───────────────────────────────────────────────── */
  var NODE_COUNT_MAX = 1040
  var SPHERE_FILL = 0.605
  var CONNECT_DIST = 0.22
  var ROTATE_SPEED = 0.0008
  var MOUSE_INFLUENCE = 0.00004
  var PERSPECTIVE = 800
  var GLOW_COUNT = 5
  var GLOW_RADIUS = 1.28
  var GLOW_DRIFT = 0.0224
  var WIND_CHANCE = 0.003
  var WIND_STRENGTH = 0.08
  var WIND_DECAY = 0.96
  var BRIGHTNESS_LERP = 0.15
  var PULSE_INTERVAL = 200
  var PULSE_SPEED = 0.016
  var PULSE_WIDTH = 0.28
  var PULSE_TRAIL_DECAY = 0.06
  var BREATH_SPEED = 0.004
  var BREATH_AMOUNT = 0.02
  var SORT_INTERVAL = 3
  var DUST_COUNT = 35
  var TEMP_CYCLE_SPEED = 0.0003
  var NODE_SIZES = [0.85, 0.95, 1.0, 1.0, 1.1]

  /* ── Palette ──────────────────────────────────────────────────
     The wave colours are the original's — they sit close to this
     site's --series-* ramp, so the sphere reads as part of the same
     system rather than a bolt-on. */
  var WAVE_COLORS = [
    { r: 160, g: 145, b: 220 },
    { r: 120, g: 175, b: 215 },
    { r: 155, g: 200, b: 170 },
    { r: 200, g: 170, b: 135 },
    { r: 175, g: 140, b: 200 }
  ]

  var THEMES = {
    dark: {
      node: { r: 100, g: 100, b: 112 },
      edge: { r: 80, g: 80, b: 90 },
      pulse: { r: 180, g: 180, b: 190 },
      dust: { r: 160, g: 160, b: 175 },
      haloes: true,
      alphaNode: 1,
      alphaEdge: 1
    },
    light: {
      // Much darker ink, and the alphas are BOOSTED rather than cut. The
      // original curve assumes light-on-dark, where 0.1 alpha still reads;
      // the same value on a #f5f5f5 ground is a 9/255 delta — invisible.
      // Edges take the larger lift because their base alpha is a third of
      // the nodes'. No haloes: additive glow only works on a dark ground.
      node: { r: 52, g: 52, b: 68 },
      edge: { r: 88, g: 88, b: 104 },
      pulse: { r: 26, g: 26, b: 44 },
      dust: { r: 108, g: 108, b: 124 },
      haloes: false,
      alphaNode: 1.35,
      alphaEdge: 1.9
    }
  }

  function shiftColor(c, temp) {
    var warm = temp > 0 ? temp : 0
    var cool = temp < 0 ? -temp : 0
    return {
      r: Math.min(255, c.r + warm * 25 - cool * 10),
      g: Math.min(255, c.g - warm * 5 + cool * 5),
      b: Math.min(255, c.b - warm * 15 + cool * 20)
    }
  }

  /* In light mode the wave colours are lightened pastels on white —
     darken them so they stay legible. */
  function forTheme(c, pal) {
    if (pal.haloes) return c
    return { r: Math.round(c.r * 0.5), g: Math.round(c.g * 0.5), b: Math.round(c.b * 0.56) }
  }

  /* ── Geometry ─────────────────────────────────────────────── */
  function buildSphereNodes(count) {
    var nodes = []
    var golden = Math.PI * (3 - Math.sqrt(5))
    for (var i = 0; i < count; i++) {
      var y = 1 - (i / (count - 1)) * 2
      var r = Math.sqrt(1 - y * y)
      var theta = golden * i
      nodes.push({
        sx: Math.cos(theta) * r,
        sy: y,
        sz: Math.sin(theta) * r,
        px: 0, py: 0, scale: 0, depth: 0,
        brightness: 0,
        pulseBr: 0,
        _waveColor: null,
        sizeClass: NODE_SIZES[Math.floor(Math.random() * NODE_SIZES.length)]
      })
    }
    return nodes
  }

  function buildEdges(nodes) {
    var edges = []
    for (var i = 0; i < nodes.length; i++) {
      for (var j = i + 1; j < nodes.length; j++) {
        var dx = nodes[i].sx - nodes[j].sx
        var dy = nodes[i].sy - nodes[j].sy
        var dz = nodes[i].sz - nodes[j].sz
        var d = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (d < CONNECT_DIST) edges.push({ i: i, j: j, d: d })
      }
    }
    return edges
  }

  function buildDust(count) {
    var dust = []
    for (var i = 0; i < count; i++) {
      dust.push({
        x: Math.random(),
        y: Math.random(),
        size: 0.5 + Math.random() * 1.5,
        speedX: (Math.random() - 0.5) * 0.0002,
        speedY: (Math.random() - 0.5) * 0.00015,
        opacity: 0.08 + Math.random() * 0.12,
        phase: Math.random() * Math.PI * 2
      })
    }
    return dust
  }

  /* ── Main ─────────────────────────────────────────────────── */
  function initNeuralBackground(canvas) {
    if (!canvas || !canvas.getContext) return

    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    var mouse = { x: 0.5, y: 0.5 }
    var raf = null
    var s = null

    // Scale the sphere down on small screens: the edge list is O(n²),
    // and a phone neither needs nor can afford 1040 nodes.
    var area = window.innerWidth * window.innerHeight
    var nodeCount = NODE_COUNT_MAX
    if (area < 400000) nodeCount = 380
    else if (area < 900000) nodeCount = 620

    function palette() {
      return THEMES[document.documentElement.dataset.theme === 'light' ? 'light' : 'dark']
    }

    function init() {
      var dpr = window.devicePixelRatio || 1
      var w = canvas.offsetWidth
      var h = canvas.offsetHeight
      if (!w || !h) return

      canvas.width = w * dpr
      canvas.height = h * dpr

      var ctx = canvas.getContext('2d')
      ctx.setTransform(1, 0, 0, 1, 0, 0) // reset before re-scaling, so resizes don't accumulate
      ctx.scale(dpr, dpr)

      if (!s) {
        var nodes = buildSphereNodes(nodeCount)
        var glows = []
        for (var g = 0; g < GLOW_COUNT; g++) {
          var theta = Math.random() * Math.PI * 2
          var phi = Math.acos(2 * Math.random() - 1)
          glows.push({
            x: Math.sin(phi) * Math.cos(theta),
            y: Math.sin(phi) * Math.sin(theta),
            z: Math.cos(phi),
            dTheta: (Math.random() - 0.5) * GLOW_DRIFT,
            dPhi: (Math.random() - 0.5) * GLOW_DRIFT,
            color: WAVE_COLORS[g % WAVE_COLORS.length],
            phase: Math.random() * Math.PI * 2,
            vTheta: 0,
            vPhi: 0
          })
        }
        s = {
          ctx: ctx, w: w, h: h, dpr: dpr,
          nodes: nodes, edges: [], dust: buildDust(DUST_COUNT),
          angleY: 0, angleX: 0.3, frame: 0,
          glows: glows, pulses: [],
          wind: { dTheta: 0, dPhi: 0 },
          sortedEdgeIdx: null, sortedNodeIdx: null,
          velX: 0, velY: 0
        }
        // Build the O(n²) edge list off the main thread so the first
        // frame paints without a synchronous stall.
        setTimeout(function () {
          if (s) {
            s.edges = buildEdges(nodes)
            if (reduced) draw() // static frame needs the edges too
          }
        }, 0)
      } else {
        s.ctx = ctx
        s.w = w
        s.h = h
        s.dpr = dpr
      }
    }

    function step() {
      var mx = (mouse.x - 0.5) * 2
      var my = (mouse.y - 0.5) * 2
      s.velY = (s.velY || ROTATE_SPEED) + mx * MOUSE_INFLUENCE
      s.velX = (s.velX || ROTATE_SPEED * 0.3) + my * MOUSE_INFLUENCE
      s.velY += (ROTATE_SPEED - s.velY) * 0.005
      s.velX += (ROTATE_SPEED * 0.3 - s.velX) * 0.005
      s.angleY += s.velY
      s.angleX += s.velX
      s.frame++

      /* Wind gusts */
      if (Math.random() < WIND_CHANCE) {
        var a = Math.random() * Math.PI * 2
        s.wind.dTheta = Math.cos(a) * WIND_STRENGTH
        s.wind.dPhi = Math.sin(a) * WIND_STRENGTH
      }
      s.wind.dTheta *= WIND_DECAY
      s.wind.dPhi *= WIND_DECAY

      /* Drift glow centres with inverse-square mutual repulsion */
      var REPEL_K = 0.0025
      var MIN_DIST_SQ = 0.04
      var VELOCITY_DAMP = 0.82
      var glows = s.glows

      for (var gi = 0; gi < glows.length; gi++) {
        var g = glows[gi]
        var repelTheta = 0, repelPhi = 0
        for (var gj = 0; gj < glows.length; gj++) {
          if (gi === gj) continue
          var o = glows[gj]
          var dx = g.x - o.x, dy = g.y - o.y, dz = g.z - o.z
          var dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
          if (dist > 0.001) {
            var distSq = Math.max(dist * dist, MIN_DIST_SQ)
            var force = REPEL_K / distSq
            repelTheta += ((dx * -g.z + dz * g.x) / dist) * force
            repelPhi += (dy / dist) * force
          }
        }
        g.vTheta = (g.vTheta + repelTheta) * VELOCITY_DAMP
        g.vPhi = (g.vPhi + repelPhi) * VELOCITY_DAMP

        var th = Math.atan2(g.z, g.x) + g.dTheta + s.wind.dTheta + g.vTheta
        var ph = Math.acos(Math.max(-1, Math.min(1, g.y))) + g.dPhi + s.wind.dPhi + g.vPhi
        if (ph < 0.15 || ph > Math.PI - 0.15) g.dPhi *= -1
        g.x = Math.sin(ph) * Math.cos(th)
        g.y = Math.cos(ph)
        g.z = Math.sin(ph) * Math.sin(th)
        if (Math.random() < 0.03) {
          g.dTheta += (Math.random() - 0.5) * 0.004
          g.dPhi += (Math.random() - 0.5) * 0.004
          var maxDrift = GLOW_DRIFT * 1.5
          g.dTheta = Math.max(-maxDrift, Math.min(maxDrift, g.dTheta))
          g.dPhi = Math.max(-maxDrift, Math.min(maxDrift, g.dPhi))
        }
      }

      /* Pulse waves */
      if (s.frame % PULSE_INTERVAL === 0) {
        var pt = Math.random() * Math.PI * 2
        var pp = Math.acos(2 * Math.random() - 1)
        s.pulses.push({
          nx: Math.sin(pp) * Math.cos(pt),
          ny: Math.sin(pp) * Math.sin(pt),
          nz: Math.cos(pp),
          progress: -1
        })
      }
      for (var pi = s.pulses.length - 1; pi >= 0; pi--) {
        s.pulses[pi].progress += PULSE_SPEED
        if (s.pulses[pi].progress > 1 + PULSE_WIDTH + 0.5) s.pulses.splice(pi, 1)
      }
    }

    function draw() {
      if (!s) return
      var ctx = s.ctx, w = s.w, h = s.h
      var nodes = s.nodes, edges = s.edges, glows = s.glows, dust = s.dust
      var pal = palette()

      var cosY = Math.cos(s.angleY), sinY = Math.sin(s.angleY)
      var cosX = Math.cos(s.angleX), sinX = Math.sin(s.angleX)
      var cx = w / 2, cy = h / 2
      var time = s.frame * 0.01
      var breathScale = 1 + Math.sin(s.frame * BREATH_SPEED) * BREATH_AMOUNT
      var radius = Math.min(w, h) * SPHERE_FILL * breathScale
      var temp = Math.sin(s.frame * TEMP_CYCLE_SPEED)
      var AN = pal.alphaNode
      var AE = pal.alphaEdge
      var i, n, g

      /* Project nodes + accumulate glow brightness */
      for (i = 0; i < nodes.length; i++) {
        n = nodes[i]
        var x1 = n.sx * cosY - n.sz * sinY
        var z1 = n.sx * sinY + n.sz * cosY
        var y1 = n.sy * cosX - z1 * sinX
        var z2 = n.sy * sinX + z1 * cosX
        var pScale = PERSPECTIVE / (PERSPECTIVE + z2 * radius)
        n.px = cx + x1 * radius * pScale
        n.py = cy + y1 * radius * pScale
        n.scale = pScale
        n.depth = z2

        var targetBr = 0, targetColor = null
        for (var k = 0; k < glows.length; k++) {
          g = glows[k]
          var gdx = n.sx - g.x, gdy = n.sy - g.y, gdz = n.sz - g.z
          var gd = Math.sqrt(gdx * gdx + gdy * gdy + gdz * gdz)
          var breath = 0.8 + 0.2 * Math.sin(time * 1.5 + g.phase)
          var glowR = GLOW_RADIUS * breath
          if (gd < glowR) {
            var t = 1 - gd / glowR
            var intensity = t * t * (3 - 2 * t)
            if (intensity > targetBr) { targetBr = intensity; targetColor = g.color }
          }
        }
        n.brightness += (targetBr - n.brightness) * BRIGHTNESS_LERP
        if (targetColor) n._waveColor = forTheme(shiftColor(targetColor, temp), pal)
        else if (n.brightness < 0.02) n._waveColor = null

        /* Pulse brightness with comet-trail decay */
        var pTarget = 0
        for (var q = 0; q < s.pulses.length; q++) {
          var p = s.pulses[q]
          var dot = n.sx * p.nx + n.sy * p.ny + n.sz * p.nz
          var diff = Math.abs(dot - p.progress)
          if (diff < PULSE_WIDTH) pTarget = Math.max(pTarget, 1 - diff / PULSE_WIDTH)
        }
        var lerpRate = pTarget > n.pulseBr ? 0.12 : PULSE_TRAIL_DECAY
        n.pulseBr += (pTarget - n.pulseBr) * lerpRate
      }

      ctx.clearRect(0, 0, w, h)
      var needSort = s.frame % SORT_INTERVAL === 0 || !s.sortedEdgeIdx

      /* Edges, painted back to front */
      if (needSort && edges.length) {
        s.sortedEdgeIdx = edges
          .map(function (e, idx) {
            return { idx: idx, avgDepth: (nodes[e.i].depth + nodes[e.j].depth) / 2 }
          })
          .sort(function (a, b) { return a.avgDepth - b.avgDepth })
          .map(function (e) { return e.idx })
      }

      if (s.sortedEdgeIdx) {
        for (var ei = 0; ei < s.sortedEdgeIdx.length; ei++) {
          var e = edges[s.sortedEdgeIdx[ei]]
          var ni = nodes[e.i], nj = nodes[e.j]
          if (ni.depth < -0.3 && nj.depth < -0.3) continue

          var depthFade = ((ni.depth + nj.depth) / 2 + 1) / 2
          var fireBright = Math.max(ni.brightness, nj.brightness)
          var pulseBright = Math.max(ni.pulseBr, nj.pulseBr)
          var totalBr = Math.min(1, fireBright + pulseBright * 0.6)
          var alpha = Math.min(1, (0.03 + depthFade * 0.06 + totalBr * 0.25 * depthFade) * AE)
          if (alpha < 0.01) continue

          ctx.beginPath()
          ctx.moveTo(ni.px, ni.py)
          ctx.lineTo(nj.px, nj.py)

          if (fireBright > 0.1 && ni._waveColor && nj._waveColor) {
            var grad = ctx.createLinearGradient(ni.px, ni.py, nj.px, nj.py)
            var ci = ni._waveColor, cj = nj._waveColor
            grad.addColorStop(0, 'rgba(' + ci.r + ',' + ci.g + ',' + ci.b + ',' + alpha + ')')
            grad.addColorStop(1, 'rgba(' + cj.r + ',' + cj.g + ',' + cj.b + ',' + alpha + ')')
            ctx.strokeStyle = grad
            ctx.lineWidth = 0.6 + totalBr * 1.2
          } else if (fireBright > 0.1) {
            var fc = ni.brightness > nj.brightness
              ? ni._waveColor || pal.edge
              : nj._waveColor || pal.edge
            ctx.strokeStyle = 'rgba(' + fc.r + ',' + fc.g + ',' + fc.b + ',' + alpha + ')'
            ctx.lineWidth = 0.6 + totalBr * 1.2
          } else if (pulseBright > 0.1) {
            ctx.strokeStyle = 'rgba(' + pal.pulse.r + ',' + pal.pulse.g + ',' + pal.pulse.b + ',' + alpha + ')'
            ctx.lineWidth = 0.5 + pulseBright * 0.8
          } else {
            ctx.strokeStyle = 'rgba(' + pal.edge.r + ',' + pal.edge.g + ',' + pal.edge.b + ',' + alpha + ')'
            ctx.lineWidth = 0.5
          }
          ctx.stroke()
        }
      }

      /* Nodes, painted back to front */
      if (needSort) {
        s.sortedNodeIdx = nodes
          .map(function (_, idx) { return idx })
          .sort(function (a, b) { return nodes[a].depth - nodes[b].depth })
      }

      for (var si = 0; si < s.sortedNodeIdx.length; si++) {
        n = nodes[s.sortedNodeIdx[si]]
        var df = (n.depth + 1) / 2
        var dof = df * df
        var tb = Math.min(1, n.brightness + n.pulseBr * 0.6)
        var r = (1 + df * 1.8 + tb * 2) * n.sizeClass
        var col = n.brightness > 0.1
          ? n._waveColor || pal.node
          : n.pulseBr > 0.1 ? pal.pulse : pal.node

        if (pal.haloes && tb > 0.12 && df > 0.2) {
          var hr = r * (5 + tb * 10)
          var halo = ctx.createRadialGradient(n.px, n.py, 0, n.px, n.py, hr)
          halo.addColorStop(0, 'rgba(' + col.r + ',' + col.g + ',' + col.b + ',' + tb * 0.3 * dof + ')')
          halo.addColorStop(0.5, 'rgba(' + col.r + ',' + col.g + ',' + col.b + ',' + tb * 0.06 * dof + ')')
          halo.addColorStop(1, 'rgba(' + col.r + ',' + col.g + ',' + col.b + ',0)')
          ctx.beginPath()
          ctx.arc(n.px, n.py, hr, 0, Math.PI * 2)
          ctx.fillStyle = halo
          ctx.fill()
        }

        var na = Math.min(1, (0.06 + dof * 0.3 + tb * 0.55) * (0.4 + dof * 0.6) * AN)
        ctx.beginPath()
        ctx.arc(n.px, n.py, r, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(' + col.r + ',' + col.g + ',' + col.b + ',' + na + ')'
        ctx.fill()
      }

      /* Floating dust */
      for (var di = 0; di < dust.length; di++) {
        var d = dust[di]
        d.x += d.speedX
        d.y += d.speedY
        if (d.x < -0.05) d.x = 1.05
        if (d.x > 1.05) d.x = -0.05
        if (d.y < -0.05) d.y = 1.05
        if (d.y > 1.05) d.y = -0.05
        var twinkle = 0.7 + 0.3 * Math.sin(time * 2 + d.phase)
        ctx.beginPath()
        ctx.arc(d.x * w, d.y * h, d.size, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(' + pal.dust.r + ',' + pal.dust.g + ',' + pal.dust.b + ',' + Math.min(1, d.opacity * twinkle * AN) + ')'
        ctx.fill()
      }

      /* Ambient centre glow — dark theme only, for the same reason
         the node haloes are: it is additive light. */
      if (pal.haloes) {
        var ar = radius * 0.7
        var ambient = ctx.createRadialGradient(cx, cy, 0, cx, cy, ar)
        var ac = shiftColor(glows[0] ? glows[0].color : WAVE_COLORS[0], temp)
        var bp = 0.025 + 0.015 * Math.sin(time * 0.8)
        ambient.addColorStop(0, 'rgba(' + ac.r + ',' + ac.g + ',' + ac.b + ',' + bp + ')')
        ambient.addColorStop(1, 'rgba(' + ac.r + ',' + ac.g + ',' + ac.b + ',0)')
        ctx.beginPath()
        ctx.arc(cx, cy, ar, 0, Math.PI * 2)
        ctx.fillStyle = ambient
        ctx.fill()
      }
    }

    function tick() {
      step()
      draw()
      raf = requestAnimationFrame(tick)
    }

    init()

    if (reduced) {
      // One static frame. draw() runs again once the edge list lands.
      draw()
    } else {
      raf = requestAnimationFrame(tick)
    }

    /* Resize with the parent card */
    if ('ResizeObserver' in window) {
      var ro = new ResizeObserver(function () { init() })
      ro.observe(canvas.parentElement || canvas)
    } else {
      window.addEventListener('resize', init)
    }

    /* The canvas is pointer-events:none, so mouse tracking has to come
       from the window rather than the element. */
    window.addEventListener(
      'mousemove',
      function (ev) {
        var rect = canvas.getBoundingClientRect()
        mouse.x = (ev.clientX - rect.left) / rect.width
        mouse.y = (ev.clientY - rect.top) / rect.height
      },
      { passive: true }
    )

    /* Stop burning frames on a hidden tab */
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        if (raf) cancelAnimationFrame(raf)
        raf = null
      } else if (!reduced && !raf) {
        raf = requestAnimationFrame(tick)
      }
    })

    /* Repaint immediately on a theme flip so the palette swap is not
       deferred to the next frame under reduced motion. */
    document.addEventListener('sm:themechange', function () {
      if (reduced) draw()
    })
  }

  document.addEventListener('DOMContentLoaded', function () {
    var canvas = document.getElementById('neural-bg')
    if (canvas) initNeuralBackground(canvas)
  })
})()
