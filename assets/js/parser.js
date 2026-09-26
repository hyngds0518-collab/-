/*
 * 회의록 PDF 파서
 * 표준 회의록 양식(기본정보 + 섹션 01~08, 05A)을 위치 기반으로 읽어 구조화 JSON으로 변환한다.
 * 브라우저(pdf.js)와 Node(pdfjs-dist) 양쪽에서 동일하게 동작한다.
 */
(function (root) {
  'use strict';

  // 표준 양식의 섹션별 열 시작 x 좌표 (pt)
  var LAYOUT = {
    hdr: [44, 177, 310, 443],
    '01': [44, 150, 257, 363, 470],
    '02': [44, 310],
    '03': [44, 177, 310, 443],
    '04': [44, 177, 310, 443],
    '05': [44, 150, 257, 363, 470],
    '05A': [44, 310],
    '06': [44, 120, 196, 272, 348, 424, 500],
    '07': [44, 310],
    '08': [44, 310]
  };
  var ROW_GAP = 12.5;

  var HDR_LABELS = ['회의번호', '일시', '회의 성격', '회의 유형', '장소', '프로젝트 단계', '주재자', '기록자',
    '회의 소집 사유', '참석 부서', '참석자', '회의 목적', '안건'];

  function clean(s) {
    return String(s || '').replace(/\s+/g, ' ').replace(/\s([,.)])/g, '$1').trim();
  }

  // pdf.js 텍스트 아이템 → 줄 단위 묶음
  function toLines(items) {
    var its = items.filter(function (i) { return i.s && i.s.trim(); })
      .filter(function (i) { return i.y > 30 && i.y < 755; });
    its.sort(function (a, b) { return b.y - a.y || a.x - b.x; });
    var lines = [];
    its.forEach(function (it) {
      var L = null;
      for (var k = lines.length - 1; k >= 0 && k >= lines.length - 4; k--) {
        if (Math.abs(lines[k].y - it.y) < 2.5) { L = lines[k]; break; }
      }
      if (!L) { L = { y: it.y, its: [] }; lines.push(L); }
      L.its.push(it);
    });
    lines.forEach(function (L) { L.its.sort(function (a, b) { return a.x - b.x; }); });
    lines.sort(function (a, b) { return b.y - a.y; });
    return lines;
  }

  function joinItems(its) {
    var out = '', prevEnd = null;
    its.forEach(function (it) {
      if (prevEnd !== null && it.x - prevEnd > 1.2 && !/\s$/.test(out)) out += ' ';
      out += it.s;
      prevEnd = it.x + (it.w || 0);
    });
    return out;
  }

  function lineText(L) { return joinItems(L.its); }

  function colIndex(cols, x) {
    var idx = 0;
    for (var i = 0; i < cols.length; i++) if (x >= cols[i] - 3) idx = i;
    return idx;
  }

  // 여러 줄 셀 텍스트 결합.
  // pdf.js 는 줄 끝 공백을 버리므로, 한국어 어절 경계를 추정해 띄어쓰기를 복원한다.
  var WORD_END = /[는은를을의에며고서로과와및등후해된한할인여만도게면요다됨함음임짐]$/;
  function lineGlue(a, b) {
    if (/[.,;:)\]”’%]$/.test(a)) return ' ';
    if (/^[“‘(\[]/.test(b)) return ' ';
    if (/[A-Za-z0-9]$/.test(a) && /^[가-힣]/.test(b)) return ' ';
    if (/[가-힣]$/.test(a) && /^[A-Za-z0-9]/.test(b)) return ' ';
    if (/[가-힣]$/.test(a) && /^[가-힣]/.test(b) && WORD_END.test(a)) return ' ';
    return '';
  }
  function joinCellLines(parts) {
    var out = '';
    parts.forEach(function (p) {
      p = p.trim();
      if (!p) return;
      out = out ? out + lineGlue(out, p) + p : p;
    });
    return clean(out);
  }

  // 줄을 세그먼트(연속된 글자 묶음)로 나눈다. 열 경계는 큰 공백(>6pt)으로 구분된다.
  function segments(L, cols) {
    var segs = [], cur = null;
    L.its.forEach(function (it) {
      var atCol = cols && cols.some(function (c) { return Math.abs(it.x - c) < 1.5; });
      if (cur && it.x - cur.end < (atCol ? 2 : 6)) { cur.its.push(it); cur.end = it.x + (it.w || 0); }
      else { cur = { x: it.x, end: it.x + (it.w || 0), its: [it] }; segs.push(cur); }
    });
    return segs;
  }

  // 한 섹션의 줄들을 행(row) × 열(col) 셀로 분해
  function toRows(lines, cols) {
    var rows = [], cur = null, lastY = null;
    // 페이지 첫 줄: 그 줄이 속한 묶음(행)에 첫 열 글자가 있으면 새 행, 없으면 이전 페이지 행의 연속
    lines.forEach(function (L, i) {
      if (!L.pageStart) return;
      var has = false;
      for (var j = i; j < lines.length; j++) {
        if (j > i && lines[j - 1].y - lines[j].y > ROW_GAP) break;
        if (lines[j].its[0].x < cols[1] - 3) { has = true; break; }
      }
      L.pageNewRow = has;
    });
    lines.forEach(function (L) {
      var newRow = lastY === null || lastY - L.y > ROW_GAP || (L.pageStart && L.pageNewRow);
      if (newRow) { cur = { lines: [] }; rows.push(cur); }
      cur.lines.push(L);
      lastY = L.y;
    });
    return rows.map(function (r) {
      var cells = cols.map(function () { return []; });
      r.lines.forEach(function (L) {
        segments(L, cols).forEach(function (sg) { cells[colIndex(cols, sg.x)].push(joinItems(sg.its)); });
      });
      return cells.map(joinCellLines);
    });
  }

  function isHeaderRow(cells, words) {
    var t = cells.join(' ');
    return words.some(function (w) { return t.indexOf(w) >= 0; }) && !/^(D|A|OI)-\d/.test(cells[0]);
  }

  // ---------- 섹션별 해석 ----------
  function parseKV(rows) {
    var kv = {};
    rows.forEach(function (c) {
      var label = c[0];
      var val = c.slice(1).filter(Boolean).join(' ');
      if (label) kv[label] = clean((kv[label] ? kv[label] + ' ' : '') + val);
    });
    return kv;
  }

  function parseHeader(rows) {
    var kv = {};
    rows.forEach(function (c) {
      // [라벨0, 값0, 라벨1, 값1] 또는 [라벨0, '', 값(넓은 칸)]
      if (HDR_LABELS.indexOf(c[2]) >= 0) {
        if (c[0]) kv[c[0]] = clean(c[1]);
        kv[c[2]] = clean(c[3]);
      } else if (c[0]) {
        kv[c[0]] = clean([c[1], c[2], c[3]].filter(Boolean).join(' '));
      }
    });
    // "회의번호 ML-OL-001 일시 ..." 처럼 한 칸에 붙은 경우 대비
    return kv;
  }

  function splitList(s, sep) {
    return String(s || '').split(sep).map(clean).filter(Boolean);
  }

  var TITLE_RE = /\s*(대표이사|팀장|매니저|책임|AE|파트장|본부장|이사|실장|과장|대리|사원|선임|수석|담당|리드|PM|디자이너|연구원|품질책임|개발책임|MD|바이어|Account Director)$/;

  // 부서명 표준화 (외부 협력사는 외부 조직으로 묶는다)
  var DEPT_ALIAS = [
    [/^재무$|경영지원/, '경영지원·재무'],
    [/^브랜드|마케팅$/, '브랜드마케팅'],
    [/푸드앤코|ODM/, '외부 ODM'],
    [/스파크웍스|대행/, '외부 대행사'],
    [/^SCM|품질$/, 'SCM·품질']
  ];
  function normDept(d) {
    d = clean(d);
    for (var i = 0; i < DEPT_ALIAS.length; i++) if (DEPT_ALIAS[i][0].test(d)) return DEPT_ALIAS[i][1];
    return d;
  }

  function parseAttendees(s) {
    return splitList(s, /,|，/).map(function (p) {
      var m = p.match(/^([가-힣]{2,4})\s+(.+)$/);
      // 줄바꿈으로 이름과 직함이 붙은 경우: "이수민브랜드마케팅 매니저"
      if (!m || m[1].length > 3) m = p.match(/^([가-힣]{3})\s*(.+)$/) || m;
      if (!m) return { name: p, role: '', dept: '' };
      var role = clean(m[2]);
      return { name: m[1], role: role, dept: normDept(role.replace(TITLE_RE, '')) || role };
    });
  }

  function parseDateTime(s) {
    var m = String(s || '').match(/(\d{4})\.(\d{1,2})\.(\d{1,2})\s*\(?([월화수목금토일])?\)?\s*(\d{1,2}:\d{2})?\s*-?\s*(\d{1,2}:\d{2})?/);
    if (!m) return {};
    var date = m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
    var dur = null;
    if (m[5] && m[6]) {
      var a = m[5].split(':'), b = m[6].split(':');
      dur = (+b[0] * 60 + +b[1]) - (+a[0] * 60 + +a[1]);
    }
    return { date: date, dow: m[4] || '', start: m[5] || '', end: m[6] || '', durationMin: dur };
  }

  function parseMeetingBlock(block) {
    var m = { sections: {} };
    var hdr = parseHeader(toRows(block.hdr, LAYOUT.hdr));
    m.id = hdr['회의번호'] || block.id;
    m.no = parseInt((m.id.match(/(\d+)\s*$/) || [0, 0])[1], 10);
    m.title = block.title;
    m.stage = hdr['프로젝트 단계'] || block.stage || '';
    var dt = parseDateTime(hdr['일시']);
    m.datetime = hdr['일시'] || '';
    m.date = dt.date || '';
    m.dow = dt.dow || '';
    m.start = dt.start || '';
    m.end = dt.end || '';
    m.durationMin = dt.durationMin;
    m.nature = hdr['회의 성격'] || '';
    m.typeRaw = hdr['회의 유형'] || '';
    m.place = hdr['장소'] || '';
    m.chair = hdr['주재자'] || '';
    m.recorder = hdr['기록자'] || '';
    m.reason = hdr['회의 소집 사유'] || '';
    m.depts = splitList(hdr['참석 부서'], '/').map(normDept).filter(function (d, i, a) { return a.indexOf(d) === i; });
    m.attendees = parseAttendees(hdr['참석자']);
    m.purpose = hdr['회의 목적'] || '';
    m.agendaRaw = hdr['안건'] || '';
    m.agenda = splitList(m.agendaRaw.replace(/[①②③④⑤⑥⑦⑧⑨⑩]/g, '|'), '|');

    var S = block.sections;
    // 01 성과 피드백
    m.closedLoop = [];
    if (S['01']) toRows(S['01'], LAYOUT['01']).forEach(function (c) {
      if (isHeaderRow(c, ['관련 ID', '당시 목표'])) return;
      if (!c.join('')) return;
      m.closedLoop.push({ ref: c[0], target: c[1], result: c[2], eval: c[3], next: c[4] });
    });
    // 02 연계정보
    var kv2 = S['02'] ? parseKV(toRows(S['02'], LAYOUT['02'])) : {};
    m.link = {
      prev: kv2['전 회의 연계사항'] || '',
      prevActionStatus: kv2['이전 Action 상태'] || '',
      kpi: kv2['이번 회의 핵심 KPI'] || '',
      dataBasis: kv2['데이터 기준'] || ''
    };
    // 03 논의
    m.discussions = [];
    if (S['03']) toRows(S['03'], LAYOUT['03']).forEach(function (c) {
      if (isHeaderRow(c, ['주요 논의내용', '회의 결론'])) return;
      if (!c.join('')) return;
      var speakers = [];
      (c[1] + ' ' + c[2]).replace(/([가-힣]{3}):/g, function (_, n) { if (speakers.indexOf(n) < 0) speakers.push(n); });
      m.discussions.push({ topic: c[0], discussion: c[1], dissent: c[2], conclusion: c[3], speakers: speakers });
    });
    // 04 결정
    m.decisions = []; m.reserved = '';
    if (S['04']) toRows(S['04'], LAYOUT['04']).forEach(function (c) {
      if (isHeaderRow(c, ['Decision ID', '결정사항'])) return;
      if (/^유보/.test(c[0])) { m.reserved = clean(c.slice(1).join(' ')); return; }
      var id = (c[0].match(/D-\d+/) || [''])[0];
      if (!id) return;
      m.decisions.push({ id: id, text: c[1], status: c[2], condition: c[3] === '-' ? '' : c[3] });
    });
    // 05 이슈
    m.issues = [];
    if (S['05']) toRows(S['05'], LAYOUT['05']).forEach(function (c) {
      if (isHeaderRow(c, ['Issue ID', 'Owner'])) return;
      var id = (c[0].match(/OI-\d+/) || [''])[0];
      if (!id) return;
      m.issues.push({ id: id, text: c[1], status: c[2], owner: c[3], condition: c[4] });
    });
    // 05A 위기
    m.crisis = null;
    if (S['05A']) {
      var kv5 = parseKV(toRows(S['05A'], LAYOUT['05A']));
      m.crisis = {
        event: kv5['사건'] || '',
        control: kv5['즉시 통제'] || '',
        cause: kv5['원인 가설/확인'] || kv5['근본원인'] || kv5['원인'] || '',
        prevention: kv5['재발방지'] || '',
        closure: kv5['종결 기준'] || ''
      };
    }
    // 06 액션
    m.actions = [];
    if (S['06']) toRows(S['06'], LAYOUT['06']).forEach(function (c) {
      if (isHeaderRow(c, ['Action ID', '업무지시사항'])) return;
      var id = (c[0].match(/A-\d+/) || [''])[0];
      if (!id) return;
      m.actions.push({ id: id, task: c[1], owners: splitList(c[2], '/'), priority: c[3], due: c[4], status: c[5], criteria: c[6] });
    });
    // 07 후속
    var kv7 = S['07'] ? parseKV(toRows(S['07'], LAYOUT['07'])) : {};
    m.schedule = kv7['향후 업무일정'] || '';
    m.followup = kv7['후속조치'] || '';
    m.nextMeeting = kv7['다음 회의'] || '';
    // 08 문서
    var kv8 = S['08'] ? parseKV(toRows(S['08'], LAYOUT['08'])) : {};
    m.refs = kv8['참고자료 / 첨부'] || '';
    m.approval = kv8['작성·검토·승인'] || '';
    return m;
  }

  // 페이지별 아이템 배열 → 회의 블록 분할
  function parsePages(pages) {
    var blocks = [], cur = null, sec = null, meta = { project: '', company: '' };
    var pendingPageStart = false;
    pages.forEach(function (items, pi) {
      var lines = toLines(items);
      pendingPageStart = true;
      for (var i = 0; i < lines.length; i++) {
        var L = lines[i], t = clean(lineText(L));
        var first = L.its[0];
        var mHead = t.match(/^((?:[A-Z]{1,4}-){1,3}\d{2,4})\s*\|\s*(.*)$/);
        if (first.x < 42 && mHead) {
          cur = { id: mHead[1], stage: clean(mHead[2]), title: '', hdr: [], sections: {}, page: pi + 1 };
          blocks.push(cur); sec = 'title'; pendingPageStart = false;
          continue;
        }
        if (!cur) {
          if (!meta.company && /주식회사|Inc\./.test(t)) meta.company = t;
          continue;
        }
        if (sec === 'title' && first.x < 42) { cur.title = cur.title ? cur.title + ' ' + t : t; continue; }
        var mSec = first.x < 42 && t.match(/^(0\d[A-Z]?)(?=\s|[가-힣])/);
        if (mSec) { sec = mSec[1]; cur.sections[sec] = cur.sections[sec] || []; pendingPageStart = false; continue; }
        if (sec === 'title') sec = 'hdr';
        // 페이지마다 반복되는 표 머리글은 건너뛴다
        if (/^(관련 ID|Decision ID|Issue ID|Action ID|안건 주요 논의내용)/.test(t)) continue;
        if (pendingPageStart) { L.pageStart = true; pendingPageStart = false; }
        if (sec === 'hdr') cur.hdr.push(L);
        else if (cur.sections[sec]) cur.sections[sec].push(L);
      }
    });
    return blocks.map(parseMeetingBlock);
  }

  // pdf.js 로 PDF 읽기 → 페이지별 아이템
  function extractPdf(pdfjsLib, data) {
    return pdfjsLib.getDocument({ data: data }).promise.then(function (doc) {
      var ps = [];
      for (var p = 1; p <= doc.numPages; p++) {
        ps.push(doc.getPage(p).then(function (page) {
          return page.getTextContent().then(function (tc) {
            return tc.items.map(function (i) {
              return { x: i.transform[4], y: i.transform[5], w: i.width, s: i.str };
            });
          });
        }));
      }
      return Promise.all(ps);
    });
  }

  function parsePdf(pdfjsLib, data) {
    return extractPdf(pdfjsLib, data).then(parsePages);
  }

  var api = { normDept: normDept, parsePages: parsePages, parsePdf: parsePdf, extractPdf: extractPdf, LAYOUT: LAYOUT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MeetingParser = api;
})(typeof window !== 'undefined' ? window : globalThis);
