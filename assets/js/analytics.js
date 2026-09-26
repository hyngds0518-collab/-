/*
 * 회의록 분석 엔진
 * parser.js 가 만든 회의 배열을 받아 대시보드의 모든 지표를 계산한다.
 * 규칙 기반이라 업로드한 새 회의록에도 그대로 적용된다.
 */
(function (root) {
  'use strict';

  // ---------- 분류 체계 ----------
  var NATURES = ['정기', '임시', '긴급'];
  var TYPES = ['기획', '의사결정', '운영점검', '성과리뷰', '위기대응', '회고'];
  var TYPE_RULES = [
    ['기획', /킥오프|기획|탐색|리서치|디자인 리뷰|시제품|콘셉트/],
    ['의사결정', /의사결정|Go\/No-go|협상|승인/],
    ['운영점검', /운영점검|점검|손익|최적화|재배분/],
    ['성과리뷰', /성과/],
    ['위기대응', /위기/],
    ['회고', /회고|종료/]
  ];
  var PHASES = ['기획', '개발', '생산', '유통', '런칭', '성장', '시즌 프로모션', '성과평가', '차년도 계획'];
  var PHASE_RULES = [
    ['차년도 계획', /차년도 반영|차년도 계획|종료/],
    ['성과평가', /연간|회고|결산/],
    ['시즌 프로모션', /시즌|봄|Q1|발렌타인/],
    ['성장', /최적화|확대|겨울|3 ?개월|성장|연말/],
    ['런칭', /런칭|출시/],
    ['유통', /유통/],
    ['생산', /생산|품질/],
    ['개발', /개발|패키지|브랜딩|사업성|가격/],
    ['기획', /기획|착수|시장|콘셉트/]
  ];

  var TOPICS = [
    { key: '유통·재고', re: /입점|점포|채널|재고|품절|배분|편의점|[ABC] ?사|유통|진열|매대 확보|출고|철수|상권|OTIF|물류/g },
    { key: '마케팅', re: /캠페인|미디어|광고|크리에이터|메시지|샘플링|체험|CTR|CPA|카피|콘텐츠|대행사|BREAK ?BAR|쿠폰|프로모션|IMC|인지도|UGC/g },
    { key: '제품', re: /레시피|맛|콘셉트|당도|SKU|향|용량|시제품|제품|바닐라|Vanilla|무가당|리뉴얼|관능|영양/g },
    { key: '생산·품질', re: /생산|CAPA|품질|LOT|토크|누액|ODM|원료|공급처|불량|검사|QA|증산/g },
    { key: '가격·손익', re: /가격|CM|공헌이익|원가|손익|예산|마진|재무|수수료|할인|ROI|BEP|기여이익/g },
    { key: '디자인·패키지', re: /패키지|디자인|인쇄|식별|아트워크|네이비|아이보리|슬리브|표기/g },
    { key: '고객·데이터', re: /VOC|조사|데이터|POS|구독|반복구매|고객|설문|코호트|CS ?율|대시보드|지표/g },
    { key: '조직·프로세스', re: /의사결정|체계|Gate|프로세스|Keep|Problem|Try|PMO|워룸|승인체계|템플릿|표준/g }
  ];

  var KEYWORDS = ['재고', '품절', 'CAPA', '공헌이익(CM)', '입점', '가격', '프로모션', '2+1', '쿠폰', '크리에이터', 'UGC',
    '미디어', '패키지', '저당', '당도', 'VOC', '반복구매', '구독', '워룸', '품질', 'LOT', 'ODM', '원료', 'C 사', 'B 사', 'A 사',
    '저회전점', '유효점포', '인지도', 'CTR', 'CPA', 'Gate', '대행사', '레시피', '샘플링', 'BREAK BAR', 'Vanilla Light',
    '2SKU', '예산', '매대', 'POS', '철수', '체험', '카니벌라이제이션', '환율', '데이터 정의'];
  var KEYWORD_RE = {
    '공헌이익(CM)': /CM|공헌이익/g, '2+1': /2\+1/g, 'C 사': /C ?사/g, 'B 사': /B ?사/g, 'A 사': /A ?사/g,
    'BREAK BAR': /BREAK ?BAR/gi, 'Vanilla Light': /Vanilla ?Light|바닐라/g, '저회전점': /저회전/g, 'CAPA': /CAPA/g
  };

  var DEPTS = ['대표이사', '브랜드마케팅', '상품기획', '디자인', '영업유통', '데이터전략', 'SCM·품질', '경영지원·재무', '고객경험', '외부 ODM', '외부 대행사'];
  var DEPT_SHORT = {
    '대표이사': '대표', '브랜드마케팅': '마케팅', '상품기획': '상품', '디자인': '디자인', '영업유통': '영업',
    '데이터전략': '데이터', 'SCM·품질': 'SCM', '경영지원·재무': '재무', '고객경험': 'CX', '외부 ODM': 'ODM', '외부 대행사': '대행사'
  };
  // 본문에서 부서를 지칭하는 표현
  var DEPT_MENTION = [
    ['대표이사', /대표(?!이사)|대표이사/g], ['브랜드마케팅', /브랜드팀|브랜드는|브랜드 측|마케팅|브랜드$/g], ['상품기획', /상품팀|상품기획|상품은/g],
    ['디자인', /디자인팀|디자인은/g], ['영업유통', /영업/g], ['데이터전략', /데이터팀|데이터전략|데이터는/g],
    ['SCM·품질', /SCM|품질팀|품질은/g], ['경영지원·재무', /재무/g], ['외부 ODM', /ODM/g], ['외부 대행사', /대행사/g]
  ];

  // ---------- 유틸 ----------
  function uniq(a) { return a.filter(function (v, i) { return a.indexOf(v) === i; }); }
  function count(str, re) { var m = String(str || '').match(re); return m ? m.length : 0; }
  function sum(a) { return a.reduce(function (s, v) { return s + v; }, 0); }
  function toDate(s) { return s ? new Date(s + 'T00:00:00') : null; }
  function days(a, b) { return Math.round((toDate(b) - toDate(a)) / 86400000); }
  function pct(a, b) { return b ? Math.round(a / b * 1000) / 10 : 0; }

  function classifyTypes(raw) {
    var t = TYPE_RULES.filter(function (r) { return r[1].test(raw); }).map(function (r) { return r[0]; });
    return t.length ? t : ['의사결정'];
  }
  function classifyPhase(stage, title) {
    var s = stage + ' ' + (title || '');
    for (var i = 0; i < PHASE_RULES.length; i++) if (PHASE_RULES[i][1].test(stage)) return PHASE_RULES[i][0];
    for (i = 0; i < PHASE_RULES.length; i++) if (PHASE_RULES[i][1].test(s)) return PHASE_RULES[i][0];
    return '기획';
  }

  // 마감일 "MM.DD" → 회의일 기준 연도 추정
  function dueDate(due, meetingDate) {
    var m = String(due || '').match(/(\d{1,2})\.(\d{1,2})/);
    if (!m || !meetingDate) return '';
    var y = +meetingDate.slice(0, 4), mm = +m[1], md = +meetingDate.slice(5, 7);
    if (mm < md - 6) y += 1;
    return y + '-' + ('0' + mm).slice(-2) + '-' + ('0' + m[2]).slice(-2);
  }

  // ---------- 상태 정규화 ----------
  function decisionBucket(st) {
    st = st || '';
    if (/보류/.test(st)) return '보류';
    if (/잠정/.test(st)) return '잠정';
    if (/조건부|예외/.test(st)) return '조건부';
    return '확정';
  }
  function approvalLevel(st) { return /대표|긴급|예외/.test(st || '') ? '대표·긴급 승인' : '팀 확정'; }

  function evalBucket(ev) {
    ev = ev || '';
    if (/기준선|N\/A/.test(ev) || !ev) return '기준선';
    if (/혼합|\/.*미달|달성\(.*\).*미달/.test(ev)) return '혼합';
    if (/중대 미달|미달/.test(ev) && !/달성/.test(ev.replace(/미달/g, ''))) return '미달';
    if (/부분/.test(ev)) return '부분달성';
    if (/초과/.test(ev)) return '초과';
    if (/주의/.test(ev)) return '달성(주의)';
    if (/달성/.test(ev)) return '달성';
    if (/미달/.test(ev)) return '미달';
    return '혼합';
  }

  function issueBucket(st) {
    st = (st || '').toUpperCase();
    if (/PARTIAL/.test(st)) return '부분종결';
    if (/CLOSED/.test(st)) return '종결';
    if (/TRANSFER/.test(st)) return '이관';
    if (/MONITOR/.test(st)) return '모니터링';
    return '오픈';
  }

  // 다음 회의의 "이전 Action 상태" 문장에서 액션별 결과 추출
  function parseActionFollowups(text) {
    var out = {};
    if (!text) return out;
    var parts = text.split(/\s\/\s|(?<=\.)\s|\.\s/);
    parts.forEach(function (p) {
      var ids = p.match(/A-\d{3}/g);
      if (!ids) return;
      var st = null;
      if (/부분완료|\d{2}% ?(완료|진행)|진행중|진행|설계중/.test(p) && !/[^부분]완료\(/.test(p)) {
        st = /부분완료|\d{2}% ?완료/.test(p) ? '부분완료' : '진행중';
      }
      if (/완료/.test(p) && !/부분완료|\d{2}% ?완료|완료 예정/.test(p)) st = '완료';
      if (/완료 예정/.test(p)) st = st || '진행중';
      var delayed = /지연/.test(p);
      ids.forEach(function (id) {
        var prev = out[id] || {};
        out[id] = { status: st || prev.status || '진행중', delayed: delayed || prev.delayed || false, note: p.trim() };
      });
    });
    return out;
  }

  // ---------- 메인 분석 ----------
  function analyze(meetings, opts) {
    opts = opts || {};
    function byDate(a, b) { return (a.date || '').localeCompare(b.date || '') || a.no - b.no; }
    var ms = meetings.slice().sort(byDate);
    // 추적용 전체 회의 (필터와 무관하게 후속 회의의 상태 기록을 읽는다)
    var all = (opts.all || meetings).slice().sort(byDate);
    var inView = {};
    ms.forEach(function (m) { inView[m.id] = true; });

    // 사람 → 부서 사전
    var personDept = {};
    all.forEach(function (m) {
      m.attendees.forEach(function (a) { if (a.name && a.dept) personDept[a.name] = a.dept; });
      [m.chair, m.recorder].forEach(function (s) {
        var mm = String(s || '').match(/^([가-힣]{2,4})\s+(.+)$/);
        if (mm && !personDept[mm[1]]) personDept[mm[1]] = root.MeetingParser ? root.MeetingParser.normDept(mm[2].replace(/(팀장|매니저|AE|책임|대표이사)$/, '')) : mm[2];
      });
    });
    function deptOf(name) { return personDept[String(name).trim()] || '기타'; }

    all.forEach(function (m) {
      m.types = classifyTypes(m.typeRaw);
      m.phase = classifyPhase(m.stage, m.title);
      m.chairName = (m.chair.match(/^[가-힣]{2,4}/) || [''])[0];
      m.chairDept = deptOf(m.chairName) === '기타' && /대표/.test(m.chair) ? '대표이사' : deptOf(m.chairName);
      m.recorderName = (m.recorder.match(/^[가-힣]{2,4}/) || [''])[0];
      m.building = (m.place.match(/^(본사|푸드앤코|[^ ]+)/) || [''])[0];
      m.room = m.place.replace(/\s*\+.*$/, '');
      m.hybrid = /화상|\+/.test(m.place);
    });

    // --- 액션: 후속 회의에서 최종 상태 추적
    var follow = {};
    all.forEach(function (m) {
      var f = parseActionFollowups(m.link.prevActionStatus);
      Object.keys(f).forEach(function (id) { follow[id] = Object.assign({ meeting: m.id, date: m.date }, f[id]); });
      m.closedLoop.forEach(function (c) {
        (c.ref.match(/A-\d{3}/g) || []).forEach(function (id) {
          if (!follow[id]) follow[id] = { status: /달성/.test(c.eval) && !/부분/.test(c.eval) ? '완료' : '부분완료', delayed: /지연/.test(c.result), meeting: m.id, date: m.date };
        });
      });
    });
    var actions = [];
    ms.forEach(function (m) {
      m.actions.forEach(function (a) {
        var f = follow[a.id];
        var status = f ? f.status : (/예정/.test(a.status) ? '미착수' : /지연/.test(a.status) ? '진행중' : '진행중');
        var delayed = (f && f.delayed) || /지연/.test(a.status);
        var owners = a.owners;
        var depts = uniq(owners.map(deptOf));
        actions.push({
          id: a.id, task: a.task, owners: owners, ownerDepts: depts, dept: depts[0] || '기타', collab: depts.slice(1),
          priority: /최우선|긴급/.test(a.priority) ? '최우선' : a.priority, start: m.date, due: dueDate(a.due, m.date),
          rawStatus: a.status, status: status, delayed: delayed, done: status === '완료', criteria: a.criteria,
          followNote: f ? f.note : '', followMeeting: f ? f.meeting : '', meeting: m.id, meetingNo: m.no
        });
      });
    });

    // --- 결정
    var decisions = [];
    ms.forEach(function (m) {
      m.decisions.forEach(function (d) {
        var review = (d.condition.match(/(\d{1,2}\/\d{1,2}|\d{1,2} ?월)/) || [''])[0];
        decisions.push({
          id: d.id, text: d.text, statusRaw: d.status, status: decisionBucket(d.status), level: approvalLevel(d.status),
          condition: d.condition, conditional: !!d.condition && d.condition !== '-', review: review,
          date: m.date, meeting: m.id, meetingNo: m.no, chair: m.chair, chairDept: m.chairDept,
          refs: uniq((d.text + ' ' + d.condition).match(/D-\d{3}/g) || []).filter(function (x) { return x !== d.id; })
        });
      });
    });

    // --- 이슈 라이프사이클
    var issueMap = {};
    all.forEach(function (m) {
      m.issues.forEach(function (i) {
        var it = issueMap[i.id] || (issueMap[i.id] = { id: i.id, title: i.text, history: [], owners: [] });
        it.history.push({ meeting: m.id, no: m.no, date: m.date, status: issueBucket(i.status), raw: i.status, cond: i.condition });
        it.owners = uniq(it.owners.concat(i.owner.split('/').map(function (s) { return s.trim(); })));
        if (i.text.length > it.title.length) it.title = i.text;
      });
    });
    // 본문에 적힌 종결 기록 (예: "OI-013 도 10/13 API 승인으로 CLOSED")
    all.forEach(function (m) {
      var txt = [m.link.prevActionStatus, m.link.prev].concat(m.discussions.map(function (d) { return d.conclusion; })).join(' ');
      var re = /(OI-\d{3})[^|]{0,40}?(CLOSED|종결)/g, mm;
      while ((mm = re.exec(txt))) {
        var it = issueMap[mm[1]];
        if (it && !it.history.some(function (h) { return h.meeting === m.id; })) it.history.push({ meeting: m.id, no: m.no, date: m.date, status: '종결', raw: 'CLOSED(본문)', cond: '' });
      }
    });
    var lastDate = (all[all.length - 1] || {}).date;
    var issues = Object.keys(issueMap).sort().filter(function (k) {
      return issueMap[k].history.some(function (h) { return inView[h.meeting]; });
    }).map(function (k) {
      var it = issueMap[k], h = it.history;
      it.first = h[0]; it.last = h[h.length - 1];
      it.status = it.last.status;
      it.mentions = h.length;
      h.sort(function (a, b) { return a.date.localeCompare(b.date); });
      it.first = h[0]; it.last = h[h.length - 1]; it.status = it.last.status;
      var closed = it.status === '종결' || it.status === '이관' || it.status === '부분종결';
      // 종결 기록 없이 이후 회의에서 사라진 이슈
      it.untracked = !closed && it.last.date < lastDate;
      it.openDays = days(h[0].date, closed ? it.last.date : lastDate);
      it.depts = uniq(it.owners.map(deptOf));
      return it;
    });

    // --- 논의 분석
    var discussions = [];
    ms.forEach(function (m) {
      m.discussions.forEach(function (d) {
        var text = d.topic + ' ' + d.discussion + ' ' + d.dissent + ' ' + d.conclusion;
        var scores = TOPICS.map(function (t) { return count(text, t.re) + count(d.topic, t.re) * 2; });
        var best = scores.indexOf(Math.max.apply(null, scores));
        var dissentDepts = [];
        var dText = d.discussion + ' ' + d.dissent;
        DEPT_MENTION.forEach(function (dm) { if (count(dText, dm[1])) dissentDepts.push(dm[0]); });
        d.speakers.forEach(function (s) { var dd = deptOf(s); if (dd !== '기타') dissentDepts.push(dd); });
        var res = /보류|연기|재논의|추가 관찰|이후 결정|미확정|논의\./.test(d.conclusion) ? '보류·연기'
          : /절충|축소|분할|제한|한정|단계|일부|우선 확정|대신/.test(d.conclusion) ? '절충'
          : /조건|하되|단,|기준으로|경우/.test(d.conclusion) ? '조건부 채택' : '채택';
        discussions.push({
          meeting: m.id, meetingNo: m.no, date: m.date, topic: d.topic, category: TOPICS[best].key, scores: scores,
          discussion: d.discussion, dissent: d.dissent, conclusion: d.conclusion, hasDissent: !!d.dissent,
          depts: uniq(dissentDepts), speakers: d.speakers, resolution: res
        });
      });
    });
    var topicShare = TOPICS.map(function (t, i) {
      var n = sum(discussions.map(function (d) { var s = sum(d.scores); return s ? d.scores[i] / s : 0; }));
      return { key: t.key, value: n };
    });
    var tot = sum(topicShare.map(function (t) { return t.value; })) || 1;
    topicShare.forEach(function (t) { t.pct = Math.round(t.value / tot * 1000) / 10; });
    topicShare.sort(function (a, b) { return b.value - a.value; });

    // 키워드 빈도 (논의+결정+이슈 전문)
    var corpus = ms.map(function (m) {
      return [m.title, m.agendaRaw].concat(m.discussions.map(function (d) { return d.topic + ' ' + d.discussion + ' ' + d.dissent + ' ' + d.conclusion; }),
        m.decisions.map(function (d) { return d.text + ' ' + d.condition; }), m.issues.map(function (i) { return i.text; })).join(' ');
    });
    var keywords = KEYWORDS.map(function (k) {
      var re = KEYWORD_RE[k] || new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      var perMeeting = corpus.map(function (c) { return count(c, re); });
      return { key: k, count: sum(perMeeting), meetings: perMeeting.filter(Boolean).length, perMeeting: perMeeting };
    }).filter(function (k) { return k.count > 0; }).sort(function (a, b) { return b.count - a.count; });

    // 부서 간 이견 쌍
    var conflictPairs = {};
    discussions.forEach(function (d) {
      if (!d.hasDissent) return;
      var ds = d.depts.filter(function (x) { return x !== '기타'; });
      for (var i = 0; i < ds.length; i++) for (var j = i + 1; j < ds.length; j++) {
        var k = [ds[i], ds[j]].sort().join('|');
        conflictPairs[k] = (conflictPairs[k] || 0) + 1;
      }
    });

    // --- 부서 분석
    var deptList = uniq(DEPTS.concat(ms.reduce(function (a, m) { return a.concat(m.depts); }, []))).filter(function (d) {
      return ms.some(function (m) { return m.depts.indexOf(d) >= 0; }) || actions.some(function (a) { return a.ownerDepts.indexOf(d) >= 0; });
    });
    var depts = deptList.map(function (d) {
      var attended = ms.filter(function (m) { return m.depts.indexOf(d) >= 0; });
      var acts = actions.filter(function (a) { return a.ownerDepts.indexOf(d) >= 0; });
      var lead = actions.filter(function (a) { return a.dept === d; });
      var mentions = sum(discussions.map(function (x) { return x.depts.indexOf(d) >= 0 ? 1 : 0; }));
      return {
        dept: d, short: DEPT_SHORT[d] || d, meetings: attended.length, chaired: ms.filter(function (m) { return m.chairDept === d; }).length,
        decisions: sum(attended.map(function (m) { return m.decisions.length; })), actions: acts.length, leadActions: lead.length,
        done: acts.filter(function (a) { return a.done; }).length, delayed: acts.filter(function (a) { return a.delayed; }).length,
        partial: acts.filter(function (a) { return a.status === '부분완료'; }).length, mentions: mentions,
        people: uniq(Object.keys(personDept).filter(function (p) { return personDept[p] === d; }))
      };
    });
    depts.forEach(function (d) { d.doneRate = pct(d.done, d.actions); d.delayRate = pct(d.delayed, d.actions); });
    // 협업 네트워크: 공동 담당 액션 + 같은 논의에서 함께 언급
    var collab = {};
    function addEdge(a, b, w, kind) {
      if (a === b || a === '기타' || b === '기타') return;
      var k = [a, b].sort().join('|');
      var e = collab[k] || (collab[k] = { a: [a, b].sort()[0], b: [a, b].sort()[1], action: 0, discussion: 0 });
      e[kind] += w;
    }
    actions.forEach(function (a) {
      for (var i = 0; i < a.ownerDepts.length; i++) for (var j = i + 1; j < a.ownerDepts.length; j++) addEdge(a.ownerDepts[i], a.ownerDepts[j], 1, 'action');
    });
    discussions.forEach(function (d) {
      for (var i = 0; i < d.depts.length; i++) for (var j = i + 1; j < d.depts.length; j++) addEdge(d.depts[i], d.depts[j], 1, 'discussion');
    });
    var edges = Object.keys(collab).map(function (k) { var e = collab[k]; e.weight = e.action * 2 + e.discussion; return e; })
      .sort(function (a, b) { return b.weight - a.weight; });

    // --- 사람
    var people = {};
    ms.forEach(function (m) {
      m.attendees.forEach(function (a) {
        var p = people[a.name] || (people[a.name] = { name: a.name, dept: a.dept, role: a.role, meetings: [], chaired: 0, recorded: 0, actions: 0 });
        p.meetings.push(m.no);
      });
      if (people[m.chairName]) people[m.chairName].chaired++;
      if (people[m.recorderName]) people[m.recorderName].recorded++;
    });
    actions.forEach(function (a) { a.owners.forEach(function (o) { if (people[o]) people[o].actions++; }); });

    // --- 성과 추적 (Closed Loop)
    var loops = [];
    ms.forEach(function (m) {
      m.closedLoop.forEach(function (c) {
        var b = evalBucket(c.eval);
        if (b === '기준선') return;
        loops.push({ meeting: m.id, meetingNo: m.no, date: m.date, ref: c.ref, target: c.target, result: c.result, evalRaw: c.eval, eval: b, next: c.next });
      });
    });

    // --- 위기
    var crises = ms.filter(function (m) { return m.crisis; }).map(function (m) {
      var t = m.crisis.event + ' ' + m.crisis.cause + ' ' + m.title;
      var type = /표현|게시물|크리에이터|콘텐츠|커뮤니케이션|브랜드/.test(t) ? '커뮤니케이션'
        : /품절|재고|배분|판매 급증/.test(t) ? '재고·유통' : /품질|LOT|토크|누액|생산/.test(t) ? '생산·품질' : '기타';
      return {
        meeting: m.id, meetingNo: m.no, date: m.date, title: m.title, type: type, event: m.crisis.event, control: m.crisis.control,
        cause: m.crisis.cause, prevention: m.crisis.prevention, closure: m.crisis.closure,
        preventionItems: m.crisis.prevention.split(/\s\/\s/).map(function (s) { return s.trim(); }).filter(Boolean),
        depts: m.depts, issues: m.issues.map(function (i) { return i.id; })
      };
    });
    // 위기 종결 시점: 위기 회의에서 생긴 이슈가 이후 종결된 회의
    crises.forEach(function (c) {
      var closedAt = null;
      c.issues.forEach(function (id) {
        var it = issueMap[id]; if (!it) return;
        var opened = it.history[0].meeting === c.meeting;
        var cl = it.history.filter(function (h) { return h.status === '종결' && h.date > c.date; })[0];
        if (opened && cl && (!closedAt || cl.date > closedAt.date)) closedAt = cl;
      });
      var nextM = all.filter(function (m) { return m.date > c.date; })[0];
      var nextLoop = nextM && nextM.closedLoop.map(function (l) { return { meeting: nextM.id, date: nextM.date, eval: evalBucket(l.eval) }; })
        .filter(function (l) { return l.eval === '달성' || l.eval === '초과'; })[0];
      if (!closedAt && nextLoop) closedAt = { meeting: nextLoop.meeting, date: nextLoop.date };
      c.resolved = !!closedAt;
      c.resolvedAt = closedAt ? closedAt.meeting : '';
      c.resolvedDate = closedAt ? closedAt.date : '';
      c.daysToResolve = closedAt ? days(c.date, closedAt.date) : null;
      c.recurred = crises.some(function (o) { return o !== c && o.type === c.type && o.date > c.date; });
      
    });

    // --- 요약 수치
    var summary = {
      meetings: ms.length,
      byNature: NATURES.map(function (n) { return { key: n, value: ms.filter(function (m) { return m.nature === n; }).length }; }),
      byType: TYPES.map(function (t) { return { key: t, value: ms.filter(function (m) { return m.types.indexOf(t) >= 0; }).length }; }),
      totalMinutes: sum(ms.map(function (m) { return m.durationMin || 0; })),
      decisions: decisions.length,
      decisionByStatus: ['확정', '조건부', '잠정', '보류'].map(function (k) { return { key: k, value: decisions.filter(function (d) { return d.status === k; }).length }; }),
      actions: actions.length,
      actionByStatus: ['완료', '부분완료', '진행중', '미착수'].map(function (k) { return { key: k, value: actions.filter(function (a) { return a.status === k; }).length }; }),
      delayed: actions.filter(function (a) { return a.delayed; }).length,
      issues: issues.length,
      openIssues: issues.filter(function (i) { return i.status === '오픈' || i.status === '모니터링'; }).length,
      untrackedIssues: issues.filter(function (i) { return i.untracked; }).length,
      closedIssues: issues.filter(function (i) { return /종결|이관/.test(i.status); }).length,
      loops: loops.length,
      loopByEval: ['초과', '달성', '달성(주의)', '부분달성', '혼합', '미달'].map(function (k) { return { key: k, value: loops.filter(function (l) { return l.eval === k; }).length }; }),
      crises: crises.length,
      reserved: ms.filter(function (m) { return m.reserved && !/^없음/.test(m.reserved); }).length,
      dissent: discussions.filter(function (d) { return d.hasDissent; }).length,
      discussions: discussions.length
    };

    return {
      meetings: ms, actions: actions, decisions: decisions, issues: issues, discussions: discussions, topicShare: topicShare,
      keywords: keywords, conflictPairs: conflictPairs, depts: depts, edges: edges, people: people, loops: loops,
      crises: crises, summary: summary, personDept: personDept, deptOf: deptOf
    };
  }

  function topicScores(text) { return TOPICS.map(function (t) { return count(text, t.re); }); }

  // 성과 추적 행에서 목표/실적 수치를 자동 추출 (업로드 데이터용)
  function autoMetrics(loops) {
    var out = [];
    loops.forEach(function (l) {
      var t = String(l.target).match(/([\d,.]+)\s*(%|점|원|병|명|건|개|만|억)/);
      var r = String(l.result).match(/([\d,.]+)\s*(%|점|원|병|명|건|개|만|억)/);
      if (!t || !r || t[2] !== r[2]) return;
      var tv = parseFloat(t[1].replace(/,/g, '')), rv = parseFloat(r[1].replace(/,/g, ''));
      if (!tv) return;
      var lower = /이하|미만|줄|감소/.test(l.target);
      out.push({ meeting: l.meeting, metric: l.target.replace(/\s*[\d,.]+\s*(%|점|원|병|명|건|개|만|억).*/, '').trim() || l.ref, target: tv, actual: rv, unit: t[2],
        lowerBetter: lower, rate: lower ? Math.round(tv / rv * 1000) / 10 : Math.round(rv / tv * 1000) / 10, eval: l.eval, source: 'auto' });
    });
    return out;
  }

  var api = {
    analyze: analyze, autoMetrics: autoMetrics, topicScores: topicScores, NATURES: NATURES, TYPES: TYPES, PHASES: PHASES, TOPICS: TOPICS.map(function (t) { return t.key; }),
    DEPTS: DEPTS, DEPT_SHORT: DEPT_SHORT, classifyTypes: classifyTypes, classifyPhase: classifyPhase, evalBucket: evalBucket,
    decisionBucket: decisionBucket, parseActionFollowups: parseActionFollowups
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MeetingAnalytics = api;
})(typeof window !== 'undefined' ? window : globalThis);
