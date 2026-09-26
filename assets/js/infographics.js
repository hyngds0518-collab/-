/*
 * 인포그래픽 부품 (SVG/HTML)
 * - floorPlan : 회의 장소를 층별 아이소메트릭 도면 위에 표시
 * - ring / ringSet / semiGauge / waffle / pictogram / steps / progressRows
 */
(function (root) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function hex2rgb(h) { h = String(h).replace('#', '').trim(); if (h.length === 3) h = h.replace(/./g, '$&$&'); var n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function mix(a, b, t) {
    var x = hex2rgb(a), y = hex2rgb(b);
    return '#' + [0, 1, 2].map(function (i) { return ('0' + Math.round(x[i] + (y[i] - x[i]) * t).toString(16)).slice(-2); }).join('');
  }
  function f1(n) { return Math.round(n * 10) / 10; }
  function pts(arr) { return arr.map(function (p) { return f1(p[0]) + ',' + f1(p[1]); }).join(' '); }

  // =====================================================================
  // 회의 장소 도면 (층별 분해 아이소메트릭)
  // =====================================================================
  var W = 460, D = 170, G = 118;
  var SLOTS = [[10, 92, 150, 68], [300, 92, 150, 68], [170, 92, 120, 68], [10, 10, 120, 70], [330, 10, 120, 70]];
  var CORE = [140, 10, 80, 70], LOUNGE = [230, 10, 90, 70];

  function floorPlan(meetings, opt) {
    opt = opt || {};
    var T = opt.tokens, compact = !!opt.compact, sel = opt.selected || [];
    var dark = T.dark;
    // 장소별 집계
    var rooms = {};
    meetings.forEach(function (m) {
      var s = m.site; if (!s) return;
      var r = rooms[s.key] || (rooms[s.key] = { key: s.key, building: s.building, floor: s.floor, room: s.room, list: [], remote: [] });
      r.list.push(m);
      if (s.remote) r.remote.push({ m: m, to: s.remote });
    });
    var allRooms = opt.allRooms || rooms;
    var hqName = mostCommonBuilding(allRooms);
    var floorsAll = uniq(Object.keys(allRooms).map(function (k) { return allRooms[k]; }).filter(function (r) { return r.building === hqName && r.floor; }).map(function (r) { return +r.floor; })).sort(function (a, b) { return a - b; });
    if (!floorsAll.length) floorsAll = [1];
    var lo = floorsAll[0], hi = floorsAll[floorsAll.length - 1];
    var floors = []; for (var f = lo; f <= hi; f++) floors.push(f);
    var externals = uniq(Object.keys(allRooms).map(function (k) { return allRooms[k]; }).filter(function (r) { return r.building !== hqName || !r.floor; }).map(function (r) { return r.building; }));
    var maxN = Math.max.apply(null, Object.keys(rooms).map(function (k) { return rooms[k].list.length; }).concat([1]));

    var ox = compact ? 60 : 78, baseY = 40 + (floors.length - 1) * G + 70 + 60;
    function P(x, y, z) { return [ox + x + y * 0.55, baseY + y * 0.3 - z]; }

    var ink = T.ink, ink2 = T.ink2, muted = T.muted, line = dark ? '#3a4557' : '#c9d1de', surf = T.surface;
    var slabTop = dark ? '#1b2331' : '#f6f8fc', slabSide = dark ? '#141b26' : '#e6ebf3';
    var roomLo = dark ? '#1f3358' : '#e3ecff', roomHi = T.s[0];
    var ctxTop = dark ? '#18202c' : '#ffffff', green = dark ? '#2c4a2a' : '#dcecc9', greenDk = dark ? '#4c8a3f' : '#8fc16a';
    var accent = T.s[0], crit = T.critical;

    var svg = [], callouts = [], anchors = {};
    function box(x, y, z, w, d, h, top, side, stroke, sw, extra) {
      var a = P(x, y, z), b = P(x + w, y, z), c = P(x + w, y + d, z), e = P(x, y + d, z);
      var a2 = P(x, y, z + h), b2 = P(x + w, y, z + h), c2 = P(x + w, y + d, z + h), e2 = P(x, y + d, z + h);
      var sd = mix(side, '#000000', dark ? 0.25 : 0.1);
      return '<g' + (extra || '') + '>' +
        (h > 0 ? '<polygon points="' + pts([a, e, e2, a2]) + '" style="fill:' + sd + ';stroke:' + stroke + ';stroke-width:' + sw + '"/>' +
          '<polygon points="' + pts([e, c, c2, e2]) + '" style="fill:' + side + ';stroke:' + stroke + ';stroke-width:' + sw + '"/>' : '') +
        '<polygon points="' + pts([a2, b2, c2, e2]) + '" style="fill:' + top + ';stroke:' + stroke + ';stroke-width:' + sw + '"/></g>';
    }
    function tree(x, y, z, r) {
      var c = P(x, y, z);
      return '<ellipse cx="' + f1(c[0]) + '" cy="' + f1(c[1] + r * 0.35) + '" rx="' + r + '" ry="' + f1(r * 0.35) + '" style="fill:rgba(0,0,0,.06)"/>' +
        '<circle cx="' + f1(c[0]) + '" cy="' + f1(c[1] - r * 0.6) + '" r="' + r + '" style="fill:' + greenDk + ';opacity:.85"/>' +
        '<circle cx="' + f1(c[0] - r * 0.35) + '" cy="' + f1(c[1] - r * 0.9) + '" r="' + f1(r * 0.55) + '" style="fill:' + mix(greenDk, '#ffffff', 0.35) + '"/>';
    }

    // 코어 수직선 (층 연결)
    var coreLines = '';
    if (floors.length > 1) {
      [[0, 0], [W, 0], [0, D], [W, D]].forEach(function (c) {
        var p1 = P(c[0], c[1], 0), p2 = P(c[0], c[1], (floors.length - 1) * G);
        coreLines += '<line x1="' + f1(p1[0]) + '" y1="' + f1(p1[1]) + '" x2="' + f1(p2[0]) + '" y2="' + f1(p2[1]) + '" style="stroke:' + line + ';stroke-width:1;stroke-dasharray:3 4"/>';
      });
    }
    svg.push(coreLines);

    floors.forEach(function (fl, fi) {
      var z = fi * G;
      svg.push(box(0, 0, z - 6, W, D, 6, slabTop, slabSide, line, 1));
      // 층 라벨
      var lp = P(0, D, z);
      svg.push('<text x="' + f1(lp[0] - 14) + '" y="' + f1(lp[1] - 2) + '" text-anchor="end" style="font-size:' + (compact ? 22 : 20) + 'px;font-weight:800;fill:' + muted + ';letter-spacing:-.02em">' + fl + 'F</text>');
      var fr = Object.keys(allRooms).map(function (k) { return allRooms[k]; }).filter(function (r) { return r.building === hqName && +r.floor === fl; });
      fr.sort(function (a, b) { return (rooms[b.key] ? rooms[b.key].list.length : 0) - (rooms[a.key] ? rooms[a.key].list.length : 0) || a.room.localeCompare(b.room); });
      var used = fr.slice(0, SLOTS.length);
      // 그리기 순서: 뒤(y 작음) → 앞
      var items = [];
      SLOTS.forEach(function (sl, i) { items.push({ sl: sl, r: used[i] || null }); });
      items.push({ sl: CORE, core: true });
      items.push({ sl: LOUNGE, lounge: true });
      items.sort(function (a, b) { return a.sl[1] - b.sl[1] || a.sl[0] - b.sl[0]; });
      items.forEach(function (it) {
        var s = it.sl;
        if (it.core) { svg.push(box(s[0], s[1], z, s[2], s[3], 3, slabSide, slabSide, line, 1)); return; }
        if (it.lounge) {
          svg.push(box(s[0], s[1], z, s[2], s[3], 2, green, green, mix(green, '#000', .12), 1));
          svg.push(tree(s[0] + 25, s[1] + 30, z + 2, 7) + tree(s[0] + 55, s[1] + 22, z + 2, 9) + tree(s[0] + 68, s[1] + 50, z + 2, 6));
          return;
        }
        if (!it.r) { svg.push(box(s[0], s[1], z, s[2], s[3], 5, ctxTop, ctxTop, line, 1)); return; }
        var r = rooms[it.r.key], n = r ? r.list.length : 0;
        var isSel = sel.indexOf(it.r.key) >= 0;
        if (!n) { svg.push(box(s[0] + 4, s[1] + 4, z, s[2] - 8, s[3] - 8, 8, ctxTop, ctxTop, line, 1, ' class="fp-room" data-place="' + esc(it.r.key) + '"')); return; }
        var h = 14 + n / maxN * 46;
        var top = mix(roomLo, roomHi, 0.15 + 0.75 * n / maxN), side = mix(top, dark ? '#000000' : '#1e3a8a', dark ? .2 : .18);
        var urgent = r.list.some(function (m) { return m.nature === '긴급'; });
        var stroke = isSel ? ink : mix(top, '#1e3a8a', dark ? .1 : .35);
        var title = it.r.key + ' · ' + n + '회\n' + r.list.map(function (m) { return m.date + ' ' + m.title; }).join('\n');
        svg.push('<g class="fp-room" data-place="' + esc(it.r.key) + '" role="button" tabindex="0" style="cursor:pointer"><title>' + esc(title) + '</title>' +
          box(s[0] + 4, s[1] + 4, z, s[2] - 8, s[3] - 8, h, top, side, stroke, isSel ? 2.2 : 1) +
          (urgent ? '' : '') + '</g>');
        // 윗면 숫자
        var tc = P(s[0] + s[2] / 2, s[1] + s[3] / 2, z + h);
        svg.push('<text x="' + f1(tc[0]) + '" y="' + f1(tc[1] + 4) + '" text-anchor="middle" style="font-size:' + (compact ? 15 : 13) + 'px;font-weight:800;fill:' + (n / maxN > 0.5 ? '#fff' : ink) + ';pointer-events:none">' + n + '</text>');
        if (urgent) {
          var up = P(s[0] + s[2] - 14, s[1] + 12, z + h);
          svg.push('<g style="pointer-events:none"><path d="M' + f1(up[0]) + ' ' + f1(up[1] - 13) + ' l7 12 h-14 z" style="fill:' + crit + ';stroke:' + surf + ';stroke-width:1.5"/><text x="' + f1(up[0]) + '" y="' + f1(up[1] - 3) + '" text-anchor="middle" style="font-size:8px;font-weight:900;fill:#fff">!</text></g>');
        }
        anchors[it.r.key] = P(s[0] + s[2] - 10, s[1] + s[3] / 2, z + h);
        callouts.push({ key: it.r.key, r: r, at: P(s[0] + s[2] * 0.7, s[1] + 8, z + h), sel: isSel, name: fl + 'F ' + it.r.room, urgent: urgent });
      });
    });

    // 외부 사이트 (예: 푸드앤코 이천공장)
    var extAnchor = {}, EXT_Y = D + 44;
    externals.forEach(function (b, i) {
      var r = Object.keys(allRooms).map(function (k) { return allRooms[k]; }).filter(function (x) { return x.building === b; })[0];
      var ew = 130, ed = 80, ex = W - ew - 10 - i * (ew + 30), ey = EXT_Y;
      var r2 = rooms[r.key], n = r2 ? r2.list.length : 0;
      var isSel = sel.indexOf(r.key) >= 0;
      svg.push(box(ex, ey, -6, ew, ed, 6, slabTop, slabSide, line, 1));
      svg.push(tree(ex + 18, ey + 16, 0, 7) + tree(ex + 112, ey + 74, 0, 6));
      var top = n ? mix(roomLo, roomHi, 0.15 + 0.75 * n / maxN) : ctxTop;
      var hh = n ? 14 + n / maxN * 46 : 8;
      svg.push('<g class="fp-room" data-place="' + esc(r.key) + '" role="button" tabindex="0" style="cursor:pointer"><title>' + esc(r.key + ' · ' + n + '회') + '</title>' +
        box(ex + 30, ey + 26, 0, 70, 42, hh, top, n ? mix(top, '#1e3a8a', .18) : ctxTop, isSel ? ink : line, isSel ? 2.2 : 1) + '</g>');
      if (n) { var tc = P(ex + 65, ey + 47, hh); svg.push('<text x="' + f1(tc[0]) + '" y="' + f1(tc[1] + 4) + '" text-anchor="middle" style="font-size:13px;font-weight:800;fill:' + ink + ';pointer-events:none">' + n + '</text>'); }
      var lb = P(ex, ey + ed, 0);
      svg.push('<text x="' + f1(lb[0]) + '" y="' + f1(lb[1] + 20) + '" style="font-size:12px;font-weight:800;fill:' + ink2 + '">' + esc(b) + '</text>');
      extAnchor[b] = P(ex + 65, ey + 47, hh + 4);
      if (n) callouts.push({ key: r.key, r: r2, at: P(ex + 80, ey + 30, hh), sel: isSel, name: b, ext: true });
    });

    // 원격(화상) 연결
    var remotes = [];
    Object.keys(rooms).forEach(function (k) {
      rooms[k].remote.forEach(function (x) { remotes.push({ from: k, to: x.to, m: x.m }); });
    });
    var pillY = P(0, D + 70, 0)[1] + 10, pillX = P(0, D + 70, 0)[0] - 40, pills = {};
    remotes.forEach(function (rm) {
      var a = anchors[rm.from]; if (!a) return;
      var target = null;
      var want = rm.to.replace(/\s*화상.*$/, '').trim();
      externals.forEach(function (b) { if (want && (b.indexOf(want) >= 0 || want.indexOf(b.replace(/^\S+\s+/, '')) >= 0)) target = extAnchor[b]; });
      var label = /대행사/.test(rm.to) ? '외부 대행사' : /화상/.test(rm.to) && !target ? '원격 참여' : '';
      if (!target) {
        if (!pills[label]) { pills[label] = [pillX + Object.keys(pills).length * 110, pillY]; }
        target = [pills[label][0] + 45, pills[label][1] - 10];
      }
      var mx = (a[0] + target[0]) / 2, my = Math.min(a[1], target[1]) - 40;
      svg.push('<path d="M' + f1(a[0]) + ' ' + f1(a[1]) + ' Q' + f1(mx) + ' ' + f1(my) + ' ' + f1(target[0]) + ' ' + f1(target[1]) + '" style="fill:none;stroke:' + accent + ';stroke-width:1.6;stroke-dasharray:2 4;stroke-linecap:round;opacity:.9"><title>' + esc(rm.m.id + ' 화상 연결 (' + rm.to + ')') + '</title></path>' +
        '<circle cx="' + f1(target[0]) + '" cy="' + f1(target[1]) + '" r="3" style="fill:' + accent + '"/>');
    });
    Object.keys(pills).forEach(function (k) {
      var p = pills[k];
      svg.push('<g><rect x="' + p[0] + '" y="' + (p[1] - 22) + '" width="92" height="24" rx="12" style="fill:' + surf + ';stroke:' + accent + ';stroke-width:1;stroke-dasharray:3 3"/>' +
        '<text x="' + (p[0] + 46) + '" y="' + (p[1] - 6) + '" text-anchor="middle" style="font-size:11px;font-weight:700;fill:' + accent + '">' + esc(k) + '</text></g>');
    });

    // 오른쪽 콜아웃 (지시선 + 라벨)
    var cx = compact ? 0 : P(W, D, 0)[0] + 44;
    var vbW = compact ? P(W, D, 0)[0] + 20 : cx + 190;
    if (!compact) {
      callouts.sort(function (a, b) { return a.at[1] - b.at[1]; });
      var lastY = 10;
      callouts.forEach(function (c) {
        var y = Math.max(c.at[1], lastY + 44); lastY = y;
        var cnt = { '정기': 0, '임시': 0, '긴급': 0 };
        c.r.list.forEach(function (m) { cnt[m.nature] = (cnt[m.nature] || 0) + 1; });
        svg.push('<polyline points="' + pts([c.at, [c.at[0] + 12, y], [cx - 6, y]]) + '" style="fill:none;stroke:' + (c.sel ? ink : muted) + ';stroke-width:1"/>' +
          '<circle cx="' + f1(c.at[0]) + '" cy="' + f1(c.at[1]) + '" r="2.5" style="fill:' + (c.sel ? ink : muted) + '"/>' +
          '<g class="fp-room" data-place="' + esc(c.key) + '" style="cursor:pointer">' +
          '<text x="' + cx + '" y="' + f1(y - 4) + '" style="font-size:12.5px;font-weight:800;fill:' + ink + '">' + esc(c.name) + '</text>' +
          '<text x="' + cx + '" y="' + f1(y + 12) + '" style="font-size:11px;fill:' + ink2 + '"><tspan style="font-weight:800;fill:' + accent + '">' + c.r.list.length + '회</tspan>' +
          (cnt['정기'] ? '  · 정기 ' + cnt['정기'] : '') + (cnt['임시'] ? ' · 임시 ' + cnt['임시'] : '') + (cnt['긴급'] ? ' · 긴급 ' + cnt['긴급'] : '') + '</text></g>');
      });
    }
    var topY = P(0, 0, (floors.length - 1) * G + 70)[1] - 20;
    var bottom = Math.max(P(0, externals.length ? EXT_Y + 80 : D, 0)[1] + 30, Object.keys(pills).length ? pillY + 14 : 0);
    var vbH = bottom - topY;
    return '<svg class="floorplan" viewBox="' + (compact ? 0 : 0) + ' ' + f1(topY) + ' ' + f1(vbW) + ' ' + f1(vbH) + '" role="img" aria-label="회의 장소 도면" preserveAspectRatio="xMidYMid meet">' + svg.join('') + '</svg>';
  }
  function mostCommonBuilding(rooms) {
    var c = {};
    Object.keys(rooms).forEach(function (k) { var r = rooms[k]; if (r.floor) c[r.building] = (c[r.building] || 0) + 1; });
    var best = null; Object.keys(c).forEach(function (b) { if (!best || c[b] > c[best]) best = b; });
    return best || '';
  }
  function uniq(a) { return a.filter(function (v, i) { return a.indexOf(v) === i; }); }

  function floorLegend(T) {
    var I = function (html) { return '<svg width="30" height="22" viewBox="0 0 30 22">' + html + '</svg>'; };
    return '<div class="fp-legend">' +
      '<span>' + I('<polygon points="4,8 18,8 26,4 12,4" fill="#fff" stroke="#c9d1de"/><polygon points="4,8 18,8 18,14 4,14" fill="#eef1f6" stroke="#c9d1de"/>') + '기타 공간</span>' +
      '<span>' + I('<polygon points="4,6 18,6 26,2 12,2" fill="' + mix('#e3ecff', T.s[0], .5) + '" stroke="#6b8fe8"/><polygon points="4,6 18,6 18,18 4,18" fill="' + mix('#e3ecff', T.s[0], .75) + '" stroke="#6b8fe8"/>') + '회의실 (높이·색 = 회의 수)</span>' +
      '<span>' + I('<polygon points="4,12 18,12 26,8 12,8" fill="#dcecc9" stroke="#b5d39a"/><circle cx="14" cy="8" r="4" fill="#8fc16a"/>') + '라운지</span>' +
      '<span>' + I('<path d="M3 16 Q15 2 27 12" fill="none" stroke="' + T.s[0] + '" stroke-width="1.6" stroke-dasharray="2 4" stroke-linecap="round"/>') + '화상 연결</span>' +
      '<span>' + I('<path d="M15 4 l8 13 h-16 z" fill="' + T.critical + '"/><text x="15" y="15" text-anchor="middle" font-size="8" font-weight="900" fill="#fff">!</text>') + '긴급회의 개최</span></div>';
  }

  // =====================================================================
  // 진행 링 / 반원 게이지 / 와플 / 픽토그램 / 단계 / 진행 막대
  // =====================================================================
  function ring(pct, o) {
    o = o || {};
    var s = o.size || 96, sw = o.stroke || 8, r = (s - sw) / 2, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct));
    return '<svg class="ring" width="' + s + '" height="' + s + '" viewBox="0 0 ' + s + ' ' + s + '" role="img" aria-label="' + esc((o.label || '') + ' ' + f1(pct) + '%') + '">' +
      (o.ticks ? ticks(s / 2, s / 2, r + sw / 2 + 4, 60, o.track) : '') +
      '<circle cx="' + s / 2 + '" cy="' + s / 2 + '" r="' + r + '" style="fill:none;stroke:' + o.track + ';stroke-width:' + sw + '"/>' +
      '<circle cx="' + s / 2 + '" cy="' + s / 2 + '" r="' + r + '" transform="rotate(-90 ' + s / 2 + ' ' + s / 2 + ')" style="fill:none;stroke:' + o.color + ';stroke-width:' + sw + ';stroke-linecap:round;stroke-dasharray:' + f1(c * p / 100) + ' ' + f1(c) + '"/>' +
      '<text x="50%" y="' + (o.sub ? '47%' : '53%') + '" text-anchor="middle" dominant-baseline="middle" style="font-size:' + (o.fs || s * 0.22) + 'px;font-weight:800;fill:' + (o.ink || 'currentColor') + ';letter-spacing:-.02em">' + esc(o.center != null ? o.center : Math.round(pct) + '%') + '</text>' +
      (o.sub ? '<text x="50%" y="66%" text-anchor="middle" style="font-size:' + Math.max(9, s * 0.1) + 'px;font-weight:600;fill:' + o.muted + '">' + esc(o.sub) + '</text>' : '') + '</svg>';
  }
  function ticks(cx, cy, r, n, col) {
    var out = '';
    for (var i = 0; i < n; i++) {
      var a = i / n * Math.PI * 2 - Math.PI / 2, r2 = r + (i % 5 ? 3 : 5);
      out += '<line x1="' + f1(cx + Math.cos(a) * r) + '" y1="' + f1(cy + Math.sin(a) * r) + '" x2="' + f1(cx + Math.cos(a) * r2) + '" y2="' + f1(cy + Math.sin(a) * r2) + '" style="stroke:' + col + ';stroke-width:1"/>';
    }
    return out;
  }
  // items: [{k, pct, color, value}]
  function ringSet(items, T, size) {
    return '<div class="ring-set">' + items.map(function (it) {
      return '<div class="ring-item">' + ring(it.pct, { size: size || 84, stroke: 7, color: it.color, track: T.grid, ink: T.ink, muted: T.muted, label: it.k }) +
        '<b>' + esc(it.k) + '</b><small>' + esc(it.value || '') + '</small></div>';
    }).join('') + '</div>';
  }
  function semiGauge(pct, o) {
    o = o || {};
    var pad = o.segments ? 26 : 6, w = o.width || 160, sw = o.stroke || 12, r = w / 2 - sw - pad, cx = w / 2, cy = r + sw + pad, p = Math.max(0, Math.min(1, pct / (o.max || 100)));
    function pt(t, rr) { var a = Math.PI * (1 - t); return [cx + Math.cos(a) * rr, cy - Math.sin(a) * rr]; }
    var a0 = pt(0, r), a1 = pt(1, r), ap = pt(p, r);
    var tk = '';
    for (var i = 0; i <= 20; i++) { var q1 = pt(i / 20, r + sw / 2 + 3), q2 = pt(i / 20, r + sw / 2 + (i % 5 ? 6 : 9)); tk += '<line x1="' + f1(q1[0]) + '" y1="' + f1(q1[1]) + '" x2="' + f1(q2[0]) + '" y2="' + f1(q2[1]) + '" style="stroke:' + o.track + ';stroke-width:1"/>'; }
    var tgt = o.target != null ? pt(Math.min(1, o.target / (o.max || 100)), 0) : null;
    var tg = o.target != null ? (function () { var t = Math.min(1, o.target / (o.max || 100)), u1 = pt(t, r - sw / 2 - 3), u2 = pt(t, r + sw / 2 + 3); return '<line x1="' + f1(u1[0]) + '" y1="' + f1(u1[1]) + '" x2="' + f1(u2[0]) + '" y2="' + f1(u2[1]) + '" style="stroke:' + o.ink + ';stroke-width:2"/>'; })() : '';
    void tgt;
    return '<svg class="gauge" width="100%" viewBox="0 0 ' + w + ' ' + (cy + 22) + '" role="img" aria-label="' + esc((o.label || '') + ' ' + Math.round(pct) + '%') + '">' + tk +
      '<path d="M' + f1(a0[0]) + ' ' + f1(a0[1]) + ' A' + r + ' ' + r + ' 0 0 1 ' + f1(a1[0]) + ' ' + f1(a1[1]) + '" style="fill:none;stroke:' + o.track + ';stroke-width:' + sw + ';stroke-linecap:round"/>' +
      (o.segments ? segArcs(o, pt, r, sw) : (p > 0 ? '<path d="M' + f1(a0[0]) + ' ' + f1(a0[1]) + ' A' + r + ' ' + r + ' 0 0 1 ' + f1(ap[0]) + ' ' + f1(ap[1]) + '" style="fill:none;stroke:' + o.color + ';stroke-width:' + sw + ';stroke-linecap:round"/>' : '')) + tg +
      '<text x="' + cx + '" y="' + f1(cy - 4) + '" text-anchor="middle" style="font-size:' + (o.fs || w * 0.145) + 'px;font-weight:800;fill:' + o.ink + ';letter-spacing:-.03em">' + esc(o.center != null ? o.center : Math.round(pct) + '%') + '</text>' +
      '<text x="' + cx + '" y="' + f1(cy + 14) + '" text-anchor="middle" style="font-size:11px;font-weight:600;fill:' + o.muted + '">' + esc(o.sub || '') + '</text></svg>';
  }
  // 상태별 구간 호 (예: 완료·부분완료·진행중·미착수)
  function segArcs(o, pt, r, sw) {
    var total = o.total || o.segments.reduce(function (a, x) { return a + x.v; }, 0) || 1, t = 0, out = '', gap = 0.012;
    o.segments.forEach(function (sg, i) {
      if (!sg.v) return;
      var t0 = t, t1 = t + sg.v / total; t = t1;
      var s0 = t0 + (t0 > 0 ? gap / 2 : 0), s1 = t1 - (t1 < 0.999 ? gap / 2 : 0);
      if (s1 <= s0) return;
      var a = pt(s0, r), b = pt(s1, r);
      out += '<path d="M' + f1(a[0]) + ' ' + f1(a[1]) + ' A' + r + ' ' + r + ' 0 0 1 ' + f1(b[0]) + ' ' + f1(b[1]) + '" style="fill:none;stroke:' + sg.c + ';stroke-width:' + sw + ';stroke-linecap:butt"><title>' + esc(sg.k + ' ' + sg.v + '건 (' + Math.round(sg.v / total * 100) + '%)') + '</title></path>';
      // 구간 라벨 (비중이 충분할 때)
      if (sg.v / total >= 0.06) {
        var m = pt((t0 + t1) / 2, r + sw / 2 + 14);
        out += '<text x="' + f1(m[0]) + '" y="' + f1(m[1] + 3) + '" text-anchor="middle" style="font-size:10px;font-weight:700;fill:' + o.muted + '">' + Math.round(sg.v / total * 100) + '%</text>';
      }
    });
    if (o.delayed) {
      var d = pt(1, r);
      out += '<text x="' + f1(d[0]) + '" y="' + f1(d[1] + sw / 2 + 16) + '" text-anchor="middle" style="font-size:10.5px;font-weight:800;fill:' + (o.crit || '#e5484d') + '">⚠ 지연 ' + o.delayed + '</text>';
    }
    return out;
  }
  // items: [{k, v, c, glyph}] → 사각 셀 격자
  function waffle(items, o) {
    o = o || {};
    var cells = [];
    items.forEach(function (it) { for (var i = 0; i < it.v; i++) cells.push(it); });
    return '<div class="waffle" style="grid-template-columns:repeat(' + (o.cols || 10) + ', minmax(0, ' + (o.cell || 24) + 'px))">' + cells.map(function (it, i) {
      return '<i title="' + esc(it.k + (it.tip ? ' · ' + it.tip[i - cells.indexOf(it)] : '')) + '" style="background:' + it.c + '">' + (it.glyph ? '<span>' + it.glyph + '</span>' : '') + '</i>';
    }).join('') + '</div>' +
      (o.legend === false ? '' : '<div class="legend" style="margin-top:10px">' + items.map(function (it) { return '<span><i class="sw" style="background:' + it.c + '"></i>' + esc(it.k) + ' <b style="color:var(--ink)">' + it.v + '</b></span>'; }).join('') + '</div>');
  }
  var PERSON = '<svg viewBox="0 0 24 24" width="100%" height="100%"><circle cx="12" cy="6" r="4"/><path d="M4 23v-6a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v6z"/></svg>';
  function pictogram(total, filled, o) {
    o = o || {};
    var out = '<div class="picto">';
    for (var i = 0; i < total; i++) out += '<i style="color:' + (i < filled ? o.color : o.track) + '" title="' + (i + 1) + '">' + PERSON + '</i>';
    return out + '</div>';
  }
  function steps(items) {
    return '<div class="steps">' + items.map(function (it, i) {
      return '<div class="step-b"><div class="step-flag"><b>' + String.fromCharCode(65 + i) + '</b><span>STEP ' + (i + 1) + '</span></div><div class="step-body"><b>' + esc(it.title) + '</b><small>' + esc(it.sub || '') + '</small>' + (it.extra || '') + '</div></div>';
    }).join('') + '</div>';
  }
  // items: [{k, pct, c, note}] → 0/50/100 눈금 진행 막대
  function progressRows(items) {
    return '<div class="prog">' + items.map(function (it) {
      return '<div class="prog-row"><span class="pk">' + esc(it.k) + '</span><div class="pbar"><i style="width:' + Math.max(0, Math.min(100, it.pct)) + '%;background:' + it.c + '"></i></div><b>' + esc(it.label != null ? it.label : Math.round(it.pct) + '%') + '</b>' + (it.note ? '<small>' + esc(it.note) + '</small>' : '') + '</div>';
    }).join('') + '<div class="prog-axis"><span></span><div><em>0</em><em>50</em><em>100</em></div><span></span></div></div>';
  }

  root.Info = { floorPlan: floorPlan, floorLegend: floorLegend, ring: ring, ringSet: ringSet, semiGauge: semiGauge, waffle: waffle, pictogram: pictogram, steps: steps, progressRows: progressRows, mix: mix };
})(window);
