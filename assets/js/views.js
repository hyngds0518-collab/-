/*
 * 회의록 분석 대시보드 - 탭별 화면
 * 각 함수는 (panel, R, api)를 받아 해당 탭을 그린다. R 은 analytics.analyze 결과(필터 적용).
 */
(function () {
  'use strict';
  var A = window.MeetingAnalytics;
  var WARN = 'path://M12 1.8 L23 21.6 H1 Z';
  var SYM = { '정기': 'circle', '임시': 'triangle', '긴급': WARN };

  // ---------- 공용 조각 ----------
  function card(cls, title, sub, body, opts) {
    opts = opts || {};
    return '<div class="card ' + cls + (opts.click ? ' ov-card' : '') + '"' + (opts.click ? ' data-go="' + opts.click + '" tabindex="0" role="button"' : '') + '>' +
      '<div class="card-head"><div><h3 class="card-title">' + title + '</h3>' + (sub ? '<p class="card-sub">' + sub + '</p>' : '') + '</div>' +
      (opts.tools ? '<div class="card-tools">' + opts.tools + '</div>' : '') + '</div>' + body + '</div>';
  }
  function ch(id, h) { return '<div class="chart ' + (h || 'h280') + '" id="' + id + '"></div>'; }
  function ai(txt) { return '<span class="badge-ai" title="원문을 근거로 AI가 해석·정규화한 값">' + (txt || 'AI 분석') + '</span>'; }
  function src() { return '<span class="badge-src" title="회의록 원문에서 직접 추출·집계한 값">원문 추출</span>'; }
  var TILE_ICON = [
    [/미기재/, 'ban', 'red'], [/번복/, 'loop', 'red'], [/지연/, 'alert', 'red'], [/미달/, 'alert', 'red'], [/위기/, 'shield', 'red'], [/재발/, 'loop', 'orange'],
    [/미착수/, 'hourglass', 'slate'], [/보류/, 'ban', 'slate'], [/잠정/, 'hourglass', 'amber'], [/부분/, 'percent', 'amber'], [/조건부/, 'target', 'teal'],
    [/재검토/, 'calendar', 'purple'], [/완료|확정|해결|달성/, 'check', 'green'], [/진행/, 'clock', 'blue'], [/반복/, 'repeat', 'orange'],
    [/주제/, 'sparkles', 'orange'], [/논의/, 'chat', 'purple'], [/안건/, 'agenda', 'blue'], [/수치/, 'trend', 'purple'], [/목표/, 'target', 'blue'],
    [/이슈/, 'alert', 'amber'], [/기간|시간/, 'clock', 'purple'], [/참석자|참석 인원|평균 참석/, 'users', 'green'], [/부서/, 'building', 'orange'],
    [/장소/, 'pin', 'pink'], [/주재/, 'user', 'teal'], [/의사결정|결정/, 'gavel', 'blue'], [/업무/, 'list', 'blue'], [/회의/, 'calendar', 'blue']
  ];
  function tile(k, v, unit, d, cls, icon, tone) {
    var plain = String(k).replace(/<[^>]+>/g, '').replace(/[●⚠!↺]/g, '').trim();
    if (!icon) { for (var i = 0; i < TILE_ICON.length; i++) if (TILE_ICON[i][0].test(plain)) { icon = TILE_ICON[i][1]; tone = tone || TILE_ICON[i][2]; break; } }
    return '<div class="tile ' + (cls || '') + '"><span class="ic-wrap lg tone-' + (tone || 'blue') + '">' + window.Icons.icon(icon || 'chart', 22) + '</span>' +
      '<div class="tb"><div class="k">' + plain + '</div><div class="v">' + v + (unit ? '<small>' + unit + '</small>' : '') + '</div>' + (d ? '<div class="d">' + d + '</div>' : '') + '</div></div>';
  }
  function viewAll(tab, label) { return '<button type="button" class="view-all" data-go="' + tab + '">' + (label || '전체 보기') + ' ' + window.Icons.icon('arrowRight', 14) + '</button>'; }
  // 탭 제목은 상단 바에 있으므로 여기서는 설명만 보여준다
  function head(title, desc, extra) {
    return desc ? '<div class="panel-head"><div><p>' + desc + '</p></div>' + (extra || '') + '</div>' : '';
  }
  function legend(items) {
    return '<div class="legend">' + items.map(function (i) {
      return '<span>' + (i.sym ? '<b class="sym" style="color:' + i.c + '">' + i.sym + '</b>' : '<i class="sw" style="background:' + i.c + '"></i>') + i.k + '</span>';
    }).join('') + '</div>';
  }
  function empty(msg) { return '<div class="empty">' + (msg || '선택한 조건에 해당하는 데이터가 없습니다') + '</div>'; }
  function el(id) { return document.getElementById(id); }
  function short(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function mno(id) { return String(id).replace(/^.*-(\d+)$/, '$1'); }
  function axis(T, o) {
    return Object.assign({
      axisLine: { lineStyle: { color: T.axis } }, axisTick: { show: false },
      axisLabel: { color: T.muted, fontSize: 11 }, splitLine: { lineStyle: { color: T.grid } }
    }, o || {});
  }
  function bindGo(root, api) {
    api.$$('[data-go]', root).forEach(function (c) {
      c.addEventListener('click', function (e) { if (e.target.closest('.idchip')) return; api.go(c.dataset.go); });
      c.addEventListener('keydown', function (e) { if (e.key === 'Enter') api.go(c.dataset.go); });
    });
  }
  function onClickMeeting(c, api) {
    if (c) c.on('click', function (p) { var id = p.data && (p.data.mid || p.data.id); if (id && /^ML|^[A-Z]+-[A-Z]+-\d+/.test(id)) api.openMeeting(id); else if (id) api.openEntity(id); });
  }
  function pctTxt(v) { return (Math.round(v * 10) / 10) + '%'; }
  function sum(a) { return a.reduce(function (s, v) { return s + v; }, 0); }
  // 도면: 전체 회의 기준 공간 목록 (필터와 무관하게 건물 형태 유지)
  function roomsOf(ms) {
    var rooms = {};
    ms.forEach(function (m) { var s = m.site; if (!s) return; var r = rooms[s.key] || (rooms[s.key] = { key: s.key, building: s.building, floor: s.floor, room: s.room, list: [], remote: [] }); r.list.push(m); });
    return rooms;
  }
  function floorPlanHTML(R, api, compact) {
    return window.Info.floorPlan(R.meetings, { tokens: api.tokens(), compact: compact, selected: api.S.f.places, allRooms: roomsOf(R.all) });
  }
  function bindRooms(root, api) {
    api.$$('[data-place]', root).forEach(function (g) {
      var fn = function (e) { e.stopPropagation(); var k = g.getAttribute('data-place'); var cur = api.S.f.places; if (cur.length === 1 && cur[0] === k) api.setFilter('places', []); else api.setFilter('places', k); };
      g.addEventListener('click', fn);
      g.addEventListener('keydown', function (e) { if (e.key === 'Enter') fn(e); });
    });
  }
  // 방사형 막대: 컨테이너 크기(o.w, o.h)에 맞춰 원과 라벨 묶음을 가운데 배치
  function polarOpt(api, items, o) {
    o = o || {};
    var T = api.tokens(), max = Math.max.apply(null, items.map(function (i) { return i.v; }).concat([1]));
    var w = o.w || 400, h = o.h || 280, labelW = o.labelW || 118;
    var r = Math.min(h * 0.44, (w - labelW - 40) / 2);
    var left0 = Math.max(10, (w - (2 * r + 24 + labelW)) / 2), cx = left0 + r, lx = cx + r + 24;
    var gap = Math.min(24, (h - 20) / items.length), top0 = h / 2 - gap * items.length / 2;
    return {
      tooltip: { trigger: 'item', formatter: function (p) { return '<b>' + items[p.dataIndex].v + (o.unit || '') + '</b> · ' + api.esc(items[p.dataIndex].k); } },
      angleAxis: { max: max * (o.span || 1.33), startAngle: 90, clockwise: true, show: false },
      radiusAxis: { type: 'category', data: items.map(function (i) { return i.k; }), show: false },
      polar: { radius: [r * 0.18, r], center: [cx, h / 2] },
      series: [{ type: 'bar', coordinateSystem: 'polar', barWidth: o.bw || 9, roundCap: true, showBackground: true, backgroundStyle: { color: T.grid },
        data: items.map(function (i, k) { return { value: i.v, itemStyle: { color: i.c || T.s[0], opacity: i.c ? 1 : 1 - k * 0.1 } }; }),
        label: { show: false } }],
      graphic: items.map(function (i, k) {
        return { type: 'text', left: lx, top: top0 + gap * k + 4, style: { text: i.k + '  ' + i.v + (o.unit || ''), fill: T.ink2, font: '600 11.5px ' + T.font } };
      })
    };
  }
  function dims(id) { var e = el(id); return e ? { w: e.clientWidth, h: e.clientHeight } : {}; }
  function lollipopOpt(api, cats, vals, o) {
    o = o || {};
    var T = api.tokens();
    return {
      grid: { left: o.left || 36, right: 16, top: 24, bottom: 28 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: T.axis } }, formatter: o.tip },
      xAxis: axis(T, { type: 'category', data: cats, splitLine: { show: false }, axisLabel: { color: T.muted, fontSize: 10.5, interval: 0 } }),
      yAxis: axis(T, { type: 'value', axisLine: { show: false }, name: o.unit || '', nameTextStyle: { color: T.muted } }),
      series: [
        { type: 'bar', barWidth: 2, data: vals.map(function (v, i) { return { value: v.value, itemStyle: { color: v.c || T.axis } }; }), silent: true, tooltip: { show: false } },
        { type: 'scatter', symbolSize: function (v, p) { return vals[p.dataIndex].size || 12; }, data: vals.map(function (v) { return { value: v.value, mid: v.mid, itemStyle: { color: v.c || T.s[0], borderColor: T.surface, borderWidth: 2 } }; }),
          label: { show: !!o.label, position: 'top', color: T.ink2, fontSize: 10, formatter: o.label } }
      ]
    };
  }
  function IG() { return window.Info; }
  function gaugeGrid(api, items, o) {
    var T = api.tokens();
    o = o || {};
    return '<div class="gauge-grid' + (o.compact ? ' compact' : '') + '">' + items.map(function (it) {
      var c = stateColor(T, it.state);
      return '<div class="gauge-cell" ' + (it.key ? 'data-k="' + it.key + '" role="button" tabindex="0" aria-pressed="' + (!!it.on) + '"' : '') + '><div class="gn"><span>' + api.esc(it.name) + '</span><span class="st" style="color:' + c + '">' + stateIcon(it.state) + '</span></div>' +
        IG().semiGauge(Math.min(it.r, 130), { width: o.width || 150, max: 130, target: 100, color: c, track: T.grid, ink: T.ink, muted: T.muted, center: Math.round(it.r) + '%', sub: it.sub || '', label: it.name }) +
        (it.foot ? '<div class="gf">' + it.foot + '</div>' : '') + '</div>';
    }).join('') + '</div>';
  }
  function slopeOpt(api, kpis) {
    var T = api.tokens();
    var data = kpis.map(function (k) { return { k: k, g: Math.round((k.next / k.thisYear - 1) * 1000) / 10 }; });
    return {
      grid: { left: 40, right: 40, top: 30, bottom: 12 },
      tooltip: { trigger: 'item', formatter: function (p) { var d = data[p.seriesIndex]; return '<b>+' + d.g + '%</b> · ' + api.esc(d.k.name) + '<br>' + api.fmt(d.k.thisYear, 2) + d.k.unit + ' → ' + api.fmt(d.k.next, 2) + d.k.unit; } },
      xAxis: { type: 'category', data: ['2026–27 실적', '2027 목표'], boundaryGap: false, axisLine: { lineStyle: { color: T.axis } }, axisTick: { show: false }, axisLabel: { color: T.ink2, fontWeight: 700, fontSize: 12 }, position: 'top' },
      yAxis: { type: 'value', min: 95, max: function (v) { return Math.ceil(v.max / 10) * 10 + 5; }, show: false },
      series: data.map(function (d, i) {
        var c = [T.s[0], T.s[2], T.s[6], T.s[1]][i % 4];
        return { type: 'line', data: [100, 100 + d.g], symbol: 'circle', symbolSize: 10, lineStyle: { color: c, width: 2.5 }, itemStyle: { color: T.surface, borderColor: c, borderWidth: 2.5 },
          label: { show: false } };
      }).map(function (sr) {
        return sr;
      })
    };
  }
  function slopeLegend(api, kpis) {
    var T = api.tokens();
    return '<div class="prog" style="margin-top:6px;gap:6px">' + kpis.map(function (k, i) {
      var c = [T.s[0], T.s[2], T.s[6], T.s[1]][i % 4], g = Math.round((k.next / k.thisYear - 1) * 1000) / 10;
      return '<div style="display:grid;grid-template-columns:12px 1fr auto;gap:8px;align-items:center;font-size:12.5px"><i style="width:12px;height:3px;border-radius:2px;background:' + c + '"></i><span style="color:var(--ink-2)">' + api.esc(k.name) + ' <small style="color:var(--muted)">' + api.fmt(k.thisYear, 1) + ' → ' + api.fmt(k.next, 1) + k.unit + '</small></span><b style="color:' + c + '">+' + g + '%</b></div>';
    }).join('') + '</div>';
  }
  function rate(m) { return m.lowerBetter ? m.target / m.actual * 100 : m.actual / m.target * 100; }
  function kpiState(r) { return r >= 100 ? '달성' : r >= 95 ? '주의' : '미달'; }
  function stateColor(T, s) { return s === '달성' ? T.good : s === '주의' ? T.warning : T.critical; }
  function stateIcon(s) { return s === '달성' ? '✓' : s === '주의' ? '!' : '✕'; }

  // 성과 지표: AI 레이어가 있으면 정규화 지표, 없으면 자동 추출
  function metricsOf(R) {
    var ids = {}; R.meetings.forEach(function (m) { ids[m.id] = true; });
    if (R.ann) return R.ann.metrics.filter(function (x) { return ids[x.m]; }).map(function (x) { var r = rate(x); return Object.assign({ meeting: x.m, rate: r, state: kpiState(r), source: 'ai' }, x); });
    return A.autoMetrics(R.loops).map(function (x) { return Object.assign(x, { m: x.meeting, state: kpiState(x.rate) }); });
  }
  function kpiSeriesOf(R) {
    if (!R.ann) return [];
    var ids = {}; R.meetings.forEach(function (m) { ids[m.id] = true; });
    return R.ann.kpiSeries.map(function (k) {
      var pts = k.points.filter(function (p) { return ids[p.m]; });
      return Object.assign({}, k, { points: pts });
    }).filter(function (k) { return k.points.length; });
  }
  function meetingById(R, id) { return R.all.filter(function (m) { return m.id === id; })[0]; }

  // ---------- 차트 옵션 빌더 ----------
  function timelineOpt(R, api, mini) {
    var T = api.tokens();
    var phases = A.PHASES;
    var ms = R.meetings;
    var series = [{
      type: 'line', data: ms.map(function (m) { return [m.date, phases.indexOf(m.phase)]; }), symbol: 'none', silent: true,
      lineStyle: { color: T.axis, width: 1.5 }, z: 1
    }];
    A.NATURES.forEach(function (n) {
      series.push({
        name: n, type: 'scatter', z: 3,
        symbol: SYM[n], symbolSize: mini ? (n === '긴급' ? 14 : 10) : (n === '긴급' ? 22 : 15),
        itemStyle: { color: api.natureColor(n), borderColor: T.surface, borderWidth: 2 },
        label: mini ? (n === '긴급' ? { show: true, formatter: '!', color: '#fff', fontWeight: 800, fontSize: 9, offset: [0, 2] } : { show: false }) : {
          show: true, formatter: function (p) { return n === '긴급' ? '!' : ''; }, color: '#fff', fontWeight: 800, fontSize: 11, offset: [0, 3]
        },
        data: ms.filter(function (m) { return m.nature === n; }).map(function (m) {
          return { value: [m.date, phases.indexOf(m.phase)], mid: m.id, name: m.title, m: m };
        })
      });
    });
    if (!mini) {
      series.push({
        type: 'scatter', symbolSize: 1, silent: true, itemStyle: { color: 'transparent' },
        label: { show: true, position: 'top', distance: 12, formatter: function (p) { return p.data.no; }, color: T.ink2, fontSize: 10.5, fontWeight: 700 },
        data: ms.map(function (m) { return { value: [m.date, phases.indexOf(m.phase)], no: mno(m.id) }; })
      });
    }
    return {
      grid: { left: mini ? 78 : 96, right: 18, top: mini ? 8 : 24, bottom: 24 },
      tooltip: {
        trigger: 'item', formatter: function (p) {
          var m = p.data && p.data.m; if (!m) return '';
          return '<b>' + api.esc(m.id) + '</b> · ' + api.NATURE_GLYPH[m.nature] + ' ' + m.nature + '<br>' + api.esc(m.title) + '<br><span style="color:' + T.muted + '">' + m.date + ' · ' + api.esc(m.stage) + ' · 결정 ' + m.decisions.length + ' · 업무 ' + m.actions.length + '</span>';
        }
      },
      xAxis: axis(T, { type: 'time', splitLine: { show: false }, axisLabel: { color: T.muted, fontSize: 10.5, formatter: '{yy}.{MM}' } }),
      yAxis: axis(T, { type: 'category', data: phases, inverse: true, axisLabel: { color: T.ink2, fontSize: mini ? 10 : 11.5 }, splitLine: { show: true, lineStyle: { color: T.grid } } }),
      series: series
    };
  }

  function donutOpt(api, items, center, sub) {
    var T = api.tokens();
    return {
      tooltip: { trigger: 'item', formatter: function (p) { return '<b>' + p.value + '건</b> · ' + api.esc(p.name) + ' (' + p.percent + '%)'; } },
      title: { text: String(center), subtext: sub || '', left: 'center', top: '36%', textStyle: { fontSize: 24, fontWeight: 800, color: T.ink }, subtextStyle: { color: T.muted, fontSize: 11 }, itemGap: 2 },
      series: [{
        type: 'pie', radius: ['58%', '80%'], center: ['50%', '50%'], avoidLabelOverlap: true, padAngle: 1.5,
        itemStyle: { borderColor: T.surface, borderWidth: 2, borderRadius: 3 },
        label: { show: false }, labelLine: { show: false },
        data: items.filter(function (i) { return i.value > 0; }).map(function (i) { return { name: i.k, value: i.value, itemStyle: { color: i.c } }; })
      }]
    };
  }

  function hbarOpt(api, cats, vals, o) {
    o = o || {};
    var T = api.tokens();
    return {
      grid: { left: o.left || 90, right: o.right || 44, top: o.extraSeries ? 20 : 6, bottom: 6, containLabel: false },
      tooltip: { trigger: 'item', formatter: o.tip || function (p) { return '<b>' + p.value + (o.unit || '') + '</b> · ' + api.esc(p.name); } },
      xAxis: { type: 'value', show: false, max: o.max },
      yAxis: axis(T, { type: 'category', data: cats, inverse: true, axisLine: { show: false }, axisLabel: { color: T.ink2, fontSize: 11.5, width: (o.left || 90) - 10, overflow: 'truncate' } }),
      series: [{
        type: 'bar', barWidth: o.barWidth || 12, data: vals.map(function (v, i) { return { value: v, itemStyle: { color: Array.isArray(o.color) ? o.color[i] : (o.color || T.s[0]), borderRadius: [0, 4, 4, 0] } }; }),
        label: { show: true, position: 'right', color: T.ink2, fontSize: 11, formatter: o.fmt || function (p) { return p.value + (o.unit || ''); } },
        showBackground: !!o.bg, backgroundStyle: { color: T.surface2, borderRadius: [0, 4, 4, 0] }
      }].concat(o.extraSeries || [])
    };
  }

  // =====================================================================
  // 개요 상단: 캘린더 · 일정 · 회의록 펼침 · 부서 요약 · 핵심 참여자
  // =====================================================================
  var cal = { month: null, expanded: null };
  var DOW = ['일', '월', '화', '수', '목', '금', '토'];
  function ym(d) { return d.slice(0, 7); }
  function addMonth(m, k) { var y = +m.slice(0, 4), mo = +m.slice(5, 7) - 1 + k; y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12; return y + '-' + ('0' + (mo + 1)).slice(-2); }
  function selIds(api) { return api.S.f.meetings || []; }

  function calendarCard(R, api) {
    var I = window.Icons.icon, all = R.all;
    var months = api.uniq(all.map(function (m) { return ym(m.date); })).sort();
    var sel = selIds(api);
    var selM = sel.length ? meetingById(R, sel[0]) : null;
    if (!cal.month || months.indexOf(cal.month) < 0) cal.month = selM ? ym(selM.date) : (R.meetings[0] ? ym(R.meetings[0].date) : months[0]);
    var mo = cal.month, y = +mo.slice(0, 4), m0 = +mo.slice(5, 7) - 1;
    var first = new Date(y, m0, 1), start = new Date(y, m0, 1 - first.getDay());
    var inView = {}; R.meetings.forEach(function (m) { inView[m.id] = true; });
    var byDate = {}; all.forEach(function (m) { (byDate[m.date] = byDate[m.date] || []).push(m); });
    var cells = '';
    for (var i = 0; i < 42; i++) {
      var d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      var key = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
      if (i >= 35 && d.getMonth() !== m0) break;
      var ms = byDate[key] || [], out = d.getMonth() !== m0;
      var isSel = ms.some(function (m) { return sel.indexOf(m.id) >= 0; });
      var dim = ms.length && !ms.some(function (m) { return inView[m.id]; });
      var cls = 'day' + (out ? ' out' : '') + (ms.length ? ' has' : '') + (isSel ? ' sel' : '') + (dim && !isSel ? ' dim' : '');
      var tip = ms.map(function (m) { return m.id + ' · ' + m.title; }).join('\n');
      cells += (ms.length ? '<button type="button" class="' + cls + '" data-date="' + key + '" title="' + api.esc(tip) + '" aria-pressed="' + isSel + '">' : '<div class="' + cls + '">') +
        '<span class="n">' + d.getDate() + '</span>' +
        ms.map(function (m) { return '<span class="ev n-' + m.nature + '">' + (m.nature === '긴급' ? '⚠ ' : '') + api.esc(m.title) + '</span>'; }).join('') +
        (ms.length ? '</button>' : '</div>');
    }
    var inMonth = all.filter(function (m) { return ym(m.date) === mo; });
    var dec = sum(inMonth.map(function (m) { return m.decisions.length; })), act = sum(inMonth.map(function (m) { return m.actions.length; }));
    var body = '<div class="cal-wrap"><div>' +
      '<div class="cal-head"><button type="button" class="cal-nav" data-mv="-1" aria-label="이전 달"' + (mo <= months[0] ? ' disabled' : '') + '>' + I('left', 16) + '</button>' +
      '<b>' + y + '년 ' + (m0 + 1) + '월</b>' +
      '<button type="button" class="cal-nav" data-mv="1" aria-label="다음 달"' + (mo >= months[months.length - 1] ? ' disabled' : '') + '>' + I('right', 16) + '</button></div>' +
      '<div class="cal">' + DOW.map(function (w, i) { return '<div class="dow' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '') + '">' + w + '</div>'; }).join('') + cells + '</div>' +
      '<div class="cal-legend"><span><i style="background:var(--t-blue-bg);border:1px solid var(--t-blue)"></i>정기</span><span><i style="background:var(--t-orange-bg);border:1px solid var(--t-orange)"></i>임시</span><span><i style="background:var(--t-red-bg);border:1px solid var(--t-red)"></i>긴급</span><span style="color:var(--muted)">회의가 있는 날을 누르면 대시보드 전체가 그 회의 기준으로 바뀝니다</span></div></div>' +
      '<div class="cal-side">' +
      '<div class="cs blue"><div><small>이달의 회의</small><b>' + inMonth.length + '</b></div><span class="ic-wrap">' + I('users', 18) + '</span></div>' +
      '<div class="cs green"><div><small>의사결정</small><b>' + dec + '</b></div><span class="ic-wrap">' + I('check', 18) + '</span></div>' +
      '<div class="cs orange"><div><small>업무 지시</small><b>' + act + '</b></div><span class="ic-wrap">' + I('clock', 18) + '</span></div>' +
      '<button type="button" class="view-all" data-go="basic" style="justify-content:center;margin-top:4px">전체 회의 보기 ' + I('arrowRight', 14) + '</button>' +
      '</div></div>';
    return card('c7', '회의 캘린더', '회의한 날짜에 회의 제목이 표시됩니다', body, { tools: sel.length ? '<button type="button" class="mini-btn" data-clear-sel>' + I('x', 13) + '선택 해제</button>' : '' });
  }

  // 기본정보 탭용 소형 캘린더: 회의일 = 색 점, 아래에 그달 회의 목록
  function miniCalendarCard(R, api, cls) {
    var I = window.Icons.icon, all = R.all;
    var months = api.uniq(all.map(function (m) { return ym(m.date); })).sort();
    var sel = selIds(api);
    var selM = sel.length ? meetingById(R, sel[0]) : null;
    if (!cal.month || months.indexOf(cal.month) < 0) cal.month = selM ? ym(selM.date) : (R.meetings[0] ? ym(R.meetings[0].date) : months[0]);
    var mo = cal.month, y = +mo.slice(0, 4), m0 = +mo.slice(5, 7) - 1;
    var first = new Date(y, m0, 1), start = new Date(y, m0, 1 - first.getDay());
    var inView = {}; R.meetings.forEach(function (m) { inView[m.id] = true; });
    var byDate = {}; all.forEach(function (m) { (byDate[m.date] = byDate[m.date] || []).push(m); });
    var cells = '';
    for (var i = 0; i < 42; i++) {
      var d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      if (i >= 35 && d.getMonth() !== m0) break;
      var key = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
      var ms = byDate[key] || [], out = d.getMonth() !== m0;
      var isSel = ms.some(function (m) { return sel.indexOf(m.id) >= 0; });
      var dim = ms.length && !ms.some(function (m) { return inView[m.id]; });
      var c = 'mday' + (out ? ' out' : '') + (ms.length ? ' has n-' + ms[0].nature : '') + (isSel ? ' sel' : '') + (dim && !isSel ? ' dim' : '');
      cells += ms.length ? '<button type="button" class="' + c + '" data-date="' + key + '" title="' + api.esc(ms.map(function (m) { return m.id + ' · ' + m.title; }).join('\n')) + '">' + d.getDate() + '</button>' : '<span class="' + c + '">' + d.getDate() + '</span>';
    }
    var list = all.filter(function (m) { return ym(m.date) === mo; });
    var body = '<div class="cal-head"><button type="button" class="cal-nav" data-mv="-1" aria-label="이전 달"' + (mo <= months[0] ? ' disabled' : '') + '>' + I('left', 15) + '</button><b>' + y + '. ' + (m0 + 1) + '</b>' +
      '<button type="button" class="cal-nav" data-mv="1" aria-label="다음 달"' + (mo >= months[months.length - 1] ? ' disabled' : '') + '>' + I('right', 15) + '</button></div>' +
      '<div class="mcal">' + DOW.map(function (w, i) { return '<b class="' + (i === 0 ? 'sun' : i === 6 ? 'sat' : '') + '">' + w + '</b>'; }).join('') + cells + '</div>' +
      '<div class="mcal-list">' + (list.length ? list.map(function (m) {
        return '<button type="button" class="mcal-row' + (sel.indexOf(m.id) >= 0 ? ' on' : '') + '" data-open="' + m.id + '"><i class="n-' + m.nature + '"></i><span class="d">' + m.date.slice(5).replace('-', '.') + '</span><span class="t">' + api.esc(m.title) + '</span></button>';
      }).join('') : '<div class="note" style="text-align:center;padding:8px">이 달에는 회의가 없습니다</div>') + '</div>';
    return card(cls || 'c4', '회의 캘린더', '날짜를 누르면 그 회의 기준으로 전환 · 목록은 회의록 열기', body, { tools: sel.length ? '<button type="button" class="mini-btn" data-clear-sel>' + I('x', 13) + '해제</button>' : '' });
  }
  function bindCal(p, R, api) {
    api.$$('[data-mv]', p).forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); cal.month = addMonth(cal.month, +b.dataset.mv); api.render(); }); });
    api.$$('.mday.has', p).forEach(function (b) {
      b.addEventListener('click', function () {
        var ids = R.all.filter(function (m) { return m.date === b.dataset.date; }).map(function (m) { return m.id; });
        var cur = selIds(api), already = cur.length === ids.length && ids.every(function (id) { return cur.indexOf(id) >= 0; });
        api.selectMeetings(already ? [] : ids);
      });
    });
    api.$$('[data-open]', p).forEach(function (b) { b.addEventListener('click', function () { api.openMeeting(b.dataset.open); }); });
    api.$$('[data-clear-sel]', p).forEach(function (b) { b.addEventListener('click', function () { api.selectMeetings([]); }); });
  }

  function scheduleCard(R, api) {
    var I = window.Icons.icon, sel = selIds(api);
    var selM = sel.length === 1 ? meetingById(R, sel[0]) : null;
    var list = R.all.filter(function (m) { return ym(m.date) === cal.month; });
    var h = '';
    if (selM) {
      var chair = selM.attendees.filter(function (a) { return a.name === selM.chairName; })[0];
      h += '<div class="sel-card"><div class="sel-top">' + api.avatar(selM.chairName, 'lg') + '<div style="min-width:0"><div class="split" style="gap:6px;margin-bottom:4px"><span class="status st-' + selM.nature + '">' + api.NATURE_GLYPH[selM.nature] + ' ' + selM.nature + '</span>' +
        selM.types.map(function (t) { return '<span class="pill">' + t + '</span>'; }).join('') + '</div><h4>' + api.esc(selM.title) + '</h4>' +
        '<div class="card-sub">' + api.esc(selM.id) + ' · 주재 ' + api.esc(selM.chair) + '</div></div></div>' +
        '<div class="sel-meta"><div>일시<b>' + selM.date.replace(/-/g, '.') + ' (' + selM.dow + ') ' + selM.start + '–' + selM.end + '</b></div><div>장소<b>' + api.esc(selM.place) + '</b></div>' +
        '<div>프로젝트 단계<b>' + api.esc(selM.stage) + '</b></div><div>참석<b>' + selM.attendees.length + '명 · ' + selM.depts.length + '개 부서</b></div></div>' +
        '<div class="sel-counts"><div><b>' + selM.agenda.length + '</b><small>안건</small></div><div><b>' + selM.decisions.length + '</b><small>결정</small></div><div><b>' + selM.actions.length + '</b><small>업무</small></div><div><b>' + selM.issues.length + '</b><small>이슈</small></div></div>' +
        '<div class="split" style="justify-content:space-between"><div class="av-stack">' + selM.attendees.slice(0, 6).map(function (a) { return api.avatar(a.name, 'xs'); }).join('') + (selM.attendees.length > 6 ? '<span class="more">+' + (selM.attendees.length - 6) + '</span>' : '') + '</div>' +
        '<button type="button" class="btn primary sm" data-expand="' + selM.id + '">' + (cal.expanded === selM.id ? '회의록 접기' : '자세히 보기') + ' ' + I(cal.expanded === selM.id ? 'down' : 'arrowRight', 14) + '</button></div></div>';
      void chair;
    } else {
      h += '<div class="sched">' + (list.length ? list.map(function (m) { return schedRow(m, api, sel); }).join('') : empty('이 달에는 회의가 없습니다')) + '</div>';
    }
    var title = selM ? '선택한 회의' : (+cal.month.slice(5, 7)) + '월 회의 일정';
    return card('c5', title, selM ? '회의록 요약 · 자세히 보기를 누르면 회의록이 아래에 펼쳐집니다' : '행을 누르면 해당 회의로 대시보드가 바뀝니다', h, { tools: selM ? '<button type="button" class="mini-btn" data-clear-sel>' + I('x', 13) + '전체 보기</button>' : viewAll('basic') });
  }
  function schedRow(m, api, sel) {
    var I = window.Icons.icon;
    return '<div class="srow n-' + m.nature + (sel && sel.indexOf(m.id) >= 0 ? ' active' : '') + '" data-sel="' + m.id + '" role="button" tabindex="0">' +
      '<div class="when"><b>' + m.date.slice(5).replace('-', '.') + ' (' + m.dow + ')</b>' + m.start + '</div>' +
      '<div class="body"><b>' + api.esc(m.title) + '</b><small>' + api.avatar(m.chairName, 'xs') + api.esc(m.chair) + '<span>· ' + api.esc(short(m.room, 16)) + '</span></small></div>' +
      '<div class="right"><span class="status st-' + m.nature + '">' + m.nature + '</span><button type="button" class="view-all" data-expand="' + m.id + '">자세히 ' + I('arrowRight', 13) + '</button></div></div>';
  }

  function minutesPanel(R, api) {
    if (!cal.expanded) return '';
    var m = meetingById(R, cal.expanded);
    if (!m) return '';
    var I = window.Icons.icon;
    return '<section class="minutes" id="minutesPanel" aria-label="회의록 상세"><div class="minutes-head"><div><h3>' + I('file', 16).replace('class="ic ', 'style="display:inline;vertical-align:-3px;margin-right:6px" class="ic ') + api.esc(m.id) + ' · ' + api.esc(m.title) + '</h3><div class="sub">' + api.meetingSub(m) + '</div></div>' +
      '<div class="split"><button type="button" class="btn sm" data-open-drawer="' + m.id + '">옆 창으로 보기</button><button type="button" class="btn sm" data-collapse>' + I('x', 14) + '접기</button></div></div>' +
      '<div class="minutes-body">' + api.meetingHTML(m, true) + '</div></section>';
  }

  function deptSummaryCard(R, api) {
    var ds = R.depts.filter(function (d) { return d.meetings && !/외부|대표/.test(d.dept); }).sort(function (a, b) { return b.meetings - a.meetings; }).slice(0, 5);
    var I = window.Icons;
    var body = '<div class="dept-cards">' + ds.map(function (d) {
      return '<div class="dcard" data-dept="' + api.esc(d.dept) + '" role="button" tabindex="0"><span class="ic-wrap tone-' + (I.DEPT_TONE[d.dept] || 'blue') + '">' + I.icon(I.DEPT_ICON[d.dept] || 'users', 20) + '</span>' +
        '<div class="nm">' + api.esc(d.dept) + '</div><div class="val">' + d.meetings + '<small style="font-size:12px;color:var(--ink-2);font-weight:700;margin-left:3px">회 참석</small></div>' +
        '<div class="ft"><span>업무 ' + d.actions + '건</span><em>완료 ' + (d.actions ? Math.round(d.doneRate) + '%' : '-') + '</em></div></div>';
    }).join('') + '</div>';
    return card('c8', '부서 요약', '회의 참여가 많은 부서 · 카드를 누르면 해당 부서가 참석한 회의만 봅니다', body, { tools: viewAll('dept') });
  }

  function peopleTopCard(R, api) {
    var ppl = Object.keys(R.people).map(function (k) { return R.people[k]; })
      .map(function (p) { var n = p.meetings.filter(function (no) { return R.meetings.some(function (m) { return m.no === no; }); }).length; return Object.assign({}, p, { n: n }); })
      .filter(function (p) { return p.n; }).sort(function (a, b) { return b.n - a.n || b.chaired - a.chaired; }).slice(0, 4);
    var body = '<div class="plist">' + ppl.map(function (p) {
      return '<div class="prow" data-person="' + api.esc(p.name) + '" role="button" tabindex="0">' + api.avatar(p.name) + '<div><b>' + api.esc(p.name) + '</b><div class="role">' + api.esc(p.role) + '</div><div class="meta">참석<em>' + p.n + '회</em></div></div><div class="right">' + (p.chaired ? '<span class="pill">주재 ' + p.chaired + '</span>' : '') + '</div></div>';
    }).join('') + '</div>';
    return card('c4', '핵심 참여자', '참석 횟수 기준', body, { tools: viewAll('basic') });
  }

  function statStrip(R, api) {
    var I = window.Icons.icon, s = R.summary;
    var people = api.uniq([].concat.apply([], R.meetings.map(function (m) { return m.attendees.map(function (a) { return a.name; }); }))).length;
    var agenda = sum(R.meetings.map(function (m) { return m.agenda.length; }));
    var items = [['users', '참석 인원', people, '명', '고유 참석자'], ['agenda', '안건', agenda, '개', '논의 ' + s.discussions + '건'], ['gavel', '의사결정', s.decisions, '건', '조건부 ' + (s.decisionByStatus[1] || {}).value + '건'],
      ['list', '업무 지시', s.actions, '건', '지연 ' + s.delayed + '건'], ['alert', '미결 이슈', s.issues, '건', '후속 미기재 ' + s.untrackedIssues + '건'], ['clock', '총 회의 시간', Math.round(s.totalMinutes / 6) / 10, '시간', '평균 ' + (R.meetings.length ? Math.round(s.totalMinutes / R.meetings.length) : 0) + '분']];
    return '<div class="strip">' + items.map(function (x) {
      return '<div><span class="ic-wrap sq">' + I(x[0], 20) + '</span><div><small>' + x[1] + '</small><b>' + api.fmt(x[2]) + '<span style="font-size:12px;margin-left:2px">' + x[3] + '</span></b><span>' + x[4] + '</span></div></div>';
    }).join('') + '</div>';
  }

  function bindOverviewTop(p, R, api) {
    api.$$('[data-mv]', p).forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); cal.month = addMonth(cal.month, +b.dataset.mv); api.render(); }); });
    api.$$('.day.has', p).forEach(function (b) {
      b.addEventListener('click', function () {
        var ids = R.all.filter(function (m) { return m.date === b.dataset.date; }).map(function (m) { return m.id; });
        var already = ids.every(function (id) { return selIds(api).indexOf(id) >= 0; }) && selIds(api).length === ids.length;
        cal.expanded = null;
        api.selectMeetings(already ? [] : ids);
      });
    });
    api.$$('[data-sel]', p).forEach(function (r) {
      var fn = function (e) { if (e.target.closest('[data-expand]')) return; cal.expanded = null; api.selectMeetings([r.dataset.sel]); };
      r.addEventListener('click', fn); r.addEventListener('keydown', function (e) { if (e.key === 'Enter') fn(e); });
    });
    api.$$('[data-expand]', p).forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var id = b.dataset.expand;
        if (cal.expanded === id) { cal.expanded = null; api.render(); return; }
        cal.expanded = id;
        if (selIds(api).length !== 1 || selIds(api)[0] !== id) api.selectMeetings([id]); else api.render();
        setTimeout(function () { var el = document.getElementById('minutesPanel'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 80);
      });
    });
    api.$$('[data-collapse]', p).forEach(function (b) { b.addEventListener('click', function () { cal.expanded = null; api.render(); }); });
    api.$$('[data-open-drawer]', p).forEach(function (b) { b.addEventListener('click', function () { api.openMeeting(b.dataset.openDrawer); }); });
    api.$$('[data-clear-sel]', p).forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); cal.expanded = null; api.selectMeetings([]); }); });
    api.$$('[data-dept]', p).forEach(function (b) { b.addEventListener('click', function () { api.setFilter('depts', b.dataset.dept); }); });
    api.$$('[data-person]', p).forEach(function (b) { b.addEventListener('click', function () { api.setFilter('people', b.dataset.person); }); });
    api.bindChips(p);
  }

  // =====================================================================
  // 00 개요
  // =====================================================================
  function overview(p, R, api) {
    var T = api.tokens(), s = R.summary;
    if (!R.meetings.length) { p.innerHTML = head('개요', '') + empty(); return; }
    var hours = Math.round(s.totalMinutes / 6) / 10;
    var dec = {}; s.decisionByStatus.forEach(function (d) { dec[d.key] = d.value; });
    var act = {}; s.actionByStatus.forEach(function (d) { act[d.key] = d.value; });
    var loopOk = sum(s.loopByEval.filter(function (e) { return /초과|달성/.test(e.key) && e.key !== '부분달성'; }).map(function (e) { return e.value; }));
    var links = decisionLinksOf(R);
    var reversals = links.filter(function (l) { return l.type === '번복'; }).length;
    var kseries = kpiSeriesOf(R);
    var finals = kseries.filter(function (k) { return ['pos', 'store', 'repeat', 'aware', 'cm', 'budget'].indexOf(k.key) >= 0; }).map(function (k) {
      var last = k.points[k.points.length - 1]; var r = rate({ target: last.target, actual: last.actual, lowerBetter: k.lowerBetter });
      return { name: k.name, r: r, state: kpiState(r), last: last, unit: k.unit };
    });
    var mets = metricsOf(R);
    var topTopic = R.topicShare[0] || { key: '-', pct: 0 };
    var topEdge = R.edges[0];
    var crisisResolved = R.crises.filter(function (c) { return c.resolved; }).length;
    var recurred = R.crises.filter(function (c) { return c.recurred; }).length;
    var ins = R.ann ? R.ann.insights : autoInsights(R, api);
    var ny = R.ann ? R.ann.nextYear : null;

    var I = window.Icons.icon;
    var pc = {}; R.meetings.forEach(function (m) { pc[m.site.key] = (pc[m.site.key] || 0) + 1; });
    var topPlace = Object.keys(pc).sort(function (a, b) { return pc[b] - pc[a]; })[0] || '-';
    topPlace = topPlace.replace(/^\S+\s/, '').replace(' · ', ' ') + ' ' + (pc[Object.keys(pc).sort(function (a, b) { return pc[b] - pc[a]; })[0]] || 0) + '회';
    var h = '<div class="tiles">' +
      tile('총 회의', R.meetings.length, '건', s.byNature.map(function (n) { return n.key + ' ' + n.value; }).join(' · '), '', 'calendar', 'blue') +
      tile('의사결정', s.decisions, '건', '<span class="up">확정 ' + (s.decisions ? Math.round((dec['확정'] || 0) / s.decisions * 100) : 0) + '%</span> · 조건부 ' + (dec['조건부'] || 0), '', 'gavel', 'green') +
      tile('업무 완료율', (s.actions ? Math.round((act['완료'] || 0) / s.actions * 100) : 0), '%', '전체 ' + s.actions + '건 · <span class="dn">지연 ' + s.delayed + '</span>', '', 'list', 'purple') +
      tile('목표 달성률', (s.loops ? Math.round(loopOk / s.loops * 100) : 0), '%', s.loops + '개 목표 추적 · 미달 ' + ((s.loopByEval.filter(function (e) { return e.key === '미달'; })[0] || {}).value || 0), '', 'target', 'orange') +
      '</div>';
    h += '<div class="grid">' + calendarCard(R, api) + scheduleCard(R, api) + '</div>';
    h += minutesPanel(R, api);
    h += '<div class="grid" style="margin-top:16px">' + deptSummaryCard(R, api) + peopleTopCard(R, api) + '</div>';
    h += statStrip(R, api);
    h += '<div class="panel-head" style="margin-top:26px"><div><h2>영역별 분석 요약</h2><p>항목별 핵심을 그래프 한 장으로 요약했습니다. 카드를 누르면 해당 분석 탭으로 이동합니다.' + (R.filtered ? ' <b style="color:var(--accent)">필터 적용 중</b>' : '') + '</p></div></div>';
    h += '<div class="grid">';
    h += card('c8', '<span class="ov-num">09</span> 프로젝트 진행 흐름', '',
      '<div class="ov-hero"><span class="big">' + R.meetings.length + '</span><span class="unit">건</span><span class="aside">' + R.meetings[0].date.replace(/-/g, '.') + ' – ' + R.meetings[R.meetings.length - 1].date.replace(/-/g, '.') + ' · ' + api.uniq(R.meetings.map(function (m) { return m.phase; })).length + '개 단계</span></div>' +
      legend([{ k: '정기', c: api.natureColor('정기'), sym: '●' }, { k: '임시', c: api.natureColor('임시'), sym: '▲' }, { k: '긴급', c: api.natureColor('긴급'), sym: '⚠' }]) + ch('ovFlow', 'h240'), { click: 'flow' });
    h += card('c4', '<span class="ov-num">01</span> 회의 시간', '월별 회의 시간 합계',
      '<div class="ov-hero"><span class="big">' + hours + '</span><span class="unit">시간</span><span class="aside">총 ' + R.meetings.length + '회 · 평균 ' + Math.round(s.totalMinutes / R.meetings.length) + '분 · 참석 ' + fmtAvg(R) + '명</span></div>' + ch('ovTime', 'h240'), { click: 'basic' });
    h += card('c4', '<span class="ov-num">02</span> 안건·논의 분석', '주제 비중 (논의 ' + s.discussions + '건)',
      '<div class="ov-hero"><span class="big">' + topTopic.pct + '%</span><span class="aside">최다 주제 · ' + topTopic.key + '</span></div>' + ch('ovTopic', 'h200'), { click: 'discussion' });
    h += card('c4', '<span class="ov-num">03</span> 의사결정 현황', '',
      '<div class="ov-hero"><span class="big">' + s.decisions + '</span><span class="unit">건</span><span class="aside">번복·방향 변경 ' + reversals + '건</span></div>' + '<div style="margin-top:10px">' + IG().ringSet(s.decisionByStatus.map(function (d) { return { k: d.key, pct: s.decisions ? d.value / s.decisions * 100 : 0, color: api.decisionColor(d.key), value: d.value + '건' }; }), T, 66) + '</div>', { click: 'decision' });
    h += card('c4', '<span class="ov-num">04</span> Action Item 관리', '',
      '<div class="ov-hero"><span class="aside">전체 ' + s.actions + '건 · 후속 회의 기록 기준</span></div>' + IG().semiGauge(s.actions ? (act['완료'] || 0) / s.actions * 100 : 0, { width: 220, stroke: 16, color: T.good, track: T.grid, ink: T.ink, muted: T.muted, sub: '업무 완료율', label: '업무 상태 구성',
        segments: s.actionByStatus.map(function (d) { return { v: d.value, c: api.actionColor(d.key), k: d.key }; }), total: s.actions }) +
      legend(s.actionByStatus.map(function (d) { return { k: d.key + ' ' + d.value, c: api.actionColor(d.key) }; }).concat([{ k: '지연 ' + s.delayed, c: T.critical, sym: '⚠' }])), { click: 'action' });
    h += card('c4', '<span class="ov-num">05</span> 이전 → 현재 성과 추적', '',
      '<div class="ov-hero"><span class="big">' + (s.loops ? Math.round(loopOk / s.loops * 100) : 0) + '%</span><span class="aside">달성 · 목표 1개 = 1칸</span></div>' + '<div style="margin-top:8px">' + IG().waffle(s.loopByEval.filter(function (e) { return e.value; }).map(function (e) { return { k: e.key, v: e.value, c: api.evalColor(e.key) }; }), { cols: 10 }) + '</div>', { click: 'tracking' });
    h += card('c4', '<span class="ov-num">06</span> KPI 성과관리', finals.length ? '최종 실적 / 목표' : '',
      (finals.length ? '<div class="ov-hero"><span class="big">' + finals.filter(function (f) { return f.state === '달성'; }).length + '/' + finals.length + '</span><span class="aside">프로젝트 KPI 달성</span></div>' + ch('ovKpi', 'h240')
        : '<div class="ov-hero"><span class="big">' + mets.length + '</span><span class="aside">수치 지표 자동 추출</span></div>' + ch('ovKpi', 'h200')), { click: 'kpi' });
    h += card('c4', '<span class="ov-num">07</span> 위기·리스크', '',
      '<div class="ov-hero"><span class="big">' + s.crises + '</span><span class="unit">건</span><span class="aside">해결 ' + crisisResolved + ' · 재발 ' + recurred + ' · 미결 이슈 ' + s.issues + '</span></div>' + ch('ovRisk', 'h200'), { click: 'risk' });
    h += card('c4', '<span class="ov-num">08</span> 부서별 업무 분석', topEdge ? '최다 협업: ' + (A.DEPT_SHORT[topEdge.a] || topEdge.a) + ' ↔ ' + (A.DEPT_SHORT[topEdge.b] || topEdge.b) : '',
      ch('ovDept', 'h240'), { click: 'dept' });

    h += card('c8', '<span class="ov-num">11</span> 차년도 기획 ' + (ny ? ai() : ''), ny ? '올해 실적 → 2027 목표 (올해 = 100 기준 지수)' : '',
      ny ? '<div class="split" style="align-items:center;flex-wrap:nowrap;gap:20px"><div style="flex:1.2;min-width:0">' + ch('ovNext', 'h200') + '</div><div style="flex:1;min-width:0">' + slopeLegend(api, ny.kpis) + '</div></div>' : '<div class="empty">회고·차년도 회의가 포함되면 자동으로 채워집니다</div>', { click: 'next' });
    h += card('c12', '<span class="ov-num">10</span> AI 인사이트 ' + ai(), '',
      '<div class="ov-ins">' + ins.slice(0, 4).map(function (i) {
        return '<div><b>' + api.esc(i.metric) + '</b><small>' + api.esc(i.cat) + '</small><span>' + api.esc(i.title) + '</span></div>';
      }).join('') + '</div>', { click: 'insight' });
    h += '</div>';
    p.innerHTML = h;
    bindGo(p, api);
    bindOverviewTop(p, R, api);

    // 차트
    onClickMeeting(api.chart(el('ovFlow'), timelineOpt(R, api, true)), api);


    var months = api.uniq(R.meetings.map(function (m) { return m.date.slice(0, 7); })).sort();
    var perMonth = months.map(function (mo) { return R.meetings.filter(function (m) { return m.date.slice(0, 7) === mo; }); });
    var hrs = perMonth.map(function (ms) { return Math.round(sum(ms.map(function (m) { return m.durationMin || 0; })) / 6) / 10; });
    api.chart(el('ovTime'), {
      grid: { left: 34, right: 12, top: 18, bottom: 24 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: T.axis } }, formatter: function (ps) { var i = ps[0].dataIndex, ms = perMonth[i]; return '<b>' + hrs[i] + '시간</b> · ' + months[i] + ' · ' + ms.length + '회<br>' + ms.map(function (m) { return api.NATURE_GLYPH[m.nature] + ' ' + m.durationMin + '분 · ' + api.esc(short(m.title, 20)); }).join('<br>'); } },
      xAxis: axis(T, { type: 'category', boundaryGap: false, data: months.map(function (x) { return +x.slice(5) + '월'; }), splitLine: { show: false }, axisLabel: { color: T.muted, fontSize: 10.5 } }),
      yAxis: axis(T, { type: 'value', axisLine: { show: false }, splitNumber: 3, name: '시간', nameTextStyle: { color: T.muted, fontSize: 10.5 } }),
      series: [{ type: 'line', smooth: 0.4, symbol: 'circle', symbolSize: 7, data: hrs,
        lineStyle: { color: T.s[0], width: 2.5 }, itemStyle: { color: T.surface, borderColor: T.s[0], borderWidth: 2 },
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(37,99,235,.28)' }, { offset: 1, color: 'rgba(37,99,235,0)' }] } } }]
    });

    var tops = R.topicShare.slice(0, 6);
    api.chart(el('ovTopic'), polarOpt(api, tops.slice(0, 5).map(function (t) { return { k: t.key, v: t.pct }; }), Object.assign({ unit: '%', bw: 8 }, dims('ovTopic'))));

    if (finals.length) {
      api.chart(el('ovKpi'), kpiBulletOpt(api, finals.map(function (f) { return { name: f.name.replace('누적 ', '').replace('(CM)', ''), r: f.r, state: f.state, tip: api.fmt(f.last.actual, 2) + f.unit + ' / 목표 ' + api.fmt(f.last.target, 2) + f.unit }; }), 96));
    } else {
      if (mets.length) api.chart(el('ovKpi'), kpiBulletOpt(api, mets.slice(0, 6).map(function (m) { return { name: short(m.metric, 10), r: m.rate, state: m.state, tip: m.actual + m.unit + ' / 목표 ' + m.target + m.unit }; }), 96));
      else el('ovKpi').innerHTML = empty('수치형 목표·실적이 없습니다');
    }

    if (R.crises.length) {
      var cRisk = api.chart(el('ovRisk'), {
        grid: { left: 96, right: 50, top: 8, bottom: 20 },
        tooltip: { trigger: 'item', formatter: function (p) { var c = p.data.c; return '<b>' + (c.daysToResolve != null ? c.daysToResolve + '일' : '미해결') + '</b> 만에 해결<br>' + api.esc(c.title) + '<br><span style="color:' + T.muted + '">' + c.type + ' · ' + c.date + ' → ' + (c.resolvedDate || '-') + '</span>'; } },
        xAxis: axis(T, { type: 'value', name: '해결까지 일수', nameLocation: 'middle', nameGap: 22, nameTextStyle: { color: T.muted, fontSize: 10 }, axisLine: { show: false }, splitNumber: 3 }),
        yAxis: axis(T, { type: 'category', inverse: true, data: R.crises.map(function (c) { return c.type; }), axisLine: { show: false }, axisLabel: { color: T.ink2, fontSize: 11.5 } }),
        series: [{ type: 'bar', barWidth: 14, data: R.crises.map(function (c, i) { return { value: c.daysToResolve || 0, mid: c.meeting, c: c, itemStyle: { color: T.s[i % 8], borderRadius: [0, 4, 4, 0] } }; }),
          label: { show: true, position: 'right', color: T.ink2, fontSize: 11, formatter: function (p) { return p.data.c.resolved ? p.value + '일 ✓' : '진행 중'; } } }]
      });
      onClickMeeting(cRisk, api);
    } else {
      var ist = issueStatusCounts(R);
      api.chart(el('ovRisk'), donutOpt(api, ist, R.issues.length, '이슈'));
    }

    api.chart(el('ovDept'), networkOpt(R, api, true));

    if (ny) {
      api.chart(el('ovNext'), slopeOpt(api, ny.kpis));
    }
  }
  function fmtAvg(R) { return R.meetings.length ? Math.round(sum(R.meetings.map(function (m) { return m.attendees.length; })) / R.meetings.length * 10) / 10 : 0; }
  function addLegendRight(node, items) {
    if (!node) return;
    var d = document.createElement('div');
    d.className = 'legend'; d.style.justifyContent = 'center'; d.style.marginTop = '-4px';
    d.innerHTML = items.map(function (i) { return '<span>' + (i.sym ? '<b class="sym" style="color:' + i.c + '">' + i.sym + '</b>' : '<i class="sw" style="background:' + i.c + '"></i>') + i.k + '</span>'; }).join('');
    node.parentNode.insertBefore(d, node.nextSibling);
  }
  function kpiBulletOpt(api, items, left) {
    var T = api.tokens();
    var max = Math.max(120, Math.ceil(Math.max.apply(null, items.map(function (i) { return i.r; })) / 10) * 10);
    return {
      grid: { left: left || 110, right: 52, top: 18, bottom: 18 },
      tooltip: { trigger: 'item', formatter: function (p) { var it = items[p.dataIndex]; return '<b>' + pctTxt(it.r) + '</b> 달성 · ' + stateIcon(it.state) + ' ' + it.state + '<br>' + api.esc(it.name) + '<br><span style="color:' + T.muted + '">' + api.esc(it.tip || '') + '</span>'; } },
      xAxis: axis(T, { type: 'value', min: 0, max: max, axisLabel: { color: T.muted, fontSize: 10, formatter: '{value}%' }, splitNumber: 3 }),
      yAxis: axis(T, { type: 'category', inverse: true, data: items.map(function (i) { return i.name; }), axisLine: { show: false }, axisLabel: { color: T.ink2, fontSize: 11.5, width: (left || 110) - 10, overflow: 'truncate' } }),
      series: [{
        type: 'bar', barWidth: 12, data: items.map(function (i) { return { value: Math.round(i.r * 10) / 10, itemStyle: { color: stateColor(T, i.state), borderRadius: [0, 4, 4, 0] } }; }),
        label: { show: true, position: 'right', color: T.ink2, fontSize: 11, formatter: function (p) { return p.value + '%'; } },
        markLine: { silent: true, symbol: 'none', lineStyle: { color: T.ink, width: 1.5, type: 'solid' }, label: { show: true, formatter: '목표', color: T.muted, fontSize: 10, position: 'start' }, data: [{ xAxis: 100 }] }
      }]
    };
  }
  function issueStatusCounts(R) {
    var T = window.DashboardAPI.tokens();
    var map = { '오픈': T.serious, '모니터링': T.warning, '종결': T.good, '부분종결': T.s[2], '이관': T.s[6] };
    return Object.keys(map).map(function (k) { return { k: k, value: R.issues.filter(function (i) { return i.status === k; }).length, c: map[k] }; });
  }

  function networkOpt(R, api, mini) {
    var T = api.tokens();
    var ds = R.depts.filter(function (d) { return d.meetings || d.actions; });
    var maxA = Math.max.apply(null, ds.map(function (d) { return d.actions + d.meetings; }).concat([1]));
    var edges = R.edges.filter(function (e) { return ds.some(function (d) { return d.dept === e.a; }) && ds.some(function (d) { return d.dept === e.b; }); });
    var maxW = Math.max.apply(null, edges.map(function (e) { return e.weight; }).concat([1]));
    return {
      tooltip: {
        formatter: function (p) {
          if (p.dataType === 'edge') return '<b>' + p.data.w + '</b> 협업 강도<br>' + api.esc(p.data.source) + ' ↔ ' + api.esc(p.data.target) + '<br><span style="color:' + T.muted + '">공동 업무 ' + p.data.act + '건 · 같은 논의 ' + p.data.dis + '건</span>';
          var d = p.data.d; return '<b>' + api.esc(d.dept) + '</b><br>회의 ' + d.meetings + '회 · 업무 ' + d.actions + '건 · 완료율 ' + d.doneRate + '%';
        }
      },
      series: [{
        type: 'graph', layout: 'circular', circular: { rotateLabel: false }, roam: false, top: mini ? 20 : 40, bottom: mini ? 20 : 40, left: mini ? 50 : 90, right: mini ? 50 : 90,
        label: { show: true, position: 'right', color: T.ink, fontSize: mini ? 10.5 : 12, fontWeight: 600, formatter: function (p) { return mini ? p.data.d.short : p.data.d.dept; } },
        emphasis: { focus: 'adjacency', lineStyle: { width: 6 } },
        data: ds.map(function (d) {
          var ext = /외부/.test(d.dept);
          return { name: d.dept, d: d, symbolSize: (mini ? 10 : 16) + (d.actions + d.meetings) / maxA * (mini ? 22 : 38),
            itemStyle: { color: ext ? T.neutral : d.dept === '대표이사' ? T.ink : T.s[0], borderColor: T.surface, borderWidth: 2 } };
        }),
        links: edges.map(function (e) {
          return { source: e.a, target: e.b, w: e.weight, act: e.action, dis: e.discussion,
            lineStyle: { width: 1 + e.weight / maxW * (mini ? 5 : 9), color: e.action ? T.s[0] : T.axis, opacity: 0.25 + e.weight / maxW * 0.55, curveness: 0.15 } };
        })
      }]
    };
  }

  function nextKpiOpt(api, kpis, mini) {
    var T = api.tokens();
    return {
      grid: { left: mini ? 92 : 120, right: 58, top: 8, bottom: 22 },
      tooltip: { trigger: 'item', formatter: function (p) { var k = kpis[p.dataIndex]; return '<b>+' + Math.round((k.next / k.thisYear - 1) * 1000) / 10 + '%</b> 성장 목표<br>' + api.esc(k.name) + '<br><span style="color:' + T.muted + '">올해 ' + api.fmt(k.thisYear) + k.unit + ' → 2027 ' + api.fmt(k.next) + k.unit + '</span>'; } },
      xAxis: axis(T, { type: 'value', min: 0, axisLabel: { color: T.muted, fontSize: 10, formatter: '+{value}%' }, splitNumber: 3 }),
      yAxis: axis(T, { type: 'category', inverse: true, data: kpis.map(function (k) { return k.name; }), axisLine: { show: false }, axisLabel: { color: T.ink2, fontSize: 11.5 } }),
      series: [{ type: 'bar', barWidth: 12, itemStyle: { color: T.good, borderRadius: [0, 4, 4, 0] },
        data: kpis.map(function (k) { return Math.round((k.next / k.thisYear - 1) * 1000) / 10; }),
        label: { show: true, position: 'right', color: T.ink2, fontSize: 11, formatter: function (p) { return '+' + p.value + '%'; } } }]
    };
  }

  // =====================================================================
  // 01 회의 기본정보
  // =====================================================================
  function basic(p, R, api) {
    var T = api.tokens(), ms = R.meetings, s = R.summary;
    if (!ms.length) { p.innerHTML = head('회의 기본정보', '') + empty(); return; }
    var places = {}; ms.forEach(function (m) { places[m.room] = (places[m.room] || 0) + 1; });
    var placeArr = Object.keys(places).map(function (k) { return { k: k, v: places[k] }; }).sort(function (a, b) { return b.v - a.v; });
    var hybrid = ms.filter(function (m) { return m.hybrid; }).length;
    var avgAtt = fmtAvg(R);
    var h = head('회의 기본정보', '회의번호·일시·장소·성격·유형·참석자·주재자·기록자를 구조화했습니다. 상단 필터 바로 원하는 회의만 골라 볼 수 있습니다.');
    h += '<div class="tiles">' +
      tile('회의 수', ms.length, '건', s.byNature.map(function (n) { return n.key + ' ' + n.value; }).join(' · ')) +
      tile('총 회의 시간', Math.round(s.totalMinutes / 6) / 10, '시간', '평균 ' + Math.round(s.totalMinutes / ms.length) + '분') +
      tile('평균 참석자', avgAtt, '명', '최대 ' + Math.max.apply(null, ms.map(function (m) { return m.attendees.length; })) + '명') +
      tile('참석 부서', api.uniq([].concat.apply([], ms.map(function (m) { return m.depts; }))).length, '개', '외부 조직 포함') +
      tile('회의 장소', placeArr.length, '곳', '화상 병행 ' + hybrid + '건') +
      tile('주재자', api.uniq(ms.map(function (m) { return m.chairName; })).length, '명', '기록자 ' + api.uniq(ms.map(function (m) { return m.recorderName; })).length + '명') +
      '</div>';
    // 참석자 리스트 (아바타 · 역할 · 참석 횟수)
    var inV = {}; ms.forEach(function (m) { inV[m.no] = true; });
    var plist = Object.keys(R.people).map(function (k) { return R.people[k]; }).map(function (pp) {
      var n = pp.meetings.filter(function (no) { return inV[no]; }).length;
      var ch2 = ms.filter(function (m) { return m.chairName === pp.name; }).length, rc = ms.filter(function (m) { return m.recorderName === pp.name; }).length;
      return Object.assign({}, pp, { n: n, ch: ch2, rc: rc });
    }).filter(function (pp) { return pp.n; }).sort(function (a, b) { return b.n - a.n || b.ch - a.ch; });
    var maxN = plist.length ? plist[0].n : 1;
    h += '<div class="grid">';
    var roomsV = roomsOf(ms), roomArr = Object.keys(roomsV).map(function (k) { return roomsV[k]; }).sort(function (a, b) { return b.list.length - a.list.length; });
    h += card('c7', '회의 장소 ' + src(), '본사 층별 도면 · 높이·색 = 회의 수 · 공간을 누르면 그 장소의 회의만 봅니다',
      '<div style="flex:1;display:flex;flex-direction:column;justify-content:center">' + floorPlanHTML(R, api, false) + '</div>' + window.Info.floorLegend(T) + '<div class="room-grid">' + roomArr.map(function (r) {
        var on = api.S.f.places.indexOf(r.key) >= 0;
        var avg = Math.round(sum(r.list.map(function (m) { return m.durationMin || 0; })) / r.list.length);
        return '<button type="button" class="room-item' + (on ? ' on' : '') + '" data-place="' + api.esc(r.key) + '"><span class="fl">' + (r.floor ? r.floor + 'F' : '외부') + '</span>' +
          '<span><b>' + api.esc(r.room) + '</b><small>' + api.esc(r.building) + ' · 평균 ' + avg + '분</small><span class="mini">' + r.list.map(function (m) { return '<i title="' + api.esc(m.id + ' ' + m.title) + '" style="background:' + api.natureColor(m.nature) + '"></i>'; }).join('') + '</span></span>' +
          '<span class="cnt">' + r.list.length + '<small style="font-size:11px;margin-left:1px">회</small></span></button>';
      }).join('') + '</div>');
    h += '<div class="c5 stack">' + miniCalendarCard(R, api, '');
    h += card('', '참석자 ' + src(), plist.length + '명 · 참석 횟수 순 · 누르면 해당 인물이 참석한 회의만 보기',
      '<div class="plist compact two">' + plist.map(function (pp) {
        return '<div class="prow" data-person="' + api.esc(pp.name) + '" role="button" tabindex="0">' + api.avatar(pp.name) +
          '<div style="min-width:0"><b>' + api.esc(pp.name) + '</b><div class="role">' + api.esc(pp.role) + '</div>' +
          '<div class="meta">참석<em>' + pp.n + '회</em><span style="display:inline-block;width:56px;height:4px;border-radius:2px;background:var(--grid);margin-left:8px;vertical-align:middle;position:relative;overflow:hidden"><i style="position:absolute;inset:0 auto 0 0;width:' + Math.round(pp.n / maxN * 100) + '%;background:var(--good)"></i></span></div></div>' +
          '<div class="right">' + (pp.ch ? '<span class="status st-정기">주재 ' + pp.ch + '</span>' : '') + (pp.rc ? '<span class="pill">기록 ' + pp.rc + '</span>' : '') + '</div></div>';
      }).join('') + '</div>') + '</div>';
    var byNat = A.NATURES.map(function (n) { var l = ms.filter(function (m) { return m.nature === n; }); return { n: n, l: l, avg: l.length ? Math.round(sum(l.map(function (m) { return m.durationMin || 0; })) / l.length) : 0, dec: sum(l.map(function (m) { return m.decisions.length; })) }; });
    h += card('c4', '회의 성격 ' + src(), '회의 1건 = 1칸 · ● 정기 ▲ 임시 ⚠ 긴급', '<div style="padding:4px 0 6px">' + window.Info.waffle(s.byNature.map(function (n) { return { k: n.key, v: n.value, c: api.natureColor(n.key), glyph: api.NATURE_GLYPH[n.key] }; }), { cols: 10, cell: 40, legend: false }) + '</div>' +
      '<div class="nat-rows">' + byNat.map(function (x) {
        return '<div><span class="status st-' + x.n + '">' + api.NATURE_GLYPH[x.n] + ' ' + x.n + '</span><b>' + x.l.length + '<small>건</small></b><span class="pbar"><i style="width:' + (ms.length ? x.l.length / ms.length * 100 : 0) + '%;background:' + api.natureColor(x.n) + '"></i></span><small>평균 ' + x.avg + '분 · 결정 ' + x.dec + '</small></div>';
      }).join('') + '</div>');
    h += card('c4', '회의 유형 ' + src(), '방사형 막대 · 한 회의가 여러 유형에 해당 (다중 분류)', ch('bType', 'h280'));
    var attAvg = fmtAvg(R), attMax = Math.max.apply(null, ms.map(function (m) { return m.attendees.length; })), attMin = Math.min.apply(null, ms.map(function (m) { return m.attendees.length; }));
    var dist = []; for (var q = attMin; q <= attMax; q++) dist.push({ k: q, v: ms.filter(function (m) { return m.attendees.length === q; }).length });
    var dMax = Math.max.apply(null, dist.map(function (x) { return x.v; }).concat([1]));
    h += card('c4', '회의당 참석 규모 ' + src(), '평균 참석 인원 / 최대 ' + attMax + '명',
      '<div style="display:flex;align-items:flex-end;gap:14px;margin:4px 0 10px"><span class="big-num">' + attAvg + '<small>명</small></span><span class="note" style="margin:0 0 4px">회의 1건 평균 · 최소 ' + attMin + '명 · 부서 ' + Math.round(sum(ms.map(function (m) { return m.depts.length; })) / ms.length * 10) / 10 + '개</span></div>' +
      '<div class="picto lg">' + window.Info.pictogram(attMax, Math.round(attAvg), { color: T.s[0], track: T.grid }).replace('<div class="picto">', '').replace(/<\/div>$/, '') + '</div>' +
      '<div class="card-sub" style="margin:14px 0 6px;font-weight:700;color:var(--ink-2)">참석 인원별 회의 수</div><div class="mini-cols">' + dist.map(function (x) {
        return '<div title="' + x.k + '명 참석 회의 ' + x.v + '건"><span style="height:' + (x.v ? 8 + x.v / dMax * 52 : 3) + 'px;background:' + (x.v ? T.s[0] : T.grid) + '"></span><b>' + (x.v || '') + '</b><small>' + x.k + '명</small></div>';
      }).join('') + '</div>');
    h += card('c12', '부서별 참석 매트릭스 ' + src(), '진한 칸 = 주재 부서 · 셀을 누르면 해당 회의 상세',
      legend([{ k: '참석', c: T.seq[2] }, { k: '주재', c: T.seq[5] }]) + ch('bDeptHeat', 'h360'));
    h += card('c12', '참석자 × 회의 ' + src(), '사람별 참석 이력 (● 주재 · ✎ 기록)', ch('bPeopleHeat', 'h480'));
    h += card('c12', '회의 시간과 규모', '롤리팝 높이 = 회의 시간(분) · 점 크기 = 참석 인원', legend(A.NATURES.map(function (n) { return { k: n, c: api.natureColor(n) }; })) + ch('bDur', 'h280'));
    h += '</div>';
    p.innerHTML = h;
    api.$$('.srow[data-mid]', p).forEach(function (b) {
      b.addEventListener('click', function () { api.openMeeting(b.dataset.mid); });
      b.addEventListener('keydown', function (e) { if (e.key === 'Enter') api.openMeeting(b.dataset.mid); });
    });
    api.$$('[data-person]', p).forEach(function (b) {
      b.addEventListener('click', function () { api.setFilter('people', b.dataset.person); });
      b.addEventListener('keydown', function (e) { if (e.key === 'Enter') api.setFilter('people', b.dataset.person); });
    });

    bindRooms(p, api);
    bindCal(p, R, api);
    var tItems = s.byType.slice().sort(function (a, b) { return b.value - a.value; }).map(function (t) { return { k: t.key, v: t.value }; });
    var cT = api.chart(el('bType'), polarOpt(api, tItems, Object.assign({ unit: '건', labelW: 96 }, dims('bType'))));
    if (cT) cT.on('click', function (e) { api.setFilter('types', tItems[e.dataIndex].k); });

    // 부서 매트릭스
    var depts = R.depts.filter(function (d) { return d.meetings; }).map(function (d) { return d.dept; });
    var cells = [];
    ms.forEach(function (m, x) { depts.forEach(function (d, y) { if (m.depts.indexOf(d) >= 0) cells.push([x, y, m.chairDept === d ? 2 : 1, m.id]); }); });
    var cH = api.chart(el('bDeptHeat'), {
      grid: { left: 100, right: 12, top: 8, bottom: 30 },
      tooltip: { formatter: function (p) { var m = meetingById(R, p.data[3]); return '<b>' + api.esc(depts[p.data[1]]) + '</b> ' + (p.data[2] === 2 ? '주재' : '참석') + '<br>' + api.esc(m.id) + ' · ' + api.esc(m.title); } },
      xAxis: axis(T, { type: 'category', data: ms.map(function (m) { return mno(m.id); }), splitLine: { show: false }, axisLabel: { color: T.muted, fontSize: 10.5, interval: 0 } }),
      yAxis: axis(T, { type: 'category', data: depts, inverse: true, axisLine: { show: false }, axisLabel: { color: T.ink2, fontSize: 11.5, interval: 0 } }),
      visualMap: { show: false, type: 'piecewise', dimension: 2, pieces: [{ value: 1, color: T.seq[2] }, { value: 2, color: T.seq[5] }] },
      series: [{ type: 'heatmap', data: cells, itemStyle: { borderColor: T.surface, borderWidth: 2, borderRadius: 3 } }]
    });
    if (cH) cH.on('click', function (e) { api.openMeeting(e.data[3]); });

    // 사람 매트릭스
    var people = Object.keys(R.people).map(function (k) { return R.people[k]; }).filter(function (pp) { return pp.meetings.some(function (n) { return ms.some(function (m) { return m.no === n; }); }); });
    var order = A.DEPTS;
    people.sort(function (a, b) { return (order.indexOf(a.dept) + 1 || 99) - (order.indexOf(b.dept) + 1 || 99) || b.meetings.length - a.meetings.length; });
    var pc = [];
    ms.forEach(function (m, x) {
      people.forEach(function (pp, y) {
        var at = m.attendees.some(function (a) { return a.name === pp.name; });
        if (at) pc.push([x, y, m.chairName === pp.name ? 3 : m.recorderName === pp.name ? 2 : 1, m.id]);
      });
    });
    el('bPeopleHeat').style.height = Math.max(260, people.length * 22 + 50) + 'px';
    var cP = api.chart(el('bPeopleHeat'), {
      grid: { left: 150, right: 12, top: 8, bottom: 30 },
      tooltip: { formatter: function (p) { var pp = people[p.data[1]], m = meetingById(R, p.data[3]); return '<b>' + api.esc(pp.name) + '</b> ' + ['', '참석', '기록', '주재'][p.data[2]] + '<br>' + api.esc(m.id) + ' · ' + api.esc(m.title); } },
      xAxis: axis(T, { type: 'category', data: ms.map(function (m) { return mno(m.id); }), splitLine: { show: false }, axisLabel: { color: T.muted, fontSize: 10.5, interval: 0 } }),
      yAxis: axis(T, { type: 'category', inverse: true, data: people.map(function (pp) { return pp.name + ' · ' + (A.DEPT_SHORT[pp.dept] || pp.dept); }), axisLine: { show: false }, axisLabel: { color: T.ink2, fontSize: 11, interval: 0 } }),
      visualMap: { show: false, type: 'piecewise', dimension: 2, pieces: [{ value: 1, color: T.seq[1] }, { value: 2, color: T.seq[3] }, { value: 3, color: T.seq[5] }] },
      series: [{ type: 'heatmap', data: pc, itemStyle: { borderColor: T.surface, borderWidth: 2, borderRadius: 3 },
        label: { show: true, color: '#fff', fontSize: 9, formatter: function (p) { return p.data[2] === 3 ? '●' : p.data[2] === 2 ? '✎' : ''; } } }]
    });
    if (cP) cP.on('click', function (e) { api.openMeeting(e.data[3]); });

    var cD = api.chart(el('bDur'), lollipopOpt(api, ms.map(function (m) { return mno(m.id); }), ms.map(function (m) { return { value: m.durationMin, mid: m.id, c: api.natureColor(m.nature), size: 6 + m.attendees.length * 1.6 }; }), {
      unit: '분', label: function (pp) { return ms[pp.dataIndex].attendees.length + '명'; },
      tip: function (ps) { var m = ms[ps[0].dataIndex]; return '<b>' + m.durationMin + '분</b> · 참석 ' + m.attendees.length + '명<br>' + api.esc(m.id) + ' · ' + api.esc(m.title); } }));
    onClickMeeting(cD, api);
  }


  // =====================================================================
  // 회의 목록
  // =====================================================================
  function meetings(p, R, api) {
    var ms = R.meetings;
    if (!ms.length) { p.innerHTML = head('회의 목록', '') + empty(); return; }
    var h = head('회의 목록', '전체 회의를 월별로 모았습니다. 행을 누르면 회의록 전체 구조(안건·결정·업무·이슈)가 열립니다.');
    var months = api.uniq(ms.map(function (m) { return m.date.slice(0, 7); }));
    h += '<div class="grid">';
    h += card('c12', '회의 목록 ' + src(), ms.length + '건 · ' + months.length + '개월',
      '<div class="sched">' + ms.map(function (m, i) {
        var mh = (i === 0 || ms[i - 1].date.slice(0, 7) !== m.date.slice(0, 7)) ? '<div class="month-h">' + m.date.slice(0, 4) + '년 ' + (+m.date.slice(5, 7)) + '월 <small>' + ms.filter(function (x) { return x.date.slice(0, 7) === m.date.slice(0, 7); }).length + '건</small></div>' : '';
        return mh +
        '<div class="srow n-' + m.nature + '" data-mid="' + m.id + '" role="button" tabindex="0">' +
          '<div class="when"><b>' + m.date.slice(2).replace(/-/g, '.') + '</b>(' + m.dow + ') ' + m.start + '<br><span style="color:var(--muted)">' + (m.durationMin || '-') + '분</span></div>' +
          '<div class="body"><b>' + '<span style="color:var(--muted);font-weight:700;margin-right:6px">' + mno(m.id) + '</span>' + api.esc(m.title) + '</b>' +
          '<small>' + api.avatar(m.chairName, 'xs') + '주재 ' + api.esc(m.chair) + '<span>· 기록 ' + api.esc(m.recorderName) + '</span><span>· ' + window.Icons.icon('pin', 12) + '</span>' + api.esc(short(m.room, 18)) + '</small>' +
          '<small style="margin-top:6px"><span class="av-stack">' + m.attendees.slice(0, 5).map(function (a) { return api.avatar(a.name, 'xs'); }).join('') + (m.attendees.length > 5 ? '<span class="more">+' + (m.attendees.length - 5) + '</span>' : '') + '</span>' +
          m.types.map(function (t) { return '<span class="pill">' + t + '</span>'; }).join('') + '<span class="pill" style="background:transparent;border:1px solid var(--border)">단계 · ' + api.esc(m.phase) + '</span></small></div>' +
          '<div class="right"><span class="status st-' + m.nature + '">' + api.NATURE_GLYPH[m.nature] + ' ' + m.nature + '</span><span class="note" style="margin:0">결정 ' + m.decisions.length + ' · 업무 ' + m.actions.length + '</span></div></div>';
      }).join('') + '</div>');
    h += '</div>';
    p.innerHTML = h;
    api.$$('.srow[data-mid]', p).forEach(function (b) {
      b.addEventListener('click', function () { api.openMeeting(b.dataset.mid); });
      b.addEventListener('keydown', function (e) { if (e.key === 'Enter') api.openMeeting(b.dataset.mid); });
    });
  }

  // 단계 흐름 (STEP 카드 + 연결선) 과 단계 상세
  var flowSel = null;
  var PHASE_ICON = { '기획': ['bulb', 'blue'], '개발': ['box', 'purple'], '생산': ['factory', 'amber'], '유통': ['truck', 'orange'], '런칭': ['sparkles', 'blue'],
    '성장': ['trend', 'green'], '시즌 프로모션': ['calendar', 'pink'], '성과평가': ['target', 'teal'], '차년도 계획': ['flag', 'green'] };
  function stepFlowHTML(stats, api) {
    var I = window.Icons.icon;
    return '<div class="steps-flow" role="tablist" aria-label="프로젝트 단계">' + stats.map(function (x, i) {
      var ic = PHASE_ICON[x.ph] || ['flag', 'blue'], nx = stats[i + 1];
      var desc = x.meetings.map(function (m) { return m.title.replace(/\s*(및|·).*$/, ''); }).slice(0, 2).join(' · ');
      var gapDays = nx ? Math.round((new Date(nx.from) - new Date(x.to)) / 86400000) : 0;
      return '<button type="button" class="sf-card' + (flowSel === x.ph ? ' on' : '') + '" data-phase="' + api.esc(x.ph) + '" role="tab" aria-selected="' + (flowSel === x.ph) + '">' +
        '<span class="sf-badge">STEP ' + ('0' + (i + 1)).slice(-2) + '</span>' +
        '<span class="ic-wrap sq tone-' + ic[1] + '">' + I(ic[0], 22) + '</span>' +
        '<b>' + api.esc(x.ph) + '</b><small class="sf-desc">' + api.esc(desc) + '</small>' +
        '<span class="sf-meta">' + x.from.slice(5).replace('-', '.') + (x.to !== x.from ? '–' + x.to.slice(5).replace('-', '.') : '') + '</span>' +
        '<span class="sf-nums"><em>회의 ' + x.n + '</em><em>결정 ' + x.dec + '</em>' + (x.urgent ? '<em class="u">⚠ ' + x.urgent + '</em>' : '') + '</span></button>' +
        (nx ? '<span class="sf-link"><small>' + gapDays + '일</small><i></i></span>' : '');
    }).join('') + '</div>';
  }
  function phaseDetailHTML(R, api, ph) {
    var I = window.Icons.icon, T = api.tokens();
    var ms = R.meetings.filter(function (m) { return m.phase === ph; });
    if (!ms.length) return '';
    var ids = {}; ms.forEach(function (m) { ids[m.id] = true; });
    var decs = R.decisions.filter(function (d) { return ids[d.meeting]; });
    var acts = R.actions.filter(function (a) { return ids[a.meeting]; });
    var loops = R.loops.filter(function (l) { return ids[l.meeting]; });
    var issues = R.issues.filter(function (it) { return ids[it.first.meeting]; });
    var mins = sum(ms.map(function (m) { return m.durationMin || 0; }));
    var from = ms[0].date, to = ms[ms.length - 1].date, span = Math.round((new Date(to) - new Date(from)) / 86400000) + 1;
    var idx = A.PHASES.indexOf(ph), ic = PHASE_ICON[ph] || ['flag', 'blue'];
    var done = acts.filter(function (a) { return a.done; }).length;
    var pills = [['회의 ' + ms.length + '건', T.s[0]], ['결정 ' + decs.length + '건', T.good], ['업무 ' + acts.length + '건 · 완료 ' + (acts.length ? Math.round(done / acts.length * 100) : 0) + '%', T.s[6]],
      ['새 이슈 ' + issues.length + '건', T.warning], ['회의 시간 ' + Math.round(mins / 6) / 10 + '시간', T.s[2]]];
    var urgent = ms.filter(function (m) { return m.nature === '긴급'; }).length;
    if (urgent) pills.push(['긴급회의 ' + urgent + '건', T.critical]);
    var h = '<div class="pd">';
    h += '<div class="pd-head"><span class="ic-wrap lg sq tone-' + ic[1] + '">' + I(ic[0], 24) + '</span><div><span class="sf-badge static">STEP ' + ('0' + (R.meetings.length ? phaseOrder(R, ph) : idx + 1)).slice(-2) + '</span>' +
      '<h3>' + api.esc(ph) + '</h3><p>' + from.replace(/-/g, '.') + ' – ' + to.replace(/-/g, '.') + ' · ' + span + '일간 · ' + api.esc(api.uniq(ms.map(function (m) { return m.stage; })).join(', ')) + '</p></div>' +
      '<button type="button" class="mini-btn" data-phase-filter="' + api.esc(ph) + '">' + I('target', 13) + '이 단계만 보기</button></div>';
    h += '<div class="pd-pills">' + pills.map(function (x) { return '<span><i style="background:' + x[1] + '"></i>' + x[0] + '</span>'; }).join('') + '</div>';
    h += '<div class="pd-grid">';
    h += '<div class="pd-col"><h5>' + I('calendar', 14) + '회의</h5>' + ms.map(function (m) {
      return '<button type="button" class="pd-m" data-open="' + m.id + '"><span class="status st-' + m.nature + '">' + api.NATURE_GLYPH[m.nature] + ' ' + m.nature + '</span><b>' + api.esc(m.title) + '</b><small>' + m.date.replace(/-/g, '.') + ' · ' + api.esc(m.chairName) + ' 주재 · ' + (m.durationMin || '-') + '분 · 참석 ' + m.attendees.length + '명</small></button>';
    }).join('') + '</div>';
    h += '<div class="pd-col"><h5>' + I('gavel', 14) + '핵심 결정 ' + decs.length + '</h5>' + decs.slice(0, 6).map(function (d) {
      return '<div class="pd-d">' + api.chips(d.id) + api.decisionPill(d.status, d.statusRaw) + '<p>' + api.esc(d.text) + '</p></div>';
    }).join('') + (decs.length > 6 ? '<div class="note">외 ' + (decs.length - 6) + '건 — 의사결정 탭에서 전체 보기</div>' : '') + '</div>';
    h += '<div class="pd-col"><h5>' + I('target', 14) + '성과 피드백 · 이슈</h5>' + (loops.length ? loops.slice(0, 4).map(function (l) {
      return '<div class="pd-d">' + api.chips(l.ref) + api.evalPill(l.eval, l.evalRaw) + '<p><b>' + api.esc(short(l.target, 40)) + '</b> → ' + api.esc(short(l.result, 48)) + '</p></div>';
    }).join('') : '<div class="note">이 단계에서 평가된 성과 피드백이 없습니다</div>') +
      (issues.length ? '<div class="pd-issues">' + issues.map(function (it) { return '<span title="' + api.esc(it.title) + ' · 현재 ' + it.status + '">' + api.chips(it.id) + api.esc(short(it.title, 14)) + '</span>'; }).join('') + '</div>' : '') + '</div>';
    h += '</div></div>';
    return h;
  }
  function phaseOrder(R, ph) {
    var list = A.PHASES.filter(function (p) { return R.meetings.some(function (m) { return m.phase === p; }); });
    return list.indexOf(ph) + 1;
  }
  function bindStepFlow(p, R, api) {
    function bindDetail() {
      var box = document.getElementById('phaseDetail');
      api.bindChips(box);
      api.$$('[data-open]', box).forEach(function (b) { b.addEventListener('click', function () { api.openMeeting(b.dataset.open); }); });
      api.$$('[data-phase-filter]', box).forEach(function (b) { b.addEventListener('click', function () { api.setFilter('phases', b.dataset.phaseFilter); }); });
    }
    api.$$('.sf-card', p).forEach(function (c) {
      c.addEventListener('click', function () {
        flowSel = c.dataset.phase;
        api.$$('.sf-card', p).forEach(function (x) { var on = x === c; x.classList.toggle('on', on); x.setAttribute('aria-selected', String(on)); });
        var box = document.getElementById('phaseDetail');
        box.innerHTML = phaseDetailHTML(R, api, flowSel);
        bindDetail();
      });
    });
    bindDetail();
  }

  // =====================================================================
  // 09 프로젝트 흐름
  // =====================================================================
  function flow(p, R, api) {
    var T = api.tokens(), ms = R.meetings;
    if (!ms.length) { p.innerHTML = head('프로젝트 진행 흐름', '') + empty(); return; }
    var phaseStats = A.PHASES.map(function (ph) {
      var pm = ms.filter(function (m) { return m.phase === ph; });
      return { ph: ph, n: pm.length, meetings: pm, from: pm.length ? pm[0].date : '', to: pm.length ? pm[pm.length - 1].date : '', dec: sum(pm.map(function (m) { return m.decisions.length; })),
        act: sum(pm.map(function (m) { return m.actions.length; })), urgent: pm.filter(function (m) { return m.nature === '긴급'; }).length };
    }).filter(function (x) { return x.n; });
    var h = head('프로젝트 진행 흐름', '전체 회의를 단계별 타임라인으로 봅니다. ● 정기 ▲ 임시 ⚠ 긴급 · 점을 누르면 회의 상세가 열립니다.');
    if (!flowSel || !phaseStats.some(function (x) { return x.ph === flowSel; })) flowSel = phaseStats[0].ph;
    h += '<div class="grid">';
    h += card('c12', '단계 흐름 요약 ' + src(), 'HOW IT WENT — 단계를 누르면 그 단계의 회의·결정·성과가 아래에 펼쳐집니다', stepFlowHTML(phaseStats, api) + '<div id="phaseDetail">' + phaseDetailHTML(R, api, flowSel) + '</div>');
    h += card('c12', '단계별 타임라인 ' + src(), '기획 → 개발 → 생산 → 유통 → 런칭 → 성장 → 시즌 프로모션 → 성과평가 → 차년도 계획',
      legend([{ k: '정기회의', c: api.natureColor('정기'), sym: '●' }, { k: '임시회의', c: api.natureColor('임시'), sym: '▲' }, { k: '긴급회의', c: api.natureColor('긴급'), sym: '⚠' }]) + ch('fTimeline', 'h420'));
    h += card('c8', '회의별 산출물 ' + src(), '회의마다 나온 결정·업무·이슈 건수 (누적) · 막대 위 숫자 = 합계', legend([{ k: '결정', c: T.seq[5] }, { k: '업무', c: T.seq[3] }, { k: '이슈(언급)', c: T.seq[1] }]) + ch('fOut', 'h280'));
    h += card('c4', '단계별 회의 밀도 ' + src(), '단계별 회의 수 · 빨간 구간 = 긴급회의', ch('fPhase', 'h320'));
    h += '</div>';
    p.innerHTML = h;
    bindStepFlow(p, R, api);
    onClickMeeting(api.chart(el('fTimeline'), timelineOpt(R, api, false)), api);
    var rowsB = [['결정', 'decisions', 5], ['업무', 'actions', 3], ['이슈(언급)', 'issues', 1]];
    var cO = api.chart(el('fOut'), {
      grid: { left: 32, right: 10, top: 22, bottom: 28 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(37,99,235,.06)' } }, formatter: function (ps) { var m = ms[ps[0].dataIndex]; return '<b>' + api.esc(m.id) + '</b> ' + api.esc(short(m.title, 26)) + '<br>' + ps.filter(function (x) { return x.seriesName; }).map(function (x) { return x.marker + x.seriesName + ' <b>' + x.value + '</b>'; }).join('<br>'); } },
      xAxis: axis(T, { type: 'category', data: ms.map(function (m) { return mno(m.id); }), splitLine: { show: false }, axisLabel: { color: T.muted, fontSize: 10.5, interval: 0 } }),
      yAxis: axis(T, { type: 'value', minInterval: 1, axisLine: { show: false }, splitNumber: 4 }),
      series: rowsB.map(function (r, i) {
        return { name: r[0], type: 'bar', stack: 'o', barWidth: '46%', itemStyle: { color: T.seq[r[2]], borderColor: T.surface, borderWidth: 1, borderRadius: i === rowsB.length - 1 ? [5, 5, 0, 0] : 0 },
          data: ms.map(function (m) { return { value: m[r[1]].length, mid: m.id }; }),
          label: i === rowsB.length - 1 ? { show: true, position: 'top', color: T.ink2, fontSize: 10.5, fontWeight: 700, formatter: function (pp) { var m = ms[pp.dataIndex]; return m.decisions.length + m.actions.length + m.issues.length; } } : { show: false } };
      })
    });
    onClickMeeting(cO, api);
    api.chart(el('fPhase'), {
      grid: { left: 90, right: 44, top: 6, bottom: 6 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(37,99,235,.06)' } }, formatter: function (ps) { var x = phaseStats[ps[0].dataIndex]; return '<b>' + x.ph + '</b><br>회의 ' + x.n + '건' + (x.urgent ? ' · 긴급 ' + x.urgent + '건' : '') + '<br>결정 ' + x.dec + ' · 업무 ' + x.act; } },
      xAxis: { type: 'value', show: false, max: Math.max.apply(null, phaseStats.map(function (x) { return x.n; })) },
      yAxis: [axis(T, { type: 'category', inverse: true, data: phaseStats.map(function (x) { return x.ph; }), axisLine: { show: false }, axisLabel: { color: T.ink2, fontSize: 12 } }),
        axis(T, { type: 'category', inverse: true, position: 'right', data: phaseStats.map(function (x) { return x.n + '회'; }), axisLine: { show: false }, axisLabel: { color: T.ink, fontSize: 11.5, fontWeight: 700 } })],
      series: [
        { name: '정기·임시', type: 'bar', stack: 'a', barWidth: 12, showBackground: true, backgroundStyle: { color: T.surface2, borderRadius: 6 },
          itemStyle: { color: { type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: T.seq[2] }, { offset: 1, color: T.seq[4] }] }, borderRadius: 6 },
          data: phaseStats.map(function (x) { return { value: x.n - x.urgent, itemStyle: x.urgent ? { borderRadius: [6, 0, 0, 6] } : undefined }; }) },
        { name: '긴급', type: 'bar', stack: 'a', barWidth: 12, itemStyle: { color: '#f08a8d', borderRadius: [0, 6, 6, 0] },
          data: phaseStats.map(function (x) { return x.urgent || null; }),
          label: { show: false } }
      ]
    });
  }

  // =====================================================================
  // 02 안건·논의
  // =====================================================================
  function discussion(p, R, api) {
    var T = api.tokens(), ds = R.discussions, ms = R.meetings;
    // 차트마다 다른 파스텔 톤
    var PAS = {
      topic: ['#8fa8f7', '#9db2f8', '#abbdf9', '#b9c8fa', '#c6d2fb', '#d2dcfc', '#dee5fd', '#e9eefe'],
      phase: [T.surface2, '#d9f4ee', '#b3e9dc', '#86d9c5', '#5fc7ad'],
      kw: ['#efe9fd', '#e0d6fb', '#cdbdf7', '#b8a2f2', '#a38aec'],
      flow: [T.surface2, '#ffe8d6', '#fdd0ae', '#f9b382'],
      res: ['#a9c4fb', '#9fdcc2', '#f9d58c', '#d3d8e2'],
      recur: '#f6b3a4'
    };
    var pasInk = '#334155';
    if (!ds.length) { p.innerHTML = head('안건 및 논의 분석', '') + empty(); return; }
    var resKeys = ['채택', '조건부 채택', '절충', '보류·연기'];
    var resCol = PAS.res;
    var recurring = R.issues.filter(function (i) { return i.mentions >= 2; }).sort(function (a, b) { return b.mentions - a.mentions; });
    var pairs = Object.keys(R.conflictPairs).map(function (k) { return { k: k.split('|'), v: R.conflictPairs[k] }; }).sort(function (a, b) { return b.v - a.v; });
    var agendaN = sum(ms.map(function (m) { return m.agenda.length; }));
    var h = head('안건 및 논의 분석', '회의록의 안건별 논의·이견·결론 텍스트를 AI 규칙으로 분류해 "무엇을 얼마나 이야기했는지"를 수치화했습니다.');
    h += '<div class="tiles">' + tile('안건', agendaN, '개', '회의당 ' + Math.round(agendaN / ms.length * 10) / 10 + '개') + tile('논의 기록', ds.length, '건', '이견·대안 포함') +
      tile('최다 주제', R.topicShare[0].key, '', R.topicShare[0].pct + '%') + tile('반복 이슈', recurring.length, '건', '2회 이상 등장') +
      tile('보류·연기된 논의', ds.filter(function (d) { return d.resolution === '보류·연기'; }).length, '건', '결론 유형 AI 분류') + '</div>';
    h += '<div class="grid">';
    var ts = R.topicShare;
    h += card('c5', '가장 많이 논의된 주제 ' + ai(), '1위 <b style="color:var(--ink)">' + ts[0].key + ' ' + ts[0].pct + '%</b> · 2위 ' + ts[1].key + ' ' + ts[1].pct + '% · 3위 ' + ts[2].key + ' ' + ts[2].pct + '%', ch('dTopic', 'h320'));
    h += card('c7', '단계별 논의 주제 변화 ' + ai(), '진할수록 해당 단계에서 많이 논의됨 (주제 점유율 %)', ch('dTopicPhase', 'h320'));
    h += card('c7', '주요 키워드 ' + ai(), '원문 전체에서 등장 빈도 · 크기 = 언급 수', ch('dKw', 'h360'));
    h += card('c5', '키워드 흐름', '상위 키워드의 회의별 언급 추이', ch('dKwTrend', 'h360'));
    h += card('c6', '부서 간 이견 ' + ai(), '같은 안건에서 의견이 갈린 부서 쌍 · 많이 부딪힌 순', '<div id="dConflict" class="pairs"></div>');
    h += card('c3', '이견의 결론 방식 ' + ai(), '이견이 어떻게 정리됐나', ch('dRes', 'h320'));
    h += card('c3', '반복적으로 등장한 이슈 ' + src(), '미결 이슈가 회의록에 등장한 횟수', recurring.length ? ch('dRecur', 'h360') : empty('2회 이상 등장한 이슈가 없습니다'));
    h += card('c12', '안건별 논의 · 이견 · 결론', '',
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>회의</th><th>안건</th><th>주제</th><th>관련 부서</th><th>핵심 논의</th><th>이견·대안</th><th>결론</th><th>결론 방식</th></tr></thead><tbody>' +
      ds.map(function (d) {
        return '<tr><td>' + api.chips(d.meeting) + '</td><td><b>' + api.esc(d.topic) + '</b></td><td><span class="pill">' + d.category + '</span></td><td>' + d.depts.map(function (x) { return A.DEPT_SHORT[x] || x; }).join(', ') + '</td>' +
          '<td class="clip">' + api.esc(d.discussion) + '</td><td class="clip">' + api.esc(d.dissent) + '</td><td class="clip">' + api.esc(d.conclusion) + '</td><td>' + d.resolution + '</td></tr>';
      }).join('') + '</tbody></table></div>');
    h += '</div>';
    p.innerHTML = h;
    api.bindChips(p);

    api.chart(el('dTopic'), polarOpt(api, ts.map(function (t, i) { return { k: t.key, v: t.pct, c: PAS.topic[i % PAS.topic.length] }; }), Object.assign({ unit: '%', bw: 9, labelW: 128 }, dims('dTopic'))));

    var phases = A.PHASES.filter(function (ph) { return ms.some(function (m) { return m.phase === ph; }); });
    var topics = A.TOPICS;
    var cells = [], maxv = 0;
    phases.forEach(function (ph, x) {
      var pd = ds.filter(function (d) { return meetingById(R, d.meeting).phase === ph; });
      var tot = sum(pd.map(function (d) { return sum(d.scores); })) || 1;
      topics.forEach(function (tp, y) {
        var v = Math.round(sum(pd.map(function (d) { return d.scores[y]; })) / tot * 100);
        maxv = Math.max(maxv, v); cells.push([x, y, v]);
      });
    });
    api.chart(el('dTopicPhase'), {
      grid: { left: 96, right: 12, top: 8, bottom: 44 },
      tooltip: { formatter: function (p) { return '<b>' + p.data[2] + '%</b> · ' + topics[p.data[1]] + '<br>' + phases[p.data[0]] + ' 단계'; } },
      xAxis: axis(T, { type: 'category', data: phases, splitLine: { show: false }, axisLabel: { color: T.ink2, fontSize: 10.5, interval: 0, rotate: 30 } }),
      yAxis: axis(T, { type: 'category', data: topics, inverse: true, axisLine: { show: false }, axisLabel: { color: T.ink2 } }),
      visualMap: { show: false, min: 0, max: maxv || 1, inRange: { color: PAS.phase } },
      series: [{ type: 'heatmap', data: cells, itemStyle: { borderColor: T.surface, borderWidth: 2, borderRadius: 3 },
        label: { show: true, fontSize: 10, color: pasInk, fontWeight: 600, formatter: function (p) { return p.data[2] >= 15 ? p.data[2] : ''; } } }]
    });

    var kws = R.keywords.slice(0, 32);
    var maxK = Math.max.apply(null, kws.map(function (k) { return k.count; }).concat([1]));
    api.chart(el('dKw'), {
      tooltip: { formatter: function (p) { return '<b>' + p.value + '회</b> · ' + api.esc(p.name) + '<br><span style="color:' + T.muted + '">' + p.data.meetings + '개 회의에서 언급</span>'; } },
      series: [{
        type: 'treemap', roam: false, nodeClick: false, breadcrumb: { show: false }, width: '100%', height: '100%', top: 0, left: 0, right: 0, bottom: 0,
        itemStyle: { borderColor: T.surface, borderWidth: 3, gapWidth: 3, borderRadius: 6 },
        label: { show: true, formatter: '{b}\n{c}', color: '#fff', fontSize: 12, fontWeight: 700, lineHeight: 16 },
        data: kws.map(function (k) {
          var t = k.count / maxK; var idx = Math.min(4, Math.round(t * 4));
          return { name: k.key, value: k.count, meetings: k.meetings, itemStyle: { color: PAS.kw[idx] }, label: { color: pasInk } };
        })
      }]
    });

    var topK = R.keywords.slice(0, 10);
    var kc = [], kmax = 0;
    topK.forEach(function (k, y) {
      ms.forEach(function (m, x) { var v = k.perMeeting[x] || 0; kmax = Math.max(kmax, v); kc.push([x, y, v, m.id]); });
    });
    var cK = api.chart(el('dKwTrend'), {
      grid: { left: 90, right: 8, top: 8, bottom: 28 },
      tooltip: { formatter: function (p) { return '<b>' + p.data[2] + '회</b> · ' + api.esc(topK[p.data[1]].key) + '<br>' + p.data[3]; } },
      xAxis: axis(T, { type: 'category', data: ms.map(function (m) { return mno(m.id); }), splitLine: { show: false }, axisLabel: { color: T.muted, fontSize: 10, interval: 1, formatter: function (v) { return String(+v); } } }),
      yAxis: axis(T, { type: 'category', data: topK.map(function (k) { return k.key; }), inverse: true, axisLine: { show: false }, axisLabel: { color: T.ink2, interval: 0 } }),
      visualMap: { show: false, dimension: 2, min: 0, max: kmax || 1, inRange: { color: PAS.flow } },
      series: [{ type: 'heatmap', data: kc, itemStyle: { borderColor: T.surface, borderWidth: 2, borderRadius: 2 } }]
    });
    if (cK) cK.on('click', function (e) { api.openMeeting(e.data[3]); });

    var I = window.Icons;
    // 5) 부서 간 이견: 부서 쌍 막대 목록
    if (pairs.length) {
      var pm = pairs[0].v;
      el('dConflict').innerHTML = pairs.slice(0, 8).map(function (x, i) {
        var d1 = x.k[0], d2 = x.k[1];
        var ic = function (d) { return '<span class="ic-wrap sm tone-' + (I.DEPT_TONE[d] || 'slate') + '" title="' + api.esc(d) + '">' + I.icon(I.DEPT_ICON[d] || 'users', 15) + '</span>'; };
        return '<div class="pair" role="button" tabindex="0" data-i="' + i + '" title="관련 회의록 보기"><span class="rk">' + (i + 1) + '</span><span class="pd2">' + ic(d1) + ic(d2) + '</span><span class="pn"><b>' + api.esc(A.DEPT_SHORT[d1] || d1) + ' ↔ ' + api.esc(A.DEPT_SHORT[d2] || d2) + '</b>' +
          '<span class="pbar"><i style="width:' + (x.v / pm * 100) + '%;background:linear-gradient(90deg,#fbc9ad,#f4a3a3)"></i></span></span><em>' + x.v + '<small>건</small></em></div>';
      }).join('');
      api.$$('.pair', el('dConflict')).forEach(function (row) {
        function open() {
          var x = pairs[+row.dataset.i], d1 = x.k[0], d2 = x.k[1];
          var rel = ds.filter(function (d) { return d.hasDissent && d.depts.indexOf(d1) >= 0 && d.depts.indexOf(d2) >= 0; });
          var nm = (A.DEPT_SHORT[d1] || d1) + ' ↔ ' + (A.DEPT_SHORT[d2] || d2);
          api.openDrawer(nm + ' 이견 ' + rel.length + '건', '관련 회의 ' + api.uniq(rel.map(function (d) { return d.meeting; })).length + '회 · 회의 ID를 누르면 전체 회의록',
            '<div class="dsec wide">' + rel.map(function (d) {
              var m = api.findMeeting(d.meeting);
              return '<div class="ditem"><div class="h">' + api.chips(d.meeting) + '<b>' + api.esc(d.topic) + '</b><span class="note">' + api.esc(d.date || '') + (m ? ' · ' + api.esc(m.title) : '') + '</span></div>' +
                '<p><b>논의</b> ' + api.esc(d.discussion) + '</p><p><b>이견·대안</b> ' + api.esc(d.dissent) + '</p><p><b>결론</b> ' + api.esc(d.conclusion) + ' <span class="pill">' + api.esc(d.resolution) + '</span></p></div>';
            }).join('') + '</div>');
        }
        row.addEventListener('click', open);
        row.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
      });
    } else el('dConflict').innerHTML = empty('부서 간 이견 기록이 없습니다');

    var rc = resKeys.map(function (k, i) { return { k: k, value: ds.filter(function (d) { return d.resolution === k; }).length, c: resCol[i] }; });
    api.chart(el('dRes'), {
      tooltip: { trigger: 'item', formatter: function (pp) { return '<b>' + pp.value + '건</b> · ' + pp.name + ' (' + pp.percent + '%)'; } },
      legend: { bottom: 0, left: 'center', itemWidth: 10, itemHeight: 10, icon: 'circle', textStyle: { color: T.ink2, fontSize: 11 } },
      series: [{ type: 'pie', radius: ['0%', '66%'], center: ['50%', '44%'], itemStyle: { borderColor: T.surface, borderWidth: 2 },
        label: { show: true, position: 'inside', color: pasInk, fontWeight: 700, fontSize: 11, formatter: function (pp) { return pp.percent >= 8 ? Math.round(pp.percent) + '%' : ''; } },
        data: rc.filter(function (r) { return r.value; }).map(function (r) { return { name: r.k, value: r.value, itemStyle: { color: r.c } }; }) }]
    });

    if (recurring.length) {
      var ic = recurring.slice(0, 12);
      api.chart(el('dRecur'), hbarOpt(api, ic.map(function (i) { return i.id + ' ' + short(i.title, 7); }), ic.map(function (i) { return i.mentions; }), {
        unit: '회', left: 118, color: PAS.recur, bg: true, barWidth: 11,
        tip: function (pp) { var it = ic[pp.dataIndex]; return '<b>' + it.mentions + '회</b> 등장 · ' + api.esc(it.title) + '<br><span style="color:' + T.muted + '">현재 상태: ' + it.status + '</span>'; } }));
    }
  }

  // =====================================================================
  // 03 의사결정
  // =====================================================================
  function decisionLinksOf(R) {
    var ids = {}; R.decisions.forEach(function (d) { ids[d.id] = d; });
    var links = [];
    if (R.ann) links = R.ann.decisionLinks.filter(function (l) { return ids[l.from] && ids[l.to]; });
    R.decisions.forEach(function (d) {
      d.refs.forEach(function (r) {
        if (ids[r] && !links.some(function (l) { return l.from === r && l.to === d.id; })) links.push({ from: r, to: d.id, type: '연계', note: '결정문에서 참조', auto: true });
      });
    });
    return links;
  }
  function linkColor(T, t) { return { '구체화': T.s[0], '유지': T.neutral, '연기': T.s[3], '번복': T.critical, '예외': T.s[1], '연계': T.s[6] }[t] || T.axis; }

  function decision(p, R, api) {
    var T = api.tokens(), D = R.decisions, s = R.summary;
    if (!D.length) { p.innerHTML = head('의사결정 현황', '') + empty(); return; }
    var byS = {}; s.decisionByStatus.forEach(function (d) { byS[d.key] = d.value; });
    var links = decisionLinksOf(R);
    var rev = links.filter(function (l) { return l.type === '번복'; });
    var withCond = D.filter(function (d) { return d.conditional; }).length;
    var lvl = { '대표·긴급 승인': 0, '팀 확정': 0 }; D.forEach(function (d) { lvl[d.level]++; });
    var h = head('의사결정 현황', 'Decision Register를 모아 결정 상태·승인 레벨·조건·결정 간 변경 흐름을 추적합니다.');
    h += '<div class="tiles t7">' + tile('총 의사결정', D.length, '건', R.meetings.length + '개 회의') +
      ['확정', '조건부', '잠정', '보류'].map(function (k) { return tile('<i class="dot" style="background:' + api.decisionColor(k) + '"></i>' + k, byS[k] || 0, '건', pctTxt((byS[k] || 0) / D.length * 100)); }).join('') +
      tile('<b style="color:var(--critical-ink)">↺</b> 번복·변경', rev.length, '건', rev.map(function (l) { return l.from + '→' + l.to; }).join(', ') || '감지되지 않음') +
      tile('재검토 명시', D.filter(function (d) { return d.review; }).length, '건', '조건에 날짜·월 기재') + '</div>';
    h += '<div class="grid">';
    var DPAS = { '확정': '#8fb0f7', '조건부': '#8bd6bd', '잠정': '#f7cf85', '보류': '#cdd4e0' };
    h += card('c8', '회의별 의사결정 ' + src(), '회의마다 내린 결정 수 · 색 = 상태 · 막대를 누르면 원문', legend(['확정', '조건부', '잠정', '보류'].map(function (k) { return { k: k, c: DPAS[k] }; })) + ch('decBar', 'h360'));
    h += card('c4', '결정 상태 비율', '상태별 비중 링', '<div class="ring-set two">' + IG().ringSet(['확정', '조건부', '잠정', '보류'].map(function (k) { return { k: k, pct: (byS[k] || 0) / D.length * 100, color: api.decisionColor(k), value: (byS[k] || 0) + '건' }; }), T, 92).replace('<div class="ring-set">', '').replace(/<\/div>$/, '') + '</div>' +
      '<div style="margin-top:16px"><div class="card-sub" style="margin-bottom:8px;font-weight:700;color:var(--ink-2)">승인 레벨</div>' + IG().progressRows([{ k: '대표·긴급 승인', pct: lvl['대표·긴급 승인'] / D.length * 100, c: T.ink, label: lvl['대표·긴급 승인'] + '건' }, { k: '팀 확정', pct: lvl['팀 확정'] / D.length * 100, c: T.s[0], label: lvl['팀 확정'] + '건' }]) + '</div>');
    h += card('c12', '결정 변경 흐름 ' + (R.ann ? ai() : src()), '앞선 결정이 어떻게 구체화·유지·연기·번복됐는지 (가로축 = 회의 순서)',
      legend(['구체화', '유지', '연기', '예외', '번복', '연계'].map(function (k) { return { k: k, c: linkColor(T, k) }; })) + (links.length ? ch('decGraph', 'h420') : empty('결정 간 연결을 찾지 못했습니다')));
    h += card('c6', '유보사항이 남은 회의', '결정하지 못하고 넘긴 사항 (회의별)', ch('decRes', 'h280'));
    h += card('c6', '결정 주제 분포 ' + ai(), '결정문을 주제별로 분류', ch('decTopic', 'h280'));
    h += card('c12', 'Decision Register', '',
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>ID</th><th>결정사항</th><th>결정일</th><th>회의 / 주재</th><th>상태</th><th>승인 레벨</th><th>조건·재검토 기준</th><th>후속 변경</th></tr></thead><tbody>' +
      D.map(function (d) {
        var ls = links.filter(function (l) { return l.from === d.id; });
        return '<tr><td>' + api.chips(d.id) + '</td><td><b>' + api.esc(d.text) + '</b></td><td class="num">' + d.date + '</td><td>' + api.chips(d.meeting) + '<br><span class="note">' + api.esc(d.chair) + '</span></td>' +
          '<td>' + api.decisionPill(d.status, d.statusRaw) + '</td><td>' + d.level + '</td><td class="clip">' + api.esc(d.condition || '-') + (d.review ? ' <span class="pill">재검토 ' + api.esc(d.review) + '</span>' : '') + '</td>' +
          '<td>' + ls.map(function (l) { return '<span class="st" style="color:' + linkColor(T, l.type) + '">' + l.type + '</span> ' + api.chips(l.to); }).join('<br>') + '</td></tr>';
      }).join('') + '</tbody></table></div>');
    h += '</div>';
    p.innerHTML = h;
    api.bindChips(p);

    var ms = R.meetings.filter(function (m) { return m.decisions.length; });
    var stK = ['확정', '조건부', '잠정', '보류'];
    var cB = api.chart(el('decBar'), {
      grid: { left: 30, right: 10, top: 16, bottom: 28 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(148,163,184,.12)' } },
        formatter: function (ps) { var m = ms[ps[0].dataIndex]; return '<b>' + m.id + '</b> · ' + api.esc(m.title) + '<br>' + ps.filter(function (x) { return x.value; }).map(function (x) { return x.marker + x.seriesName + ' ' + x.value + '건'; }).join('<br>'); } },
      xAxis: axis(T, { type: 'category', data: ms.map(function (m) { return mno(m.id); }), splitLine: { show: false }, axisLabel: { color: T.muted, interval: 0 } }),
      yAxis: axis(T, { type: 'value', minInterval: 1, axisLine: { show: false }, axisLabel: { color: T.muted } }),
      series: stK.map(function (k, si) {
        return { name: k, type: 'bar', stack: 'd', barWidth: 18,
          itemStyle: { color: DPAS[k], borderColor: T.surface, borderWidth: 1.5, borderRadius: 4 },
          data: ms.map(function (m) { return { value: D.filter(function (d) { return d.meeting === m.id && d.status === k; }).length, mid: m.id }; }) };
      })
    });
    if (cB) cB.on('click', function (e) { api.openMeeting(ms[e.dataIndex].id); });
    
    if (links.length) {
      var gEl2 = el('decGraph');
      var comps = decisionGraphOpt(R, api, links);
      gEl2.style.height = Math.max(280, comps._rows * 44 + 70) + 'px';
      api.chart(gEl2, comps);
    }

    var resM = R.meetings.map(function (m) { return { m: m, n: m.reserved && !/^없음/.test(m.reserved) ? m.reserved.split(/,|·|\//).filter(function (x) { return x.trim().length > 1; }).length : 0 }; });
    var cR = api.chart(el('decRes'), lollipopOpt(api, resM.map(function (x) { return mno(x.m.id); }), resM.map(function (x) { return { value: x.n, mid: x.m.id, c: x.n >= 4 ? T.s[3] : T.s[0], size: x.n ? 8 + x.n * 2.5 : 5 }; }), {
      unit: '건', tip: function (ps) { var x = resM[ps[0].dataIndex]; return '<b>유보 ' + x.n + '건</b> · ' + api.esc(x.m.id) + '<br>' + api.esc(x.m.reserved || '없음'); } }));
    onClickMeeting(cR, api);

    var tp = A.TOPICS.map(function () { return 0; });
    var TOP_RE = A.TOPICS;
    D.forEach(function (d) {
      var sc = A.topicScores(d.text + ' ' + d.condition), mx = Math.max.apply(null, sc);
      if (mx > 0) tp[sc.indexOf(mx)]++;
    });
    var tpa = TOP_RE.map(function (k, i) { return { k: k, v: tp[i] }; }).filter(function (x) { return x.v; }).sort(function (a, b) { return b.v - a.v; });
    api.chart(el('decTopic'), hbarOpt(api, tpa.map(function (x) { return x.k; }), tpa.map(function (x) { return x.v; }), { unit: '건', left: 96, color: T.s[0] }));
  }

  function decisionGraphOpt(R, api, links) {
    var T = api.tokens();
    var ids = api.uniq([].concat.apply([], links.map(function (l) { return [l.from, l.to]; })));
    // 연결 요소별로 행 배치
    var parent = {}; ids.forEach(function (i) { parent[i] = i; });
    function find(x) { return parent[x] === x ? x : (parent[x] = find(parent[x])); }
    links.forEach(function (l) { parent[find(l.from)] = find(l.to); });
    var groups = {}; ids.forEach(function (i) { var r = find(i); (groups[r] = groups[r] || []).push(i); });
    var gl = Object.keys(groups).map(function (k) { return groups[k]; });
    var dmap = {}; R.decisions.forEach(function (d) { dmap[d.id] = d; });
    gl.sort(function (a, b) { return Math.min.apply(null, a.map(function (i) { return dmap[i].meetingNo; })) - Math.min.apply(null, b.map(function (i) { return dmap[i].meetingNo; })); });
    var nodes = [];
    gl.forEach(function (g, row) {
      var used = {};
      g.sort().forEach(function (id) {
        var d = dmap[id]; var k = d.meetingNo; used[k] = (used[k] || 0) + 1;
        nodes.push({ name: id, d: d, x: d.meetingNo * 60 + (used[k] - 1) * 26, y: row * 40 + (used[k] - 1) * 16, symbolSize: 14,
          itemStyle: { color: api.decisionColor(d.status), borderColor: T.surface, borderWidth: 2 } });
      });
    });
    return {
      _rows: gl.length,
      tooltip: {
        formatter: function (p) {
          if (p.dataType === 'edge') return '<b style="color:' + linkColor(T, p.data.type) + '">' + p.data.type + '</b> ' + p.data.source + ' → ' + p.data.target + '<br>' + api.esc(p.data.note || '');
          var d = p.data.d; return '<b>' + d.id + '</b> · ' + d.statusRaw + ' · ' + d.meeting + '<br>' + api.esc(d.text);
        }
      },
      series: [{
        type: 'graph', layout: 'none', roam: false, left: 40, right: 60, top: 56, bottom: 20,
        edgeSymbol: ['none', 'arrow'], edgeSymbolSize: 7,
        label: { show: true, position: 'top', fontSize: 10.5, color: T.ink2, fontWeight: 600, formatter: '{b}' },
        data: nodes,
        links: links.map(function (l) { return { source: l.from, target: l.to, type: l.type, note: l.note, lineStyle: { color: linkColor(T, l.type), width: l.type === '번복' ? 3 : 1.8, curveness: 0.12, opacity: 0.9 } }; }),
        emphasis: { focus: 'adjacency' }
      }]
    };
  }

  // =====================================================================
  // 04 Action Item
  // =====================================================================
  function action(p, R, api) {
    var T = api.tokens(), AC = R.actions, s = R.summary;
    if (!AC.length) { p.innerHTML = head('Action Item 관리', '') + empty(); return; }
    // 상단 카드 톤과 맞춘 파스텔 상태색
    var APAS = { '완료': '#52be7e', '부분완료': '#f0b43c', '진행중': '#6a95f0', '미착수': '#b5bfcd' }, ADLY = '#e5484d';
    function ac(k) { return APAS[k] || APAS['미착수']; }
    var st = {}; s.actionByStatus.forEach(function (x) { st[x.key] = x.value; });
    var lead = AC.filter(function (a) { return a.due; }).map(function (a) { return Math.round((new Date(a.due) - new Date(a.start)) / 86400000); });
    var avgLead = lead.length ? Math.round(sum(lead) / lead.length) : 0;
    var h = head('Action Item 관리', '업무지시사항을 담당자·부서·마감일로 구조화하고, 다음 회의의 "이전 Action 상태" 기록으로 실제 완료 여부를 추적합니다.');
    h += '<div class="tiles">' + tile('전체 업무', AC.length, '건', '평균 리드타임 ' + avgLead + '일') +
      tile('<i class="dot" style="background:' + ac('완료') + '"></i>완료', st['완료'] || 0, '건', pctTxt((st['완료'] || 0) / AC.length * 100)) +
      tile('<i class="dot" style="background:' + ac('부분완료') + '"></i>부분완료', st['부분완료'] || 0, '건', '후속 회의 기록 기준') +
      tile('<i class="dot" style="background:' + ac('진행중') + '"></i>진행중', st['진행중'] || 0, '건', '완료 기록 없음 포함') +
      tile('<b style="color:var(--critical-ink)">⚠</b> 지연', s.delayed, '건', AC.filter(function (a) { return a.delayed; }).map(function (a) { return a.id; }).join(', ')) +
      tile('<i class="dot" style="background:' + ac('미착수') + '"></i>미착수', st['미착수'] || 0, '건', '예정 상태') + '</div>';
    h += '<div class="grid">';
    h += card('c12', '업무 간트 차트 ' + src(), '지시일(회의일) → 마감일 · 색 = 최종 상태 · ⚠ = 지연 기록 · 막대를 누르면 원문', legend(['완료', '부분완료', '진행중', '미착수'].map(function (k) { return { k: k, c: ac(k) }; }).concat([{ k: '지연', c: ADLY, sym: '⚠' }])) + '<div style="max-height:560px;overflow:auto">' + ch('aGantt', 'h480') + '</div>');
    h += card('c6', '부서별 업무 현황', '담당(공동 포함) 기준 상태별 건수 · 오른쪽 숫자 = 완료율', legend(['완료', '부분완료', '진행중', '미착수'].map(function (k) { return { k: k, c: ac(k) }; })) + '<div id="aDept" class="chart" style="height:330px"></div>');
    h += card('c3', '우선순위 × 상태', '우선순위별 업무 상태', ch('aPrio', 'h360'));
    h += card('c3', '업무 리드타임', '지시일부터 마감일까지 (일)', ch('aLead', 'h360'));
    h += card('c12', 'Action Item 목록', '',
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>ID</th><th>업무지시사항</th><th>담당 부서</th><th>담당자</th><th>협업 부서</th><th>우선순위</th><th>시작일</th><th>마감일</th><th>상태</th><th>완료 기준</th><th>후속 기록</th></tr></thead><tbody>' +
      AC.map(function (a) {
        return '<tr><td>' + api.chips(a.id) + '</td><td><b>' + api.esc(a.task) + '</b></td><td>' + api.esc(a.dept) + '</td><td>' + api.esc(a.owners.join(', ')) + '</td><td>' + api.esc(a.collab.join(', ') || '-') + '</td>' +
          '<td>' + api.esc(a.priority) + '</td><td class="num">' + a.start + '</td><td class="num">' + a.due + '</td><td>' + api.actionPill(a.status, a.delayed) + '</td><td class="clip">' + api.esc(a.criteria) + '</td><td class="clip">' + api.esc(a.followNote || '-') + '</td></tr>';
      }).join('') + '</tbody></table></div>');
    h += '</div>';
    p.innerHTML = h;
    api.bindChips(p);

    var rows = AC.slice().reverse();
    var gEl = el('aGantt'); gEl.style.height = Math.max(240, rows.length * 18 + 44) + 'px';
    var cg = api.chart(gEl, {
      grid: { left: 190, right: 30, top: 30, bottom: 10 },
      tooltip: { formatter: function (pp) { var a = rows[pp.data.value[0]]; return '<b>' + a.id + '</b> · ' + a.status + (a.delayed ? ' · ⚠ 지연' : '') + '<br>' + api.esc(a.task) + '<br><span style="color:' + T.muted + '">' + a.start + ' → ' + a.due + ' · ' + api.esc(a.owners.join(', ')) + '</span>'; } },
      xAxis: axis(T, { type: 'time', position: 'top', axisLabel: { color: T.muted, fontSize: 10.5, formatter: '{yy}.{MM}' } }),
      yAxis: axis(T, { type: 'category', data: rows.map(function (a) { return a.id + '  ' + short(a.task, 12); }), axisLine: { show: false }, splitLine: { show: false }, axisLabel: { color: T.ink2, fontSize: 10.5, interval: 0 } }),
      series: [{
        type: 'custom', encode: { x: [1, 2], y: 0 },
        renderItem: function (params, apiE) {
          var i = apiE.value(0), s0 = apiE.coord([apiE.value(1), i]), s1 = apiE.coord([apiE.value(2), i]);
          var hgt = apiE.size([0, 1])[1] * 0.6, a = rows[i];
          var w = Math.max(4, s1[0] - s0[0]);
          var children = [{ type: 'rect', shape: { x: s0[0], y: s0[1] - hgt / 2, width: w, height: hgt, r: 3 }, style: { fill: ac(a.status) } }];
          if (a.delayed) children.push({ type: 'text', style: { text: '⚠', x: s0[0] + w + 4, y: s0[1] - 6, fill: ADLY, fontSize: 11 } });
          return { type: 'group', children: children };
        },
        data: rows.map(function (a, i) { return { value: [i, a.start, a.due || a.start], id: a.id }; })
      }]
    });
    if (cg) cg.on('click', function (e) { api.openEntity(e.data.id); });

    var SK = ['완료', '부분완료', '진행중', '미착수'];
    var dl = R.depts.filter(function (d) { return d.actions; }).sort(function (a, b) { return b.actions - a.actions; });
    api.chart(el('aDept'), {
      grid: { left: 96, right: 52, top: 4, bottom: 4 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(148,163,184,.10)' } },
        formatter: function (ps) { var d = dl[ps[0].dataIndex]; return '<b>' + api.esc(d.dept) + '</b> · 완료율 ' + d.doneRate + '%<br>' + ps.filter(function (x) { return x.value && x.seriesName !== '완료율'; }).map(function (x) { return x.marker + x.seriesName + ' ' + x.value + '건'; }).join('<br>'); } },
      xAxis: { type: 'value', show: false },
      yAxis: axis(T, { type: 'category', inverse: true, data: dl.map(function (d) { return A.DEPT_SHORT[d.dept] || d.dept; }), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: T.ink2, fontSize: 12 } }),
      series: SK.map(function (k) {
        return { name: k, type: 'bar', stack: 'x', barWidth: 14, itemStyle: { color: ac(k), borderColor: T.surface, borderWidth: 2, borderRadius: 7 },
          data: dl.map(function (d) { return AC.filter(function (a) { return a.ownerDepts.indexOf(d.dept) >= 0 && a.status === k; }).length || null; }) };
      }).concat([{ name: '완료율', type: 'bar', stack: 'x', data: dl.map(function () { return 0; }), label: { show: true, position: 'right', distance: 8, color: T.ink, fontWeight: 700, fontSize: 11.5, formatter: function (pp) { return Math.round(dl[pp.dataIndex].doneRate) + '%'; } }, itemStyle: { color: 'transparent' }, tooltip: { show: false } }])
    });

    var prios = api.uniq(AC.map(function (a) { return a.priority; }));
    var prOrder = ['최우선', '높음', '중간', '낮음'];
    prios.sort(function (a, b) { return prOrder.indexOf(a) - prOrder.indexOf(b); });
    api.chart(el('aPrio'), {
      legend: { top: 0, left: 'center', icon: 'circle', itemWidth: 8, itemHeight: 8, itemGap: 10, textStyle: { color: T.ink2, fontSize: 11 } },
      grid: { left: 30, right: 8, top: 40, bottom: 26 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(148,163,184,.10)' } } },
      xAxis: axis(T, { type: 'category', data: prios, splitLine: { show: false }, axisTick: { show: false }, axisLabel: { color: T.ink2, fontWeight: 600 } }),
      yAxis: axis(T, { type: 'value', minInterval: 1, axisLine: { show: false }, axisLabel: { color: T.muted } }),
      series: SK.map(function (k) {
        return { name: k, type: 'bar', stack: 'p', barWidth: '42%', itemStyle: { color: ac(k), borderColor: T.surface, borderWidth: 2, borderRadius: 6 },
          data: prios.map(function (pr) { return AC.filter(function (a) { return a.priority === pr && a.status === k; }).length || null; }) };
      })
    });
    var bins = [[0, 7, '~1주'], [8, 14, '~2주'], [15, 28, '~4주'], [29, 999, '4주+']];
    var LPAS = ['#6a95f0', '#b7cdfb', '#c6d7fc', '#d5e1fd'];
    api.chart(el('aLead'), {
      grid: { left: 30, right: 8, top: 24, bottom: 26 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(148,163,184,.10)' } }, formatter: function (ps) { return '<b>' + ps[0].name + '</b> · ' + ps[0].value + '건'; } },
      xAxis: axis(T, { type: 'category', data: bins.map(function (b) { return b[2]; }), splitLine: { show: false }, axisTick: { show: false }, axisLabel: { color: T.ink2, fontWeight: 600 } }),
      yAxis: axis(T, { type: 'value', minInterval: 1, axisLine: { show: false }, axisLabel: { color: T.muted } }),
      series: [{ type: 'bar', barWidth: '46%', showBackground: true, backgroundStyle: { color: T.surface2, borderRadius: [8, 8, 0, 0] },
        label: { show: true, position: 'top', color: T.ink, fontWeight: 700, fontSize: 12 },
        data: bins.map(function (b, i) { return { value: lead.filter(function (x) { return x >= b[0] && x <= b[1]; }).length, itemStyle: { color: LPAS[0], borderRadius: [8, 8, 0, 0] } }; }) }]
    });
  }

  // =====================================================================
  // 05 성과 추적 (이전 회의 → 현재 회의)
  // =====================================================================
  function originMeeting(R, ref) {
    var ids = String(ref).match(/(D|A)-\d{3}/g) || [];
    for (var i = 0; i < ids.length; i++) {
      var m = R.all.filter(function (mm) { return mm.decisions.some(function (d) { return d.id === ids[i]; }) || mm.actions.some(function (a) { return a.id === ids[i]; }); })[0];
      if (m) return m;
    }
    return null;
  }
  function nextKind(t) { return /중단|금지|보류|축소|철수/.test(t) ? '중단·축소' : /확대|유지|채택|표준|정식|전환 유지|강화/.test(t) ? '유지·확대' : '보완·수정'; }

  function tracking(p, R, api) {
    var T = api.tokens(), L = R.loops, s = R.summary;
    if (!L.length) { p.innerHTML = head('이전 회의 → 현재 회의 성과 추적', '') + empty('성과 피드백(Closed Loop) 기록이 없습니다'); return; }
    var mets = metricsOf(R);
    var ok = L.filter(function (l) { return l.eval === '달성' || l.eval === '초과' || l.eval === '달성(주의)'; }).length;
    var cmp = R.ann ? R.ann.comparisons : null;
    var h = head('이전 회의 → 현재 회의 성과 추적', '각 회의가 이전 회의의 결정(D)·업무(A)·이슈(OI) 목표를 실제 결과와 비교한 Closed Loop 기록입니다. 달성률은 수치 목표를 정규화해 계산했습니다.');
    h += '<div class="tiles">' + tile('추적한 목표', L.length, '건', '기준선 설정 제외') +
      tile('달성', ok, '건', pctTxt(ok / L.length * 100)) +
      tile('부분달성·혼합', L.filter(function (l) { return l.eval === '부분달성' || l.eval === '혼합'; }).length, '건', '') +
      tile('미달', L.filter(function (l) { return l.eval === '미달'; }).length, '건', '') +
      tile('수치화된 지표 ' + (R.ann ? ai('AI') : ''), mets.length, '개', '평균 달성률 ' + (mets.length ? Math.round(sum(mets.map(function (m) { return Math.min(m.rate, 200); })) / mets.length) : 0) + '%') + '</div>';
    h += '<div class="grid">';
    h += card('c4', '평가 결과 분포 ' + src(), '원문의 달성평가 표기를 정규화', ch('tEval', 'h280'));
    h += card('c8', '목표 → 결과 → 다음 실행 ' + ai(), '추적 대상(결정·업무·이슈)이 어떤 결과를 거쳐 어떤 후속 조치로 이어졌나', ch('tSankey', 'h280'));
    h += card('c12', '지표별 목표 대비 달성률 (덤벨) ' + (R.ann ? ai() : ai('자동 추출')), '회색 점 = 목표(100%) → 색 점 = 실제 달성률 · 낮을수록 좋은 지표는 역산 · 점을 누르면 해당 회의',
      legend([{ k: '달성 (≥100%)', c: T.good }, { k: '주의 (95–100%)', c: T.warning }, { k: '미달 (<95%)', c: T.critical }]) + (mets.length ? ch('tMet', 'h480') : empty('수치형 목표를 찾지 못했습니다')));
    if (cmp) {
      h += card('c6', cmp.creative.title + ' ' + ai(), '목표 CTR ' + cmp.creative.target + '%', ch('tCtr', 'h240') +
        '<div class="summary-vs" style="margin-top:8px"><div class="sv"><h5>AI 인사이트</h5><p>UGC형 소재의 CTR이 제품설명형보다 <b>2.3배</b> 높았습니다 (1.92% vs 0.84%). 다음 캠페인에서는 UGC·사용상황 소재 비중을 늘려야 합니다.</p></div>' +
        '<div class="sv"><h5>실제 반영</h5><p>D-034로 크리에이터 예산을 중형/UGC로 옮긴 뒤 CTR 1.46%→<b>1.71%</b>, CPA 6,900원(-11.5%).</p><div style="margin-top:4px">' + api.chips('D-034 ML-OL-013') + '</div></div></div>');
      h += card('c6', cmp.promo.title + ' ' + ai(), '가드레일 CM ' + cmp.promo.target + '% · 할인형 vs 비할인형', ch('tPromo', 'h240') +
        '<div class="summary-vs" style="margin-top:8px"><div class="sv"><h5>AI 인사이트</h5><p>할인형 행사 <b>4건 모두</b> CM 35%에 못 미쳤고, 증정형(Pair Your Moment)만 목표 판매와 CM 36.2%를 함께 달성했습니다.</p></div>' +
        '<div class="sv"><h5>실제 반영</h5><p>D-038 전국 연말 할인 미실시, 015 이후 체험·CRM형으로 전환.</p><div style="margin-top:4px">' + api.chips('D-038 D-045 ML-OL-015') + '</div></div></div>');
    }
    h += card('c12', 'Closed Loop 추적표', '관련 이전 회의 → 당시 목표 → 실제 결과 → 평가 → 다음 실행 반영',
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>평가 회의</th><th>관련 ID</th><th>관련 이전 회의</th><th>당시 목표 (KPI)</th><th>실제 결과</th><th class="num">달성률</th><th>평가</th><th>학습·다음 실행 반영</th></tr></thead><tbody>' +
      L.map(function (l) {
        var om = originMeeting(R, l.ref);
        var mm = mets.filter(function (x) { return x.meeting === l.meeting && String(l.ref).indexOf(x.ref) >= 0; })[0];
        return '<tr><td>' + api.chips(l.meeting) + '</td><td>' + api.chips(l.ref) + '</td><td>' + (om ? api.chips(om.id) + '<br><span class="note">' + api.esc(short(om.title, 20)) + '</span>' : '-') + '</td>' +
          '<td class="clip">' + api.esc(l.target) + '</td><td class="clip">' + api.esc(l.result) + '</td><td class="num">' + (mm ? Math.round(mm.rate) + '%' : '-') + '</td><td>' + api.evalPill(l.eval, l.evalRaw) + '</td><td class="clip">' + api.esc(l.next) + '</td></tr>';
      }).join('') + '</tbody></table></div>');
    h += '</div>';
    p.innerHTML = h;
    api.bindChips(p);

    var le = s.loopByEval.filter(function (e) { return e.value; });
    api.chart(el('tEval'), donutOpt(api, le.map(function (e) { return { k: e.key, value: e.value, c: api.evalColor(e.key) }; }), L.length, '목표'));
    addLegendRight(el('tEval'), le.map(function (e) { return { k: e.key + ' ' + e.value, c: api.evalColor(e.key) }; }));

    // 생키: 추적 대상 유형 → 평가 → 다음 실행
    var kindOf = function (ref) { return /^D-/.test(ref) ? '결정(D)' : /^A-/.test(ref) ? '업무(A)' : /^OI-/.test(ref) ? '이슈(OI)' : '프로젝트 KPI'; };
    var flows = {};
    L.forEach(function (l) {
      var a = kindOf(l.ref), b = l.eval, c = nextKind(l.next);
      flows[a + '>' + b] = (flows[a + '>' + b] || 0) + 1;
      flows[b + '>' + c] = (flows[b + '>' + c] || 0) + 1;
    });
    var nodes = api.uniq([].concat.apply([], Object.keys(flows).map(function (k) { return k.split('>'); })));
    var nodeCol = function (n) { return /결정|업무|이슈|KPI/.test(n) ? T.s[0] : /유지|중단|보완/.test(n) ? ({ '유지·확대': T.s[2], '중단·축소': T.s[1], '보완·수정': T.s[3] })[n] : api.evalColor(n); };
    api.chart(el('tSankey'), {
      tooltip: { trigger: 'item', formatter: function (pp) { return pp.dataType === 'edge' ? '<b>' + pp.data.value + '건</b> · ' + api.esc(pp.data.source) + ' → ' + api.esc(pp.data.target) : '<b>' + api.esc(pp.name) + '</b>'; } },
      series: [{ type: 'sankey', left: 10, right: 90, top: 10, bottom: 10, nodeWidth: 12, nodeGap: 10, draggable: false,
        label: { color: T.ink, fontSize: 11.5 }, lineStyle: { color: 'gradient', opacity: 0.35, curveness: 0.5 },
        data: nodes.map(function (n) { return { name: n, itemStyle: { color: nodeCol(n), borderWidth: 0 } }; }),
        links: Object.keys(flows).map(function (k) { var x = k.split('>'); return { source: x[0], target: x[1], value: flows[k] }; }) }]
    });

    if (mets.length) {
      var ms = mets.slice();
      var mEl = el('tMet'); mEl.style.height = Math.max(260, ms.length * 20 + 50) + 'px';
      var cm = api.chart(mEl, {
        grid: { left: 200, right: 110, top: 22, bottom: 26 },
        tooltip: { trigger: 'item', formatter: function (pp) { var m = ms[pp.dataIndex]; if (!m) return ''; return '<b>' + Math.round(m.rate) + '%</b> ' + stateIcon(m.state) + ' ' + m.state + '<br>' + api.esc(m.metric) + '<br><span style="color:' + T.muted + '">목표 ' + api.fmt(m.target, 2) + m.unit + ' · 실제 ' + api.fmt(m.actual, 3) + m.unit + (m.lowerBetter ? ' (낮을수록 좋음)' : '') + ' · ' + m.meeting + '</span>'; } },
        xAxis: axis(T, { type: 'value', min: function (v) { return Math.min(50, Math.floor(v.min / 10) * 10); }, max: function (v) { return Math.max(150, Math.ceil(v.max / 10) * 10); }, axisLabel: { color: T.muted, formatter: '{value}%' } }),
        yAxis: axis(T, { type: 'category', inverse: true, data: ms.map(function (m) { return mno(m.meeting) + ' · ' + m.metric; }), axisLine: { show: false }, splitLine: { show: true, lineStyle: { color: T.grid } }, axisLabel: { color: T.ink2, fontSize: 11, width: 190, overflow: 'truncate', interval: 0 } }),
        series: [
          { type: 'custom', silent: true, renderItem: function (params, e) { var y = e.value(0), a = e.coord([100, y]), b = e.coord([e.value(1), y]); return { type: 'line', shape: { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }, style: { stroke: stateColor(T, ms[y].state), lineWidth: 3, opacity: 0.35 } }; },
            data: ms.map(function (m, i) { return [i, Math.round(m.rate * 10) / 10]; }), encode: { x: 1, y: 0 }, z: 1 },
          { type: 'scatter', symbolSize: 7, silent: true, data: ms.map(function (m, i) { return [100, i]; }), itemStyle: { color: T.neutral }, z: 2 },
          { type: 'scatter', symbolSize: 12, data: ms.map(function (m, i) { return { value: [Math.round(m.rate * 10) / 10, i], mid: m.meeting, itemStyle: { color: stateColor(T, m.state), borderColor: T.surface, borderWidth: 2 } }; }), z: 3,
            label: { show: true, position: 'right', fontSize: 10.5, color: T.ink2, formatter: function (pp) { var m = ms[pp.dataIndex]; return Math.round(m.rate) + '% · ' + api.fmt(m.actual, 2) + m.unit; } },
            tooltip: { formatter: function (pp) { var m = ms[pp.dataIndex]; return '<b>' + Math.round(m.rate) + '%</b> ' + stateIcon(m.state) + ' ' + m.state + '<br>' + api.esc(m.metric) + '<br><span style="color:' + T.muted + '">목표 ' + api.fmt(m.target, 2) + m.unit + ' · 실제 ' + api.fmt(m.actual, 3) + m.unit + ' · ' + m.meeting + '</span>'; } },
            markLine: { silent: true, symbol: 'none', lineStyle: { color: T.ink, width: 1.2, type: 'solid' }, label: { formatter: '목표 100%', color: T.muted, fontSize: 10, position: 'start' }, data: [{ xAxis: 100 }] } }
        ]
      });
      onClickMeeting(cm, api);
    }
    if (cmp) {
      var cc = cmp.creative.items;
      api.chart(el('tCtr'), hbarOpt(api, cc.map(function (x) { return x.k; }), cc.map(function (x) { return x.v; }), {
        unit: '%', left: 110, color: cc.map(function (x) { return x.v >= cmp.creative.target ? T.s[2] : T.critical; }), max: 2.4,
        extraSeries: [{ type: 'line', data: [], markLine: { silent: true, symbol: 'none', lineStyle: { color: T.ink, width: 1.5, type: 'solid' }, label: { formatter: '목표 1.2%', color: T.muted, fontSize: 10, position: 'start' }, data: [{ xAxis: cmp.creative.target }] } }]
      }));
      var pc = cmp.promo.items;
      api.chart(el('tPromo'), hbarOpt(api, pc.map(function (x) { return x.k; }), pc.map(function (x) { return x.v; }), {
        unit: '%', left: 150, color: pc.map(function (x) { return x.v >= cmp.promo.target ? T.good : T.s[1]; }), max: 40,
        extraSeries: [{ type: 'line', data: [], markLine: { silent: true, symbol: 'none', lineStyle: { color: T.ink, width: 1.5, type: 'solid' }, label: { formatter: 'CM 35%', color: T.muted, fontSize: 10, position: 'start' }, data: [{ xAxis: cmp.promo.target }] } }]
      }));
    }
  }

  // =====================================================================
  // 06 KPI 성과관리
  // =====================================================================
  var kpiSel = null;
  function kpi(p, R, api) {
    var T = api.tokens();
    var ks = kpiSeriesOf(R);
    var mets = metricsOf(R);
    var h = head('KPI 성과관리', '회의록 곳곳에 흩어진 KPI 실적을 시점별로 모아 목표 대비 실제를 비교합니다. 상태: ✓ 달성(≥100%) · ! 주의(95–100%) · ✕ 미달(<95%)');
    if (!ks.length) {
      h += '<div class="grid">' + card('c12', '회의록에서 추출한 수치 지표 ' + ai('자동 추출'), '성과 피드백 표의 "목표·결과"에서 같은 단위 수치를 자동으로 짝지었습니다',
        mets.length ? ch('kAuto', 'h420') : empty('수치형 KPI를 찾지 못했습니다. 회의록의 "이번 회의 핵심 KPI"와 성과 피드백 표에 목표·실적 수치를 적으면 자동 반영됩니다.')) + '</div>';
      p.innerHTML = h;
      if (mets.length) api.chart(el('kAuto'), kpiBulletOpt(api, mets.map(function (m) { return { name: short(m.metric, 16), r: m.rate, state: m.state, tip: m.actual + m.unit + ' / 목표 ' + m.target + m.unit }; }), 150));
      return;
    }
    var cards = ks.map(function (k) {
      var last = k.points[k.points.length - 1], prev = k.points[k.points.length - 2];
      var r = rate({ target: last.target, actual: last.actual, lowerBetter: k.lowerBetter });
      var stt = kpiState(r);
      var delta = prev ? last.actual - prev.actual : null;
      var good = delta == null ? null : (k.lowerBetter ? delta < 0 : delta > 0);
      var m = meetingById(R, last.m);
      return { k: k, last: last, prev: prev, r: r, st: stt, delta: delta, good: good, basis: (m && m.link.dataBasis) || last.basis || '' };
    });
    if (!kpiSel || !ks.some(function (k) { return k.key === kpiSel; })) kpiSel = ks[0].key;
    h += '<div class="kpis">' + cards.map(function (c) {
      var w = Math.min(100, c.r / 1.3);
      return '<div class="kpi" role="button" tabindex="0" data-k="' + c.k.key + '" aria-pressed="' + (kpiSel === c.k.key) + '"><div class="name"><span>' + api.esc(c.k.name) + '</span><span class="st" style="color:' + stateColor(T, c.st) + '">' + stateIcon(c.st) + ' ' + c.st + '</span></div>' +
        '<div class="val">' + api.fmt(c.last.actual, 2) + '<small>' + c.k.unit + '</small></div>' +
        '<div class="bar"><i style="width:' + w + '%;background:' + stateColor(T, c.st) + '"></i><em style="left:' + (100 / 1.3) + '%"></em></div>' +
        '<div class="row"><span>목표 ' + api.fmt(c.last.target, 2) + c.k.unit + ' · 달성률 <b>' + Math.round(c.r * 10) / 10 + '%</b></span></div>' +
        '<div class="row"><span>' + (c.delta == null ? '이전 시점 없음' : '이전 대비 <span class="' + (c.good ? 'delta-up' : 'delta-down') + '">' + (c.delta > 0 ? '▲ +' : '▼ ') + api.fmt(c.delta, 2) + c.k.unit + '</span>') + '</span><span>' + api.esc(c.last.label) + '</span></div>' +
        '<div class="row"><span class="note" style="margin:0">기준: ' + api.esc(short(c.basis, 28)) + '</span></div></div>';
    }).join('') + '</div>';
    h += '<div class="grid" style="margin-top:14px">';
    h += card('c7', '목표 대비 편차 ' + ai(), '0 = 목표 · 오른쪽 초과 / 왼쪽 미달 (최근 시점 기준, 낮을수록 좋은 지표는 역산)', ch('kBullet', 'h320'));
    h += card('c5', '<span id="kSelTitle"></span> 추이 ' + ai(), '막대 = 실제 · 선 = 해당 시점 목표', ch('kTrend', 'h320'));
    h += card('c12', 'KPI 시점별 추이 (스몰 멀티플) ' + ai(), '각 KPI를 자기 단위로 그려 모양을 비교 · 녹색 점 = 목표 달성 시점', '<div class="grid" id="kSmall"></div>');
    h += card('c12', 'KPI 데이터 표', '',
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>KPI</th><th>시점</th><th>근거 회의</th><th class="num">목표</th><th class="num">실제</th><th class="num">달성률</th><th class="num">이전 대비</th><th>상태</th></tr></thead><tbody>' +
      ks.map(function (k) {
        return k.points.map(function (pt, i) {
          var r = rate({ target: pt.target, actual: pt.actual, lowerBetter: k.lowerBetter }), stt = kpiState(r), pv = k.points[i - 1];
          return '<tr><td><b>' + api.esc(k.name) + '</b></td><td>' + api.esc(pt.label) + '</td><td>' + api.chips(pt.m) + '</td><td class="num">' + api.fmt(pt.target, 2) + k.unit + '</td><td class="num">' + api.fmt(pt.actual, 3) + k.unit + '</td><td class="num">' + Math.round(r * 10) / 10 + '%</td>' +
            '<td class="num">' + (pv ? (pt.actual - pv.actual > 0 ? '+' : '') + api.fmt(pt.actual - pv.actual, 2) : '-') + '</td><td><span class="st" style="color:' + stateColor(T, stt) + '">' + stateIcon(stt) + ' ' + stt + '</span></td></tr>';
        }).join('');
      }).join('') + '</tbody></table></div>');
    h += '</div>';
    p.innerHTML = h;
    api.bindChips(p);
    api.$$('.kpi[data-k]', p).forEach(function (c) {
      var fn = function () { kpiSel = c.dataset.k; api.$$('.kpi[data-k]', p).forEach(function (x) { x.setAttribute('aria-pressed', String(x === c)); }); drawTrend(); };
      c.addEventListener('click', fn); c.addEventListener('keydown', function (e) { if (e.key === 'Enter') fn(); });
    });
    var gaps = cards.slice().sort(function (a, b) { return (b.r - 100) - (a.r - 100); });
    api.chart(el('kBullet'), {
      grid: { left: 130, right: 60, top: 10, bottom: 24 },
      tooltip: { trigger: 'item', formatter: function (pp) { var c = gaps[pp.dataIndex]; return '<b>' + (c.r >= 100 ? '+' : '') + Math.round((c.r - 100) * 10) / 10 + '%p</b> ' + stateIcon(c.st) + ' ' + c.st + '<br>' + api.esc(c.k.name) + '<br><span style="color:' + T.muted + '">' + api.fmt(c.last.actual, 2) + c.k.unit + ' / 목표 ' + api.fmt(c.last.target, 2) + c.k.unit + '</span>'; } },
      xAxis: axis(T, { type: 'value', axisLabel: { color: T.muted, formatter: function (v) { return (v > 0 ? '+' : '') + v + '%p'; } } }),
      yAxis: axis(T, { type: 'category', inverse: true, data: gaps.map(function (c) { return c.k.name; }), axisLine: { show: false }, axisLabel: { color: T.ink2, fontSize: 11.5, interval: 0 } }),
      series: [{ type: 'bar', barWidth: 10, data: gaps.map(function (c) { var v = Math.round((c.r - 100) * 10) / 10; return { value: v, itemStyle: { color: stateColor(T, c.st), borderRadius: v >= 0 ? [0, 5, 5, 0] : [5, 0, 0, 5] } }; }),
        label: { show: true, position: 'outside', color: T.ink2, fontSize: 11, formatter: function (pp) { return (pp.value > 0 ? '+' : '') + pp.value; } },
        markLine: { silent: true, symbol: 'none', lineStyle: { color: T.ink, width: 1.5, type: 'solid' }, label: { show: false }, data: [{ xAxis: 0 }] } }]
    });

    var trendChart = null;
    function drawTrend() {
      var k = ks.filter(function (x) { return x.key === kpiSel; })[0];
      el('kSelTitle').textContent = k.name;
      if (trendChart) trendChart.dispose();
      trendChart = api.chart(el('kTrend'), {
        grid: { left: 50, right: 16, top: 20, bottom: 30 },
        tooltip: { trigger: 'axis', formatter: function (ps) { var pt = k.points[ps[0].dataIndex]; return '<b>' + api.fmt(pt.actual, 3) + k.unit + '</b> 실제 · 목표 ' + api.fmt(pt.target, 2) + k.unit + '<br>' + api.esc(pt.label) + ' · ' + pt.m; } },
        xAxis: axis(T, { type: 'category', data: k.points.map(function (pt) { return pt.label; }), splitLine: { show: false }, axisLabel: { color: T.ink2 } }),
        yAxis: axis(T, { type: 'value', axisLine: { show: false }, scale: true, name: k.unit, nameTextStyle: { color: T.muted } }),
        series: [{ name: '실제', type: 'bar', barWidth: '40%', data: k.points.map(function (pt) { var r = rate({ target: pt.target, actual: pt.actual, lowerBetter: k.lowerBetter }); return { value: pt.actual, mid: pt.m, itemStyle: { color: stateColor(T, kpiState(r)), borderRadius: [4, 4, 0, 0] } }; }),
          label: { show: true, position: 'top', color: T.ink2, fontSize: 11, formatter: function (pp) { return api.fmt(pp.value, 2); } } },
          { name: '목표', type: 'line', data: k.points.map(function (pt) { return pt.target; }), symbol: 'rect', symbolSize: [18, 3], lineStyle: { color: T.ink, width: 1.5 }, itemStyle: { color: T.ink } }]
      });
      onClickMeeting(trendChart, api);
    }
    drawTrend();

    var sm = el('kSmall');
    sm.innerHTML = ks.map(function (k, i) { return '<div class="c3" style="min-width:0"><div style="font-size:12px;font-weight:700;margin-bottom:2px">' + api.esc(k.name) + ' <span class="note">(' + k.unit + ')</span></div><div class="chart h160" id="kSm' + i + '"></div></div>'; }).join('');
    ks.forEach(function (k, i) {
      api.chart(el('kSm' + i), {
        grid: { left: 40, right: 12, top: 10, bottom: 22 },
        tooltip: { trigger: 'axis', formatter: function (ps) { var pt = k.points[ps[0].dataIndex]; return '<b>' + api.fmt(pt.actual, 3) + k.unit + '</b> · 목표 ' + api.fmt(pt.target, 2) + '<br>' + pt.label; } },
        xAxis: axis(T, { type: 'category', data: k.points.map(function (pt) { return pt.label; }), splitLine: { show: false }, axisLabel: { color: T.muted, fontSize: 10 } }),
        yAxis: axis(T, { type: 'value', scale: true, axisLine: { show: false }, splitNumber: 2, axisLabel: { color: T.muted, fontSize: 10 } }),
        series: [{ type: 'line', data: k.points.map(function (pt) { return pt.target; }), symbol: 'none', lineStyle: { color: T.muted, width: 1.5 }, step: 'middle' },
          { type: 'line', data: k.points.map(function (pt) { var ok = kpiState(rate({ target: pt.target, actual: pt.actual, lowerBetter: k.lowerBetter })) === '달성'; return { value: pt.actual, itemStyle: { color: ok ? T.good : T.critical } }; }),
            symbolSize: 8, lineStyle: { color: T.s[0], width: 2 }, itemStyle: { borderColor: T.surface, borderWidth: 2 } }]
      });
    });
  }

  // =====================================================================
  // 07 위기·리스크
  // =====================================================================
  function risk(p, R, api) {
    var T = api.tokens(), C = R.crises, I = R.issues;
    var meta = R.ann ? R.ann.crisisMeta : {};
    var types = api.uniq(C.map(function (c) { return c.type; }));
    var typeCol = function (t) { return T.s[['생산·품질', '재고·유통', '커뮤니케이션', '기타'].indexOf(t)] || T.s[4]; };
    var h = head('위기·리스크 관리', '긴급회의의 위기관리(05A) 섹션과 미결 이슈(05) 기록을 발생 → 대응 → 해결 → 예방 흐름으로 재구성했습니다.');
    h += '<div class="tiles">' + tile('위기', C.length, '건', types.map(function (t) { return t + ' ' + C.filter(function (c) { return c.type === t; }).length; }).join(' · ') || '없음') +
      tile('해결', C.filter(function (c) { return c.resolved; }).length, '건', '종결 기준 충족') +
      tile('재발', C.filter(function (c) { return c.recurred; }).length, '건', '같은 유형 재발생') +
      tile('평균 해결 기간', C.length ? Math.round(sum(C.map(function (c) { return c.daysToResolve || 0; })) / C.length) : 0, '일', '위기 회의 → 종결 확인') +
      tile('미결 이슈', I.length, '건', '종결 ' + R.summary.closedIssues + ' · 오픈/모니터링 ' + R.summary.openIssues) +
      tile('<b style="color:var(--critical-ink)">!</b> 후속 미기재', R.summary.untrackedIssues, '건', '종결 기록 없이 사라진 이슈') + '</div>';
    h += '<div class="grid">';
    if (C.length) {
      h += card('c12', '위기 대응 흐름 ' + src(), '발생 → 즉시 대응 → 해결 → 재발 방지 (카드를 누르면 원문)',
        '<div class="flow-head"><span></span><span>① 발생</span><span>② 대응</span><span>③ 해결</span><span>④ 예방</span></div>' +
        C.map(function (c) {
          var mt = meta[c.meeting] || {}, sh = mt.short || {};
          var col = typeCol(c.type);
          var sev = mt.severity || (c.meeting ? 3 : 0);
          return '<div class="flow" style="--c:' + col + '"><div class="lab"><b>' + api.esc(c.type) + '</b><span>' + c.date.replace(/-/g, '.') + ' · ' + api.chips(c.meeting) + '</span>' +
            '<span class="sev" title="심각도 ' + sev + '/5 (AI 추정)">' + [1, 2, 3, 4, 5].map(function (i) { return '<i class="' + (i <= sev ? 'on' : '') + '"></i>'; }).join('') + '</span></div>' +
            '<div class="step"><small>발생</small>' + api.esc(sh.occur || short(c.event, 60)) + '</div>' +
            '<div class="step"><small>대응</small>' + api.esc(sh.respond || short(c.control, 60)) + '</div>' +
            '<div class="step"><small>해결 · ' + (c.resolved ? c.daysToResolve + '일' : '진행 중') + '</small>' + api.esc(sh.resolve || (c.resolved ? c.resolvedAt + '에서 종결 확인' : short(c.closure, 60))) + '</div>' +
            '<div class="step"><small>예방 · ' + c.preventionItems.length + '건</small>' + api.esc(sh.prevent || short(c.prevention, 60)) + '</div></div>';
        }).join(''));
      h += card('c5', '심각도 × 해결 기간 ' + (R.ann ? ai() : ''), '원 크기 = 재발방지 조치 수 · 심각도는 영향 범위 기준 AI 추정', ch('rSev', 'h280'));
      h += card('c7', '위기별 근본원인과 재발방지 조치 ' + src(), '', '<div style="display:flex;flex-direction:column;gap:8px">' + C.map(function (c) {
        return '<div class="ditem" style="border-left:3px solid ' + typeCol(c.type) + '"><div class="h"><b>' + api.esc(c.type) + '</b>' + api.chips(c.meeting) + ((meta[c.meeting] || {}).impact ? '<span class="pill">영향: ' + api.esc(meta[c.meeting].impact) + '</span>' : '') + '</div>' +
          '<p><b>원인</b> ' + api.esc(c.cause) + '</p><p><b>재발방지</b> ' + c.preventionItems.map(function (x) { return '<span class="pill" style="margin:2px 2px 0 0">' + api.esc(x) + '</span>'; }).join('') + '</p><p><b>종결 기준</b> ' + api.esc(c.closure) + '</p></div>';
      }).join('') + '</div>');
    } else {
      h += card('c12', '위기', '', empty('선택한 회의에 긴급 위기관리(05A) 기록이 없습니다'));
    }
    var ist0 = issueStatusCounts(R);
    h += card('c12', '미결 이슈 라이프사이클 ' + src(), '가로축 = 회의 순서 · 점 = 회의록에 기록된 시점 · 막대 색 = 당시 상태 · 점선 = 이후 기록 없음 · 행을 누르면 원문',
      (I.length ? '<div class="life-sum">' + ist0.filter(function (x) { return x.value; }).map(function (x) {
        return '<span class="ls-chip"><i style="background:' + x.c + '"></i>' + x.k + '<b>' + x.value + '</b></span>';
      }).join('') + '<span class="ls-chip muted"><i class="dash"></i>후속 미기재<b>' + R.summary.untrackedIssues + '</b></span>' +
        '<span class="ls-bar">' + ist0.filter(function (x) { return x.value; }).map(function (x) { return '<i style="flex:' + x.value + ';background:' + x.c + '" title="' + x.k + ' ' + x.value + '건"></i>'; }).join('') + '</span></div>' +
        ch('rLife', 'h480') : empty()));
    h += '</div>';
    p.innerHTML = h;
    api.bindChips(p);
    api.$$('.flow', p).forEach(function (f) { f.style.cursor = 'default'; });

    if (C.length) {
      api.chart(el('rSev'), {
        grid: { left: 44, right: 20, top: 16, bottom: 40 },
        tooltip: { formatter: function (pp) { var c = pp.data.c; return '<b>' + api.esc(c.type) + '</b> · 심각도 ' + pp.value[1] + '/5<br>' + (c.resolved ? c.daysToResolve + '일 만에 해결' : '진행 중') + ' · 예방 ' + c.preventionItems.length + '건<br><span style="color:' + T.muted + '">' + api.esc(short(c.title, 40)) + '</span>'; } },
        xAxis: axis(T, { type: 'value', name: '해결까지 일수', nameLocation: 'middle', nameGap: 26, nameTextStyle: { color: T.muted }, min: 0, max: function (v) { return Math.ceil((v.max + 8) / 10) * 10; } }),
        yAxis: axis(T, { type: 'value', name: '심각도', nameTextStyle: { color: T.muted }, min: 0, max: 6, interval: 1, axisLabel: { color: T.muted, formatter: function (v) { return v > 5 ? '' : v; } } }),
        series: [{ type: 'scatter', data: C.map(function (c) { var mt = meta[c.meeting] || {}; return { value: [c.daysToResolve || 0, mt.severity || 3], c: c, mid: c.meeting, symbolSize: 18 + c.preventionItems.length * 6, itemStyle: { color: typeCol(c.type), borderColor: T.surface, borderWidth: 2, opacity: 0.9 } }; }),
          label: { show: true, position: 'right', color: T.ink2, fontSize: 11, formatter: function (pp) { return pp.data.c.type; } } }]
      });
    }
    if (I.length) {
      var rows = I.slice();
      var mIdx = {}; R.all.forEach(function (m, i) { mIdx[m.id] = i; });
      var nM = R.all.length;
      var col = { '오픈': T.serious, '모니터링': T.warning, '종결': T.good, '부분종결': T.s[2], '이관': T.s[6] };
      var ROW = 30;
      var lEl = el('rLife'); lEl.style.height = (rows.length * ROW + 46) + 'px';
      var segs = [];
      rows.forEach(function (it, i) {
        it.history.forEach(function (hh, j) {
          var nx = it.history[j + 1];
          var x0 = mIdx[hh.meeting], x1 = nx ? mIdx[nx.meeting] : x0;
          segs.push({ value: [i, x0, x1, hh.status], it: it, h: hh, first: j === 0 });
        });
        if (it.untracked) segs.push({ value: [i, mIdx[it.last.meeting], nM - 1, '후속 미기재'], it: it, h: it.last, tail: true });
      });
      var cl = api.chart(lEl, {
        grid: { left: 220, right: 110, top: 28, bottom: 8 },
        tooltip: { formatter: function (pp) { var d = pp.data; if (!d || !d.it) return ''; return '<b>' + d.it.id + '</b> ' + api.esc(d.it.title) + '<br>' + (d.tail ? '<span style="color:' + T.muted + '">' + d.h.meeting + ' 이후 상태 갱신 없음</span>' : d.h.meeting + ' · <b>' + d.h.status + '</b> (' + api.esc(d.h.raw) + ')' + (d.h.cond ? '<br><span style="color:' + T.muted + '">' + api.esc(short(d.h.cond, 60)) + '</span>' : '')); } },
        xAxis: { type: 'value', position: 'top', min: 0, max: nM - 1, interval: 1, axisLine: { show: false }, axisTick: { show: false },
          splitLine: { show: true, lineStyle: { color: T.grid, type: 'dashed', opacity: 0.7 } },
          axisLabel: { color: T.muted, fontSize: 10.5, formatter: function (v) { var m = R.all[Math.round(v)]; return m && Math.abs(v - Math.round(v)) < 0.01 ? mno(m.id) : ''; } } },
        yAxis: [
          { type: 'category', inverse: true, data: rows.map(function (it) { return it.id + '  ' + short(it.title, 13); }), axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false },
            splitArea: { show: true, areaStyle: { color: ['transparent', T.surface2] } }, axisLabel: { color: T.ink2, fontSize: 11.5, interval: 0 } },
          { type: 'category', inverse: true, position: 'right', data: rows.map(function (it) { return it.untracked ? '미기재' : it.status; }), axisLine: { show: false }, axisTick: { show: false },
            axisLabel: { interval: 0, margin: 16, fontSize: 11, fontWeight: 700, formatter: function (v, i) { var it = rows[i]; var c = it.untracked ? 'mut' : 's' + Object.keys(col).indexOf(it.status); return '{' + c + '|' + (it.untracked ? '● 후속 미기재' : '● ' + it.status) + '}'; },
              rich: { s0: { color: T.serious }, s1: { color: T.warning }, s2: { color: T.good }, s3: { color: T.s[2] }, s4: { color: T.s[6] }, mut: { color: T.muted, fontWeight: 600 } } } }
        ],
        series: [{
          type: 'custom', encode: { x: [1, 2], y: 0 },
          renderItem: function (params, e) {
            var i = e.value(0), a = e.coord([e.value(1), i]), b = e.coord([e.value(2), i]), st = e.value(3);
            var d = segs[params.dataIndex], c = col[st] || T.neutral;
            if (d.tail) {
              if (b[0] - a[0] < 2) return null;
              return { type: 'line', shape: { x1: a[0] + 6, y1: a[1], x2: b[0], y2: b[1] }, style: { stroke: T.neutral, lineWidth: 1.5, lineDash: [3, 4] } };
            }
            var hh = 10, ch = [];
            if (b[0] > a[0]) ch.push({ type: 'rect', shape: { x: a[0], y: a[1] - hh / 2, width: b[0] - a[0], height: hh, r: hh / 2 }, style: { fill: c, opacity: 0.85 } });
            ch.push({ type: 'circle', shape: { cx: a[0], cy: a[1], r: 6 }, style: { fill: T.surface, stroke: c, lineWidth: 3 } });
            return { type: 'group', children: ch };
          },
          data: segs, z: 3
        }]
      });
      if (cl) cl.on('click', function (e) { if (e.data && e.data.it) api.openEntity(e.data.it.id); });
    }
  }

  // =====================================================================
  // 08 부서 분석
  // =====================================================================
  function dept(p, R, api) {
    var T = api.tokens(), D = R.depts.filter(function (d) { return d.meetings || d.actions; });
    if (!D.length) { p.innerHTML = head('부서별 업무 분석', '') + empty(); return; }
    var top = R.edges.slice(0, 5);
    var h = head('부서별 업무 분석', '참석 기록·업무 담당·논의 언급을 부서 단위로 합쳐 참여도·실행력·협업 관계를 봅니다.');
    h += '<div class="grid">';
    h += card('c7', '부서 협업 네트워크 ' + ai(), '선 굵기 = 협업 강도 (공동 업무 ×2 + 같은 논의에서 함께 언급) · 원 크기 = 활동량 · 부서를 가리키면 연결만 강조',
      legend([{ k: '공동 업무 있음', c: T.s[0] }, { k: '논의만 함께', c: T.axis }, { k: '외부 조직', c: T.neutral }]) + ch('dNet', 'h420'));
    h += card('c5', '협업이 많은 부서 쌍 Top 5', '', '<div style="display:flex;flex-direction:column;gap:8px;margin-top:4px">' + top.map(function (e, i) {
      return '<div class="cpair" role="button" tabindex="0" data-i="' + i + '" title="상세 보기"><b style="color:var(--muted)">' + (i + 1) + '</b>' +
        '<span><b>' + api.esc(A.DEPT_SHORT[e.a] || e.a) + ' ↔ ' + api.esc(A.DEPT_SHORT[e.b] || e.b) + '</b><br><span class="note" style="margin:0">공동 업무 ' + e.action + '건 · 같은 논의 ' + e.discussion + '건</span></span><b>' + e.weight + '</b><span class="chev">›</span></div>';
    }).join('') + '</div>' + '<p class="note">항목을 누르면 함께한 업무·논의를 볼 수 있습니다. 협업 강도는 원문의 공동 담당자·논의 언급을 규칙 기반으로 집계한 값입니다.</p>');
    h += card('c12', '부서별 핵심 지표', '같은 부서 순서로 네 지표를 나란히 비교 (각 지표는 자기 단위)', ch('dMulti', 'h360'));
    h += card('c4', '부서 역량 레이더 ' + ai(), '상위 4개 부서 · 각 축은 최댓값 대비 비율', ch('dRadar', 'h360'));
    h += card('c4', '부서 × 논의 주제 ' + ai(), '부서가 언급된 논의의 주제 분포', ch('dTopicHeat', 'h360'));
    h += card('c4', '담당자별 업무량', '업무 담당 건수 상위', ch('dPeople', 'h360'));
    h += card('c12', '부서 지표 표', '',
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>부서</th><th class="num">회의 참여</th><th class="num">주재</th><th class="num">참여 회의 결정 수</th><th class="num">논의 언급</th><th class="num">업무</th><th class="num">완료율</th><th class="num">지연</th><th>구성원</th></tr></thead><tbody>' +
      D.map(function (d) {
        return '<tr><td><b>' + api.esc(d.dept) + '</b></td><td class="num">' + d.meetings + '</td><td class="num">' + d.chaired + '</td><td class="num">' + d.decisions + '</td><td class="num">' + d.mentions + '</td><td class="num">' + d.actions + '</td><td class="num">' + (d.actions ? d.doneRate + '%' : '-') + '</td><td class="num">' + d.delayed + '</td><td>' + api.esc(d.people.join(', ')) + '</td></tr>';
      }).join('') + '</tbody></table></div>');
    h += '</div>';
    p.innerHTML = h;

    api.$$('.cpair', p).forEach(function (row) {
      function open() {
        var e = top[+row.dataset.i], a = e.a, b = e.b;
        var acts = R.actions.filter(function (x) { return x.ownerDepts.indexOf(a) >= 0 && x.ownerDepts.indexOf(b) >= 0; });
        var dis = R.discussions.filter(function (x) { return x.depts.indexOf(a) >= 0 && x.depts.indexOf(b) >= 0; });
        var nm = (A.DEPT_SHORT[a] || a) + ' ↔ ' + (A.DEPT_SHORT[b] || b);
        var body = '<div class="sel-counts" style="grid-template-columns:repeat(3,1fr)"><div><b>' + e.weight + '</b><small>협업 강도</small></div><div><b>' + acts.length + '</b><small>공동 업무</small></div><div><b>' + dis.length + '</b><small>같은 논의</small></div></div>';
        body += '<div class="dsec wide"><h4>공동 업무 ' + acts.length + '건</h4>' + (acts.length ? acts.map(function (x) {
          return '<div class="ditem"><div class="h">' + api.chips(x.id) + api.actionPill(x.status, x.delayed) + '<span class="note">' + api.esc(x.meeting) + ' · 마감 ' + api.esc(x.due || '-') + '</span></div><p><b>' + api.esc(x.task) + '</b></p><p>담당 ' + api.esc(x.owners.join(', ')) + '</p></div>';
        }).join('') : '<p class="note">공동 담당 업무가 없습니다</p>') + '</div>';
        body += '<div class="dsec wide"><h4>함께 언급된 논의 ' + dis.length + '건</h4>' + (dis.length ? dis.map(function (x) {
          return '<div class="ditem"><div class="h">' + api.chips(x.meeting) + '<b>' + api.esc(x.topic) + '</b><span class="note">' + api.esc(x.date || '') + '</span></div><p><b>논의</b> ' + api.esc(short(x.discussion, 140)) + '</p>' + (x.dissent ? '<p><b>이견</b> ' + api.esc(short(x.dissent, 120)) + '</p>' : '') + '<p><b>결론</b> ' + api.esc(x.conclusion) + '</p></div>';
        }).join('') : '<p class="note">함께 언급된 논의가 없습니다</p>') + '</div>';
        api.openDrawer(nm + ' 협업', '공동 업무 ×2 + 같은 논의 = 협업 강도 ' + e.weight + ' · ID를 누르면 원문', body);
      }
      row.addEventListener('click', open);
      row.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); } });
    });
    var net = api.chart(el('dNet'), networkOpt(R, api, false));
    if (net) net.on('click', function (e) { if (e.dataType === 'node') api.setFilter('depts', e.name); });

    var cats = D.map(function (d) { return d.short; });
    var mets = [['회의 참여', 'meetings', '회', '#6a95f0'], ['업무 담당', 'actions', '건', '#9d8cf2'], ['논의 언급', 'mentions', '건', '#f0a35e'], ['업무 완료율', 'doneRate', '%', '#52be7e']];
    var grids = [], xs = [], ys = [], ser = [];
    mets.forEach(function (m, i) {
      grids.push({ left: (i * 25 + (i ? 1 : 7)) + '%', width: (i ? 21 : 16) + '%', top: 28, bottom: 10 });
      xs.push({ gridIndex: i, type: 'value', show: false, max: m[1] === 'doneRate' ? 115 : function (v) { return v.max * 1.25; } });
      ys.push(axis(T, { gridIndex: i, type: 'category', inverse: true, data: cats, axisLine: { show: false }, axisLabel: { show: i === 0, color: T.ink2 } }));
      ser.push({ type: 'bar', xAxisIndex: i, yAxisIndex: i, barWidth: 12, data: D.map(function (d) { return d.actions || m[1] !== 'doneRate' ? d[m[1]] : null; }),
        itemStyle: { color: m[3], borderRadius: [0, 4, 4, 0] }, label: { show: true, position: 'right', color: T.ink2, fontSize: 10.5, formatter: function (pp) { return pp.value + m[2]; } } });
    });
    api.chart(el('dMulti'), {
      title: mets.map(function (m, i) { return { text: m[0], left: (i * 25 + (i ? 1 : 7)) + '%', top: 0, textStyle: { fontSize: 12, fontWeight: 700, color: T.ink } }; }),
      tooltip: { trigger: 'item', formatter: function (pp) { return '<b>' + pp.value + mets[pp.seriesIndex][2] + '</b> · ' + api.esc(D[pp.dataIndex].dept) + ' ' + mets[pp.seriesIndex][0]; } },
      grid: grids, xAxis: xs, yAxis: ys, series: ser
    });

    var rd = D.filter(function (d) { return !/외부|대표/.test(d.dept); }).sort(function (a, b) { return (b.meetings + b.actions) - (a.meetings + a.actions); }).slice(0, 4);
    var axes = [['회의 참여', 'meetings'], ['업무 담당', 'actions'], ['논의 언급', 'mentions'], ['주재', 'chaired'], ['완료율', 'doneRate']];
    var maxes = axes.map(function (a) { return Math.max.apply(null, D.map(function (d) { return d[a[1]] || 0; }).concat([1])); });
    api.chart(el('dRadar'), {
      legend: { bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: T.ink2, fontSize: 11 } },
      tooltip: { trigger: 'item' },
      radar: { radius: '62%', center: ['50%', '46%'], indicator: axes.map(function (a, i) { return { name: a[0], max: a[1] === 'doneRate' ? 100 : maxes[i] }; }),
        axisName: { color: T.ink2, fontSize: 11 }, splitLine: { lineStyle: { color: T.grid } }, splitArea: { areaStyle: { color: [T.surface, T.surface2] } }, axisLine: { lineStyle: { color: T.grid } } },
      series: [{ type: 'radar', symbolSize: 5, data: rd.map(function (d, i) { var c = [T.s[0], T.s[1], T.s[2], T.s[6]][i]; return { name: d.short, value: axes.map(function (a) { return d[a[1]] || 0; }), lineStyle: { color: c, width: 2 }, itemStyle: { color: c }, areaStyle: { color: c, opacity: 0.08 } }; }) }]
    });
    var topics = A.TOPICS, cells = [], mx = 0;
    D.forEach(function (d, y) {
      topics.forEach(function (t, x) {
        var v = R.discussions.filter(function (q) { return q.depts.indexOf(d.dept) >= 0 && q.category === t; }).length;
        mx = Math.max(mx, v); cells.push([x, y, v]);
      });
    });
    api.chart(el('dTopicHeat'), {
      grid: { left: 70, right: 10, top: 8, bottom: 56 },
      tooltip: { formatter: function (pp) { return '<b>' + pp.data[2] + '건</b> · ' + api.esc(D[pp.data[1]].dept) + '<br>' + topics[pp.data[0]]; } },
      xAxis: axis(T, { type: 'category', data: topics, splitLine: { show: false }, axisLabel: { color: T.ink2, interval: 0, rotate: 35, fontSize: 10.5 } }),
      yAxis: axis(T, { type: 'category', data: cats, inverse: true, axisLine: { show: false }, axisLabel: { color: T.ink2 } }),
      visualMap: { show: false, min: 0, max: mx || 1, inRange: { color: [T.surface2, T.seq[2], T.seq[5]] } },
      series: [{ type: 'heatmap', data: cells, itemStyle: { borderColor: T.surface, borderWidth: 2, borderRadius: 3 }, label: { show: true, fontSize: 10, color: T.ink, formatter: function (pp) { return pp.data[2] || ''; } } }]
    });

    var ppl = Object.keys(R.people).map(function (k) { return R.people[k]; }).filter(function (x) { return x.actions; }).sort(function (a, b) { return b.actions - a.actions; }).slice(0, 14);
    var ownerCount = {};
    R.actions.forEach(function (a) { a.owners.forEach(function (o) { ownerCount[o] = (ownerCount[o] || 0) + 1; }); });
    var pl = Object.keys(ownerCount).map(function (k) { return { n: k, v: ownerCount[k], d: R.deptOf(k) }; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 14);
    api.chart(el('dPeople'), hbarOpt(api, pl.map(function (x) { return x.n + ' · ' + (A.DEPT_SHORT[x.d] || x.d); }), pl.map(function (x) { return x.v; }), { unit: '건', left: 110, color: (function () { var mxp = Math.max.apply(null, pl.map(function (x) { return x.v; }).concat([1])), mnp = Math.min.apply(null, pl.map(function (x) { return x.v; })); return pl.map(function (x) { var t = mxp === mnp ? 1 : (x.v - mnp) / (mxp - mnp); return IG().mix('#d3e0fc', '#2f6bea', 0.15 + t * 0.85); }); })() }));
  }

  // =====================================================================
  // 10 AI 인사이트
  // =====================================================================
  var ICONS = {
    repeat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></svg>',
    shift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>',
    learn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg>',
    block: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M5.7 5.7l12.6 12.6"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3L2 21h20L12 3z"/><path d="M12 10v4M12 17.5v.5"/></svg>',
    summary: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h10M4 18h7"/></svg>',
    auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2"/></svg>'
  };

  // 규칙 기반 자동 인사이트 (필터·업로드 데이터에 반응)
  function autoInsights(R, api) {
    var out = [], s = R.summary;
    if (!R.meetings.length) return out;
    var t = R.topicShare[0];
    if (t) out.push({ cat: '자동 분석', icon: 'auto', title: '가장 많이 논의된 주제는 ' + t.key, body: '선택한 회의 ' + R.meetings.length + '건의 논의 중 ' + t.pct + '%가 ' + t.key + ' 주제였습니다. 2위는 ' + (R.topicShare[1] || {}).key + '(' + (R.topicShare[1] || {}).pct + '%)입니다.', metric: t.pct + '%', metricLabel: '주제 점유율', evidence: [], actions: ['상위 주제(' + t.key + ') 안건은 결론·담당자·기한을 분명히 남겨 같은 논의가 반복되지 않게 합니다.', '논의 비중이 낮은 주제(' + (R.topicShare[R.topicShare.length - 1] || {}).key + ')가 소홀하지 않은지 점검합니다.'] });
    var rec = R.issues.filter(function (i) { return i.mentions >= 3; });
    if (rec.length) out.push({ cat: '자동 분석', icon: 'repeat', title: rec.length + '개 이슈가 3회 이상 반복 등장', body: rec.map(function (i) { return i.id + '(' + i.title + ') ' + i.mentions + '회'; }).join(', ') + '.', metric: rec.length + '건', metricLabel: '반복 이슈', evidence: rec.map(function (i) { return i.id; }), actions: ['반복 이슈마다 근본 원인과 종결 조건을 정하고 담당자를 지정합니다.', '3회 이상 등장한 이슈는 별도 태스크로 분리해 다음 회의 전까지 해결안을 가져오게 합니다.'] });
    var open = s.decisionByStatus.filter(function (d) { return d.key !== '확정'; });
    var no = sum(open.map(function (d) { return d.value; }));
    if (s.decisions) out.push({ cat: '자동 분석', icon: 'shift', title: '결정의 ' + Math.round(no / s.decisions * 100) + '%가 조건부·잠정·보류', body: '전체 ' + s.decisions + '건 중 ' + open.map(function (d) { return d.key + ' ' + d.value; }).join(', ') + '건입니다. 조건 충족 여부를 후속 회의에서 확인해야 합니다.', metric: Math.round(no / s.decisions * 100) + '%', metricLabel: '미확정 결정 비중', evidence: [], actions: ['조건부·잠정 결정의 조건 충족 여부를 다음 회의 고정 안건으로 확인합니다.', '보류 결정에는 재검토 시점과 판단 기준을 반드시 적습니다.'] });
    if (s.actions) {
      var worst = R.depts.filter(function (d) { return d.actions >= 3; }).sort(function (a, b) { return a.doneRate - b.doneRate; })[0];
      out.push({ cat: '자동 분석', icon: 'block', title: '업무 완료율 ' + Math.round((s.actionByStatus[0].value) / s.actions * 100) + '%, 지연 ' + s.delayed + '건', body: (worst ? '완료율이 가장 낮은 부서는 ' + worst.dept + '(' + worst.doneRate + '%)입니다. ' : '') + '지연 업무: ' + (R.actions.filter(function (a) { return a.delayed; }).map(function (a) { return a.id; }).join(', ') || '없음') + '.', metric: s.delayed + '건', metricLabel: '지연 업무', evidence: R.actions.filter(function (a) { return a.delayed; }).map(function (a) { return a.id; }), actions: ['지연 업무를 원인(외부 의존·리소스 부족·범위 변경)별로 나눠 대응합니다.'].concat(worst ? [worst.dept + ' 업무에 마감 전 중간 점검 일정을 추가합니다.'] : []).concat(['마감이 지난 업무는 다음 회의에서 새 마감일과 완료 기준을 다시 합의합니다.']) });
    }
    if (s.loops) {
      var ok = s.loopByEval.filter(function (e) { return /달성|초과/.test(e.key) && e.key !== '부분달성'; }).reduce(function (a, e) { return a + e.value; }, 0);
      var bad = R.loops.filter(function (l) { return l.eval === '미달'; });
      out.push({ cat: '자동 분석', icon: 'learn', title: '이전 목표 달성률 ' + Math.round(ok / s.loops * 100) + '%', body: '추적한 목표 ' + s.loops + '건 중 ' + ok + '건을 달성했습니다.' + (bad.length ? ' 미달: ' + bad.map(function (l) { return l.ref + '(' + short(l.target, 18) + ')'; }).join(', ') + '.' : ''), metric: Math.round(ok / s.loops * 100) + '%', metricLabel: '목표 달성률', evidence: bad.map(function (l) { return l.meeting; }), actions: (bad.length ? ['미달 목표는 원인과 보완 조치를 다음 회의 성과 피드백에 명시합니다.'] : []).concat(['달성한 목표의 실행 방식을 표준 절차로 정리해 다음 과제에 재사용합니다.']) });
    }
    if (R.crises.length) out.push({ cat: '자동 분석', icon: 'alert', title: '긴급 위기 ' + R.crises.length + '건 · 해결 ' + R.crises.filter(function (c) { return c.resolved; }).length + '건', body: R.crises.map(function (c) { return c.type + '(' + c.date + (c.resolved ? ', ' + c.daysToResolve + '일 만에 해결' : ', 진행 중') + ')'; }).join(' / ') + '.', metric: R.crises.length + '건', metricLabel: '긴급 위기', evidence: R.crises.map(function (c) { return c.meeting; }), actions: ['위기별 재발방지 조치의 이행 여부를 정기 회의에서 점검합니다.', '긴급회의 소집 기준(품절률·VOC 등 임계치)을 미리 정의해 대응 시간을 줄입니다.'] });
    if (s.untrackedIssues) out.push({ cat: '자동 분석', icon: 'alert', title: '이슈 ' + s.untrackedIssues + '건이 종결 기록 없이 사라짐', body: '이후 회의록에 상태 갱신이 없는 이슈입니다: ' + R.issues.filter(function (i) { return i.untracked; }).slice(0, 6).map(function (i) { return i.id; }).join(', ') + (s.untrackedIssues > 6 ? ' 외' : '') + '.', metric: s.untrackedIssues + '건', metricLabel: '후속 미기재', evidence: R.issues.filter(function (i) { return i.untracked; }).slice(0, 6).map(function (i) { return i.id; }), actions: ['이슈 등록 시 종결 조건과 재검토일을 필수로 적습니다.', '매 회의 시작에 이전 이슈 상태를 확인하는 순서를 고정합니다.'] });
    var e = R.edges[0];
    if (e) out.push({ cat: '자동 분석', icon: 'summary', title: '가장 긴밀한 협업: ' + (A.DEPT_SHORT[e.a] || e.a) + ' ↔ ' + (A.DEPT_SHORT[e.b] || e.b), body: '공동 업무 ' + e.action + '건, 같은 논의 ' + e.discussion + '건으로 협업 강도가 가장 높았습니다.', metric: String(e.weight), metricLabel: '협업 강도', evidence: [], actions: ['가장 긴밀한 부서 쌍은 공동 목표와 정기 싱크를 공식화합니다.', '협업이 적은 부서 쌍 사이에 연결이 필요한 안건이 빠져 있지 않은지 점검합니다.'] });
    return out;
  }

  var CAT_TONE = { '반복되는 문제': 'orange', '의사결정 패턴': 'blue', '성과 학습': 'green', '병목': 'amber', '리스크 신호': 'red', '성과 요약': 'purple', '자동 분석': 'slate' };
  function insCard(i, api, idx) {
    var n = (i.evidence || []).length;
    return '<div class="ins mini" role="button" tabindex="0" data-idx="' + idx + '"><div class="cat"><span class="ic-wrap tone-' + (CAT_TONE[i.cat] || 'slate') + '">' + (ICONS[i.icon] || ICONS.auto) + '</span>' + api.esc(i.cat) + '<span class="go">›</span></div>' +
      '<div class="metric"><b>' + api.esc(i.metric) + '</b><span>' + api.esc(i.metricLabel || '') + '</span></div><h4>' + api.esc(i.title) + '</h4>' +
      '<div class="foot">' + (n ? '근거 ' + n + '건' : '규칙 기반 집계') + '<span>자세히</span></div></div>';
  }
  function evidenceHTML(id, R, api) {
    var d = R.decisions.filter(function (x) { return x.id === id; })[0];
    if (d) return '<div class="ditem"><div class="h">' + api.chips(id) + api.decisionPill(d.status, d.statusRaw) + '<span class="note">' + d.meeting + ' · ' + d.date + '</span></div><p><b>' + api.esc(d.text) + '</b></p>' + (d.condition && d.condition !== '-' ? '<p>조건: ' + api.esc(d.condition) + '</p>' : '') + '</div>';
    var a = R.actions.filter(function (x) { return x.id === id; })[0];
    if (a) return '<div class="ditem"><div class="h">' + api.chips(id) + api.actionPill(a.status, a.delayed) + '<span class="note">' + a.meeting + ' · 마감 ' + (a.due || '-') + '</span></div><p><b>' + api.esc(a.task) + '</b></p><p>담당 ' + api.esc(a.owners.join(', ')) + (a.followNote ? ' · 후속: ' + api.esc(a.followNote) : '') + '</p></div>';
    var it = R.issues.filter(function (x) { return x.id === id; })[0];
    if (it) return '<div class="ditem"><div class="h">' + api.chips(id) + '<span class="pill">' + api.esc(it.status) + '</span><span class="note">' + it.history.length + '회 기록 · ' + it.history.map(function (h) { return mno(h.meeting); }).join('→') + '</span></div><p><b>' + api.esc(it.title) + '</b></p></div>';
    var m = api.findMeeting(id);
    if (m) return '<div class="ditem"><div class="h">' + api.chips(id) + '<span class="note">' + api.esc(m.date) + ' · ' + api.esc(m.nature) + '</span></div><p><b>' + api.esc(m.title) + '</b></p><p>' + api.esc(short(m.purpose || '', 120)) + '</p></div>';
    return '<div class="ditem"><div class="h">' + api.chips(id) + '</div></div>';
  }
  function openInsight(i, R, api) {
    var ev = i.evidence || [];
    var body = '<div class="ins-detail"><div class="cat"><span class="ic-wrap tone-' + (CAT_TONE[i.cat] || 'slate') + '">' + (ICONS[i.icon] || ICONS.auto) + '</span>' + api.esc(i.cat) + '</div>' +
      '<div class="metric"><b>' + api.esc(i.metric) + '</b><span>' + api.esc(i.metricLabel || '') + '</span></div><p class="lead">' + api.esc(i.body) + '</p></div>';
    if (i.actions && i.actions.length) body += '<div class="ins-fix"><h4>' + (ICONS.learn || '') + '해결 방향 <span class="badge-ai">AI 제안</span></h4><ol>' + i.actions.map(function (x) { return '<li>' + api.esc(x) + '</li>'; }).join('') + '</ol></div>';
    body += '<div class="dsec wide"><h4>근거 ' + ev.length + '건</h4>' + (ev.length ? ev.map(function (id) { return evidenceHTML(id, R, api); }).join('') : '<p class="note">현재 필터의 회의 데이터로 실시간 집계한 값입니다</p>') + '</div>';
    api.openDrawer(i.title, api.esc(i.cat) + ' · ID를 누르면 해당 회의록 원문', body);
  }

  function insight(p, R, api) {
    var cur = R.ann ? R.ann.insights : [];
    var auto = autoInsights(R, api);
    var all = cur.concat(auto);
    var h = head('AI 인사이트', '단순 요약(무슨 일이 있었나)과 인사이트(그래서 무엇을 해야 하나)를 구분합니다. 카드를 누르면 상세 내용과 근거 회의·ID를 볼 수 있습니다.');
    h += '<div class="summary-vs" style="margin-bottom:14px"><div class="sv"><h5>요약 (Summary)</h5><p>“11/13 회의에서 광고 CTR 1.46%를 기록했다.” — 기록된 사실을 줄인 것</p></div>' +
      '<div class="sv"><h5>인사이트 (Insight)</h5><p>“UGC 소재 CTR이 설명형의 2.3배 → 다음 캠페인은 UGC 비중 확대가 필요하다.” — 여러 회의를 교차해 패턴·원인·행동을 도출한 것</p></div></div>';
    if (cur.length) {
      h += '<div class="panel-head" style="margin-top:6px"><div><h2 style="font-size:16px">원문 교차 분석 인사이트 ' + ai() + '</h2><p>전체 회의록 기준 · ' + cur.length + '개</p></div></div>';
      api.uniq(cur.map(function (i) { return i.cat; })).forEach(function (c) {
        h += '<div style="margin:14px 0 8px;font-size:13px;font-weight:800">' + api.esc(c) + '</div><div class="insights mini">' +
          cur.map(function (i, k) { return i.cat === c ? insCard(i, api, k) : ''; }).join('') + '</div>';
      });
    }
    h += '<div class="panel-head" style="margin-top:22px"><div><h2 style="font-size:16px">필터 반영 자동 인사이트 ' + ai('규칙 기반') + '</h2><p>현재 선택한 회의 ' + R.meetings.length + '건으로 실시간 계산 · 업로드한 회의록에도 적용됩니다</p></div></div>';
    h += auto.length ? '<div class="insights mini">' + auto.map(function (i, k) { return insCard(i, api, cur.length + k); }).join('') + '</div>' : empty();
    p.innerHTML = h;
    api.$$('.ins.mini', p).forEach(function (c) {
      var fn = function () { openInsight(all[+c.dataset.idx], R, api); };
      c.addEventListener('click', fn);
      c.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } });
    });
  }

  // =====================================================================
  // 11 차년도 기획
  // =====================================================================
  function next(p, R, api) {
    var T = api.tokens();
    var ny = R.ann ? R.ann.nextYear : null;
    var h = head('차년도 기획', '"올해 문제 → 올해 학습 → 차년도 전략" 구조로 회고(KPT)와 최종 의사결정을 차년도 계획으로 연결했습니다.');
    if (!ny) {
      // 업로드 데이터: 미달·부분달성 성과와 회고 회의에서 자동 구성
      var bad = R.loops.filter(function (l) { return /미달|부분|혼합/.test(l.eval); });
      var retro = R.meetings.filter(function (m) { return m.types.indexOf('회고') >= 0; });
      var kpt = [].concat.apply([], retro.map(function (m) { return m.discussions.filter(function (d) { return /^(Keep|Problem|Try)$/i.test(d.topic); }); }));
      h += '<div class="grid">' + card('c12', '올해 문제 → 학습 → 반영 ' + ai('자동 구성'), '성과 피드백에서 미달·부분달성 항목을 모았습니다',
        bad.length ? '<div class="pl-head"><span>관련</span><span>올해 문제</span><span>결과</span><span>차년도 반영</span></div>' + bad.map(function (l) {
          return '<div class="pl-row"><div class="pl-theme">' + api.chips(l.ref) + '</div><div class="pl-cell p">' + api.esc(l.target) + '</div><div class="pl-cell l">' + api.esc(l.result) + ' (' + l.evalRaw + ')</div><div class="pl-cell n">' + api.esc(l.next) + '</div></div>';
        }).join('') : empty('미달·부분달성 기록이 없습니다'));
      h += card('c12', 'KPT 회고', '회고 유형 회의의 Keep / Problem / Try', kpt.length ? '<div class="kpt">' + ['Keep', 'Problem', 'Try'].map(function (k) {
        return '<div><h5>' + k + '</h5><ul>' + kpt.filter(function (d) { return d.topic.toLowerCase() === k.toLowerCase(); }).map(function (d) { return '<li>' + api.esc(d.discussion) + '</li>'; }).join('') + '</ul></div>';
      }).join('') + '</div>' : empty('KPT 회고 기록이 없습니다')) + '</div>';
      p.innerHTML = h; api.bindChips(p); return;
    }
    h += '<div class="grid">';
    h += card('c12', '올해 문제 → 올해 학습 → 2027 반영 ' + ai(), '원문의 위기·미달 기록, KPT 회고, 020 최종 승인 결정을 연결했습니다',
      '<div class="pl-head"><span>영역</span><span>올해 문제</span><span>학습</span><span>2027 반영</span></div>' + ny.flows.map(function (f) {
        return '<div class="pl-row"><div class="pl-theme">' + api.esc(f.theme) + '</div><div class="pl-cell p"><b>' + api.esc(f.problem) + '</b><div class="ev">' + api.chips(f.problemEv) + '</div></div>' +
          '<div class="pl-cell l">' + api.esc(f.learning) + '</div><div class="pl-cell n">' + api.esc(f.plan) + '<div class="ev">' + api.chips(f.planEv) + '</div></div></div>';
      }).join(''));
    h += card('c7', '전략 매트릭스 ' + ai(), '유지 · 중단 · 개선 · 신규', '<div class="matrix">' +
      [['유지', 'keep', '유지할 전략'], ['중단', 'stop', '중단할 전략'], ['개선', 'improve', '개선할 전략'], ['신규', 'new', '신규 시도']].map(function (x) {
        return '<div class="mq ' + x[1] + '"><h5>' + x[2] + ' <span class="pill">' + ny.strategy[x[0]].length + '</span></h5><ul>' + ny.strategy[x[0]].map(function (s) { return '<li>' + api.esc(s) + '</li>'; }).join('') + '</ul><div class="ev" style="margin-top:6px">' + api.chips(ny.strategyEv[x[0]].join(' ')) + '</div></div>';
      }).join('') + '</div>');
    h += card('c5', '차년도 KPI 슬로프 ' + src(), 'D-061 승인 목표 · 올해 실적 = 100 기준 지수', ch('nKpi', 'h200') + slopeLegend(api, ny.kpis) + '<div class="tbl-wrap" style="margin-top:8px"><table class="tbl"><thead><tr><th>KPI</th><th class="num">2026–27 실적</th><th class="num">2027 목표</th></tr></thead><tbody>' +
      ny.kpis.map(function (k) { return '<tr><td>' + api.esc(k.name) + '</td><td class="num">' + api.fmt(k.thisYear, 2) + k.unit + '</td><td class="num"><b>' + api.fmt(k.next, 2) + k.unit + '</b></td></tr>'; }).join('') + '</tbody></table></div>');
    h += card('c6', '예상 리스크 매트릭스 ' + ai(), '발생 가능성 × 영향도 (1–5, AI 추정) · 오른쪽 위일수록 우선 대응', ch('nRisk', 'h280') +
      '<div class="risk-list">' + ny.risks.map(function (r, i) { var sc = r.level * r.prob; return '<div><b style="background:' + (sc >= 12 ? T.critical : sc >= 9 ? T.serious : T.warning) + '">' + (i + 1) + '</b><span>' + api.esc(r.name) + '<small>' + api.esc(r.note) + '</small></span>' + api.chips(r.ev) + '</div>'; }).join('') + '</div>');
    h += card('c6', '우선 추진과제', '기한 순 단계 · 원문의 차년도 착수 업무와 승인 결정', IG().steps(ny.priorities.slice().sort(function (a, b) { return a.due.localeCompare(b.due); }).map(function (x) {
      return { title: x.title, sub: x.owner + ' · 기한 ' + x.due, extra: '<div style="margin-top:4px">' + api.chips(x.id) + '</div>' };
    })));
    h += card('c12', 'KPT 회고 (ML-OL-019) ' + src(), '차년도 전략의 입력 데이터', '<div class="kpt">' + ['Keep', 'Problem', 'Try'].map(function (k) {
      return '<div><h5>' + k + '</h5><ul>' + ny.kpt[k].map(function (x) { return '<li>' + api.esc(x) + '</li>'; }).join('') + '</ul></div>';
    }).join('') + '</div>');
    h += '</div>';
    p.innerHTML = h;
    api.bindChips(p);
    api.chart(el('nKpi'), slopeOpt(api, ny.kpis));
    api.chart(el('nRisk'), {
      grid: { left: 50, right: 30, top: 16, bottom: 44 },
      tooltip: { formatter: function (pp) { var r = pp.data.r; return '<b>' + api.esc(r.name) + '</b><br>가능성 ' + r.prob + ' · 영향 ' + r.level + '<br><span style="color:' + T.muted + '">' + api.esc(r.note) + ' · ' + r.ev + '</span>'; } },
      xAxis: axis(T, { type: 'value', name: '발생 가능성', nameLocation: 'middle', nameGap: 28, nameTextStyle: { color: T.muted }, min: 1, max: 5, interval: 1 }),
      yAxis: axis(T, { type: 'value', name: '영향도', nameTextStyle: { color: T.muted }, min: 1, max: 5, interval: 1 }),
      series: [{ type: 'scatter',
        data: ny.risks.map(function (r, i) { var sc = r.level * r.prob; return { value: [r.prob + (i % 2 ? 0.08 : -0.08), r.level], r: r, id: r.ev, itemStyle: { color: sc >= 12 ? T.critical : sc >= 9 ? T.serious : T.warning, borderColor: T.surface, borderWidth: 2 } }; }),
        symbolSize: 22, label: { show: true, position: 'inside', color: '#fff', fontSize: 11, fontWeight: 800, formatter: function (pp) { return pp.dataIndex + 1; } },
        markArea: { silent: true, itemStyle: { color: T.critical, opacity: 0.06 }, data: [[{ coord: [3.5, 3.5] }, { coord: [5, 5] }]] } }]
    });
  }

  window.Views = { overview: overview, basic: basic, meetings: meetings, flow: flow, discussion: discussion, decision: decision, action: action, tracking: tracking, kpi: kpi, risk: risk, dept: dept, insight: insight, next: next };
})();
