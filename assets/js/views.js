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
  function tile(k, v, unit, d, cls) {
    return '<div class="tile ' + (cls || '') + '"><div class="k">' + k + '</div><div class="v">' + v + (unit ? '<small>' + unit + '</small>' : '') + '</div>' + (d ? '<div class="d">' + d + '</div>' : '') + '</div>';
  }
  function head(title, desc, extra) {
    return '<div class="panel-head"><div><h2>' + title + '</h2><p>' + desc + '</p></div>' + (extra || '') + '</div>';
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

    var h = head('개요', '항목별 핵심을 한 장의 그래프로 요약했습니다. 카드를 누르면 해당 분석 탭으로 이동합니다.' + (R.filtered ? ' <b>필터 적용 중</b>' : ''));
    h += '<div class="grid">';
    h += card('c8', '<span class="ov-num">09</span> 프로젝트 진행 흐름', '',
      '<div class="ov-hero"><span class="big">' + R.meetings.length + '</span><span class="unit">건</span><span class="aside">' + R.meetings[0].date.replace(/-/g, '.') + ' – ' + R.meetings[R.meetings.length - 1].date.replace(/-/g, '.') + ' · ' + api.uniq(R.meetings.map(function (m) { return m.phase; })).length + '개 단계</span></div>' +
      legend([{ k: '정기', c: api.natureColor('정기'), sym: '●' }, { k: '임시', c: api.natureColor('임시'), sym: '▲' }, { k: '긴급', c: api.natureColor('긴급'), sym: '⚠' }]) + ch('ovFlow', 'h240'), { click: 'flow' });
    h += card('c4', '<span class="ov-num">01</span> 회의 기본정보', '',
      '<div class="ov-hero"><span class="big">' + hours + '</span><span class="unit">시간</span><span class="aside">평균 ' + Math.round(s.totalMinutes / R.meetings.length) + '분 · 참석 ' + fmtAvg(R) + '명</span></div>' + ch('ovBasic', 'h240'), { click: 'basic' });
    h += card('c4', '<span class="ov-num">02</span> 안건·논의 분석', '주제 비중 (논의 ' + s.discussions + '건)',
      '<div class="ov-hero"><span class="big">' + topTopic.pct + '%</span><span class="aside">최다 주제 · ' + topTopic.key + '</span></div>' + ch('ovTopic', 'h200'), { click: 'discussion' });
    h += card('c4', '<span class="ov-num">03</span> 의사결정 현황', '',
      '<div class="ov-hero"><span class="big">' + s.decisions + '</span><span class="unit">건</span><span class="aside">조건부 ' + (dec['조건부'] || 0) + ' · 보류 ' + (dec['보류'] || 0) + ' · 번복 ' + reversals + '</span></div>' + ch('ovDec', 'h200'), { click: 'decision' });
    h += card('c4', '<span class="ov-num">04</span> Action Item 관리', '',
      '<div class="ov-hero"><span class="big">' + (s.actions ? Math.round((act['완료'] || 0) / s.actions * 100) : 0) + '%</span><span class="aside">완료율 · 전체 ' + s.actions + '건 · 지연 ' + s.delayed + '건</span></div>' + ch('ovAct', 'h200'), { click: 'action' });
    h += card('c4', '<span class="ov-num">05</span> 이전 → 현재 성과 추적', '',
      '<div class="ov-hero"><span class="big">' + (s.loops ? Math.round(loopOk / s.loops * 100) : 0) + '%</span><span class="aside">달성 · ' + s.loops + '개 목표 추적</span></div>' + ch('ovLoop', 'h200'), { click: 'tracking' });
    h += card('c4', '<span class="ov-num">06</span> KPI 성과관리', finals.length ? '최종 실적 / 목표' : '',
      (finals.length ? '<div class="ov-hero"><span class="big">' + finals.filter(function (f) { return f.state === '달성'; }).length + '/' + finals.length + '</span><span class="aside">프로젝트 KPI 달성</span></div>' + ch('ovKpi', 'h200')
        : '<div class="ov-hero"><span class="big">' + mets.length + '</span><span class="aside">수치 지표 자동 추출</span></div>' + ch('ovKpi', 'h200')), { click: 'kpi' });
    h += card('c4', '<span class="ov-num">07</span> 위기·리스크', '',
      '<div class="ov-hero"><span class="big">' + s.crises + '</span><span class="unit">건</span><span class="aside">해결 ' + crisisResolved + ' · 재발 ' + recurred + ' · 미결 이슈 ' + s.issues + '</span></div>' + ch('ovRisk', 'h200'), { click: 'risk' });
    h += card('c4', '<span class="ov-num">08</span> 부서별 업무 분석', topEdge ? '최다 협업: ' + (A.DEPT_SHORT[topEdge.a] || topEdge.a) + ' ↔ ' + (A.DEPT_SHORT[topEdge.b] || topEdge.b) : '',
      ch('ovDept', 'h240'), { click: 'dept' });
    h += card('c4', '<span class="ov-num">10</span> AI 인사이트 ' + ai(), '',
      '<div style="display:flex;flex-direction:column;gap:8px;margin-top:4px">' + ins.slice(0, 4).map(function (i) {
        return '<div style="display:grid;grid-template-columns:104px 1fr;gap:10px;align-items:center"><b style="font-size:' + (String(i.metric).length > 5 ? 15 : 19) + 'px;letter-spacing:-.02em">' + api.esc(i.metric) + '</b><span style="font-size:12.5px;line-height:1.4"><span style="color:var(--muted);font-weight:700;font-size:11px">' + api.esc(i.cat) + '</span><br>' + api.esc(i.title) + '</span></div>';
      }).join('') + '</div>', { click: 'insight' });
    h += card('c4', '<span class="ov-num">11</span> 차년도 기획 ' + (ny ? ai() : ''), ny ? '2027 목표 = 올해 실적 대비' : '',
      ny ? ch('ovNext', 'h240') : '<div class="empty">회고·차년도 회의가 포함되면 자동으로 채워집니다</div>', { click: 'next' });
    h += '</div>';
    p.innerHTML = h;
    bindGo(p, api);

    // 차트
    onClickMeeting(api.chart(el('ovFlow'), timelineOpt(R, api, true)), api);

    var months = api.uniq(R.meetings.map(function (m) { return m.date.slice(0, 7); })).sort();
    api.chart(el('ovBasic'), {
      grid: { left: 26, right: 6, top: 10, bottom: 22 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: axis(T, { type: 'category', data: months.map(function (x) { return x.slice(2).replace('-', '.'); }), axisLabel: { color: T.muted, fontSize: 10, interval: 0, rotate: months.length > 8 ? 45 : 0 } }),
      yAxis: axis(T, { type: 'value', minInterval: 1, axisLine: { show: false }, splitNumber: 3 }),
      series: A.NATURES.map(function (n) {
        return { name: n, type: 'bar', stack: 'n', barWidth: '55%', itemStyle: { color: api.natureColor(n), borderColor: T.surface, borderWidth: 1 },
          data: months.map(function (mo) { return R.meetings.filter(function (m) { return m.date.slice(0, 7) === mo && m.nature === n; }).length || null; }) };
      })
    });

    var tops = R.topicShare.slice(0, 6);
    api.chart(el('ovTopic'), hbarOpt(api, tops.map(function (t) { return t.key; }), tops.map(function (t) { return t.pct; }), { unit: '%', left: 84, color: T.s[0] }));

    api.chart(el('ovDec'), donutOpt(api, s.decisionByStatus.map(function (d) { return { k: d.key, value: d.value, c: api.decisionColor(d.key) }; }), s.decisions, '결정'));
    addLegendRight(el('ovDec'), s.decisionByStatus.map(function (d) { return { k: d.key + ' ' + d.value, c: api.decisionColor(d.key) }; }));

    api.chart(el('ovAct'), donutOpt(api, s.actionByStatus.map(function (d) { return { k: d.key, value: d.value, c: api.actionColor(d.key) }; }), s.actions, '업무'));
    addLegendRight(el('ovAct'), s.actionByStatus.map(function (d) { return { k: d.key + ' ' + d.value, c: api.actionColor(d.key) }; }).concat([{ k: '지연 ' + s.delayed, c: T.critical, sym: '⚠' }]));

    var le = s.loopByEval.filter(function (e) { return e.value; });
    api.chart(el('ovLoop'), hbarOpt(api, le.map(function (e) { return e.key; }), le.map(function (e) { return e.value; }), { unit: '건', left: 76, color: le.map(function (e) { return api.evalColor(e.key); }) }));

    if (finals.length) {
      api.chart(el('ovKpi'), kpiBulletOpt(api, finals.map(function (f) { return { name: f.name.replace('누적 ', '').replace('(CM)', ''), r: f.r, state: f.state, tip: f.last.actual + f.unit + ' / 목표 ' + f.last.target + f.unit }; }), 96));
    } else if (mets.length) {
      api.chart(el('ovKpi'), kpiBulletOpt(api, mets.slice(0, 6).map(function (m) { return { name: short(m.metric, 10), r: m.rate, state: m.state, tip: m.actual + m.unit + ' / 목표 ' + m.target + m.unit }; }), 96));
    } else el('ovKpi').innerHTML = empty('수치형 목표·실적이 없습니다');

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
      api.chart(el('ovNext'), nextKpiOpt(api, ny.kpis, true));
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
      tile('회의 수', ms.length, '건', s.byNature.map(function (n) { return n.key + ' ' + n.value; }).join(' · '), 'hero') +
      tile('총 회의 시간', Math.round(s.totalMinutes / 6) / 10, '시간', '평균 ' + Math.round(s.totalMinutes / ms.length) + '분') +
      tile('평균 참석자', avgAtt, '명', '최대 ' + Math.max.apply(null, ms.map(function (m) { return m.attendees.length; })) + '명') +
      tile('참석 부서', api.uniq([].concat.apply([], ms.map(function (m) { return m.depts; }))).length, '개', '외부 조직 포함') +
      tile('회의 장소', placeArr.length, '곳', '화상 병행 ' + hybrid + '건') +
      tile('주재자', api.uniq(ms.map(function (m) { return m.chairName; })).length, '명', '기록자 ' + api.uniq(ms.map(function (m) { return m.recorderName; })).length + '명') +
      '</div>';
    h += '<div class="grid">';
    h += card('c4', '회의 성격 ' + src(), '정기 / 임시 / 긴급 — 클릭하면 해당 성격만 필터링', ch('bNature', 'h240'));
    h += card('c4', '회의 유형 ' + src(), '한 회의가 여러 유형에 해당할 수 있음 (다중 분류)', ch('bType', 'h240'));
    h += card('c4', '회의 장소 ' + src(), '장소별 회의 건수', ch('bPlace', 'h240'));
    h += card('c12', '부서별 참석 매트릭스 ' + src(), '진한 칸 = 주재 부서 · 셀을 누르면 해당 회의 상세',
      legend([{ k: '참석', c: T.seq[2] }, { k: '주재', c: T.seq[5] }]) + ch('bDeptHeat', 'h360'));
    h += card('c12', '참석자 × 회의 ' + src(), '사람별 참석 이력 (● 주재 · ✎ 기록)', ch('bPeopleHeat', 'h480'));
    h += card('c12', '회의 시간과 규모', '막대 = 회의 시간(분) · 막대 위 숫자 = 참석 인원', legend(A.NATURES.map(function (n) { return { k: n, c: api.natureColor(n) }; })) + ch('bDur', 'h280'));
    h += '</div>';
    h += '<div class="panel-head" style="margin-top:20px"><div><h2 style="font-size:16px">회의 목록</h2><p>카드를 누르면 회의록 전체 구조(안건·결정·업무·이슈)를 볼 수 있습니다.</p></div></div>';
    h += '<div class="mcards">' + ms.map(function (m) {
      return '<button type="button" class="mcard" data-mid="' + m.id + '"><div class="top"><span class="id">' + api.esc(m.id) + '</span><span class="nature-tag nature-' + m.nature + '">' + api.NATURE_GLYPH[m.nature] + ' ' + m.nature + '</span></div>' +
        '<div class="title">' + api.esc(m.title) + '</div>' +
        '<div class="meta"><span>📅 ' + m.date.replace(/-/g, '.') + ' (' + m.dow + ') ' + m.start + '</span><span>⏱ ' + (m.durationMin || '-') + '분</span><span>📍 ' + api.esc(short(m.room, 18)) + '</span></div>' +
        '<div class="meta"><span>주재 ' + api.esc(m.chairName) + '</span><span>기록 ' + api.esc(m.recorderName) + '</span><span>참석 ' + m.attendees.length + '명</span></div>' +
        '<div class="meta">' + m.types.map(function (t) { return '<span class="pill">' + t + '</span>'; }).join('') + '<span class="pill" style="background:transparent;border:1px solid var(--border)">단계 · ' + api.esc(m.phase) + '</span></div>' +
        '<div class="meta" style="color:var(--muted)">' + m.depts.map(function (d) { return A.DEPT_SHORT[d] || d; }).join(' · ') + '</div></button>';
    }).join('') + '</div>';
    p.innerHTML = h;
    api.$$('.mcard', p).forEach(function (b) { b.addEventListener('click', function () { api.openMeeting(b.dataset.mid); }); });

    var cN = api.chart(el('bNature'), donutOpt(api, s.byNature.map(function (n) { return { k: n.key, value: n.value, c: api.natureColor(n.key) }; }), ms.length, '회의'));
    addLegendRight(el('bNature'), s.byNature.map(function (n) { return { k: n.key + ' ' + n.value, c: api.natureColor(n.key), sym: api.NATURE_GLYPH[n.key] }; }));
    if (cN) cN.on('click', function (e) { api.setFilter('nature', e.name); });
    var cT = api.chart(el('bType'), hbarOpt(api, s.byType.map(function (t) { return t.key; }), s.byType.map(function (t) { return t.value; }), { unit: '건', left: 70, color: T.s[0] }));
    if (cT) cT.on('click', function (e) { api.setFilter('types', e.name); });
    api.chart(el('bPlace'), hbarOpt(api, placeArr.map(function (x) { return x.k; }), placeArr.map(function (x) { return x.v; }), { unit: '건', left: 150, color: T.s[0] }));

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

    var cD = api.chart(el('bDur'), {
      grid: { left: 40, right: 40, top: 16, bottom: 30 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: function (ps) { var m = ms[ps[0].dataIndex]; return '<b>' + m.durationMin + '분</b> · 참석 ' + m.attendees.length + '명<br>' + api.esc(m.id) + ' · ' + api.esc(m.title); } },
      xAxis: axis(T, { type: 'category', data: ms.map(function (m) { return mno(m.id); }), splitLine: { show: false }, axisLabel: { color: T.muted, fontSize: 10.5, interval: 0 } }),
      yAxis: [axis(T, { type: 'value', name: '분', nameTextStyle: { color: T.muted }, axisLine: { show: false } })],
      series: [{ type: 'bar', barWidth: '55%', data: ms.map(function (m) { return { value: m.durationMin, mid: m.id, itemStyle: { color: api.natureColor(m.nature), borderRadius: [4, 4, 0, 0] } }; }),
        label: { show: true, position: 'top', color: T.ink2, fontSize: 10, formatter: function (pp) { return ms[pp.dataIndex].attendees.length + '명'; } } }]
    });
    onClickMeeting(cD, api);
  }

  // =====================================================================
  // 09 프로젝트 흐름
  // =====================================================================
  function flow(p, R, api) {
    var T = api.tokens(), ms = R.meetings;
    if (!ms.length) { p.innerHTML = head('프로젝트 진행 흐름', '') + empty(); return; }
    var phaseStats = A.PHASES.map(function (ph) {
      var pm = ms.filter(function (m) { return m.phase === ph; });
      return { ph: ph, n: pm.length, from: pm.length ? pm[0].date : '', to: pm.length ? pm[pm.length - 1].date : '', dec: sum(pm.map(function (m) { return m.decisions.length; })),
        act: sum(pm.map(function (m) { return m.actions.length; })), urgent: pm.filter(function (m) { return m.nature === '긴급'; }).length };
    }).filter(function (x) { return x.n; });
    var h = head('프로젝트 진행 흐름', '전체 회의를 단계별 타임라인으로 봅니다. ● 정기 ▲ 임시 ⚠ 긴급 · 점을 누르면 회의 상세가 열립니다.');
    h += '<div class="grid">';
    h += card('c12', '단계별 타임라인 ' + src(), '기획 → 개발 → 생산 → 유통 → 런칭 → 성장 → 시즌 프로모션 → 성과평가 → 차년도 계획',
      legend([{ k: '정기회의', c: api.natureColor('정기'), sym: '●' }, { k: '임시회의', c: api.natureColor('임시'), sym: '▲' }, { k: '긴급회의', c: api.natureColor('긴급'), sym: '⚠' }]) + ch('fTimeline', 'h420'));
    h += card('c12', '단계 흐름 요약', '', '<div style="display:flex;gap:6px;overflow-x:auto;padding:4px 0 6px">' + phaseStats.map(function (x, i) {
      return '<div style="flex:1 0 118px;background:var(--surface-2);border-radius:10px;padding:10px 12px;position:relative;border-top:3px solid ' + T.seq[Math.min(6, 1 + Math.floor(i * 6 / Math.max(1, phaseStats.length - 1)))] + '">' +
        '<div style="font-size:11px;color:var(--muted);font-weight:700">STEP ' + (i + 1) + '</div><div style="font-weight:800;font-size:13.5px">' + x.ph + '</div>' +
        '<div style="font-size:11.5px;color:var(--ink-2)">' + x.from.slice(2).replace(/-/g, '.') + (x.to !== x.from ? '–' + x.to.slice(5).replace('-', '.') : '') + '</div>' +
        '<div style="font-size:12px;margin-top:6px">회의 <b>' + x.n + '</b> · 결정 <b>' + x.dec + '</b> · 업무 <b>' + x.act + '</b>' + (x.urgent ? ' · <b style="color:var(--critical-ink)">⚠' + x.urgent + '</b>' : '') + '</div></div>';
    }).join('') + '</div>');
    h += card('c8', '회의별 산출물', '회의마다 나온 결정·업무·이슈 건수', legend([{ k: '결정', c: T.s[0] }, { k: '업무', c: T.s[2] }, { k: '이슈', c: T.s[3] }]) + ch('fOut', 'h280'));
    h += card('c4', '단계별 회의 밀도', '단계별 회의 수 (긴급 포함)', ch('fPhase', 'h280'));
    h += '</div>';
    p.innerHTML = h;
    onClickMeeting(api.chart(el('fTimeline'), timelineOpt(R, api, false)), api);
    var cO = api.chart(el('fOut'), {
      grid: { left: 32, right: 12, top: 12, bottom: 28 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: function (ps) { var m = ms[ps[0].dataIndex]; return '<b>' + api.esc(m.id) + '</b> ' + api.esc(short(m.title, 26)) + '<br>' + ps.map(function (x) { return '<b>' + x.value + '</b> ' + x.seriesName; }).join(' · '); } },
      xAxis: axis(T, { type: 'category', data: ms.map(function (m) { return mno(m.id); }), splitLine: { show: false }, axisLabel: { color: T.muted, fontSize: 10.5, interval: 0 } }),
      yAxis: axis(T, { type: 'value', minInterval: 1, axisLine: { show: false } }),
      series: [['결정', 'decisions', 0], ['업무', 'actions', 2], ['이슈', 'issues', 3]].map(function (x) {
        return { name: x[0], type: 'bar', barGap: '10%', barWidth: 6, itemStyle: { color: T.s[x[2]], borderRadius: [3, 3, 0, 0] }, data: ms.map(function (m) { return { value: m[x[1]].length, mid: m.id }; }) };
      })
    });
    onClickMeeting(cO, api);
    api.chart(el('fPhase'), {
      grid: { left: 96, right: 36, top: 6, bottom: 6 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: { type: 'value', show: false },
      yAxis: axis(T, { type: 'category', inverse: true, data: phaseStats.map(function (x) { return x.ph; }), axisLine: { show: false }, axisLabel: { color: T.ink2 } }),
      series: [{ name: '정기·임시', type: 'bar', stack: 'a', barWidth: 12, itemStyle: { color: T.s[0] }, data: phaseStats.map(function (x) { return x.n - x.urgent; }) },
        { name: '긴급', type: 'bar', stack: 'a', barWidth: 12, itemStyle: { color: T.critical, borderRadius: [0, 4, 4, 0] }, data: phaseStats.map(function (x) { return x.urgent || null; }),
          label: { show: false } }]
    });
  }

  // =====================================================================
  // 02 안건·논의
  // =====================================================================
  function discussion(p, R, api) {
    var T = api.tokens(), ds = R.discussions, ms = R.meetings;
    if (!ds.length) { p.innerHTML = head('안건 및 논의 분석', '') + empty(); return; }
    var resKeys = ['채택', '조건부 채택', '절충', '보류·연기'];
    var resCol = [T.s[0], T.s[2], T.s[3], T.neutral];
    var recurring = R.issues.filter(function (i) { return i.mentions >= 2; }).sort(function (a, b) { return b.mentions - a.mentions; });
    var pairs = Object.keys(R.conflictPairs).map(function (k) { return { k: k.split('|'), v: R.conflictPairs[k] }; }).sort(function (a, b) { return b.v - a.v; });
    var agendaN = sum(ms.map(function (m) { return m.agenda.length; }));
    var h = head('안건 및 논의 분석', '회의록의 안건별 논의·이견·결론 텍스트를 AI 규칙으로 분류해 "무엇을 얼마나 이야기했는지"를 수치화했습니다.');
    h += '<div class="tiles">' + tile('안건', agendaN, '개', '회의당 ' + Math.round(agendaN / ms.length * 10) / 10 + '개', 'hero') + tile('논의 기록', ds.length, '건', '이견·대안 포함') +
      tile('최다 주제', R.topicShare[0].key, '', R.topicShare[0].pct + '%') + tile('반복 이슈', recurring.length, '건', '2회 이상 등장') +
      tile('보류·연기된 논의', ds.filter(function (d) { return d.resolution === '보류·연기'; }).length, '건', '결론 유형 AI 분류') + '</div>';
    h += '<div class="grid">';
    h += card('c5', '가장 많이 논의된 주제 ' + ai(), '논의 텍스트의 주제 키워드 비중', ch('dTopic', 'h320'));
    h += card('c7', '단계별 논의 주제 변화 ' + ai(), '진할수록 해당 단계에서 많이 논의됨 (주제 점유율 %)', ch('dTopicPhase', 'h320'));
    h += card('c7', '주요 키워드 ' + ai(), '원문 전체에서 등장 빈도 · 크기 = 언급 수', ch('dKw', 'h360'));
    h += card('c5', '키워드 흐름', '상위 키워드의 회의별 언급 추이', ch('dKwTrend', 'h360'));
    h += card('c6', '부서 간 이견 지도 ' + ai(), '같은 안건에서 의견이 갈린 부서 쌍 (색이 진할수록 잦음)', ch('dConflict', 'h360'));
    h += card('c3', '이견의 결론 방식 ' + ai(), '이견이 어떻게 정리됐나', ch('dRes', 'h280') );
    h += card('c3', '반복적으로 등장한 이슈 ' + src(), '미결 이슈의 회의 등장 횟수', recurring.length ? ch('dRecur', 'h360') : empty('2회 이상 등장한 이슈가 없습니다'));
    h += card('c12', '안건별 논의 · 이견 · 결론', '',
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>회의</th><th>안건</th><th>주제</th><th>관련 부서</th><th>핵심 논의</th><th>이견·대안</th><th>결론</th><th>결론 방식</th></tr></thead><tbody>' +
      ds.map(function (d) {
        return '<tr><td>' + api.chips(d.meeting) + '</td><td><b>' + api.esc(d.topic) + '</b></td><td><span class="pill">' + d.category + '</span></td><td>' + d.depts.map(function (x) { return A.DEPT_SHORT[x] || x; }).join(', ') + '</td>' +
          '<td class="clip">' + api.esc(d.discussion) + '</td><td class="clip">' + api.esc(d.dissent) + '</td><td class="clip">' + api.esc(d.conclusion) + '</td><td>' + d.resolution + '</td></tr>';
      }).join('') + '</tbody></table></div>');
    h += '</div>';
    p.innerHTML = h;
    api.bindChips(p);

    api.chart(el('dTopic'), hbarOpt(api, R.topicShare.map(function (t) { return t.key; }), R.topicShare.map(function (t) { return t.pct; }), { unit: '%', left: 96, color: T.s[0], bg: true, barWidth: 14 }));

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
      visualMap: { show: false, min: 0, max: maxv || 1, inRange: { color: [T.surface2, T.seq[2], T.seq[4], T.seq[6]] } },
      series: [{ type: 'heatmap', data: cells, itemStyle: { borderColor: T.surface, borderWidth: 2, borderRadius: 3 },
        label: { show: true, fontSize: 10, color: T.ink, formatter: function (p) { return p.data[2] >= 15 ? p.data[2] : ''; } } }]
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
          var t = k.count / maxK; var idx = Math.min(6, 2 + Math.round(t * 4));
          return { name: k.key, value: k.count, meetings: k.meetings, itemStyle: { color: T.seq[idx] }, label: { color: idx >= 4 ? '#fff' : T.ink } };
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
      xAxis: axis(T, { type: 'category', data: ms.map(function (m) { return mno(m.id); }), splitLine: { show: false }, axisLabel: { color: T.muted, fontSize: 10, interval: 0 } }),
      yAxis: axis(T, { type: 'category', data: topK.map(function (k) { return k.key; }), inverse: true, axisLine: { show: false }, axisLabel: { color: T.ink2, interval: 0 } }),
      visualMap: { show: false, dimension: 2, min: 0, max: kmax || 1, inRange: { color: [T.surface2, T.seq[2], T.seq[5]] } },
      series: [{ type: 'heatmap', data: kc, itemStyle: { borderColor: T.surface, borderWidth: 2, borderRadius: 2 } }]
    });
    if (cK) cK.on('click', function (e) { api.openMeeting(e.data[3]); });

    var dl = api.uniq([].concat.apply([], pairs.map(function (x) { return x.k; })));
    dl.sort(function (a, b) { return (A.DEPTS.indexOf(a) + 1 || 99) - (A.DEPTS.indexOf(b) + 1 || 99); });
    var pc = [], pmax = 0;
    pairs.forEach(function (x) { var i = dl.indexOf(x.k[0]), j = dl.indexOf(x.k[1]); pc.push([i, j, x.v]); pc.push([j, i, x.v]); pmax = Math.max(pmax, x.v); });
    if (pairs.length) {
      api.chart(el('dConflict'), {
        grid: { left: 70, right: 10, top: 8, bottom: 50 },
        tooltip: { formatter: function (p) { return '<b>' + p.data[2] + '건</b>의 안건에서 이견<br>' + api.esc(dl[p.data[0]]) + ' ↔ ' + api.esc(dl[p.data[1]]); } },
        xAxis: axis(T, { type: 'category', data: dl.map(function (d) { return A.DEPT_SHORT[d] || d; }), splitLine: { show: false }, axisLabel: { color: T.ink2, interval: 0, rotate: 30 } }),
        yAxis: axis(T, { type: 'category', data: dl.map(function (d) { return A.DEPT_SHORT[d] || d; }), inverse: true, axisLine: { show: false }, axisLabel: { color: T.ink2 } }),
        visualMap: { show: false, min: 0, max: pmax || 1, inRange: { color: [T.seq[0], T.seq[3], T.seq[6]] } },
        series: [{ type: 'heatmap', data: pc, itemStyle: { borderColor: T.surface, borderWidth: 2, borderRadius: 3 }, label: { show: true, color: '#fff', fontSize: 10.5, fontWeight: 700 } }]
      });
    } else el('dConflict').innerHTML = empty('부서 간 이견 기록이 없습니다');

    var rc = resKeys.map(function (k, i) { return { k: k, value: ds.filter(function (d) { return d.resolution === k; }).length, c: resCol[i] }; });
    api.chart(el('dRes'), donutOpt(api, rc, ds.length, '논의'));
    addLegendRight(el('dRes'), rc.map(function (r) { return { k: r.k + ' ' + r.value, c: r.c }; }));

    if (recurring.length) {
      var ic = recurring.slice(0, 12);
      api.chart(el('dRecur'), hbarOpt(api, ic.map(function (i) { return i.id + ' ' + short(i.title, 8); }), ic.map(function (i) { return i.mentions; }), {
        unit: '회', left: 120, color: T.s[1], tip: function (pp) { var it = ic[pp.dataIndex]; return '<b>' + it.mentions + '회</b> 등장 · ' + api.esc(it.title) + '<br><span style="color:' + T.muted + '">현재 상태: ' + it.status + '</span>'; }
      }));
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
    h += '<div class="tiles">' + tile('총 의사결정', D.length, '건', R.meetings.length + '개 회의', 'hero') +
      ['확정', '조건부', '잠정', '보류'].map(function (k) { return tile('<i class="dot" style="background:' + api.decisionColor(k) + '"></i>' + k, byS[k] || 0, '건', pctTxt((byS[k] || 0) / D.length * 100)); }).join('') +
      tile('<b style="color:var(--critical-ink)">↺</b> 번복·방향 변경 ' + (R.ann ? ai('AI') : ''), rev.length, '건', rev.map(function (l) { return l.from + '→' + l.to; }).join(', ') || '감지되지 않음') +
      tile('재검토 시점 명시', D.filter(function (d) { return d.review; }).length, '건', '조건에 날짜·월이 적힌 결정') + '</div>';
    h += '<div class="grid">';
    h += card('c8', '회의별 의사결정 ' + src(), '막대를 누르면 해당 회의의 결정 목록', legend(['확정', '조건부', '잠정', '보류'].map(function (k) { return { k: k, c: api.decisionColor(k) }; })) + ch('decBar', 'h280'));
    h += card('c4', '승인 레벨', '대표·긴급 승인 vs 팀 확정', ch('decLvl', 'h280'));
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
    var cB = api.chart(el('decBar'), {
      grid: { left: 30, right: 10, top: 10, bottom: 28 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: function (ps) { var m = ms[ps[0].dataIndex]; return '<b>' + api.esc(m.id) + '</b> ' + api.esc(short(m.title, 24)) + '<br>' + ps.filter(function (x) { return x.value; }).map(function (x) { return '<b>' + x.value + '</b> ' + x.seriesName; }).join(' · '); } },
      xAxis: axis(T, { type: 'category', data: ms.map(function (m) { return mno(m.id); }), splitLine: { show: false }, axisLabel: { color: T.muted, interval: 0 } }),
      yAxis: axis(T, { type: 'value', minInterval: 1, axisLine: { show: false } }),
      series: ['확정', '조건부', '잠정', '보류'].map(function (k) {
        return { name: k, type: 'bar', stack: 'd', barWidth: '55%', itemStyle: { color: api.decisionColor(k), borderColor: T.surface, borderWidth: 1 },
          data: ms.map(function (m) { return { value: D.filter(function (d) { return d.meeting === m.id && d.status === k; }).length || null, mid: m.id }; }) };
      })
    });
    onClickMeeting(cB, api);
    api.chart(el('decLvl'), donutOpt(api, [{ k: '대표·긴급 승인', value: lvl['대표·긴급 승인'], c: T.ink }, { k: '팀 확정', value: lvl['팀 확정'], c: T.s[0] }], D.length, '결정'));
    addLegendRight(el('decLvl'), [{ k: '대표·긴급 승인 ' + lvl['대표·긴급 승인'], c: T.ink }, { k: '팀 확정 ' + lvl['팀 확정'], c: T.s[0] }]);

    if (links.length) {
      var gEl2 = el('decGraph');
      var comps = decisionGraphOpt(R, api, links);
      gEl2.style.height = Math.max(280, comps._rows * 44 + 70) + 'px';
      api.chart(gEl2, comps);
    }

    var resM = R.meetings.map(function (m) { return { m: m, n: m.reserved && !/^없음/.test(m.reserved) ? m.reserved.split(/,|·|\//).filter(function (x) { return x.trim().length > 1; }).length : 0 }; });
    var cR = api.chart(el('decRes'), {
      grid: { left: 30, right: 10, top: 10, bottom: 28 },
      tooltip: { trigger: 'item', formatter: function (pp) { var x = resM[pp.dataIndex]; return '<b>유보 ' + x.n + '건</b> · ' + api.esc(x.m.id) + '<br>' + api.esc(x.m.reserved || '없음'); } },
      xAxis: axis(T, { type: 'category', data: resM.map(function (x) { return mno(x.m.id); }), splitLine: { show: false }, axisLabel: { color: T.muted, interval: 0 } }),
      yAxis: axis(T, { type: 'value', minInterval: 1, axisLine: { show: false } }),
      series: [{ type: 'bar', barWidth: '50%', data: resM.map(function (x) { return { value: x.n, mid: x.m.id, itemStyle: { color: T.s[3], borderRadius: [4, 4, 0, 0] } }; }) }]
    });
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
    var st = {}; s.actionByStatus.forEach(function (x) { st[x.key] = x.value; });
    var lead = AC.filter(function (a) { return a.due; }).map(function (a) { return Math.round((new Date(a.due) - new Date(a.start)) / 86400000); });
    var avgLead = lead.length ? Math.round(sum(lead) / lead.length) : 0;
    var h = head('Action Item 관리', '업무지시사항을 담당자·부서·마감일로 구조화하고, 다음 회의의 "이전 Action 상태" 기록으로 실제 완료 여부를 추적합니다.');
    h += '<div class="tiles">' + tile('전체 업무', AC.length, '건', '평균 리드타임 ' + avgLead + '일', 'hero') +
      tile('<i class="dot" style="background:' + api.actionColor('완료') + '"></i>완료', st['완료'] || 0, '건', pctTxt((st['완료'] || 0) / AC.length * 100)) +
      tile('<i class="dot" style="background:' + api.actionColor('부분완료') + '"></i>부분완료', st['부분완료'] || 0, '건', '후속 회의 기록 기준') +
      tile('<i class="dot" style="background:' + api.actionColor('진행중') + '"></i>진행중', st['진행중'] || 0, '건', '완료 기록 없음 포함') +
      tile('<b style="color:var(--critical-ink)">⚠</b> 지연', s.delayed, '건', AC.filter(function (a) { return a.delayed; }).map(function (a) { return a.id; }).join(', ')) +
      tile('<i class="dot" style="background:' + api.actionColor('미착수') + '"></i>미착수', st['미착수'] || 0, '건', '예정 상태') + '</div>';
    h += '<div class="grid">';
    h += card('c12', '업무 간트 차트 ' + src(), '지시일(회의일) → 마감일 · 색 = 최종 상태 · ⚠ = 지연 기록 · 막대를 누르면 원문', legend(['완료', '부분완료', '진행중', '미착수'].map(function (k) { return { k: k, c: api.actionColor(k) }; }).concat([{ k: '지연', c: T.critical, sym: '⚠' }])) + '<div style="max-height:560px;overflow:auto">' + ch('aGantt', 'h480') + '</div>');
    h += card('c6', '부서별 업무 현황', '담당(공동 포함) 기준 상태별 건수', ch('aDept', 'h320'));
    h += card('c3', '우선순위 × 상태', '', ch('aPrio', 'h320'));
    h += card('c3', '업무 리드타임', '지시일부터 마감일까지 (일)', ch('aLead', 'h320'));
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
          var children = [{ type: 'rect', shape: { x: s0[0], y: s0[1] - hgt / 2, width: w, height: hgt, r: 3 }, style: { fill: api.actionColor(a.status) } }];
          if (a.delayed) children.push({ type: 'text', style: { text: '⚠', x: s0[0] + w + 4, y: s0[1] - 6, fill: T.critical, fontSize: 11 } });
          return { type: 'group', children: children };
        },
        data: rows.map(function (a, i) { return { value: [i, a.start, a.due || a.start], id: a.id }; })
      }]
    });
    if (cg) cg.on('click', function (e) { api.openEntity(e.data.id); });

    var dl = R.depts.filter(function (d) { return d.actions; }).sort(function (a, b) { return b.actions - a.actions; });
    api.chart(el('aDept'), {
      grid: { left: 90, right: 20, top: 26, bottom: 10 },
      legend: { top: 0, left: 0, data: ['완료', '부분완료', '진행중', '미착수'], itemWidth: 10, itemHeight: 10, textStyle: { color: T.ink2, fontSize: 11.5 } },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: { type: 'value', show: false },
      yAxis: axis(T, { type: 'category', inverse: true, data: dl.map(function (d) { return d.dept; }), axisLine: { show: false }, axisLabel: { color: T.ink2 } }),
      series: ['완료', '부분완료', '진행중', '미착수'].map(function (k) {
        return { name: k, type: 'bar', stack: 'x', barWidth: 13, itemStyle: { color: api.actionColor(k), borderColor: T.surface, borderWidth: 1 },
          data: dl.map(function (d) { return AC.filter(function (a) { return a.ownerDepts.indexOf(d.dept) >= 0 && a.status === k; }).length || null; }) };
      }).concat([{ name: '완료율', type: 'bar', stack: 'x', data: dl.map(function () { return 0; }), label: { show: true, position: 'right', color: T.ink2, fontSize: 11, formatter: function (pp) { return dl[pp.dataIndex].doneRate + '%'; } }, itemStyle: { color: 'transparent' }, tooltip: { show: false } }])
    });

    var prios = api.uniq(AC.map(function (a) { return a.priority; }));
    var prOrder = ['최우선', '높음', '중간', '낮음'];
    prios.sort(function (a, b) { return prOrder.indexOf(a) - prOrder.indexOf(b); });
    api.chart(el('aPrio'), {
      legend: { top: 0, left: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: T.ink2, fontSize: 11 } },
      grid: { left: 36, right: 10, top: 44, bottom: 26 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: axis(T, { type: 'category', data: prios, splitLine: { show: false }, axisLabel: { color: T.ink2 } }),
      yAxis: axis(T, { type: 'value', minInterval: 1, axisLine: { show: false } }),
      series: ['완료', '부분완료', '진행중', '미착수'].map(function (k) {
        return { name: k, type: 'bar', stack: 'p', barWidth: '45%', itemStyle: { color: api.actionColor(k), borderColor: T.surface, borderWidth: 1 },
          data: prios.map(function (pr) { return AC.filter(function (a) { return a.priority === pr && a.status === k; }).length || null; }) };
      })
    });
    var bins = [[0, 7, '~1주'], [8, 14, '~2주'], [15, 28, '~4주'], [29, 999, '4주+']];
    api.chart(el('aLead'), {
      grid: { left: 30, right: 10, top: 16, bottom: 26 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: axis(T, { type: 'category', data: bins.map(function (b) { return b[2]; }), splitLine: { show: false }, axisLabel: { color: T.ink2 } }),
      yAxis: axis(T, { type: 'value', minInterval: 1, axisLine: { show: false } }),
      series: [{ type: 'bar', barWidth: '50%', itemStyle: { color: T.s[0], borderRadius: [4, 4, 0, 0] }, label: { show: true, position: 'top', color: T.ink2, fontSize: 11 },
        data: bins.map(function (b) { return lead.filter(function (x) { return x >= b[0] && x <= b[1]; }).length; }) }]
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
    h += '<div class="tiles">' + tile('추적한 목표', L.length, '건', '기준선 설정 제외', 'hero') +
      tile('달성', ok, '건', pctTxt(ok / L.length * 100)) +
      tile('부분달성·혼합', L.filter(function (l) { return l.eval === '부분달성' || l.eval === '혼합'; }).length, '건', '') +
      tile('미달', L.filter(function (l) { return l.eval === '미달'; }).length, '건', '') +
      tile('수치화된 지표 ' + (R.ann ? ai('AI') : ''), mets.length, '개', '평균 달성률 ' + (mets.length ? Math.round(sum(mets.map(function (m) { return Math.min(m.rate, 200); })) / mets.length) : 0) + '%') + '</div>';
    h += '<div class="grid">';
    h += card('c4', '평가 결과 분포 ' + src(), '원문의 달성평가 표기를 정규화', ch('tEval', 'h280'));
    h += card('c8', '목표 → 결과 → 다음 실행 ' + ai(), '추적 대상(결정·업무·이슈)이 어떤 결과를 거쳐 어떤 후속 조치로 이어졌나', ch('tSankey', 'h280'));
    h += card('c12', '지표별 목표 대비 달성률 ' + (R.ann ? ai() : ai('자동 추출')), '100% = 목표 · 낮을수록 좋은 지표(원가·품절률 등)는 역산 · 점을 누르면 해당 회의',
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
        grid: { left: 200, right: 90, top: 22, bottom: 26 },
        tooltip: { trigger: 'item', formatter: function (pp) { var m = ms[pp.dataIndex]; return '<b>' + Math.round(m.rate) + '%</b> ' + stateIcon(m.state) + ' ' + m.state + '<br>' + api.esc(m.metric) + '<br><span style="color:' + T.muted + '">목표 ' + api.fmt(m.target, 2) + m.unit + ' · 실제 ' + api.fmt(m.actual, 3) + m.unit + (m.lowerBetter ? ' (낮을수록 좋음)' : '') + ' · ' + m.meeting + '</span>'; } },
        xAxis: axis(T, { type: 'value', min: 0, max: function (v) { return Math.max(150, Math.ceil(v.max / 10) * 10); }, axisLabel: { color: T.muted, formatter: '{value}%' } }),
        yAxis: axis(T, { type: 'category', inverse: true, data: ms.map(function (m) { return mno(m.meeting) + ' · ' + m.metric; }), axisLine: { show: false }, axisLabel: { color: T.ink2, fontSize: 11, width: 190, overflow: 'truncate', interval: 0 } }),
        series: [{ type: 'bar', barWidth: 10, data: ms.map(function (m) { return { value: Math.round(m.rate * 10) / 10, mid: m.meeting, itemStyle: { color: stateColor(T, m.state), borderRadius: [0, 4, 4, 0] } }; }),
          label: { show: true, position: 'right', fontSize: 10.5, color: T.ink2, formatter: function (pp) { var m = ms[pp.dataIndex]; return Math.round(m.rate) + '% · ' + api.fmt(m.actual, 2) + m.unit; } },
          markLine: { silent: true, symbol: 'none', lineStyle: { color: T.ink, width: 1.5, type: 'solid' }, label: { formatter: '목표 100%', color: T.muted, fontSize: 10, position: 'start' }, data: [{ xAxis: 100 }] } }]
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
    h += card('c7', '프로젝트 KPI 목표 대비 실제 ' + ai(), '최종(가장 최근) 시점 기준 달성률', ch('kBullet', 'h320'));
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
    api.$$('.kpi', p).forEach(function (c) {
      var fn = function () { kpiSel = c.dataset.k; api.$$('.kpi', p).forEach(function (x) { x.setAttribute('aria-pressed', String(x === c)); }); drawTrend(); };
      c.addEventListener('click', fn); c.addEventListener('keydown', function (e) { if (e.key === 'Enter') fn(); });
    });
    api.chart(el('kBullet'), kpiBulletOpt(api, cards.map(function (c) { return { name: c.k.name, r: c.r, state: c.st, tip: api.fmt(c.last.actual, 2) + c.k.unit + ' / 목표 ' + api.fmt(c.last.target, 2) + c.k.unit + (c.k.lowerBetter ? ' (낮을수록 좋음)' : '') }; }), 130));

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
    h += '<div class="tiles">' + tile('위기', C.length, '건', types.map(function (t) { return t + ' ' + C.filter(function (c) { return c.type === t; }).length; }).join(' · ') || '없음', 'hero') +
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
    h += card('c8', '미결 이슈 라이프사이클 ' + src(), '이슈가 처음 등장한 회의부터 마지막 기록까지 · 색 = 당시 상태 · 흐린 막대 = 후속 기록 없음',
      legend([{ k: '오픈', c: T.serious }, { k: '모니터링', c: T.warning }, { k: '종결', c: T.good }, { k: '부분종결', c: T.s[2] }, { k: '이관', c: T.s[6] }, { k: '후속 미기재', c: T.neutral }]) +
      (I.length ? '<div style="max-height:520px;overflow:auto">' + ch('rLife', 'h480') + '</div>' : empty()));
    h += card('c4', '이슈 현재 상태', '마지막 기록 기준', I.length ? ch('rIss', 'h280') : empty());
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
      var rows = I.slice().reverse();
      var lEl = el('rLife'); lEl.style.height = Math.max(240, rows.length * 20 + 50) + 'px';
      var last = R.all[R.all.length - 1].date;
      var col = { '오픈': T.serious, '모니터링': T.warning, '종결': T.good, '부분종결': T.s[2], '이관': T.s[6] };
      var segs = [];
      rows.forEach(function (it, i) {
        it.history.forEach(function (hh, j) {
          var nx = it.history[j + 1];
          var end = nx ? nx.date : (/종결|이관/.test(hh.status) ? hh.date : hh.date);
          segs.push({ value: [i, hh.date, end, hh.status], it: it, h: hh, point: true });
        });
        if (it.untracked) segs.push({ value: [i, it.last.date, last, '후속 미기재'], it: it, h: it.last, tail: true });
      });
      var cl = api.chart(lEl, {
        grid: { left: 170, right: 24, top: 30, bottom: 10 },
        tooltip: { formatter: function (pp) { var d = pp.data; return '<b>' + d.it.id + '</b> ' + api.esc(d.it.title) + '<br>' + (d.tail ? '마지막 기록 이후 상태 갱신 없음' : d.h.meeting + ' · ' + d.h.raw + (d.h.cond ? '<br><span style="color:' + T.muted + '">' + api.esc(d.h.cond) + '</span>' : '')); } },
        xAxis: axis(T, { type: 'time', position: 'top', axisLabel: { color: T.muted, fontSize: 10.5, formatter: '{yy}.{MM}' } }),
        yAxis: axis(T, { type: 'category', data: rows.map(function (it) { return it.id + '  ' + short(it.title, 10); }), axisLine: { show: false }, splitLine: { show: false }, axisLabel: { color: T.ink2, fontSize: 10.5, interval: 0 } }),
        series: [{
          type: 'custom', encode: { x: [1, 2], y: 0 },
          renderItem: function (params, e) {
            var i = e.value(0), a = e.coord([e.value(1), i]), b = e.coord([e.value(2), i]), st = e.value(3);
            var d = segs[params.dataIndex];
            var hh = e.size([0, 1])[1] * (d.tail ? 0.3 : 0.55);
            var children = [{ type: 'rect', shape: { x: a[0], y: a[1] - hh / 2, width: Math.max(2, b[0] - a[0]), height: hh, r: 2 }, style: { fill: d.tail ? T.neutral : col[st] || T.neutral, opacity: d.tail ? 0.6 : 1 } }];
            if (!d.tail) children.push({ type: 'circle', shape: { cx: a[0], cy: a[1], r: 4 }, style: { fill: col[st] || T.neutral, stroke: T.surface, lineWidth: 2 } });
            return { type: 'group', children: children };
          },
          data: segs
        }]
      });
      if (cl) cl.on('click', function (e) { api.openEntity(e.data.it.id); });
      var ist = issueStatusCounts(R);
      api.chart(el('rIss'), donutOpt(api, ist, I.length, '이슈'));
      addLegendRight(el('rIss'), ist.filter(function (x) { return x.value; }).map(function (x) { return { k: x.k + ' ' + x.value, c: x.c }; }));
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
      return '<div style="display:grid;grid-template-columns:22px 1fr auto;gap:10px;align-items:center;padding:8px 10px;background:var(--surface-2);border-radius:10px"><b style="color:var(--muted)">' + (i + 1) + '</b>' +
        '<span><b>' + api.esc(A.DEPT_SHORT[e.a] || e.a) + ' ↔ ' + api.esc(A.DEPT_SHORT[e.b] || e.b) + '</b><br><span class="note" style="margin:0">공동 업무 ' + e.action + '건 · 같은 논의 ' + e.discussion + '건</span></span><b>' + e.weight + '</b></div>';
    }).join('') + '</div>' + '<p class="note">협업 강도는 원문의 공동 담당자·논의 언급을 규칙 기반으로 집계한 값입니다.</p>');
    h += card('c12', '부서별 핵심 지표', '같은 부서 순서로 네 지표를 나란히 비교 (각 지표는 자기 단위)', ch('dMulti', 'h360'));
    h += card('c6', '부서 × 논의 주제 ' + ai(), '부서가 언급된 논의의 주제 분포', ch('dTopicHeat', 'h360'));
    h += card('c6', '담당자별 업무량', '업무 담당 건수 상위 · 막대 색 = 부서 구분 없이 단일 색', ch('dPeople', 'h360'));
    h += card('c12', '부서 지표 표', '',
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>부서</th><th class="num">회의 참여</th><th class="num">주재</th><th class="num">참여 회의 결정 수</th><th class="num">논의 언급</th><th class="num">업무</th><th class="num">완료율</th><th class="num">지연</th><th>구성원</th></tr></thead><tbody>' +
      D.map(function (d) {
        return '<tr><td><b>' + api.esc(d.dept) + '</b></td><td class="num">' + d.meetings + '</td><td class="num">' + d.chaired + '</td><td class="num">' + d.decisions + '</td><td class="num">' + d.mentions + '</td><td class="num">' + d.actions + '</td><td class="num">' + (d.actions ? d.doneRate + '%' : '-') + '</td><td class="num">' + d.delayed + '</td><td>' + api.esc(d.people.join(', ')) + '</td></tr>';
      }).join('') + '</tbody></table></div>');
    h += '</div>';
    p.innerHTML = h;

    var net = api.chart(el('dNet'), networkOpt(R, api, false));
    if (net) net.on('click', function (e) { if (e.dataType === 'node') api.setFilter('depts', e.name); });

    var cats = D.map(function (d) { return d.short; });
    var mets = [['회의 참여', 'meetings', '회', T.s[0]], ['업무 담당', 'actions', '건', T.s[0]], ['논의 언급', 'mentions', '건', T.s[0]], ['업무 완료율', 'doneRate', '%', T.good]];
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
    api.chart(el('dPeople'), hbarOpt(api, pl.map(function (x) { return x.n + ' · ' + (A.DEPT_SHORT[x.d] || x.d); }), pl.map(function (x) { return x.v; }), { unit: '건', left: 110, color: T.s[0] }));
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
    if (t) out.push({ cat: '자동 분석', icon: 'auto', title: '가장 많이 논의된 주제는 ' + t.key, body: '선택한 회의 ' + R.meetings.length + '건의 논의 중 ' + t.pct + '%가 ' + t.key + ' 주제였습니다. 2위는 ' + (R.topicShare[1] || {}).key + '(' + (R.topicShare[1] || {}).pct + '%)입니다.', metric: t.pct + '%', metricLabel: '주제 점유율', evidence: [] });
    var rec = R.issues.filter(function (i) { return i.mentions >= 3; });
    if (rec.length) out.push({ cat: '자동 분석', icon: 'repeat', title: rec.length + '개 이슈가 3회 이상 반복 등장', body: rec.map(function (i) { return i.id + '(' + i.title + ') ' + i.mentions + '회'; }).join(', ') + '.', metric: rec.length + '건', metricLabel: '반복 이슈', evidence: rec.map(function (i) { return i.id; }) });
    var open = s.decisionByStatus.filter(function (d) { return d.key !== '확정'; });
    var no = sum(open.map(function (d) { return d.value; }));
    if (s.decisions) out.push({ cat: '자동 분석', icon: 'shift', title: '결정의 ' + Math.round(no / s.decisions * 100) + '%가 조건부·잠정·보류', body: '전체 ' + s.decisions + '건 중 ' + open.map(function (d) { return d.key + ' ' + d.value; }).join(', ') + '건입니다. 조건 충족 여부를 후속 회의에서 확인해야 합니다.', metric: Math.round(no / s.decisions * 100) + '%', metricLabel: '미확정 결정 비중', evidence: [] });
    if (s.actions) {
      var worst = R.depts.filter(function (d) { return d.actions >= 3; }).sort(function (a, b) { return a.doneRate - b.doneRate; })[0];
      out.push({ cat: '자동 분석', icon: 'block', title: '업무 완료율 ' + Math.round((s.actionByStatus[0].value) / s.actions * 100) + '%, 지연 ' + s.delayed + '건', body: (worst ? '완료율이 가장 낮은 부서는 ' + worst.dept + '(' + worst.doneRate + '%)입니다. ' : '') + '지연 업무: ' + (R.actions.filter(function (a) { return a.delayed; }).map(function (a) { return a.id; }).join(', ') || '없음') + '.', metric: s.delayed + '건', metricLabel: '지연 업무', evidence: R.actions.filter(function (a) { return a.delayed; }).map(function (a) { return a.id; }) });
    }
    if (s.loops) {
      var ok = s.loopByEval.filter(function (e) { return /달성|초과/.test(e.key) && e.key !== '부분달성'; }).reduce(function (a, e) { return a + e.value; }, 0);
      var bad = R.loops.filter(function (l) { return l.eval === '미달'; });
      out.push({ cat: '자동 분석', icon: 'learn', title: '이전 목표 달성률 ' + Math.round(ok / s.loops * 100) + '%', body: '추적한 목표 ' + s.loops + '건 중 ' + ok + '건을 달성했습니다.' + (bad.length ? ' 미달: ' + bad.map(function (l) { return l.ref + '(' + short(l.target, 18) + ')'; }).join(', ') + '.' : ''), metric: Math.round(ok / s.loops * 100) + '%', metricLabel: '목표 달성률', evidence: bad.map(function (l) { return l.meeting; }) });
    }
    if (R.crises.length) out.push({ cat: '자동 분석', icon: 'alert', title: '긴급 위기 ' + R.crises.length + '건 · 해결 ' + R.crises.filter(function (c) { return c.resolved; }).length + '건', body: R.crises.map(function (c) { return c.type + '(' + c.date + (c.resolved ? ', ' + c.daysToResolve + '일 만에 해결' : ', 진행 중') + ')'; }).join(' / ') + '.', metric: R.crises.length + '건', metricLabel: '긴급 위기', evidence: R.crises.map(function (c) { return c.meeting; }) });
    if (s.untrackedIssues) out.push({ cat: '자동 분석', icon: 'alert', title: '이슈 ' + s.untrackedIssues + '건이 종결 기록 없이 사라짐', body: '이후 회의록에 상태 갱신이 없는 이슈입니다: ' + R.issues.filter(function (i) { return i.untracked; }).slice(0, 6).map(function (i) { return i.id; }).join(', ') + (s.untrackedIssues > 6 ? ' 외' : '') + '.', metric: s.untrackedIssues + '건', metricLabel: '후속 미기재', evidence: R.issues.filter(function (i) { return i.untracked; }).slice(0, 6).map(function (i) { return i.id; }) });
    var e = R.edges[0];
    if (e) out.push({ cat: '자동 분석', icon: 'summary', title: '가장 긴밀한 협업: ' + (A.DEPT_SHORT[e.a] || e.a) + ' ↔ ' + (A.DEPT_SHORT[e.b] || e.b), body: '공동 업무 ' + e.action + '건, 같은 논의 ' + e.discussion + '건으로 협업 강도가 가장 높았습니다.', metric: String(e.weight), metricLabel: '협업 강도', evidence: [] });
    return out;
  }

  function insCard(i, api) {
    return '<div class="ins cat-' + i.cat.replace(/\s/g, '-') + '"><div class="cat">' + (ICONS[i.icon] || ICONS.auto) + api.esc(i.cat) + '</div>' +
      '<div class="metric"><b>' + api.esc(i.metric) + '</b><span>' + api.esc(i.metricLabel || '') + '</span></div><h4>' + api.esc(i.title) + '</h4><p>' + api.esc(i.body) + '</p>' +
      (i.evidence && i.evidence.length ? '<div class="ev"><span class="note" style="margin:0 4px 0 0">근거</span>' + api.chips(i.evidence.join(' ')) + '</div>' : '') + '</div>';
  }

  function insight(p, R, api) {
    var cur = R.ann ? R.ann.insights : [];
    var auto = autoInsights(R, api);
    var cats = api.uniq(cur.map(function (i) { return i.cat; }));
    var h = head('AI 인사이트', '단순 요약(무슨 일이 있었나)과 인사이트(그래서 무엇을 해야 하나)를 구분합니다. 모든 인사이트에는 근거 회의·ID가 달려 있습니다.');
    h += '<div class="summary-vs" style="margin-bottom:14px"><div class="sv"><h5>요약 (Summary)</h5><p>“11/13 회의에서 광고 CTR 1.46%를 기록했다.” — 기록된 사실을 줄인 것</p></div>' +
      '<div class="sv"><h5>인사이트 (Insight)</h5><p>“UGC 소재 CTR이 설명형의 2.3배 → 다음 캠페인은 UGC 비중 확대가 필요하다.” — 여러 회의를 교차해 패턴·원인·행동을 도출한 것</p></div></div>';
    if (cur.length) {
      h += '<div class="panel-head" style="margin-top:6px"><div><h2 style="font-size:16px">원문 교차 분석 인사이트 ' + ai() + '</h2><p>전체 회의록 기준 · ' + cur.length + '개</p></div></div>';
      cats.forEach(function (c) {
        h += '<div style="margin:14px 0 8px;font-size:13px;font-weight:800">' + api.esc(c) + '</div><div class="insights">' + cur.filter(function (i) { return i.cat === c; }).map(function (i) { return insCard(i, api); }).join('') + '</div>';
      });
    }
    h += '<div class="panel-head" style="margin-top:22px"><div><h2 style="font-size:16px">필터 반영 자동 인사이트 ' + ai('규칙 기반') + '</h2><p>현재 선택한 회의 ' + R.meetings.length + '건으로 실시간 계산 · 업로드한 회의록에도 적용됩니다</p></div></div>';
    h += auto.length ? '<div class="insights">' + auto.map(function (i) { return insCard(i, api); }).join('') + '</div>' : empty();
    p.innerHTML = h;
    api.bindChips(p);
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
    h += card('c5', '차년도 KPI ' + src(), 'D-061 승인 목표 · 올해 실적 대비 성장률', ch('nKpi', 'h240') + '<div class="tbl-wrap" style="margin-top:8px"><table class="tbl"><thead><tr><th>KPI</th><th class="num">2026–27 실적</th><th class="num">2027 목표</th></tr></thead><tbody>' +
      ny.kpis.map(function (k) { return '<tr><td>' + api.esc(k.name) + '</td><td class="num">' + api.fmt(k.thisYear, 2) + k.unit + '</td><td class="num"><b>' + api.fmt(k.next, 2) + k.unit + '</b></td></tr>'; }).join('') + '</tbody></table></div>');
    h += card('c6', '예상 리스크 매트릭스 ' + ai(), '발생 가능성 × 영향도 (1–5, AI 추정) · 오른쪽 위일수록 우선 대응', ch('nRisk', 'h320'));
    h += card('c6', '우선 추진과제', '원문의 차년도 착수 업무와 승인 결정', '<div class="prio">' + ny.priorities.slice().sort(function (a, b) { return a.due.localeCompare(b.due); }).map(function (x, i) {
      return '<div class="prio-item"><span class="n">' + (i + 1) + '</span><div><b>' + api.esc(x.title) + '</b><span>' + api.esc(x.owner) + ' · 기한 ' + api.esc(x.due) + '</span></div>' + api.chips(x.id) + '</div>';
    }).join('') + '</div>');
    h += card('c12', 'KPT 회고 (ML-OL-019) ' + src(), '차년도 전략의 입력 데이터', '<div class="kpt">' + ['Keep', 'Problem', 'Try'].map(function (k) {
      return '<div><h5>' + k + '</h5><ul>' + ny.kpt[k].map(function (x) { return '<li>' + api.esc(x) + '</li>'; }).join('') + '</ul></div>';
    }).join('') + '</div>');
    h += '</div>';
    p.innerHTML = h;
    api.bindChips(p);
    api.chart(el('nKpi'), nextKpiOpt(api, ny.kpis, false));
    api.chart(el('nRisk'), {
      grid: { left: 50, right: 30, top: 16, bottom: 44 },
      tooltip: { formatter: function (pp) { var r = pp.data.r; return '<b>' + api.esc(r.name) + '</b><br>가능성 ' + r.prob + ' · 영향 ' + r.level + '<br><span style="color:' + T.muted + '">' + api.esc(r.note) + ' · ' + r.ev + '</span>'; } },
      xAxis: axis(T, { type: 'value', name: '발생 가능성', nameLocation: 'middle', nameGap: 28, nameTextStyle: { color: T.muted }, min: 1, max: 5, interval: 1 }),
      yAxis: axis(T, { type: 'value', name: '영향도', nameTextStyle: { color: T.muted }, min: 1, max: 5, interval: 1 }),
      series: [{ type: 'scatter', symbolSize: 18,
        data: ny.risks.map(function (r, i) { var sc = r.level * r.prob; return { value: [r.prob + (i % 2 ? 0.08 : -0.08), r.level], r: r, id: r.ev, itemStyle: { color: sc >= 12 ? T.critical : sc >= 9 ? T.serious : T.warning, borderColor: T.surface, borderWidth: 2 } }; }),
        label: { show: true, position: 'right', color: T.ink2, fontSize: 11, formatter: function (pp) { return short(pp.data.r.name, 12); } },
        markArea: { silent: true, itemStyle: { color: T.critical, opacity: 0.06 }, data: [[{ coord: [3.5, 3.5] }, { coord: [5, 5] }]] } }]
    });
  }

  window.Views = { overview: overview, basic: basic, flow: flow, discussion: discussion, decision: decision, action: action, tracking: tracking, kpi: kpi, risk: risk, dept: dept, insight: insight, next: next };
})();
