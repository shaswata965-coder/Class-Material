/* Trade-off Arena — small animated demonstrations of each part.
 *
 * mount(el, questionDemo, optionDemo, mode) draws one option on a canvas.
 *   mode "preview": how the part works on a normal day (shown before locking in; it never reveals the answer).
 *   mode "stress":  the same part under the round's pressure (rush, crash, slow partner, attack), shown at reveal.
 *
 * Kinds: flow (requests through stages), grid100 (100 customers and a speed number),
 * promise (a speed promise over the morning), code (a codebase over many changes),
 * gate (login attempts against accounts), doors (who may open which result).
 */
window.ArenaDemos = (function () {
  "use strict";

  var W = 640, H = 210, MID = 128;
  var C = {
    good: "#16A34A", warn: "#F59E0B", bad: "#EF4444", bot: "#EC4899", card: "#3B82F6", req: "#14B8A6", sms: "#3B82F6",
    ink: "#0F1B2D", ink2: "#34435A", muted: "#5B6B7F", line: "#D8E0EC", wire: "#C3D3EA", surface: "#FFFFFF", surface2: "#EEF2F9",
    tGood: "#DCFCE7", tBad: "#FEE2E2", tWarn: "#FEF3C7", tBlue: "#E2EDFB", tViolet: "#ECE7FC", violet: "#8B5CF6", blue: "#1D5FA8", teal: "#0F766E"
  };
  var FONT = '"Manrope", system-ui, sans-serif';
  var DISPLAY = '"Gabarito", "Manrope", system-ui, sans-serif';
  var MONO = '"JetBrains Mono", ui-monospace, monospace';

  /* ------------------------------------------------------------------ drawing helpers */
  var iconCache = {};
  function iconPaths(name) {
    if (iconCache[name]) return iconCache[name];
    var mk = window.ARENA_ICONS.markup(name), out = [], re = /<(path|rect|circle|ellipse)\b([^>]*)>/g, m;
    while ((m = re.exec(mk))) {
      var a = {};
      m[2].replace(/([\w-]+)="([^"]*)"/g, function (_, k, v) { a[k] = v; });
      var p = new Path2D();
      if (m[1] === "path") p = new Path2D(a.d);
      else if (m[1] === "rect") { if (p.roundRect) p.roundRect(+a.x || 0, +a.y || 0, +a.width, +a.height, +a.rx || 0); else p.rect(+a.x || 0, +a.y || 0, +a.width, +a.height); }
      else if (m[1] === "circle") p.arc(+a.cx, +a.cy, +a.r, 0, Math.PI * 2);
      else p.ellipse(+a.cx, +a.cy, +a.rx, +a.ry, 0, 0, Math.PI * 2);
      out.push(p);
    }
    return (iconCache[name] = out);
  }
  function icon(ctx, name, x, y, size, color, lw) {
    ctx.save();
    ctx.translate(x - size / 2, y - size / 2);
    ctx.scale(size / 24, size / 24);
    ctx.strokeStyle = color; ctx.lineWidth = lw || 2; ctx.lineCap = "round"; ctx.lineJoin = "round";
    iconPaths(name).forEach(function (p) { ctx.stroke(p); });
    ctx.restore();
  }
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
  function box(ctx, x, y, w, h, o) {
    rr(ctx, x, y, w, h, o.r == null ? 10 : o.r);
    if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
    if (o.stroke) { ctx.setLineDash(o.dash || []); ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw || 2; ctx.stroke(); ctx.setLineDash([]); }
  }
  function text(ctx, s, x, y, o) {
    o = o || {};
    ctx.font = (o.weight || 700) + " " + (o.size || 11) + "px " + (o.font || FONT);
    ctx.fillStyle = o.color || C.ink2; ctx.textAlign = o.align || "center"; ctx.textBaseline = o.base || "middle";
    ctx.fillText(s, x, y);
  }
  function dot(ctx, x, y, r, color, alpha) {
    ctx.globalAlpha = alpha == null ? 1 : Math.max(0, alpha);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
    ctx.globalAlpha = 1;
  }
  function ring(ctx, x, y, r, color, lw, alpha) {
    ctx.globalAlpha = alpha == null ? 1 : Math.max(0, alpha);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.strokeStyle = color; ctx.lineWidth = lw || 2; ctx.stroke();
    ctx.globalAlpha = 1;
  }
  function line(ctx, x1, y1, x2, y2, color, lw, dash) {
    ctx.setLineDash(dash || []); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.strokeStyle = color; ctx.lineWidth = lw || 2; ctx.stroke(); ctx.setLineDash([]);
  }
  function chip(ctx, x, y, ic, label, col, bg) {
    ctx.font = "800 11px " + FONT;
    var w = ctx.measureText(label).width + 34;
    box(ctx, x, y, w, 22, { fill: bg, r: 11 });
    icon(ctx, ic, x + 12, y + 11, 13, col, 2.4);
    text(ctx, label, x + 23, y + 11.5, { align: "left", color: col, size: 11, weight: 800 });
    return w;
  }
  function modeChip(ctx, mode, caption) {
    if (mode === "stress") {
      if (caption) chip(ctx, 10, 8, caption.icon || "zap", caption.text, "#B91C1C", C.tBad);
      else chip(ctx, 10, 8, "zap", "Under pressure", "#92400E", C.tWarn);
    } else chip(ctx, 10, 8, "sun", "Normal day", C.ink2, C.surface2);
  }
  /* counters along the top right: [{icon, n, color}] */
  function counters(ctx, items) {
    var x = W - 10;
    for (var i = items.length - 1; i >= 0; i--) {
      var it = items[i];
      if (it.hide) continue;
      var s = String(it.n);
      ctx.font = "800 13px " + MONO;
      var w = ctx.measureText(s).width;
      text(ctx, s, x, 19, { align: "right", color: it.color, size: 13, weight: 800, font: MONO });
      icon(ctx, it.icon, x - w - 10, 19, 14, it.color, 2.6);
      x -= w + 30;
    }
  }
  function rng(seed) {
    var s = seed >>> 0 || 1;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s % 1000003) / 1000003; };
  }
  function keyColor(k) { return "hsl(" + ((k * 67) % 360) + " 70% 48%)"; }

  /* ------------------------------------------------------------------ spec resolution */
  function isObj(v) { return v && typeof v === "object" && !Array.isArray(v); }
  function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }
  function merge(a, b) {
    if (b === undefined || b === null) return clone(a);
    if (!isObj(a) || !isObj(b)) return clone(b);
    var out = clone(a);
    Object.keys(b).forEach(function (k) {
      if (k === "stages" && Array.isArray(out.stages) && isObj(b.stages)) {
        out.stages = out.stages.map(function (s) { return b.stages[s.id] ? merge(s, b.stages[s.id]) : s; });
      } else if (isObj(out[k]) && isObj(b[k])) out[k] = merge(out[k], b[k]);
      else out[k] = clone(b[k]);
    });
    return out;
  }
  function resolve(qd, od, mode) {
    qd = qd || {}; od = od || {};
    var own = {};
    Object.keys(od).forEach(function (k) { if (k !== "stress" && k !== "preview") own[k] = od[k]; });
    var s = merge(merge({ kind: qd.kind }, qd.base || {}), own);
    s = merge(s, (mode === "stress" ? qd.stress : qd.preview) || {});
    s = merge(s, (mode === "stress" ? od.stress : od.preview) || {});
    return s;
  }

  /* ================================================================== FLOW */
  function Flow(S, mode) {
    var R, st;
    var SRC = { x: 44, y: MID }, SINK = { x: 604, y: MID }, PEND = { x: 604, y: 192 }, BYPASS = MID - 66;
    var loopAt = mode === "stress" ? (S.duration || 11) : 14;

    function reset() {
      R = rng(11);
      st = { t: 0, dots: [], id: 0, acc: 0, atk: 0, served: 0, failed: 0, pending: 0, dropped: 0, keyN: 0, caption: null, ev: 0, done: false, hold: 0, flashes: [] };
      st.stages = S.stages.map(function (g) {
        var s = clone(g);
        s.copies = [];
        for (var k = 0; k < (g.copies || 1); k++) s.copies.push({ failed: false, occ: [], born: -9, spare: g.spare && k === (g.copies || 1) - 1 });
        s.ghostN = g.ghost || 0;
        s.queue = []; s.timeouts = 0; s.open = false; s.load = 1; s.ext = g.ext || 0;
        s.cacheKeys = [];
        if (s.async) s.side = { queue: 0, acc: 0, drain: g.async.drain || 2, out: [] };
        return s;
      });
      layout();
    }

    function layout() {
      var n = st.stages.length, x0 = n >= 4 ? 140 : 160, x1 = n >= 4 ? 500 : 470;
      st.stages.forEach(function (s, i) {
        s.x = n === 1 ? 318 : x0 + (x1 - x0) * i / (n - 1);
        var nC = s.copies.length + (s.ghostN || 0);
        if (s.grid || nC > 4) {
          var rows = Math.min(4, nC), cols = Math.ceil(nC / rows), size = Math.min(24, Math.floor(96 / rows) - 4);
          var gw = cols * (size + 4) - 4, gh = rows * (size + 4) - 4;
          for (var k = 0; k < nC; k++) {
            var col = Math.floor(k / rows), row = k % rows;
            var r = { x: s.x - gw / 2 + col * (size + 4), y: MID - gh / 2 + row * (size + 4), w: size, h: size, small: true };
            if (k < s.copies.length) s.copies[k].r = r; else (s.ghosts = s.ghosts || [])[k - s.copies.length] = r;
          }
          s.left = s.x - gw / 2; s.right = s.x + gw / 2; s.top = MID - gh / 2; s.bottom = MID + gh / 2;
        } else {
          var w = s.big ? 82 : (n >= 5 ? 50 : 62);
          var h = Math.min(s.big ? 62 : 48, (104 - (nC - 1) * 8) / nC);
          var total = nC * h + (nC - 1) * 8;
          s.ghosts = [];
          for (var j = 0; j < nC; j++) {
            var rr2 = { x: s.x - w / 2, y: MID - total / 2 + j * (h + 8), w: w, h: h };
            if (j < s.copies.length) s.copies[j].r = rr2; else s.ghosts.push(rr2);
          }
          s.left = s.x - w / 2; s.right = s.x + w / 2; s.top = MID - total / 2; s.bottom = MID + total / 2;
        }
        if (s.hold) s.extR = { x: s.x - 40, y: 36, w: 80, h: 26 };
        if (s.async) { s.sideR = { x: s.x + 46, y: 34, w: 78, h: 30 }; s.sideTo = { x: 560, y: 49 }; }
      });
    }

    function rateAt(t) {
      var src = S.source, r = src.rate || 3;
      if (src.rates) src.rates.forEach(function (p) { if (t >= p[0]) r = p[1]; });
      if (src.wobble) r *= 1 + src.wobble * Math.sin(t * 2.1) * Math.sin(t * 0.9 + 1);
      return Math.max(0.2, r);
    }
    function entrance(s) { return { x: s.left - 8, y: MID }; }
    function target(d, p) { d.tx = p.x; d.ty = p.y; d.phase = "move"; }

    function spawn() {
      var src = S.source, type = "req", color = C.req;
      if (src.types) {
        var u = R(), acc = 0;
        for (var i = 0; i < src.types.length; i++) { acc += src.types[i].p; if (u <= acc) { type = src.types[i].type; color = src.types[i].color; break; } }
      }
      var key = src.keys === "unique" ? st.keyN++ : Math.floor(R() * (src.keySpace || 5));
      var d = { id: st.id++, type: type, color: src.colorByKey ? keyColor(key) : color, key: key, born: st.t, x: SRC.x + 14, y: SRC.y + (R() - 0.5) * 26, si: 0, attempt: 0 };
      route(d);
      st.dots.push(d);
    }
    function route(d) {
      if (d.si >= st.stages.length) target(d, { x: SINK.x - 18, y: SINK.y + (R() - 0.5) * 16 });
      else target(d, entrance(st.stages[d.si]));
    }
    function needsHold(s, d) { return s.hold && (!s.hold.types || s.hold.types.indexOf(d.type) >= 0); }
    function serviceTime(s, d) {
      var b = typeof s.service === "object" ? (s.service[d.type] != null ? s.service[d.type] : s.service.default || 0.3) : (s.service || 0.3);
      if (needsHold(s, d)) b += s.ext * s.load;
      if (s.thrash) b *= 1 + Math.min(3, s.queue.length * 0.12);
      return b * (0.7 + R() * 0.6);
    }
    function die(d) { d.phase = "dead"; d.deadAt = st.t; st.failed++; }
    function toPending(d) { d.pending = true; target(d, { x: PEND.x - 18, y: PEND.y }); }
    function occupy(d, s, c) {
      c.occ.push(d); d.phase = "serve"; d.copy = c; d.stage = s; d.serveStart = st.t; d.serveEnd = st.t + serviceTime(s, d);
    }
    function freeCopy(s) {
      var best = null;
      s.copies.forEach(function (c) { if (!c.failed && c.occ.length < (s.slots || 1) && (!best || c.occ.length < best.occ.length)) best = c; });
      return best;
    }
    function healthy(s) { return s.copies.some(function (c) { return !c.failed; }); }

    function arrive(d) {
      if (d.pending) { st.pending++; d.gone = true; return; }
      if (d.si >= st.stages.length) { st.served++; d.gone = true; st.flashes.push({ x: d.x, y: d.y, t: st.t, c: d.hit ? C.good : C.good }); return; }
      var s = st.stages[d.si];
      if (s.cache) {
        var hit = s.cache.warm || (s.cache.hit != null ? R() < s.cache.hit : s.cacheKeys.indexOf(d.key) >= 0);
        if (hit) {
          d.hit = true; st.flashes.push({ x: s.x, y: MID, t: st.t, c: C.good }); d.si = st.stages.length;
          d.way = [{ x: s.x, y: BYPASS }, { x: SINK.x - 26, y: BYPASS }];
          target(d, d.way.shift()); return;
        }
        d.miss = true; d.si++; route(d); return;
      }
      if (s.only && s.only.indexOf(d.type) < 0) { d.si++; route(d); return; }
      if (!healthy(s)) { die(d); return; }
      if (s.open && needsHold(s, d)) { toPending(d); return; }
      var c = freeCopy(s);
      if (c) occupy(d, s, c);
      else { d.phase = "queue"; d.qAt = st.t; s.queue.push(d); }
    }
    function complete(d, s) {
      d.copy.occ.splice(d.copy.occ.indexOf(d), 1);
      if (s.async) s.side.queue++;
      if (s.drop) st.dropped++;
      if (s.learn && d.miss) {
        var cs = st.stages.filter(function (x) { return x.id === s.learn; })[0];
        if (cs && cs.cacheKeys.indexOf(d.key) < 0) { cs.cacheKeys.push(d.key); if (cs.cacheKeys.length > 40) cs.cacheKeys.shift(); }
      }
      d.si++;
      d.x = s.right + 6; d.y = MID + (R() - 0.5) * 10;
      route(d);
    }
    function fill(s) {
      while (s.queue.length) {
        var c = freeCopy(s);
        if (!c) break;
        occupy(s.queue.shift(), s, c);
      }
    }

    function step(dt) {
      if (st.done) { st.hold += dt; if (st.hold > 1.6) reset(); return; }
      st.t += dt;
      if (st.t > loopAt) { if (mode === "stress") { st.done = true; return; } reset(); return; }
      var t = st.t;
      // scheduled events
      (S.events || []).forEach(function (e, i) {
        if (st.ev & (1 << i) || t < e.at) return;
        st.ev |= 1 << i;
        if (e.caption) st.caption = { text: e.caption, icon: e.icon };
        if (e.stage) st.stages.forEach(function (s) {
          if (s.id !== e.stage || !e.set) return;
          Object.keys(e.set).forEach(function (k) { if (k === "drain" && s.side) s.side.drain = e.set[k]; else s[k] = e.set[k]; });
        });
      });
      st.stages.forEach(function (s) {
        if (s.fail && !s.failedDone && t >= s.fail.at) {
          s.failedDone = true;
          var c = s.copies[s.fail.copy || 0];
          if (c) { c.failed = true; c.occ.forEach(die); c.occ = []; }
          if (!healthy(s)) { s.queue.forEach(die); s.queue = []; }
        }
        if (s.addCopies && !s.added && t >= s.addCopies.at) {
          s.added = true;
          for (var k = 0; k < s.addCopies.n; k++) s.copies.push({ failed: false, occ: [], born: t });
          s.ghostN = Math.max(0, (s.ghostN || 0) - s.addCopies.n);
          layout();
        }
      });
      // arrivals
      st.acc += dt * rateAt(t);
      while (st.acc >= 1) { st.acc -= 1; spawn(); }
      // service, timeouts, queues
      st.stages.forEach(function (s) {
        s.copies.forEach(function (c) {
          c.occ.slice().forEach(function (d) {
            if (s.timeout && needsHold(s, d) && t - d.serveStart > s.timeout && t < d.serveEnd) {
              c.occ.splice(c.occ.indexOf(d), 1);
              s.timeouts++;
              if (s.breaker && s.timeouts >= s.breaker) s.open = true;
              if (s.onTimeout === "retry" && d.attempt < (s.retries || 5)) {
                d.attempt++; s.load = Math.min(5, s.load + 0.3);
                d.phase = "queue"; d.qAt = t; s.queue.unshift(d);
              } else { d.x = s.right + 6; toPending(d); }
            } else if (t >= d.serveEnd) complete(d, s);
          });
        });
        if (S.patience) s.queue.slice().forEach(function (d) {
          if (t - d.qAt > S.patience) { s.queue.splice(s.queue.indexOf(d), 1); die(d); }
        });
        fill(s);
        if (s.side) {
          s.side.acc += dt * s.side.drain;
          while (s.side.acc >= 1 && s.side.queue > 0) {
            s.side.acc -= 1; s.side.queue--;
            s.side.out.push({ x: s.sideR.x + s.sideR.w, y: s.sideR.y + 15, t: 0 });
          }
          if (s.side.queue === 0) s.side.acc = Math.min(s.side.acc, 1);
          s.side.out.forEach(function (o) { o.t += dt * 1.6; });
          s.side.out = s.side.out.filter(function (o) { return o.t < 1; });
        }
      });
      // movement
      st.dots.forEach(function (d) {
        if (d.phase === "move") {
          var dx = d.tx - d.x, dy = d.ty - d.y, dist = Math.sqrt(dx * dx + dy * dy), v = 230 * dt;
          if (dist <= v) { d.x = d.tx; d.y = d.ty; if (d.way && d.way.length) target(d, d.way.shift()); else if (d.way) { d.way = null; route(d); } else arrive(d); }
          else { d.x += dx / dist * v; d.y += dy / dist * v; }
        } else if (d.phase === "dead") {
          d.y += 30 * dt; if (t - d.deadAt > 0.9) d.gone = true;
        }
      });
      st.dots = st.dots.filter(function (d) { return !d.gone; });
      st.flashes = st.flashes.filter(function (f) { return t - f.t < 0.5; });
    }

    function dotColor(d) {
      if (d.phase === "dead") return C.bad;
      if (d.pending) return C.warn;
      if (st.t - d.born > (S.slowAt || 3)) return C.warn;
      return d.color;
    }

    function draw(ctx) {
      var t = st.t;
      // wires
      var prevX = SRC.x + 22;
      st.stages.forEach(function (s) { line(ctx, prevX, MID, s.left, MID, C.wire, 2); prevX = s.right; });
      line(ctx, prevX, MID, SINK.x - 20, MID, C.wire, 2);
      // source and sink
      dot(ctx, SRC.x, SRC.y, 22, C.tBlue);
      icon(ctx, S.source.icon || "users", SRC.x, SRC.y, 22, C.blue, 2.2);
      text(ctx, S.source.label || "Users", SRC.x, SRC.y + 36, { size: 11, color: C.ink2 });
      if (S.source.types) S.source.types.forEach(function (ty, i) {
        dot(ctx, SRC.x - 12 + i * 24, SRC.y - 34, 9, ty.color);
        icon(ctx, ty.icon || "user", SRC.x - 12 + i * 24, SRC.y - 34, 11, "#fff", 2.4);
      });
      dot(ctx, SINK.x, SINK.y, 18, C.tGood);
      icon(ctx, "check", SINK.x, SINK.y, 18, C.good, 3);
      st.flashes.forEach(function (f) { ring(ctx, f.x, f.y, 6 + (t - f.t) * 30, f.c, 2, 1 - (t - f.t) * 2); });
      var anyPending = st.stages.some(function (s) { return s.timeout; });
      if (anyPending) { dot(ctx, PEND.x, PEND.y, 13, C.tWarn); icon(ctx, "hourglass", PEND.x, PEND.y, 13, "#B45309", 2.4); }

      st.stages.forEach(function (s) {
        if (!s.cache) return;
        ctx.setLineDash([4, 5]); ctx.strokeStyle = "#86EFAC"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(s.x, s.top); ctx.lineTo(s.x, BYPASS); ctx.lineTo(SINK.x - 26, BYPASS); ctx.lineTo(SINK.x - 8, SINK.y - 14); ctx.stroke(); ctx.setLineDash([]);
      });
      st.stages.forEach(function (s) { drawStage(ctx, s, t); });

      // dots
      st.dots.forEach(function (d) {
        if (d.phase === "serve") return;
        var x = d.x, y = d.y;
        if (d.phase === "queue") {
          var s = st.stages[d.si], i = s.queue.indexOf(d);
          var col = i % 9, row = Math.floor(i / 9);
          x = s.left - 10 - col * 9; y = MID + (row % 2 ? -1 : 1) * Math.ceil(row / 2) * 9;
          if (row > 4) return;
          d.x = x; d.y = y;
        }
        var a = d.phase === "dead" ? 1 - (t - d.deadAt) / 0.9 : 1;
        dot(ctx, x, y, 4.5, dotColor(d), a);
        for (var k = 0; k < d.attempt && k < 3; k++) ring(ctx, x, y, 7 + k * 3, C.bot, 1.4, 0.8);
      });
      st.stages.forEach(function (s) {
        if (s.queue.length > 45) text(ctx, "+" + (s.queue.length - 45), s.left - 50, MID + 34, { color: C.bad, size: 11, weight: 800, font: MONO });
      });

      modeChip(ctx, mode, st.caption);
      counters(ctx, [
        { icon: "check", n: st.served, color: C.good },
        { icon: "x", n: st.failed, color: C.bad },
        { icon: "hourglass", n: st.pending, color: "#B45309", hide: !anyPending },
        { icon: "bellOff", n: st.dropped, color: C.muted, hide: !st.stages.some(function (s) { return s.drop; }) }
      ]);
    }

    function drawStage(ctx, s, t) {
      var slots = s.slots || 1;
      // external dependency (wallet company, SMS company)
      if (s.hold) {
        var slow = s.ext > 1, er = s.extR;
        var busy = s.copies.some(function (c) { return c.occ.some(function (d) { return needsHold(s, d); }); });
        line(ctx, s.x, er.y + er.h, s.x, s.top, s.open ? C.bad : (busy ? (slow ? C.warn : C.wire) : C.wire), 2, s.open ? [4, 4] : (busy ? [] : [3, 4]));
        box(ctx, er.x, er.y, er.w, er.h, { fill: slow ? C.tWarn : C.surface, stroke: slow ? C.warn : C.line, r: 8 });
        icon(ctx, slow ? "hourglass" : s.hold.icon, er.x + 14, er.y + 13, 14, slow ? "#B45309" : C.ink2, 2.2);
        text(ctx, s.hold.label, er.x + 26, er.y + 13.5, { align: "left", size: 10.5, color: C.ink2 });
        if (s.open) { dot(ctx, s.x, (er.y + er.h + s.top) / 2, 8, C.bad); icon(ctx, "x", s.x, (er.y + er.h + s.top) / 2, 10, "#fff", 3); }
      }
      if (s.async) {
        var sr = s.sideR;
        line(ctx, s.right - 6, s.top, sr.x + 10, sr.y + sr.h, C.wire, 2, [3, 4]);
        box(ctx, sr.x, sr.y, sr.w, sr.h, { fill: s.side.queue > 6 ? C.tWarn : C.surface, stroke: s.side.queue > 6 ? C.warn : C.line, r: 8 });
        icon(ctx, s.async.icon || "mail", sr.x + 14, sr.y + 15, 14, C.sms, 2.2);
        for (var q = 0; q < Math.min(s.side.queue, 10); q++) dot(ctx, sr.x + 28 + (q % 5) * 9, sr.y + 9 + Math.floor(q / 5) * 11, 3.4, C.sms);
        if (s.side.queue > 10) text(ctx, "+" + (s.side.queue - 10), sr.x + sr.w - 2, sr.y + sr.h + 9, { align: "right", size: 10, color: "#B45309", font: MONO });
        line(ctx, sr.x + sr.w, sr.y + 15, s.sideTo.x - 14, s.sideTo.y, C.wire, 2, [3, 4]);
        dot(ctx, s.sideTo.x, s.sideTo.y, 13, s.side.drain < 1 ? C.tWarn : C.tBlue);
        icon(ctx, s.side.drain < 1 ? "hourglass" : "msg", s.sideTo.x, s.sideTo.y, 13, s.side.drain < 1 ? "#B45309" : C.sms, 2.2);
        s.side.out.forEach(function (o) {
          dot(ctx, o.x + (s.sideTo.x - o.x) * o.t, o.y + (s.sideTo.y - o.y) * o.t, 3.4, C.sms);
        });
      }
      // ghost copies (to be added later)
      (s.ghosts || []).forEach(function (g) {
        if (!g) return;
        box(ctx, g.x, g.y, g.w, g.h, { stroke: C.wire, dash: [3, 3], r: g.small ? 5 : 9, lw: 1.5 });
        if (!g.small) icon(ctx, "plus", g.x + g.w / 2, g.y + g.h / 2, 14, C.wire, 2);
        if (s.addCopies && !s.added) {
          var p = Math.min(1, t / s.addCopies.at);
          ctx.beginPath(); ctx.moveTo(g.x + g.w / 2, g.y + g.h / 2);
          ctx.arc(g.x + g.w / 2, g.y + g.h / 2, Math.min(g.w, g.h) / 2 - 3, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
          ctx.closePath(); ctx.fillStyle = "rgba(91,107,127,.18)"; ctx.fill();
        }
      });
      var qLong = s.queue.length > 6;
      s.copies.forEach(function (c) {
        var r = c.r, pop = Math.max(0, 1 - (t - c.born) * 3), grow = pop * 4;
        var busyN = c.occ.length, slow = c.occ.some(function (d) { return t - d.born > (S.slowAt || 3); });
        var fill = c.failed ? C.tBad : (r.small ? (busyN ? (qLong ? C.tWarn : C.tGood) : C.surface) : C.surface);
        var stroke = c.failed ? C.bad : (qLong || slow ? C.warn : (c.spare ? C.violet : "#9DB2D0"));
        box(ctx, r.x - grow, r.y - grow, r.w + grow * 2, r.h + grow * 2, { fill: fill, stroke: stroke, r: r.small ? 5 : 9, lw: c.spare ? 2.5 : 2 });
        if (c.failed) { icon(ctx, "x", r.x + r.w / 2, r.y + r.h / 2, Math.min(22, r.h - 4), C.bad, 3); return; }
        if (r.small) {
          if (busyN) dot(ctx, r.x + r.w / 2, r.y + r.h / 2, Math.min(5, r.w / 4), qLong ? C.warn : C.good);
          return;
        }
        var ih = Math.min(20, r.h - 18);
        if (ih > 8) icon(ctx, s.icon || "server", r.x + r.w / 2, r.y + 4 + ih / 2 + 2, ih, C.ink2, 2);
        if (s.badge) { dot(ctx, r.x + r.w - 2, r.y + 2, 9, C.tViolet); icon(ctx, s.badge, r.x + r.w - 2, r.y + 2, 11, C.violet, 2.2); }
        if (c.spare) { dot(ctx, r.x - 2, r.y + 2, 8, C.violet); icon(ctx, "plus", r.x - 2, r.y + 2, 10, "#fff", 3); }
        // slots
        if (s.cache) {
          var keys = s.cache.warm ? 12 : Math.min(12, s.cacheKeys.length);
          for (var k = 0; k < 12; k++) {
            var cx = r.x + 6 + (k % 6) * ((r.w - 12) / 6) + 2, cy = r.y + r.h - 13 + Math.floor(k / 6) * 6;
            ctx.fillStyle = k < keys ? (s.cache.warm || s.cache.hit != null ? C.good : keyColor(s.cacheKeys[s.cacheKeys.length - 1 - k])) : C.surface2;
            ctx.fillRect(cx, cy, (r.w - 12) / 6 - 3, 4);
          }
        } else if (slots <= 8) {
          var pw = Math.min(8, (r.w - 10) / slots - 2), sx = r.x + r.w / 2 - (slots * (pw + 2) - 2) / 2;
          for (var j = 0; j < slots; j++) {
            var d = c.occ[j];
            var col = d ? (needsHold(s, d) && s.ext > 1 ? C.warn : (t - d.born > (S.slowAt || 3) ? C.warn : d.color)) : C.surface2;
            box(ctx, sx + j * (pw + 2), r.y + r.h - 10, pw, 6, { fill: col, r: 2 });
          }
        } else {
          var fr = Math.min(1, busyN / slots);
          box(ctx, r.x + 6, r.y + r.h - 10, r.w - 12, 6, { fill: C.surface2, r: 3 });
          box(ctx, r.x + 6, r.y + r.h - 10, (r.w - 12) * fr, 6, { fill: fr > 0.85 ? C.warn : C.good, r: 3 });
        }
      });
      if (s.health != null) {
        var hw = 42, hx = s.x - hw / 2, hy = s.top - 12;
        box(ctx, hx, hy, hw, 5, { fill: C.surface2, r: 3 });
        box(ctx, hx, hy, hw * s.health, 5, { fill: s.health > 0.95 ? C.good : s.health > 0.85 ? C.warn : C.bad, r: 3 });
      }
      if (s.thrash && s.queue.length > 4) icon(ctx, "flame", s.x, s.top - 10, 14, C.bad, 2.2);
      text(ctx, s.label || "", s.x, s.bottom + 13, { size: 10.5, color: C.ink2 });
    }

    reset();
    return { step: step, draw: draw, reset: reset };
  }

  /* ================================================================== GRID100 */
  function Grid100(S, mode) {
    var R = rng(5), vals = [];
    for (var i = 0; i < 100; i++) vals.push(0.08 + R() * 0.25);
    [[17, 0.7], [44, 0.9], [63, 1.2], [80, 0.6], [91, 3.6], [36, 5.2], [72, 6.4]].forEach(function (p) { vals[p[0]] = p[1]; });
    var order = vals.map(function (v, i) { return i; }).sort(function (a, b) { return vals[a] - vals[b]; });
    var mean = vals.reduce(function (a, b) { return a + b; }, 0) / 100;
    var median = vals[order[49]], p99 = vals[order[98]];
    var v = S.variant, t = 0, loop = mode === "stress" ? 9 : 8;
    var info = {
      avg: { icon: "barChart", value: mean, label: "average" },
      median: { icon: "gauge", value: median, label: "typical" },
      p99: { icon: "target", value: p99, label: "slowest 1 in 100" },
      cpu: { icon: "cpu", value: null, label: "server load" }
    }[v];
    function fmt(x) { return x < 1 ? Math.round(x * 1000) + " ms" : x.toFixed(1) + " s"; }
    function step(dt) { t += dt; if (t > loop) t = 0; }
    function draw(ctx) {
      var gx = 44, gy = 42, sp = 14.6;
      var shown = Math.min(100, Math.floor(t / 0.022));
      var phase2 = t > 2.6;
      for (var i = 0; i < 100; i++) {
        var x = gx + (i % 10) * sp, y = gy + Math.floor(i / 10) * sp;
        if (i >= shown) { dot(ctx, x, y, 5.5, C.surface2); continue; }
        var val = vals[i], col = val < 0.5 ? C.good : val < 1.5 ? C.warn : C.bad;
        var a = v === "cpu" && phase2 ? 0.35 : 1;
        var shake = mode === "stress" && val >= 1.5 && phase2 ? Math.sin(t * 30 + i) * 1.6 : 0;
        dot(ctx, x + shake, y, 5.2, col, a);
        if (mode === "stress" && val >= 1.5 && phase2) icon(ctx, "frown", x + shake, y, 11, "#fff", 2.6);
      }
      if (phase2) {
        var pulse = 0.5 + 0.5 * Math.sin(t * 6);
        if (v === "avg") box(ctx, gx - 10, gy - 10, sp * 9 + 20, sp * 9 + 20, { stroke: C.blue, r: 10, lw: 2, dash: [5, 4] });
        if (v === "median" || v === "p99") {
          var idx = v === "median" ? order[49] : order[98];
          ring(ctx, gx + (idx % 10) * sp, gy + Math.floor(idx / 10) * sp, 8 + pulse * 3, C.blue, 2.5);
        }
      }
      // meter card
      var mx = 250, my = 46, mw = 360, mh = 150;
      box(ctx, mx, my, mw, mh, { fill: C.surface2, r: 14 });
      dot(ctx, mx + 34, my + 34, 20, C.surface);
      icon(ctx, info.icon, mx + 34, my + 34, 22, C.blue, 2.2);
      text(ctx, info.label, mx + 64, my + 34, { align: "left", size: 13, color: C.ink2, weight: 800 });
      if (phase2) {
        var value = v === "cpu" ? "62%" : fmt(info.value);
        text(ctx, value, mx + 22, my + 86, { align: "left", size: 38, weight: 900, font: DISPLAY, color: C.ink });
        if (v !== "cpu") {
          var bx = mx + 22, bw = mw - 44, by = my + 116, mxv = 7;
          box(ctx, bx, by, bw, 8, { fill: C.surface, r: 4 });
          box(ctx, bx, by, bw * Math.min(1, info.value / mxv), 8, { fill: info.value <= 1 ? C.good : C.bad, r: 4 });
          line(ctx, bx + bw / mxv, by - 5, bx + bw / mxv, by + 13, C.ink, 2);
          text(ctx, "1 s", bx + bw / mxv, by + 22, { size: 10, color: C.muted, font: MONO });
        } else {
          box(ctx, mx + 22, my + 116, mw - 44, 8, { fill: C.surface, r: 4 });
          box(ctx, mx + 22, my + 116, (mw - 44) * 0.62, 8, { fill: C.good, r: 4 });
        }
        if (mode === "stress" && t > 4) {
          var caught = v === "p99";
          var bxv = mx + mw - 150;
          box(ctx, bxv, my + 62, 132, 34, { fill: caught ? C.tBad : C.tGood, r: 17 });
          icon(ctx, caught ? "bell" : "check", bxv + 20, my + 79, 16, caught ? C.bad : C.good, 2.6);
          text(ctx, caught ? "Alarm!" : "Looks fine", bxv + 36, my + 79.5, { align: "left", size: 14, weight: 900, color: caught ? "#B91C1C" : C.good });
        }
      }
      if (mode === "stress" && phase2) {
        box(ctx, gx - 12, gy + sp * 9 + 13, 112, 20, { fill: C.tBad, r: 10 });
        text(ctx, "× 500 on sale day", gx - 4, gy + sp * 9 + 23.5, { align: "left", size: 10.5, weight: 800, color: "#B91C1C" });
      }
      modeChip(ctx, mode, mode === "stress" && phase2 ? { text: "Sale day: 50,000 people", icon: "users" } : null);
    }
    return { step: step, draw: draw, reset: function () { t = 0; } };
  }

  /* ================================================================== PROMISE */
  function Promise_(S, mode) {
    var v = S.variant, t = 0, loop = 9;
    var x0 = 40, x1 = 600, base = 182, top = 64;
    function traffic(u) { // u: 0..1 over 8:00..12:00
      var spike = Math.exp(-Math.pow((u - 0.52) / 0.018, 2));
      var hump = 0.12 + 0.08 * Math.sin(u * Math.PI);
      return Math.min(1, hump + spike * 0.9);
    }
    function X(u) { return x0 + (x1 - x0) * u; }
    function Y(f) { return base - (base - top) * f; }
    function step(dt) { t += dt; if (t > loop) t = 0; }
    function draw(ctx) {
      var sweep = Math.min(1, t / 1.6);
      // window shading
      ctx.save();
      ctx.fillStyle = "rgba(59,130,246,.14)";
      if (v === "avg") ctx.fillRect(x0, top - 14, (x1 - x0) * sweep, base - top + 14);
      if (v === "day") {
        ctx.fillRect(x0, top - 14, (x1 - x0) * sweep, base - top + 14);
        if (sweep >= 1) { ctx.clearRect(X(0.49), top - 14, X(0.55) - X(0.49), base - top + 14); }
      }
      if (v === "peak") ctx.fillRect(X(0.49), top - 14, (X(0.55) - X(0.49)) * sweep, base - top + 14);
      ctx.restore();
      if (v === "day" && sweep >= 1) {
        ctx.save(); ctx.beginPath(); ctx.rect(X(0.49), top - 14, X(0.55) - X(0.49), base - top + 14); ctx.clip();
        for (var hx = X(0.49) - 120; hx < X(0.55); hx += 7) line(ctx, hx, base, hx + 120, top - 14, "rgba(91,107,127,.25)", 1.5);
        ctx.restore();
        dot(ctx, X(0.52), top - 26, 11, C.surface2);
        icon(ctx, "eyeOff", X(0.52), top - 26, 13, C.muted, 2.2);
      }
      // last-week ghost curve
      if (v === "lastweek") {
        ctx.beginPath();
        for (var g = 0; g <= 100; g++) { var ug = g / 100, f = 0.1 + 0.06 * Math.sin(ug * Math.PI); if (g) ctx.lineTo(X(ug), Y(f)); else ctx.moveTo(X(ug), Y(f)); }
        ctx.setLineDash([5, 4]); ctx.strokeStyle = C.blue; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = "rgba(59,130,246,.14)"; ctx.fillRect(x0, Y(0.2), (x1 - x0) * sweep, base - Y(0.2));
        dot(ctx, x0 + 26, Y(0.3), 11, C.tBlue); icon(ctx, "coffee", x0 + 26, Y(0.3), 13, C.blue, 2.2);
      }
      // traffic curve
      var slowRush = mode === "stress" && t > 2;
      ctx.beginPath();
      for (var i = 0; i <= 200; i++) { var u = i / 200; var y = Y(traffic(u)); if (i) ctx.lineTo(X(u), y); else ctx.moveTo(X(u), y); }
      ctx.strokeStyle = v === "lastweek" ? "rgba(52,67,90,.35)" : C.ink2; ctx.lineWidth = 2.5; ctx.stroke();
      if (slowRush) {
        ctx.save(); ctx.beginPath(); ctx.moveTo(X(0.47), base);
        for (var k = 0; k <= 40; k++) { var uu = 0.47 + 0.1 * k / 40; ctx.lineTo(X(uu), Y(traffic(uu))); }
        ctx.lineTo(X(0.57), base); ctx.closePath(); ctx.fillStyle = "rgba(239,68,68,.35)"; ctx.fill(); ctx.restore();
        for (var a = 0; a < 3; a++) { var fx = X(0.5 + a * 0.02), fy = top - 6 - (a % 2) * 12 + Math.sin(t * 9 + a) * 2; dot(ctx, fx, fy, 8, C.bad); icon(ctx, "frown", fx, fy, 12, "#fff", 2.4); }
      }
      line(ctx, x0, base, x1, base, C.line, 2);
      ["8:00", "10:00", "12:00"].forEach(function (s, i) { text(ctx, s, X([0, 0.5, 1][i]), base + 14, { size: 10, color: C.muted, font: MONO }); });
      dot(ctx, X(0.52), base + 0.5, 3, C.ink2);
      // what the promise measures
      var ic = { avg: "barChart", day: "sun", peak: "target", lastweek: "coffee" }[v];
      dot(ctx, x1 - 18, 50, 16, C.tBlue); icon(ctx, ic, x1 - 18, 50, 17, C.blue, 2.2);
      if (mode === "stress" && t > 3.2) {
        var caught = v === "peak";
        var bx = x1 - 190;
        box(ctx, bx, 34, 152, 32, { fill: caught ? C.tBad : C.tGood, r: 16 });
        icon(ctx, caught ? "bell" : "check", bx + 20, 50, 16, caught ? C.bad : C.good, 2.6);
        text(ctx, caught ? "Problem caught" : "Promise kept", bx + 36, 50.5, { align: "left", size: 13, weight: 900, color: caught ? "#B91C1C" : C.good });
      }
      modeChip(ctx, mode, slowRush ? { text: "10:00 rush: pages crawl", icon: "users" } : null);
    }
    return { step: step, draw: draw, reset: function () { t = 0; } };
  }

  /* ================================================================== CODE */
  function Code(S, mode) {
    var v = S.variant, t = 0;
    var n = mode === "stress" ? 6 : 1, gap = mode === "stress" ? 1.15 : 1.4, first = 0.9;
    var loop = first + n * gap + (mode === "stress" ? 3.2 : 2.8);
    var itemIcon = S.item || "wallet", coreIcon = S.core || "card";
    var CX = 108, CY = 64, CW = 140;
    function step(dt) { t += dt; if (t > loop) t = 0; }
    function arrived(k) { return t >= first + k * gap + 0.7; }
    function draw(ctx) {
      var got = 0;
      for (var k = 0; k < n; k++) if (arrived(k)) got++;
      var rows = 3 + (v === "ifelse" || v === "formula" ? got : 0);
      var coreH = 26 + rows * 11;
      var heat = v === "ifelse" ? Math.min(1, got / 6) : 0;
      var flashing = false;
      for (var f = 0; f < n; f++) { var at = first + f * gap + 0.7; if (t > at && t < at + 0.5 && (v === "ifelse" || v === "formula")) flashing = true; }
      // copies
      var copies = v === "copy" ? got : 0;
      var bugAt = first + n * gap + 0.3, bug = mode === "stress" && v === "copy" && t > bugAt;
      for (var c = copies; c >= 0; c--) {
        var ox = c * 18, oy = c * 12;
        var fixedUpTo = bug ? Math.floor((t - bugAt) / 0.45) : -1;
        var broken = bug && (c === 0 ? fixedUpTo < 0 : (c === copies ? true : fixedUpTo < c));
        drawCore(ctx, CX + ox, CY + oy, CW, coreH, c === 0 ? 0 : 0, broken, c > 0);
      }
      if (v !== "copy") {
        var stroke = flashing ? C.bad : (heat > 0.5 ? C.bad : heat > 0 ? C.warn : C.good);
        drawCore(ctx, CX, CY, CW, coreH, heat, false, false, stroke);
      }
      if (bug) {
        var wi = Math.min(copies, Math.floor((t - bugAt) / 0.45));
        if (wi < copies) icon(ctx, "wrench", CX + wi * 18 + CW - 8, CY + wi * 12 - 6, 18, C.ink, 2.4);
      }
      // sockets for plug-ins
      if (v === "plugin") {
        for (var s2 = 0; s2 < Math.max(n, 3); s2++) {
          var sx = CX + CW + 26 + Math.floor(s2 / 4) * 56, sy = CY + 6 + (s2 % 4) * 34;
          line(ctx, CX + CW, Math.min(CY + coreH - 10, sy + 12), sx, sy + 12, C.wire, 2);
          box(ctx, sx, sy, 40, 26, { stroke: C.wire, dash: [3, 3], r: 7, lw: 1.5 });
        }
      }
      // database for direct access
      var DBX = 480, DBY = 116;
      if (v === "direct") {
        var lines = got;
        dot(ctx, DBX, DBY, 28, lines > 2 ? C.tBad : C.tBlue);
        icon(ctx, lines > 2 ? "unlock" : "db", DBX, DBY, 26, lines > 2 ? C.bad : C.blue, 2.2);
        line(ctx, CX + CW, CY + coreH / 2, DBX - 30, DBY, C.wire, 2);
      }
      // formula editor admin
      if (v === "formula") {
        dot(ctx, 470, 60, 20, C.tViolet); icon(ctx, "user", 470, 60, 20, C.violet, 2.2);
        box(ctx, 500, 46, 84, 28, { fill: C.surface, stroke: C.line, r: 7 });
        icon(ctx, "table", 514, 60, 14, C.violet, 2.2);
        if (Math.floor(t * 3) % 2) line(ctx, 530 + (t * 20 % 40), 54, 530 + (t * 20 % 40), 66, C.ink, 1.5);
      }
      // items flying in
      for (var i = 0; i < n; i++) {
        var t0 = first + i * gap, p = (t - t0) / 0.7;
        if (p < 0) continue;
        var dest;
        if (v === "ifelse" || v === "formula") dest = { x: CX + CW / 2, y: CY + 26 + (3 + i) * 11 };
        else if (v === "plugin") dest = { x: CX + CW + 46 + Math.floor(i / 4) * 56, y: CY + 19 + (i % 4) * 34 };
        else if (v === "copy") dest = { x: CX + (i + 1) * 18 + CW / 2, y: CY + (i + 1) * 12 + 30 };
        else dest = { x: DBX - 8, y: DBY - 30 + i * 12 };
        var from = { x: 610, y: 60 + (i % 3) * 40 };
        if (v === "formula") from = { x: 540, y: 60 };
        var e = Math.min(1, p), ease = 1 - Math.pow(1 - e, 3);
        var x = from.x + (dest.x - from.x) * ease, y = from.y + (dest.y - from.y) * ease - Math.sin(ease * Math.PI) * 30;
        var badItem = v === "formula" && mode === "stress" && i === 3;
        if (p < 1 || v === "plugin" || v === "direct") {
          if (v === "direct" && p >= 1) { line(ctx, 610, from.y, DBX + 26, DBY - 8 + i * 4, lines > 2 ? C.bad : C.warn, 2, [4, 3]); continue; }
          var tw = 36, th = 24;
          box(ctx, x - tw / 2, y - th / 2, tw, th, { fill: badItem ? C.tBad : C.tViolet, stroke: badItem ? C.bad : C.violet, r: 7 });
          icon(ctx, itemIcon, x, y, 15, badItem ? C.bad : C.violet, 2.2);
        }
      }
      // students row affected by a bad formula
      if (v === "formula") {
        var badT = first + 3 * gap + 0.7, bad = mode === "stress" && t > badT && t < badT + 2.2;
        for (var st2 = 0; st2 < 10; st2++) {
          var px = 300 + st2 * 21, py = 192;
          dot(ctx, px, py, 7, bad ? C.bad : C.tGood);
          icon(ctx, bad ? "frown" : "user", px, py, 10, bad ? "#fff" : C.good, 2.4);
        }
        if (bad) text(ctx, "CGPA 0.00", 300 + 10 * 21 + 4, 192, { align: "left", size: 12, weight: 900, color: C.bad, font: MONO });
      }
      // counters
      var edits = v === "ifelse" || v === "formula" ? got : 0;
      counters(ctx, [
        { icon: "comment", n: edits, color: edits ? C.bad : C.good, hide: v === "copy" || v === "direct" },
        { icon: "copy", n: copies + 1, color: copies ? C.warn : C.ink2, hide: v !== "copy" },
        { icon: "refresh", n: v === "ifelse" ? got * (got + 3) : 0, color: C.warn, hide: v !== "ifelse" },
        { icon: "unlock", n: got, color: C.bad, hide: v !== "direct" },
        { icon: "check", n: v === "plugin" ? got : 0, color: C.good, hide: v !== "plugin" }
      ]);
      modeChip(ctx, mode, mode === "stress" && got >= 3 ? { text: got + " changes later", icon: "refresh" } : null);
    }
    function drawCore(ctx, x, y, w, h, heat, broken, ghost, stroke) {
      var fill = broken ? C.tBad : heat > 0.5 ? C.tBad : heat > 0 ? C.tWarn : C.surface;
      box(ctx, x, y, w, h, { fill: fill, stroke: stroke || (broken ? C.bad : ghost ? C.warn : C.good), r: 12, lw: 2.5 });
      dot(ctx, x + 18, y + 16, 11, C.tBlue);
      icon(ctx, coreIcon, x + 18, y + 16, 13, C.blue, 2.2);
      ctx.fillStyle = "rgba(52,67,90,.22)";
      var rows = Math.round((h - 26) / 11);
      for (var r = 0; r < rows; r++) ctx.fillRect(x + 36 + (r % 3) * 6, y + 26 + r * 11, w - 50 - (r % 3) * 6 - (r * 7 % 20), 4);
      if (broken) { dot(ctx, x + w - 12, y + 12, 8, C.bad); icon(ctx, "x", x + w - 12, y + 12, 10, "#fff", 3); }
    }
    return { step: step, draw: draw, reset: function () { t = 0; } };
  }

  /* ================================================================== GATE */
  function Gate(S, mode) {
    var v = S.variant, attack = S.attack || "guess", R, st;
    var GX = 232, BOT = { x: 58, y: 74 }, USR = { x: 58, y: 172 };
    var COLS = 6, ROWS = 4;
    var weak = attack === "spray" ? [3, 9, 14, 20] : [5, 16];
    var loop = mode === "stress" ? 11 : 8;
    function acc(i) { return { x: 352 + (i % COLS) * 44, y: 54 + Math.floor(i / COLS) * 40 }; }
    function reset() {
      R = rng(21);
      st = { t: 0, att: [], accounts: [], acc: 0, uacc: 0, breached: 0, lockedOut: 0, slowed: 0, alarm: 0, failsGlobal: 0, found: v !== "hidden", sprayI: 0 };
      for (var i = 0; i < 24; i++) st.accounts.push({ tries: 0, locked: false, breached: false, shield: 0, lastTry: -9 });
    }
    function send(kind, i) {
      var from = kind === "bot" ? BOT : USR;
      st.att.push({ kind: kind, acct: i, x: from.x + 14, y: from.y + (R() - 0.5) * 16, phase: "toGate", wait: 0, born: st.t });
    }
    function decide(a) {
      var A = st.accounts[a.acct], t = st.t;
      if (a.kind === "user") {
        if (A.locked) { st.lockedOut++; return "blocked"; }
        if (v === "captcha") st.slowed++;
        return "ok";
      }
      // bot attempt
      if (A.locked || A.breached) return "fail";
      if ((v === "ratelimit") && t - A.lastTry < 2.6) return "wait";
      if (v === "layers" && st.alarm) return "blocked";
      if (v === "captcha" && R() < 0.75) return "blocked";
      A.lastTry = t; A.tries++;
      st.failsGlobal++;
      var success = attack === "spray" ? weak.indexOf(a.acct) >= 0 : (weak.indexOf(a.acct) >= 0 && A.tries >= 4);
      if (success) {
        if (v === "layers") { A.shield = t; return "stopped"; }
        A.breached = true; st.breached++; return "in";
      }
      if (v === "lockout" && A.tries >= 3) A.locked = true;
      return "fail";
    }
    function step(dt) {
      if (st.t > loop) { reset(); return; }
      st.t += dt;
      var t = st.t;
      if (v === "hidden" && !st.found && t > 3.2) st.found = true;
      if (v === "layers" && !st.alarm && st.failsGlobal > 10) st.alarm = t;
      if (v === "ratelimit" && !st.alarm && t > 2.5) st.alarm = t;
      // traffic
      st.uacc += dt * (mode === "stress" ? 0.9 : 1.6);
      while (st.uacc >= 1) { st.uacc--; send("user", Math.floor(R() * 24)); }
      if (mode === "stress" && t > 0.6) {
        st.acc += dt * (attack === "spray" ? 5 : 7);
        while (st.acc >= 1) {
          st.acc--;
          var i = attack === "spray" ? (st.sprayI++ % 24) : [5, 16, 2, 8, 11, 19, 22, 0, 13][Math.floor(R() * 9)];
          send("bot", i);
        }
      } else if (mode === "preview" && v === "lockout" && t > 1 && t < 1.05) { send("user", 7); }
      // movement
      st.att.forEach(function (a) {
        var speed = 210 * dt;
        if (a.phase === "toGate") {
          var gx = GX - 12, gy = MID + (a.y - MID) * 0.4;
          if (!st.found && a.kind === "bot") { a.x += Math.sin(t * 5 + a.born * 7) * 1.2; a.y += Math.cos(t * 4 + a.born * 3) * 1.2; a.x = Math.min(a.x + speed * 0.15, GX - 60); return; }
          var dx = gx - a.x, dy = gy - a.y, d = Math.sqrt(dx * dx + dy * dy);
          if (d <= speed) {
            a.x = gx; a.y = gy;
            if ((v === "captcha") && !a.puzzled) { a.puzzled = true; a.wait = 0.9; a.phase = "wait"; return; }
            var res = decide(a);
            if (res === "wait") { a.phase = "wait"; a.wait = 0.6; st.slowed += a.kind === "user" ? 1 : 0; return; }
            a.res = res;
            if (res === "blocked" || res === "stopped") { a.phase = "dead"; a.deadAt = t; return; }
            var to = acc(a.acct); a.tx = to.x; a.ty = to.y; a.phase = "toAcct";
          } else { a.x += dx / d * speed; a.y += dy / d * speed; }
        } else if (a.phase === "wait") {
          a.wait -= dt; if (a.wait <= 0) a.phase = "toGate";
        } else if (a.phase === "toAcct") {
          var ex = a.tx - a.x, ey = a.ty - a.y, e = Math.sqrt(ex * ex + ey * ey);
          if (e <= speed) { a.gone = true; } else { a.x += ex / e * speed; a.y += ey / e * speed; }
        } else if (a.phase === "dead") { if (t - a.deadAt > 0.6) a.gone = true; }
      });
      st.att = st.att.filter(function (a) { return !a.gone; });
    }
    function draw(ctx) {
      var t = st.t;
      // sources
      if (mode === "stress") {
        dot(ctx, BOT.x, BOT.y, 22, "#FCE7F3"); icon(ctx, "bot", BOT.x, BOT.y, 22, C.bot, 2.2);
        if (attack === "spray") { box(ctx, BOT.x + 10, BOT.y - 30, 36, 16, { fill: C.bot, r: 8 }); text(ctx, "×100", BOT.x + 28, BOT.y - 21.5, { size: 10, color: "#fff", weight: 800 }); }
      }
      dot(ctx, USR.x, USR.y, 22, C.tBlue); icon(ctx, "users", USR.x, USR.y, 22, C.blue, 2.2);
      // gate
      var gi = { lockout: "ban", strongpw: "password", ratelimit: "timer", hidden: "eyeOff", peraccount: "shield", captcha: "grid", layers: "activity" }[v];
      var gate = st.found ? 1 : 0.3;
      ctx.globalAlpha = gate;
      box(ctx, GX - 14, 42, 28, 160, { fill: C.surface, stroke: v === "hidden" && !st.found ? C.wire : "#9DB2D0", dash: v === "hidden" && !st.found ? [4, 4] : [], r: 12 });
      ctx.globalAlpha = 1;
      dot(ctx, GX, MID, 17, st.alarm ? C.tGood : C.surface2);
      icon(ctx, gi, GX, MID, 18, st.alarm ? C.good : C.ink2, 2.2);
      if (v === "hidden" && !st.found && mode === "stress") { icon(ctx, "search", GX - 70 + Math.sin(t * 3) * 10, MID - 40, 18, C.bot, 2.4); }
      if (st.alarm) {
        var sh = Math.sin(t * 25) * 3;
        dot(ctx, GX, 30, 12, C.tWarn); icon(ctx, "bell", GX + sh, 30, 14, "#B45309", 2.4);
      }
      if (v === "layers") {
        var g = Math.min(1, st.failsGlobal / 10);
        box(ctx, GX + 20, 60, 6, 120, { fill: C.surface2, r: 3 });
        box(ctx, GX + 20, 60 + 120 * (1 - g), 6, 120 * g, { fill: g >= 1 ? C.bad : C.warn, r: 3 });
      }
      // accounts
      for (var i = 0; i < 24; i++) {
        var A = st.accounts[i], p = acc(i);
        var fill = A.breached ? "#FCE7F3" : A.locked ? C.surface2 : C.surface;
        var stroke = A.breached ? C.bot : A.locked ? "#9AA6B6" : C.line;
        box(ctx, p.x - 18, p.y - 16, 36, 32, { fill: fill, stroke: stroke, r: 8 });
        icon(ctx, A.locked ? "lock" : A.breached ? "unlock" : "user", p.x, p.y - 3, 14, A.breached ? C.bot : A.locked ? C.muted : C.ink2, 2.2);
        for (var k = 0; k < Math.min(5, A.tries); k++) dot(ctx, p.x - 10 + k * 5, p.y + 10, 1.8, C.bot);
        if (A.shield && t - A.shield < 1.6) { dot(ctx, p.x + 13, p.y - 12, 8, C.good); icon(ctx, "phone", p.x + 13, p.y - 12, 10, "#fff", 2.4); }
      }
      // attempts
      st.att.forEach(function (a) {
        var col = a.kind === "bot" ? C.bot : C.card;
        if (a.phase === "dead") {
          var al = 1 - (t - a.deadAt) / 0.6;
          dot(ctx, a.x, a.y, 4.5, a.res === "stopped" ? C.good : C.muted, al);
          ring(ctx, a.x, a.y, 8, a.kind === "user" ? C.bad : C.good, 2, al);
          return;
        }
        if (a.phase === "wait") { dot(ctx, a.x - 8, a.y, 4.5, col); icon(ctx, v === "captcha" ? "grid" : "hourglass", a.x - 8, a.y - 11, 10, C.warn, 2.2); return; }
        dot(ctx, a.x, a.y, 4.5, col);
      });
      counters(ctx, [
        { icon: "unlock", n: st.breached, color: st.breached ? C.bot : C.good },
        { icon: "lock", n: st.lockedOut, color: st.lockedOut ? C.bad : C.good, hide: v !== "lockout" },
        { icon: "hourglass", n: st.slowed, color: C.warn, hide: v !== "captcha" }
      ]);
      var cap = mode === "stress" && t > 0.6 ? { text: attack === "spray" ? "Bots try 123456 on everyone" : "Bots guess passwords", icon: "bot" } : null;
      modeChip(ctx, mode, cap);
    }
    reset();
    return { step: step, draw: draw, reset: reset };
  }

  /* ================================================================== DOORS */
  function Doors(S, mode) {
    var v = S.variant, t = 0, loop = 7.5;
    var DOORS = 5, D0 = 268, DS = 76, DY = 74, DH = 92;
    var ids = { scramble: ["k2Q9", "Zp7x", "m4Rt", "Wq8e", "J3vy"], hide: ["•••", "•••", "•••", "•••", "•••"] }[v] || ["4511", "4512", "4513", "4514", "4515"];
    var own = 1, friend = 2, goal = mode === "stress" ? friend : own;
    var granted = !(mode === "stress" && v === "check");
    function step(dt) { t += dt; if (t > loop) t = 0; }
    function dx(i) { return D0 + i * DS; }
    function draw(ctx) {
      // path timeline: 0-1 to gate, 1-1.8 gate check, 1.8-3 to door, 3-3.8 door check, then result
      var sx = 50, sy = MID + 20, gateX = 168;
      var px, py;
      if (t < 1) { px = sx + (gateX - 22 - sx) * t; py = sy; }
      else if (t < 1.8) { px = gateX - 22; py = sy; }
      else if (t < 3) { var u = (t - 1.8) / 1.2; px = gateX + 18 + (dx(goal) - gateX - 18) * u; py = sy; }
      else { px = dx(goal); py = sy; }
      // gate
      var strict = v === "stricter";
      box(ctx, gateX - 12, 52, 24, 140, { fill: C.surface, stroke: "#9DB2D0", r: 10 });
      dot(ctx, gateX, MID, strict ? 18 : 14, t > 1 && t < 1.8 ? C.tGood : C.surface2);
      icon(ctx, strict ? "idCard" : "lock", gateX, MID, strict ? 18 : 15, t > 1 && t < 1.8 ? C.good : C.ink2, 2.2);
      if (strict && t > 1 && t < 1.8) line(ctx, gateX - 30, sy - 12 + ((t - 1) * 60 % 24), gateX - 14, sy - 12 + ((t - 1) * 60 % 24), C.good, 2);
      // doors
      for (var i = 0; i < DOORS; i++) {
        var x = dx(i), open = (i === goal && t > 3.8 && granted);
        var deny = i === goal && t > 3.8 && !granted;
        var leak = open && mode === "stress";
        box(ctx, x - 26, DY, 52, DH, { fill: leak ? C.tBad : open ? C.tGood : C.surface, stroke: leak ? C.bad : open ? C.good : deny ? C.good : "#9DB2D0", r: 8 });
        if (open) box(ctx, x - 26, DY, 18, DH, { fill: leak ? "#FCA5A5" : "#86EFAC", r: 8 });
        else dot(ctx, x + 14, DY + DH / 2, 3, C.ink2);
        text(ctx, ids[i], x, DY - 12, { size: 11, weight: 800, font: MONO, color: i === own ? C.blue : C.ink2 });
        if (i === own) { box(ctx, x - 20, DY + DH + 6, 40, 14, { fill: C.tBlue, r: 7 }); icon(ctx, "user", x, DY + DH + 13, 10, C.blue, 2.4); }
        if (v === "check") { dot(ctx, x, DY + 18, 10, (deny ? C.tGood : C.tViolet)); icon(ctx, "shieldCheck", x, DY + 18, 13, deny ? C.good : C.violet, 2.2); }
        if (deny) { dot(ctx, x, DY + DH / 2 + 8, 14, C.good); icon(ctx, "x", x, DY + DH / 2 + 8, 14, "#fff", 3); }
      }
      // helpers that make the stress case work
      if (mode === "stress") {
        if (v === "scramble" && t > 1.8 && t < 3) { var u2 = (t - 1.8) / 1.2; var bx = dx(friend) + (px - dx(friend)) * u2; dot(ctx, bx, 44, 11, C.tBlue); icon(ctx, "msg", bx, 44, 13, C.blue, 2.2); }
        if (v === "hide" && t > 1.8 && t < 3.6) { dot(ctx, px, sy - 30, 11, C.tWarn); icon(ctx, "wrench", px, sy - 30, 13, "#B45309", 2.2); }
      }
      // the student
      dot(ctx, px, py, 13, C.card); icon(ctx, "user", px, py, 15, "#fff", 2.4);
      if (t > 3.8) {
        var ok = granted && mode !== "stress";
        var leak2 = granted && mode === "stress";
        if (leak2) { box(ctx, dx(goal) - 46, DY + DH + 26, 92, 20, { fill: C.tBad, r: 10 }); text(ctx, "Leaked!", dx(goal), DY + DH + 36.5, { size: 11, weight: 900, color: "#B91C1C" }); }
        if (ok) { box(ctx, dx(goal) - 40, DY + DH + 26, 80, 20, { fill: C.tGood, r: 10 }); text(ctx, "Own result", dx(goal), DY + DH + 36.5, { size: 11, weight: 900, color: C.good }); }
        if (!granted) { box(ctx, dx(goal) - 40, DY + DH + 26, 80, 20, { fill: C.tGood, r: 10 }); text(ctx, "Denied", dx(goal), DY + DH + 36.5, { size: 11, weight: 900, color: C.good }); }
      }
      counters(ctx, [{ icon: "unlock", n: mode === "stress" && granted && t > 3.8 ? 1 : 0, color: mode === "stress" && granted && t > 3.8 ? C.bad : C.good }]);
      modeChip(ctx, mode, mode === "stress" ? { text: "Opening a friend’s result", icon: "user" } : null);
    }
    return { step: step, draw: draw, reset: function () { t = 0; } };
  }

  var KINDS = { flow: Flow, grid100: Grid100, promise: Promise_, code: Code, gate: Gate, doors: Doors };

  /* ------------------------------------------------------------------ mount */
  function mount(el, qd, od, mode) {
    var spec = resolve(qd, od, mode);
    var Kind = KINDS[spec.kind];
    if (!Kind) { el.innerHTML = ""; return { destroy: function () {} }; }
    var canvas = document.createElement("canvas");
    canvas.className = "demo-canvas";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", (od && od.alt) || "Animated demonstration");
    el.innerHTML = "";
    el.appendChild(canvas);
    var ctx = canvas.getContext("2d");
    var inst = Kind(spec, mode);
    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var dpr = 1, scale = 1, raf = 0, last = performance.now(), dead = false, lastW = 0;
    function resize() {
      // The canvas height comes from its CSS aspect ratio, so resizing never changes the page layout.
      var w = canvas.clientWidth || el.clientWidth || 600;
      if (Math.abs(w - lastW) < 1) return;
      lastW = w;
      dpr = window.devicePixelRatio || 1; scale = w / W;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(H * scale * dpr);
    }
    var ro = window.ResizeObserver ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(el); else window.addEventListener("resize", resize);
    resize();
    if (reduced) { for (var i = 0; i < 120; i++) inst.step(0.05); }
    canvas.addEventListener("click", function () { inst.reset(); });
    function frame(now) {
      if (dead) return;
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!reduced) inst.step(dt);
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
      ctx.clearRect(0, 0, W, H);
      inst.draw(ctx);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return {
      destroy: function () { dead = true; cancelAnimationFrame(raf); if (ro) ro.disconnect(); else window.removeEventListener("resize", resize); }
    };
  }

  return { mount: mount, resolve: resolve };
})();
