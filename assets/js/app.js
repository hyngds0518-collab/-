/*
 * 회의록 분석 대시보드 - 앱 코어
 * 상태·필터 바·탭·상세 드로어·업로드를 담당하고, 각 탭 화면은 views.js 가 그린다.
 */
(function () {
  'use strict';
  var A = window.MeetingAnalytics;
  var STORE_KEY = 'meeting-dashboard:v1';

  // ---------- 상태 ----------
  var S = {
    base: tag(clone((window.BASE_DATA || {}).meetings || []), 'base'),
    uploaded: [],
    includeBase: true,
    tab: 'overview',
    f: emptyFilters(),
    R: null,
    all: []
  };
  function emptyFilters() {
    return { from: '', to: '', nature: [], types: [], phases: [], places: [], depts: [], people: [], meetings: [], q: '', source: [] };
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function tag(ms, src) { ms.forEach(function (m) { m.source = src; }); return ms; }

  function store(fn) { try { return fn(window.localStorage); } catch (e) { return null; } }
  store(function (ls) {
    var saved = JSON.parse(ls.getItem(STORE_KEY) || 'null');
    if (saved) {
      S.uploaded = tag(saved.uploaded || [], 'upload');
      S.includeBase = saved.includeBase !== false;
      if (saved.tab) S.tab = saved.tab;
      if (saved.theme) document.documentElement.setAttribute('data-theme', saved.theme);
    }
  });
  function persist() {
    store(function (ls) {
      ls.setItem(STORE_KEY, JSON.stringify({ uploaded: S.uploaded, includeBase: S.includeBase, tab: S.tab, theme: document.documentElement.getAttribute('data-theme') || '' }));
    });
  }

  // ---------- 유틸 ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function $(sel, el) { return (el || document).querySelector(sel); }
  function $$(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  function fmt(n, d) {
    if (n == null || isNaN(n)) return '-';
    return Number(n).toLocaleString('ko-KR', { maximumFractionDigits: d == null ? 1 : d });
  }
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  function uniq(a) { return a.filter(function (v, i) { return a.indexOf(v) === i; }); }

  // ---------- 데이터셋 ----------
  function dataset() {
    var map = {};
    if (S.includeBase) S.base.forEach(function (m) { map[m.id] = m; });
    S.uploaded.forEach(function (m) { map[m.id] = m; });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  function meetingText(m) {
    return [m.id, m.title, m.stage, m.place, m.chair, m.recorder, m.purpose, m.agendaRaw, m.reason]
      .concat(m.discussions.map(function (d) { return d.topic + ' ' + d.discussion + ' ' + d.dissent + ' ' + d.conclusion; }))
      .concat(m.decisions.map(function (d) { return d.id + ' ' + d.text; }))
      .concat(m.actions.map(function (a) { return a.id + ' ' + a.task + ' ' + a.owners.join(' '); }))
      .concat(m.issues.map(function (i) { return i.id + ' ' + i.text; })).join(' ').toLowerCase();
  }

  function applyFilters(all) {
    var f = S.f;
    return all.filter(function (m) {
      if (f.from && m.date < f.from) return false;
      if (f.to && m.date > f.to) return false;
      if (f.nature.length && f.nature.indexOf(m.nature) < 0) return false;
      if (f.types.length && !m.types.some(function (t) { return f.types.indexOf(t) >= 0; })) return false;
      if (f.phases.length && f.phases.indexOf(m.phase) < 0) return false;
      if (f.places.length && f.places.indexOf(m.site.key) < 0) return false;
      if (f.depts.length && !m.depts.some(function (d) { return f.depts.indexOf(d) >= 0; })) return false;
      if (f.people.length && !m.attendees.some(function (a) { return f.people.indexOf(a.name) >= 0; })) return false;
      if (f.meetings.length && f.meetings.indexOf(m.id) < 0) return false;
      if (f.source.length && f.source.indexOf(m.source) < 0) return false;
      if (f.q && meetingText(m).indexOf(f.q.toLowerCase()) < 0) return false;
      return true;
    });
  }

  function recompute() {
    var all = clone(dataset());
    // 분류(유형·단계)는 전체 기준으로 먼저 붙인다
    A.analyze(all, { all: all });
    S.all = all;
    var view = applyFilters(all);
    S.R = A.analyze(view, { all: all });
    S.R.all = all;
    S.R.ann = annotationsFor(all);
    S.R.filtered = view.length !== all.length;
  }

  // AI 분석 레이어는 원본 데이터셋 회의가 있을 때만 적용
  function annotationsFor(all) {
    var ann = window.AI_ANNOTATIONS;
    if (!ann) return null;
    var has = all.some(function (m) { return m.source === 'base' && m.id.indexOf(ann.dataset) === 0; });
    return has ? ann : null;
  }

  // ---------- 필터 바 ----------
  var ICON_CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>';
  var NATURE_GLYPH = { '정기': '●', '임시': '▲', '긴급': '⚠' };

  function renderFilterBar() {
    var all = S.all, f = S.f;
    var dates = all.map(function (m) { return m.date; }).filter(Boolean).sort();
    var people = uniq([].concat.apply([], all.map(function (m) { return m.attendees.map(function (a) { return a.name; }); })));
    var deptsList = uniq([].concat.apply([], all.map(function (m) { return m.depts; })));
    var order = A.DEPTS;
    deptsList.sort(function (a, b) { return (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99); });
    var hasUpload = S.uploaded.length > 0;

    var h = '';
    h += '<span class="date-range">' + window.Icons.icon('calendar', 15) +
      '<input type="date" class="date-in" id="fFrom" aria-label="시작일" value="' + esc(f.from) + '" min="' + esc(dates[0] || '') + '" max="' + esc(dates[dates.length - 1] || '') + '">' +
      '<span style="color:var(--muted)">–</span>' +
      '<input type="date" class="date-in" id="fTo" aria-label="종료일" value="' + esc(f.to) + '" min="' + esc(dates[0] || '') + '" max="' + esc(dates[dates.length - 1] || '') + '"></span>';
    h += '<span class="seg" role="group" aria-label="회의 성격">' + A.NATURES.map(function (n) {
      return '<button type="button" class="chip" data-fk="nature" data-fv="' + n + '" aria-pressed="' + (f.nature.indexOf(n) >= 0) + '"><span class="glyph" style="color:' + natureColor(n) + '">' + NATURE_GLYPH[n] + '</span>' + n + '</button>';
    }).join('') + '</span>';
    h += dd('types', '회의 유형', A.TYPES);
    h += dd('phases', '프로젝트 단계', A.PHASES);
    h += dd('places', '회의 장소', uniq(all.map(function (m) { return m.site.key; })).sort());
    h += dd('depts', '참석 부서', deptsList);
    h += dd('people', '참석자', people);
    h += dd('meetings', '회의', all.map(function (m) { return m.id; }), function (id) {
      var m = all.filter(function (x) { return x.id === id; })[0];
      return id.replace(/^.*-(\d+)$/, '$1') + ' · ' + (m ? m.title : '');
    });
    if (hasUpload) h += dd('source', '데이터', ['base', 'upload'], function (v) { return v === 'base' ? '원본 회의록' : '업로드 회의록'; });
    h += '<span class="filter-status" id="fStatus"></span>';
    $('#filterBar').innerHTML = h;
    updateFilterStatus();

    $('#fFrom').addEventListener('change', function (e) { S.f.from = e.target.value; refresh(); });
    $('#fTo').addEventListener('change', function (e) { S.f.to = e.target.value; refresh(); });
    $('#fQ').value = f.q;
    $$('.chip[data-fk]', $('#filterBar')).forEach(function (b) {
      b.addEventListener('click', function () { toggleFilter(b.dataset.fk, b.dataset.fv); refresh(); });
    });
    $$('.dd', $('#filterBar')).forEach(bindDropdown);
  }

  function dd(key, label, options, labelFn) {
    var sel = S.f[key];
    return '<div class="dd" data-key="' + key + '"><button type="button" class="dd-btn" aria-haspopup="true" aria-expanded="false">' + esc(label) +
      (sel.length ? '<span class="count">' + sel.length + '</span>' : '') + ICON_CHEV + '</button>' +
      '<div class="dd-panel" hidden>' + options.map(function (o) {
        return '<label><input type="checkbox" value="' + esc(o) + '"' + (sel.indexOf(o) >= 0 ? ' checked' : '') + '> ' + esc(labelFn ? labelFn(o) : o) + '</label>';
      }).join('') + '<div class="dd-foot"><button type="button" data-act="clear">선택 해제</button><button type="button" data-act="close">완료</button></div></div></div>';
  }

  function bindDropdown(el) {
    var btn = $('.dd-btn', el), panel = $('.dd-panel', el), key = el.dataset.key;
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = panel.hidden;
      $$('.dd-panel').forEach(function (p) { p.hidden = true; });
      panel.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      if (open) {
        var r = btn.getBoundingClientRect();
        panel.style.left = r.left + 260 > window.innerWidth ? 'auto' : '0';
        panel.style.right = r.left + 260 > window.innerWidth ? '0' : 'auto';
      }
    });
    panel.addEventListener('click', function (e) { e.stopPropagation(); });
    $$('input', panel).forEach(function (cb) {
      cb.addEventListener('change', function () {
        S.f[key] = $$('input:checked', panel).map(function (x) { return x.value; });
        refresh(true);
        var c = $('.count', btn);
        if (S.f[key].length) { if (!c) { c = document.createElement('span'); c.className = 'count'; btn.insertBefore(c, btn.lastChild); } c.textContent = S.f[key].length; }
        else if (c) c.remove();
      });
    });
    $('[data-act="clear"]', panel).addEventListener('click', function () { S.f[key] = []; refresh(); });
    $('[data-act="close"]', panel).addEventListener('click', function () { panel.hidden = true; });
  }
  document.addEventListener('click', function () { $$('.dd-panel').forEach(function (p) { p.hidden = true; }); });

  function toggleFilter(k, v) {
    var a = S.f[k], i = a.indexOf(v);
    if (i >= 0) a.splice(i, 1); else a.push(v);
  }

  function updateFilterStatus() {
    var n = S.R.meetings.length, t = S.all.length;
    var active = S.f.from || S.f.to || S.f.q || ['nature', 'types', 'phases', 'places', 'depts', 'people', 'meetings', 'source'].some(function (k) { return S.f[k].length; });
    var selTxt = S.f.meetings.length === 1 && !S.f.nature.length && !S.f.types.length ? '<span class="sel-banner">' + window.Icons.icon('calendar', 13) + esc(S.f.meetings[0]) + ' 선택됨</span>' : '';
    $('#fStatus').innerHTML = selTxt + '<span><b>' + n + '</b> / ' + t + '건</span>' + (active ? '<button type="button" class="link-btn" id="fReset">필터 초기화</button>' : '');
    var r = $('#fReset');
    if (r) r.addEventListener('click', function () { S.f = emptyFilters(); refresh(); });
  }

  // ---------- 탭 ----------
  var TABS = [
    ['overview', '개요', 'dashboard', '대시보드'], ['basic', '회의 기본정보', 'file'], ['meetings', '회의 목록', 'agenda', null, 'foot'], ['flow', '프로젝트 흐름', 'route'],
    ['discussion', '안건·논의', 'chat', '분석'], ['decision', '의사결정', 'gavel'], ['action', '실행 관리', 'list'], ['tracking', '성과 추적', 'target'],
    ['kpi', 'KPI 성과', 'trend'], ['risk', '위기·리스크', 'shield'], ['dept', '부서 분석', 'users'],
    ['insight', 'AI 인사이트', 'sparkles', '인사이트'], ['next', '차년도 기획', 'flag']
  ];
  function renderTabs() {
    var I = window.Icons.icon;
    $('#tabs').innerHTML = TABS.filter(function (t) { return !t[4]; }).map(function (t) {
      var cnt = t[0] === 'risk' && S.R ? S.R.summary.crises : t[0] === 'insight' && S.R && S.R.ann ? S.R.ann.insights.length : 0;
      return (t[3] ? '<div class="nav-sep">' + t[3] + '</div>' : '') +
        '<button type="button" class="tab" role="tab" data-tab="' + t[0] + '" aria-selected="' + (S.tab === t[0]) + '">' + I(t[2], 18) + '<span>' + t[1] + '</span>' +
        (cnt ? '<span class="cnt">' + cnt + '</span>' : '') + '</button>';
    }).join('');
    $$('.tab').forEach(function (b) { b.addEventListener('click', function () { go(b.dataset.tab); }); });
  }
  function go(tab) {
    S.tab = tab; persist();
    $$('.tab').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.tab === tab)); });
    var sm = $('#sideMeetings'); if (sm) sm.setAttribute('aria-current', tab === 'meetings' ? 'page' : 'false');
    var active = $('.tab[aria-selected="true"]');
    if (active && window.innerWidth <= 980) active.scrollIntoView({ block: 'nearest', inline: 'center' });
    var t = TABS.filter(function (x) { return x[0] === tab; })[0];
    $('#pageTitle').textContent = t ? t[1] : '';
    renderPanel();
    window.scrollTo({ top: 0 });
  }

  function renderPanel() {
    disposeCharts();
    var main = $('#main');
    var fn = window.Views && window.Views[S.tab];
    main.innerHTML = '<section class="panel active" id="panel-' + S.tab + '"></section>';
    if (fn) fn($('#panel-' + S.tab), S.R, API);
  }

  // ---------- 차트 ----------
  var charts = [];
  function disposeCharts() { charts.forEach(function (c) { try { c.dispose(); } catch (e) { /* noop */ } }); charts = []; }
  function tokens() {
    var cs = getComputedStyle(document.documentElement);
    var g = function (n) { return cs.getPropertyValue(n).trim(); };
    return {
      ink: g('--ink'), ink2: g('--ink-2'), muted: g('--muted'), grid: g('--grid'), axis: g('--axis'), surface: g('--surface'), surface2: g('--surface-2'),
      s: [g('--s1'), g('--s2'), g('--s3'), g('--s4'), g('--s5'), g('--s6'), g('--s7'), g('--s8')],
      good: g('--good'), warning: g('--warning'), serious: g('--serious'), critical: g('--critical'), goodInk: g('--good-ink'), neutral: g('--neutral'),
      seq: [g('--seq-1'), g('--seq-2'), g('--seq-3'), g('--seq-4'), g('--seq-5'), g('--seq-6'), g('--seq-7')], font: g('--font'),
      dark: document.documentElement.getAttribute('data-theme') === 'dark' ||
        (document.documentElement.getAttribute('data-theme') !== 'light' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
    };
  }
  function chart(el, option) {
    if (!el || !window.echarts) { if (el) el.innerHTML = '<div class="empty">차트 라이브러리를 불러오지 못했습니다 (네트워크 확인)</div>'; return null; }
    var T = tokens();
    var c = window.echarts.init(el, null, { renderer: 'canvas' });
    var base = {
      textStyle: { fontFamily: T.font, color: T.ink2, fontSize: 11.5 },
      animationDuration: 500,
      tooltip: {
        backgroundColor: T.surface, borderColor: T.grid, borderWidth: 1, padding: [8, 10],
        textStyle: { color: T.ink, fontSize: 12, fontFamily: T.font }, extraCssText: 'box-shadow:0 6px 20px rgba(0,0,0,.12);border-radius:10px;max-width:320px;white-space:normal;',
        confine: true
      }
    };
    option = deepMerge(base, option);
    c.setOption(option);
    charts.push(c);
    return c;
  }
  function deepMerge(a, b) {
    var out = Array.isArray(a) ? a.slice() : Object.assign({}, a);
    Object.keys(b || {}).forEach(function (k) {
      if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) out[k] = deepMerge(a[k], b[k]);
      else out[k] = b[k];
    });
    return out;
  }
  var rT;
  window.addEventListener('resize', function () { clearTimeout(rT); rT = setTimeout(function () { charts.forEach(function (c) { c.resize(); }); }, 120); });

  // 의미 색상
  function natureColor(n) { var T = tokens(); return n === '긴급' ? T.critical : n === '임시' ? T.s[1] : T.s[0]; }

  // ---------- 드로어 ----------
  function openDrawer(title, sub, body) {
    $('#drawerTitle').textContent = title;
    $('#drawerSub').innerHTML = sub || '';
    $('#drawerBody').innerHTML = body;
    $('#drawer').classList.add('open'); $('#drawerBg').classList.add('open');
    $('#drawer').setAttribute('aria-hidden', 'false');
    bindChips($('#drawer'));
    $('#drawerClose').focus();
  }
  function closeDrawer() {
    $('#drawer').classList.remove('open'); $('#drawerBg').classList.remove('open');
    $('#drawer').setAttribute('aria-hidden', 'true');
  }
  $('#drawerClose').addEventListener('click', closeDrawer);
  $('#drawerBg').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeDrawer(); closeModal(); } });

  function findMeeting(id) { return S.all.filter(function (m) { return m.id === id; })[0]; }
  function meetingOfEntity(id) {
    return S.all.filter(function (m) {
      return m.decisions.some(function (d) { return d.id === id; }) || m.actions.some(function (a) { return a.id === id; });
    })[0];
  }

  function meetingSub(m) {
    return '<span class="nature-tag nature-' + esc(m.nature) + '">' + NATURE_GLYPH[m.nature] + ' ' + esc(m.nature) + '</span>' +
      m.types.map(function (t) { return '<span class="pill">' + esc(t) + '</span>'; }).join('') +
      '<span>' + esc(m.datetime) + '</span><span>· ' + esc(m.place) + '</span>' + (m.source === 'upload' ? '<span class="badge-src">업로드</span>' : '');
  }
  function openMeeting(id, focusId) {
    var m = findMeeting(id);
    if (!m) { toast(id + ' 회의가 현재 데이터에 없습니다'); return; }
    openDrawer(m.id + ' · ' + m.title, meetingSub(m), meetingHTML(m));
    if (focusId) {
      var el = $('[data-eid="' + focusId + '"]', $('#drawer'));
      if (el) { el.classList.add('hl'); setTimeout(function () { el.scrollIntoView({ block: 'center' }); }, 60); }
    }
  }
  // 회의록 전체 구조 HTML (드로어·개요 펼침 공용)
  function meetingHTML(m, wide) {
    var W = wide ? ' wide' : '';
    var b = '';
    b += '<div class="dsec' + W + '"><h4>참석자 ' + m.attendees.length + '명</h4><div class="att-list">' + m.attendees.map(function (a) {
      return '<span class="att">' + avatar(a.name, 'xs') + esc(a.name) + ' <small>' + esc(a.role) + '</small></span>';
    }).join('') + '</div></div>';
    b += '<div class="dsec"><h4>기본정보</h4><dl class="kv">' +
      kv('회의번호', m.id) + kv('프로젝트 단계', m.stage + ' → ' + m.phase) + kv('장소', m.place) + kv('주재자', m.chair) + kv('기록자', m.recorder) +
      kv('소집 사유', m.reason) + kv('목적', m.purpose) + kv('참석 부서', m.depts.join(' · ')) +
      kv('안건', m.agenda.map(function (a, i) { return (i + 1) + '. ' + a; }).join('  ')) +
      '</dl></div>';
    if (m.closedLoop.length) b += '<div class="dsec"><h4>01 이전 실행 성과 피드백</h4>' + m.closedLoop.map(function (c) {
      return '<div class="ditem"><div class="h">' + chips(c.ref) + evalPill(A.evalBucket(c.eval), c.eval) + '</div><p><b>목표</b> ' + esc(c.target) + '</p><p><b>결과</b> ' + esc(c.result) + '</p><p><b>반영</b> ' + esc(c.next) + '</p></div>';
    }).join('') + '</div>';
    b += '<div class="dsec"><h4>02 연계 · 데이터 기준</h4><dl class="kv">' + kv('전 회의 연계', m.link.prev) + kv('이전 Action', m.link.prevActionStatus) + kv('핵심 KPI', m.link.kpi) + kv('데이터 기준', m.link.dataBasis) + '</dl></div>';
    if (m.discussions.length) b += '<div class="dsec' + W + '"><h4>03 안건별 논의 · 이견 · 결론</h4>' + m.discussions.map(function (d) {
      return '<div class="ditem"><div class="h"><b>' + esc(d.topic) + '</b></div><p><b>논의</b> ' + esc(d.discussion) + '</p><p><b>이견·대안</b> ' + esc(d.dissent) + '</p><p><b>결론</b> ' + esc(d.conclusion) + '</p></div>';
    }).join('') + '</div>';
    if (m.decisions.length) b += '<div class="dsec"><h4>04 결정사항</h4>' + m.decisions.map(function (d) {
      return '<div class="ditem" data-eid="' + d.id + '"><div class="h"><span class="idchip">' + d.id + '</span>' + decisionPill(A.decisionBucket(d.status), d.status) + '</div><p><b>' + esc(d.text) + '</b></p>' + (d.condition ? '<p>조건·재검토: ' + esc(d.condition) + '</p>' : '') + '</div>';
    }).join('') + (m.reserved ? '<div class="ditem"><p><b>유보사항</b> ' + esc(m.reserved) + '</p></div>' : '') + '</div>';
    if (m.issues.length) b += '<div class="dsec"><h4>05 미결 이슈</h4>' + m.issues.map(function (i) {
      return '<div class="ditem" data-eid="' + i.id + '"><div class="h"><span class="idchip">' + i.id + '</span><span class="pill">' + esc(i.status) + '</span><span class="pill">' + esc(i.owner) + '</span></div><p><b>' + esc(i.text) + '</b></p><p>종결/재검토: ' + esc(i.condition) + '</p></div>';
    }).join('') + '</div>';
    if (m.crisis) b += '<div class="dsec"><h4>05A 위기관리 · 재발방지</h4><dl class="kv">' + kv('사건', m.crisis.event) + kv('즉시 통제', m.crisis.control) + kv('원인', m.crisis.cause) + kv('재발방지', m.crisis.prevention) + kv('종결 기준', m.crisis.closure) + '</dl></div>';
    if (m.actions.length) {
      var acts = S.R.actions.concat([]);
      b += '<div class="dsec"><h4>06 업무지시사항</h4>' + m.actions.map(function (a) {
        var t = acts.filter(function (x) { return x.id === a.id; })[0];
        return '<div class="ditem" data-eid="' + a.id + '"><div class="h"><span class="idchip">' + a.id + '</span><span class="pill">' + esc(a.priority) + '</span><span class="pill">마감 ' + esc(a.due) + '</span>' +
          (t ? actionPill(t.status, t.delayed) : '') + '</div><p><b>' + esc(a.task) + '</b></p><p>담당 ' + esc(a.owners.join(', ')) + ' · 완료 기준: ' + esc(a.criteria) + '</p>' +
          (t && t.followNote ? '<p>후속 기록(' + esc(t.followMeeting) + '): ' + esc(t.followNote) + '</p>' : '') + '</div>';
      }).join('') + '</div>';
    }
    b += '<div class="dsec"><h4>07 후속 · 08 문서</h4><dl class="kv">' + kv('향후 일정', m.schedule) + kv('후속조치', m.followup) + kv('다음 회의', m.nextMeeting) + kv('참고자료', m.refs) + kv('작성·승인', m.approval) + '</dl></div>';
    return b;
  }

  // 인물 아바타 (일러스트 없으면 이니셜)
  function avatar(name, size) {
    var src = (window.AVATARS || {})[name];
    var cls = 'av' + (size ? ' ' + size : '');
    if (src) return '<img class="' + cls + '" src="' + src + '" alt="' + esc(name) + '" loading="lazy">';
    var hue = 0; for (var i = 0; i < String(name).length; i++) hue = (hue * 31 + String(name).charCodeAt(i)) % 360;
    return '<span class="' + cls + '" style="background:hsl(' + hue + ' 70% 92%);color:hsl(' + hue + ' 45% 35%)">' + esc(String(name).slice(-2)) + '</span>';
  }
  function kv(k, v) { return v ? '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>' : ''; }

  // D-/A-/OI-/회의 ID → 해당 회의 드로어
  function openEntity(id) {
    id = String(id).trim();
    if (/^OI-\d+/.test(id)) {
      var it = S.R.issues.filter(function (i) { return i.id === id; })[0];
      var allIssues = it ? null : A.analyze(S.all, { all: S.all }).issues.filter(function (i) { return i.id === id; })[0];
      it = it || allIssues;
      if (!it) { toast(id + ' 이슈를 찾을 수 없습니다'); return; }
      openMeeting(it.first.meeting, id); return;
    }
    if (/^(D|A)-\d+/.test(id)) {
      var m = meetingOfEntity(id);
      if (m) openMeeting(m.id, id); else toast(id + '을(를) 찾을 수 없습니다');
      return;
    }
    if (findMeeting(id)) { openMeeting(id); return; }
    toast(id + ' 항목은 원문 요약 지표입니다');
  }

  function chips(text) {
    var ids = String(text || '').match(/(ML-[A-Z]+-\d{3}|D-\d{3}|A-\d{3}|OI-\d{3})/g);
    if (!ids) return '<span class="pill">' + esc(text) + '</span>';
    return uniq(ids).map(function (id) { return '<span class="idchip" data-id="' + id + '" role="button" tabindex="0">' + id + '</span>'; }).join('');
  }
  function bindChips(root) {
    $$('.idchip[data-id]', root).forEach(function (c) {
      if (c._b) return; c._b = true;
      c.addEventListener('click', function (e) { e.stopPropagation(); openEntity(c.dataset.id); });
      c.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEntity(c.dataset.id); } });
    });
  }

  // 상태 알약
  var EVAL_COLOR = { '초과': 'goodInk', '달성': 'good', '달성(주의)': 'warning', '부분달성': 'warning', '혼합': 'serious', '미달': 'critical' };
  function evalColor(k) { var T = tokens(); return T[EVAL_COLOR[k]] || T.neutral; }
  function evalPill(k, raw) { return '<span class="st"><i style="background:' + evalColor(k) + '"></i>' + esc(raw || k) + '</span>'; }
  var DEC_COLOR = { '확정': 0, '조건부': 2, '잠정': 3 };
  function decisionColor(k) { var T = tokens(); return k in DEC_COLOR ? T.s[DEC_COLOR[k]] : T.neutral; }
  function decisionPill(k, raw) { return '<span class="st"><i style="background:' + decisionColor(k) + '"></i>' + esc(raw || k) + '</span>'; }
  function actionColor(k) { var T = tokens(); return { '완료': T.good, '부분완료': T.warning, '진행중': T.s[0], '미착수': T.neutral }[k] || T.neutral; }
  function actionPill(k, delayed) {
    return '<span class="st"><i style="background:' + actionColor(k) + '"></i>' + esc(k) + '</span>' + (delayed ? '<span class="st" style="color:var(--critical-ink)">⚠ 지연</span>' : '');
  }

  // ---------- 업로드 ----------
  var PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs';
  var PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs';
  var pdfjsPromise = null;
  function loadPdfjs() {
    if (!pdfjsPromise) {
      // 다른 출처의 워커는 pdf.js 가 blob 래퍼로 띄우고, 실패하면 메인 스레드(fake worker)로 자동 전환한다
      pdfjsPromise = import(PDFJS_URL).then(function (lib) {
        lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
        return lib;
      });
      pdfjsPromise.catch(function () { pdfjsPromise = null; });
    }
    return pdfjsPromise;
  }

  function openModal() { $('#modalBg').classList.add('open'); renderUploadedList(); $('#drop').focus(); }
  function closeModal() { $('#modalBg').classList.remove('open'); }
  function log(msg, cls) { var d = document.createElement('div'); d.className = cls || ''; d.textContent = msg; $('#upLog').appendChild(d); }

  function renderUploadedList() {
    var el = $('#uploadedList');
    if (!S.uploaded.length) { el.innerHTML = '<span class="note">업로드한 회의록이 없습니다.</span>'; return; }
    el.innerHTML = '<b>업로드한 회의록 ' + S.uploaded.length + '건</b>' + S.uploaded.map(function (m) {
      return '<div><span>' + esc(m.id) + ' · ' + esc(m.title) + '</span><span class="note">' + esc(m.date) + '</span></div>';
    }).join('') + '<label style="display:flex;gap:6px;margin-top:8px"><input type="checkbox" id="incBase"' + (S.includeBase ? ' checked' : '') + '> 원본 회의록(기본 데이터)도 함께 보기</label>';
    $('#incBase').addEventListener('change', function (e) { S.includeBase = e.target.checked; persist(); fullRefresh(); });
  }

  function handleFiles(files) {
    files = Array.prototype.slice.call(files || []);
    if (!files.length) return;
    $('#upLog').innerHTML = '';
    var mode = ($('input[name="upMode"]:checked') || {}).value || 'add';
    var added = [];
    var seq = Promise.resolve();
    files.forEach(function (file) {
      seq = seq.then(function () {
        log('처리 중: ' + file.name);
        if (/\.json$/i.test(file.name) || file.type === 'application/json') {
          return file.text().then(function (t) {
            var j = JSON.parse(t);
            var ms = Array.isArray(j) ? j : (j.meetings || []);
            if (!ms.length || !ms[0].id) throw new Error('회의 배열을 찾지 못했습니다');
            added = added.concat(ms); log('✓ ' + file.name + ': 회의 ' + ms.length + '건', 'ok');
          });
        }
        return loadPdfjs().then(function (lib) {
          return file.arrayBuffer().then(function (buf) { return window.MeetingParser.parsePdf(lib, new Uint8Array(buf)); });
        }).then(function (ms) {
          if (!ms.length) throw new Error('표준 양식의 회의 블록(회의번호 | 단계)을 찾지 못했습니다');
          added = added.concat(ms);
          var d = ms.reduce(function (s, m) { return s + m.decisions.length; }, 0), a = ms.reduce(function (s, m) { return s + m.actions.length; }, 0);
          log('✓ ' + file.name + ': 회의 ' + ms.length + '건 · 결정 ' + d + ' · 업무 ' + a + ' 추출', 'ok');
        });
      }).catch(function (e) { log('✕ ' + file.name + ': ' + (e && e.message || e), 'err'); });
    });
    seq.then(function () {
      if (!added.length) return;
      tag(added, 'upload');
      var map = {};
      if (mode === 'add') S.uploaded.forEach(function (m) { map[m.id] = m; });
      added.forEach(function (m) { map[m.id] = m; });
      S.uploaded = Object.keys(map).map(function (k) { return map[k]; });
      if (mode === 'replace') S.includeBase = false;
      persist();
      S.f = emptyFilters();
      fullRefresh();
      renderUploadedList();
      toast('회의록 ' + added.length + '건을 분석해 반영했습니다');
    });
  }

  $('#btnUpload').addEventListener('click', openModal);
  $('#btnCloseModal').addEventListener('click', closeModal);
  $('#modalBg').addEventListener('click', function (e) { if (e.target === $('#modalBg')) closeModal(); });
  $('#fileIn').addEventListener('change', function (e) { handleFiles(e.target.files); e.target.value = ''; });
  var drop = $('#drop');
  drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#fileIn').click(); } });
  ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { handleFiles(e.dataTransfer.files); });
  $('#btnClearUploads').addEventListener('click', function () {
    if (!S.uploaded.length) return;
    if (!window.confirm('업로드한 회의록 ' + S.uploaded.length + '건을 대시보드에서 삭제할까요?')) return;
    S.uploaded = []; S.includeBase = true; persist(); S.f = emptyFilters(); fullRefresh(); renderUploadedList(); toast('업로드 데이터를 삭제했습니다');
  });

  $('#btnExport').addEventListener('click', function () {
    var data = { exportedAt: new Date().toISOString(), meetings: dataset().map(function (m) {
      var c = clone(m); delete c.sections; return c;
    }) };
    var blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'meetings-structured.json'; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  });

  $('#btnTheme').addEventListener('click', function () {
    var cur = tokens().dark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', cur === 'dark' ? 'light' : 'dark');
    persist(); renderPanel();
  });
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', function () { if (!document.documentElement.getAttribute('data-theme')) renderPanel(); });
  }

  // ---------- 새로 고침 ----------
  function header() {
    var base = S.includeBase ? S.base.length : 0;
    $('#datasetPill').innerHTML = '원본 ' + base + '건' + (S.uploaded.length ? ' · 업로드 ' + S.uploaded.length + '건' : '');
    $('#sideSource').textContent = (S.includeBase ? 'MOMENTLAB 회의록 ' + base + '건' : '원본 제외') + (S.uploaded.length ? ' + 업로드 ' + S.uploaded.length + '건' : '');
    var first = S.all[0], last = S.all[S.all.length - 1];
    var proj = S.includeBase && window.BASE_DATA ? 'MOMENT LAB · MOMENT OAT LATTE 신제품 런칭 프로젝트' : '업로드한 회의록';
    $('#projectLine').textContent = proj + (first ? ' · ' + first.date.replace(/-/g, '.') + ' – ' + last.date.replace(/-/g, '.') : '');
  }
  function refresh(keepBar) {
    recompute();
    if (!keepBar) renderFilterBar(); else updateFilterStatus();
    renderPanel();
  }
  function fullRefresh() { recompute(); header(); renderFilterBar(); renderTabs(); if (S.tab) go(S.tab); }

  // 뷰에서 쓰는 공용 API
  var API = {
    S: S, A: A, esc: esc, fmt: fmt, chart: chart, tokens: tokens, go: go, openMeeting: openMeeting, openEntity: openEntity,
    chips: chips, bindChips: bindChips, evalColor: evalColor, evalPill: evalPill, decisionColor: decisionColor, decisionPill: decisionPill,
    actionColor: actionColor, actionPill: actionPill, natureColor: natureColor, NATURE_GLYPH: NATURE_GLYPH, uniq: uniq, $: $, $$: $$,
    setFilter: function (k, v) { S.f = emptyFilters(); if (Array.isArray(S.f[k])) S.f[k] = [].concat(v); else S.f[k] = v; refresh(); },
    selectMeetings: function (ids) { S.f = emptyFilters(); S.f.meetings = [].concat(ids || []); refresh(); },
    render: renderPanel, avatar: avatar, meetingHTML: meetingHTML, meetingSub: meetingSub, findMeeting: findMeeting, icon: window.Icons.icon,
    toast: toast, openDrawer: openDrawer
  };
  window.DashboardAPI = API;

  // 정적 아이콘
  var I = window.Icons.icon;
  $('#searchIcon').outerHTML = I('search', 17);
  $('#upIcon').outerHTML = I('upload', 16);
  $('#btnExport').innerHTML = I('download', 18);
  $('#btnTheme').innerHTML = I('moon', 18);
  $('#sideHelpIcon').innerHTML = I('agenda', 18);
  $('#sideMeetings').addEventListener('click', function () { go('meetings'); });
  $('#promoArt').innerHTML = '<span class="ic-wrap lg tone-green" style="box-shadow:0 8px 18px rgba(22,163,74,.18)">' + I('shieldCheck', 28) + '</span>';
  var qt;
  $('#fQ').addEventListener('input', function (e) { clearTimeout(qt); qt = setTimeout(function () { S.f.q = e.target.value.trim(); refresh(true); }, 250); });

  // 시작
  fullRefresh();
})();
