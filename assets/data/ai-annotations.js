/*
 * AI 분석 레이어 (기본 데이터셋: MOMENT LAB ML-OL-001~020)
 * 원문 회의록을 읽고 정리한 해석·수치 정규화 결과다. 모든 항목에 근거 회의/ID(evidence)를 단다.
 * - kpiSeries  : 회의록 곳곳에 흩어진 KPI 실적을 시점별로 정규화
 * - metrics    : 성과 추적(Closed Loop) 행의 목표/실적 수치화
 * - decisionLinks : 결정 간 후속·변경 관계 (구체화/유지/연기/번복)
 * - crisisMeta : 위기 심각도(AI 추정)와 흐름 요약
 * - insights / nextYear : AI 인사이트와 차년도 기획
 */
window.AI_ANNOTATIONS = {
  dataset: 'ML-OL',
  generatedFrom: 'MOMENTLAB_회의록_20건.pdf',

  kpiSeries: [
    { key: 'pos', name: 'POS 누적 판매', unit: '만 병', lowerBetter: false, projectTarget: 120,
      points: [
        { m: 'ML-OL-012', label: '4주', target: 18, actual: 18.674, basis: '출시 4주' },
        { m: 'ML-OL-015', label: '3개월', target: 55, actual: 56.248, basis: '출시 3개월' },
        { m: 'ML-OL-017', label: '3/10', target: 86, actual: 87.236, basis: '2027.03.10' },
        { m: 'ML-OL-019', label: '4/30', target: 106, actual: 106.254, basis: '2027.04.30' },
        { m: 'ML-OL-020', label: '최종', target: 120, actual: 116.842, basis: '프로젝트 종료' }
      ] },
    { key: 'store', name: '유효 점포', unit: '점', lowerBetter: false, projectTarget: 5500,
      points: [
        { m: 'ML-OL-009', label: '런칭', target: 3000, actual: 3080, basis: 'A/B 입점 확정' },
        { m: 'ML-OL-019', label: '4/30', target: 5500, actual: 5210, basis: '잠정' },
        { m: 'ML-OL-020', label: '최종', target: 5500, actual: 5140, basis: '88점 철수 반영' }
      ] },
    { key: 'repeat', name: '반복구매율', unit: '%', lowerBetter: false, projectTarget: 28,
      points: [
        { m: 'ML-OL-015', label: '30일', target: 24, actual: 25.1, basis: '30일 기준' },
        { m: 'ML-OL-019', label: '90일', target: 28, actual: 30.6, basis: '90일 기준' },
        { m: 'ML-OL-020', label: '최종', target: 28, actual: 31.2, basis: '90일 기준' }
      ] },
    { key: 'aware', name: '보조인지도', unit: '%', lowerBetter: false, projectTarget: 22,
      points: [
        { m: 'ML-OL-015', label: '3개월', target: 15, actual: 16.9 },
        { m: 'ML-OL-019', label: '4/30', target: 22, actual: 24.9 },
        { m: 'ML-OL-020', label: '최종', target: 22, actual: 25.7 }
      ] },
    { key: 'cm', name: '누적 공헌이익률(CM)', unit: '%', lowerBetter: false, projectTarget: 35,
      points: [
        { m: 'ML-OL-015', label: '3개월', target: 35, actual: 33.7 },
        { m: 'ML-OL-017', label: '3/10', target: 35, actual: 34.2 },
        { m: 'ML-OL-019', label: '4/30', target: 35, actual: 33.9 },
        { m: 'ML-OL-020', label: '최종', target: 35, actual: 33.8 }
      ] },
    { key: 'budget', name: '예산 집행', unit: '억 원', lowerBetter: true, projectTarget: 9.6,
      points: [
        { m: 'ML-OL-019', label: '4/30', target: 9.6, actual: 8.92 },
        { m: 'ML-OL-020', label: '최종', target: 9.6, actual: 9.43 }
      ] },
    { key: 'stockout', name: '핵심점 품절률', unit: '%', lowerBetter: true, projectTarget: 5,
      points: [
        { m: 'ML-OL-011', label: '72시간', target: 5, actual: 8.7 },
        { m: 'ML-OL-012', label: '4주', target: 3, actual: 2.4 }
      ] },
    { key: 'ctr', name: '광고 CTR', unit: '%', lowerBetter: false, projectTarget: 1.2,
      points: [
        { m: 'ML-OL-012', label: '4주', target: 1.2, actual: 1.46 },
        { m: 'ML-OL-013', label: 'UGC 전환', target: 1.2, actual: 1.71 }
      ] },
    { key: 'voc', name: '당도 부정 VOC', unit: '%', lowerBetter: true, projectTarget: 8,
      points: [
        { m: 'ML-OL-012', label: '4주', target: 8, actual: 4.7 },
        { m: 'ML-OL-015', label: '3개월', target: 8, actual: 4.1 },
        { m: 'ML-OL-018', label: '4/16', target: 8, actual: 3.8 }
      ] },
    { key: 'cs', name: '구독 배송 CS율', unit: '%', lowerBetter: true, projectTarget: 8,
      points: [
        { m: 'ML-OL-016', label: '베타 초기', target: 8, actual: 9.5 },
        { m: 'ML-OL-017', label: '6주', target: 8, actual: 12.5 },
        { m: 'ML-OL-018', label: '셀프변경 후', target: 8, actual: 7.1 },
        { m: 'ML-OL-020', label: '300명 코호트', target: 8, actual: 6.7 }
      ] }
  ],

  // 성과 추적: 이전 회의 목표 → 현재 회의 실적
  metrics: [
    { m: 'ML-OL-002', ref: 'A-001', metric: '소비자 조사 표본', unit: '명', target: 400, actual: 426 },
    { m: 'ML-OL-003', ref: 'D-004', metric: '콘셉트 구매의향', unit: '%', target: 55, actual: 64 },
    { m: 'ML-OL-004', ref: 'D-007', metric: '시제품 종합선호', unit: '점', target: 65, actual: 72 },
    { m: 'ML-OL-004', ref: 'D-007', metric: '시제품 재구매 의향', unit: '%', target: 60, actual: 69 },
    { m: 'ML-OL-004', ref: 'A-007', metric: '오트 잔향 언급률', unit: '%', target: 15, actual: 12, lowerBetter: true },
    { m: 'ML-OL-005', ref: 'D-011', metric: '3m 매대 식별률', unit: '%', target: 70, actual: 78 },
    { m: 'ML-OL-006', ref: 'A-013', metric: '제조원가', unit: '원/병', target: 1100, actual: 1086, lowerBetter: true },
    { m: 'ML-OL-007', ref: 'D-017', metric: 'C사 조건 CM', unit: '%', target: 35, actual: 30.8 },
    { m: 'ML-OL-008', ref: 'A-019', metric: '파일럿 불량률', unit: '%', target: 0.5, actual: 0.4, lowerBetter: true },
    { m: 'ML-OL-008', ref: 'D-018', metric: '출시 전 확보 물량', unit: '만 병', target: 22, actual: 18 },
    { m: 'ML-OL-009', ref: 'D-021', metric: '런칭 입점 점포', unit: '점', target: 3000, actual: 3080 },
    { m: 'ML-OL-011', ref: 'D-029', metric: '핵심점 입고율', unit: '%', target: 95, actual: 97.2 },
    { m: 'ML-OL-012', ref: 'D-030', metric: '핵심점 품절률', unit: '%', target: 5, actual: 2.4, lowerBetter: true },
    { m: 'ML-OL-012', ref: 'D-025', metric: '광고 CTR (전체)', unit: '%', target: 1.2, actual: 1.46, group: 'ctr' },
    { m: 'ML-OL-012', ref: 'D-025', metric: 'UGC형 CTR', unit: '%', target: 1.2, actual: 1.92, group: 'ctr' },
    { m: 'ML-OL-012', ref: 'D-025', metric: '제품설명형 CTR', unit: '%', target: 1.2, actual: 0.84, group: 'ctr' },
    { m: 'ML-OL-012', ref: 'D-025', metric: '저장·공유율', unit: '%', target: 3.5, actual: 4.1 },
    { m: 'ML-OL-013', ref: 'D-034', metric: 'UGC 전환 후 CTR', unit: '%', target: 1.46, actual: 1.71, group: 'ctr' },
    { m: 'ML-OL-013', ref: 'A-034', metric: 'VOC 자동분류 정확도', unit: '%', target: 90, actual: 93.4 },
    { m: 'ML-OL-014', ref: 'D-037', metric: 'C사 판매 증분', unit: '%', target: 35, actual: 58 },
    { m: 'ML-OL-014', ref: 'D-037', metric: 'C사 행사 CM', unit: '%', target: 30, actual: 30.7 },
    { m: 'ML-OL-015', ref: 'D-039', metric: '정정 콘텐츠 24h 도달', unit: '%', target: 70, actual: 74 },
    { m: 'ML-OL-015', ref: 'OI-023', metric: '72h 부정댓글 비중', unit: '%', target: 5, actual: 3.9, lowerBetter: true },
    { m: 'ML-OL-016', ref: 'D-042', metric: '월 CM (1월)', unit: '%', target: 35, actual: 34.8 },
    { m: 'ML-OL-017', ref: 'D-045', metric: 'Pair 2개 구매비중', unit: '%', target: 15, actual: 19.4 },
    { m: 'ML-OL-017', ref: 'D-044', metric: '구독 6주 유지율', unit: '%', target: 55, actual: 58 },
    { m: 'ML-OL-017', ref: 'D-044', metric: '구독 배송 CS율', unit: '%', target: 8, actual: 12.5, lowerBetter: true },
    { m: 'ML-OL-018', ref: 'D-046', metric: 'BREAK BAR 체험 인원', unit: '명', target: 20000, actual: 22840 },
    { m: 'ML-OL-018', ref: 'D-046', metric: '체험 30일 구매전환', unit: '%', target: 12, actual: 13.1 },
    { m: 'ML-OL-018', ref: 'A-050', metric: '셀프변경 후 CS율', unit: '%', target: 8, actual: 7.1, lowerBetter: true },
    { m: 'ML-OL-019', ref: 'A-052', metric: 'Vanilla Light 구매의향', unit: '%', target: 55, actual: 63 },
    { m: 'ML-OL-019', ref: 'A-052', metric: 'Unsweetened 구매의향', unit: '%', target: 55, actual: 49 },
    { m: 'ML-OL-020', ref: 'KPI', metric: 'POS 판매 (최종)', unit: '만 병', target: 120, actual: 116.842 },
    { m: 'ML-OL-020', ref: 'KPI', metric: '90일 반복구매율', unit: '%', target: 28, actual: 31.2 },
    { m: 'ML-OL-020', ref: 'KPI', metric: '보조인지도', unit: '%', target: 22, actual: 25.7 }
  ],

  // 성과 비교 세트 (차트용)
  comparisons: {
    creative: { title: '광고 소재별 CTR', unit: '%', target: 1.2, evidence: ['ML-OL-012', 'ML-OL-013'],
      items: [{ k: 'UGC형', v: 1.92 }, { k: 'UGC 전환 후 전체', v: 1.71 }, { k: '4주 전체', v: 1.46 }, { k: '제품설명형', v: 0.84 }] },
    cpa: { title: '크리에이터 유형별 CPA', unit: '원', evidence: ['ML-OL-012', 'ML-OL-013'],
      items: [{ k: 'UGC 전환 후', v: 6900 }, { k: '중형 크리에이터', v: 7800 }, { k: '대형 크리에이터', v: 18900 }] },
    promo: { title: '프로모션 방식별 CM', unit: '%', target: 35, evidence: ['ML-OL-007', 'ML-OL-012', 'ML-OL-013', 'ML-OL-014', 'ML-OL-017'],
      items: [{ k: 'Pair Your Moment (증정)', v: 36.2, kind: '비할인' }, { k: 'A사 앱쿠폰', v: 32.6, kind: '할인' },
        { k: 'C사 2+1 (예상)', v: 31.2, kind: '할인' }, { k: 'C사 초안 조건', v: 30.8, kind: '할인' }, { k: 'C사 2+1 (실적)', v: 30.7, kind: '할인' }] }
  },

  // 결정 간 관계: 구체화(앞선 결정을 확정·상세화), 유지, 연기, 번복(방향 변경)
  decisionLinks: [
    { from: 'D-001', to: 'D-027', type: '구체화', note: '출시 기준일 10/16 → 조건부 GO' },
    { from: 'D-002', to: 'D-042', type: '번복', note: 'KPI 우선순위: 판매량 → CM·반복구매' },
    { from: 'D-006', to: 'D-013', type: '구체화', note: '저당 전면표기 금지 → 미사용 확정' },
    { from: 'D-013', to: 'D-041', type: '유지', note: '오표현 위기 후 승인 Gate로 재확인' },
    { from: 'D-010', to: 'D-012', type: '구체화', note: '잠정 문구 → 패키지와 함께 확정' },
    { from: 'D-011', to: 'D-012', type: '구체화', note: '패키지 보류 → 매대 테스트 후 B안 확정 (5일)' },
    { from: 'D-017', to: 'D-022', type: '유지', note: 'C사 입점 보류 유지' },
    { from: 'D-022', to: 'D-036', type: '번복', note: 'C사 보류 → 320점 제한 입점' },
    { from: 'D-016', to: 'D-023', type: '예외', note: 'CM 가드레일 예외: A사 쿠폰 테스트' },
    { from: 'D-016', to: 'D-037', type: '예외', note: 'CM 가드레일 예외: C사 2+1' },
    { from: 'D-018', to: 'D-030', type: '번복', note: '2차 4만 병 → 7만 병 긴급 증산' },
    { from: 'D-025', to: 'D-032', type: '연기', note: '추가 미디어 0.6억 → 10/23 이후' },
    { from: 'D-033', to: 'D-043', type: '구체화', note: '레시피 변경 보류 → 3개월 VOC 후 유지' },
    { from: 'D-043', to: 'D-052', type: '유지', note: '원제품 레시피 유지 재확인' },
    { from: 'D-035', to: 'D-048', type: '구체화', note: '저회전점 철수 보류 → 132점 판촉 중단' },
    { from: 'D-048', to: 'D-058', type: '번복', note: '철수 보류 → 88점 철수' },
    { from: 'D-044', to: 'D-049', type: '구체화', note: '구독 베타 → 신규 중단 후 300명' },
    { from: 'D-049', to: 'D-060', type: '구체화', note: '구독 정식화, 월 500명 상한' },
    { from: 'D-046', to: 'D-050', type: '유지', note: 'BREAK BAR 7개 유지, 확대 안 함' },
    { from: 'D-050', to: 'D-053', type: '구체화', note: 'BREAK BAR 플레이북화' },
    { from: 'D-051', to: 'D-056', type: '구체화', note: 'Vanilla Light 개발비 사전승인' },
    { from: 'D-056', to: 'D-059', type: '구체화', note: 'Vanilla Light 2027.10 출시 개발 승인' }
  ],

  crisisMeta: {
    'ML-OL-010': { severity: 4, impact: '출시일·소비자 안전', scale: 'LOT 12,000병', short: {
      occur: '캡 토크 편차 LOT 12,000병', respond: 'LOT 격리·재검사, 조건부 GO', resolve: '재작업 통과·클레임 0건', prevent: '토크 샘플링 2h→30분 외 3건' } },
    'ML-OL-011': { severity: 4, impact: '핵심점 판매 기회손실', scale: '핵심점 38곳 품절(8.7%)', short: {
      occur: '72시간 핵심점 품절률 8.7%', respond: '14,400병 재배분·7만 병 증산', resolve: '4주 품절률 2.4%', prevent: '재고커버-미디어 연동 외 3건' } },
    'ML-OL-014': { severity: 5, impact: '브랜드 신뢰·표시 규정', scale: '노출 89만·문의 17건', short: {
      occur: '승인 외 “저당” 표현 노출 89만', respond: '58분 내 비공개·유료확산 중단', resolve: '부정댓글 14.8%→3.9%', prevent: '단일 승인본·금칙어 검사 외 3건' } }
  },

  insights: [
    { cat: '반복되는 문제', icon: 'repeat', title: '재고·생산 CAPA 부족이 4개 회의에 연속 등장',
      body: '초도 CAPA 부족(OI-009)이 007·008·010·011 회의에 잇따라 올라왔습니다. 분할생산(D-018)으로 버텼지만 출시 72시간 만에 핵심점 품절률 8.7%로 긴급회의가 열렸습니다.',
      metric: '4회', metricLabel: 'OI-009 연속 등장', evidence: ['OI-009', 'D-018', 'ML-OL-011', 'D-030'] },
    { cat: '반복되는 문제', icon: 'repeat', title: '할인형 프로모션은 4번 모두 CM 35% 가드레일 미달',
      body: 'C사 초안 30.8%, A사 앱쿠폰 32.6%, C사 2+1 예상 31.2%·실적 30.7%로 모두 기준에 못 미쳤습니다. C사 2+1은 재구매도 대조점 대비 +0.6%p에 그쳤습니다.',
      metric: '4/4', metricLabel: '할인형 CM 미달', evidence: ['ML-OL-007', 'ML-OL-012', 'D-037', 'ML-OL-015'] },
    { cat: '의사결정 패턴', icon: 'shift', title: '015 이후 결정 기준이 판매량에서 수익성으로 이동',
      body: '001~014 결정 41건 중 수익성 관련(CM·손익·철수·중단)은 8건(20%)이었지만, 015~020에서는 20건 중 12건(60%)입니다. D-042가 Q1 KPI를 매출에서 CM·반복구매 중심으로 바꾼 전환점입니다.',
      metric: '20%→60%', metricLabel: '수익성 결정 비중', evidence: ['D-042', 'D-047', 'D-048', 'D-058', 'D-061'] },
    { cat: '의사결정 패턴', icon: 'shift', title: '보류 결정은 화면·가설 대신 실물·실데이터로 풀었음',
      body: '패키지 결정 보류(D-011)는 실물 매대 테스트(B안 식별률 78% vs A안 61%)로 5일 만에 확정했습니다. 레시피 변경 보류(D-033)는 3개월 VOC(4.7%→4.1%)를 보고 유지(D-043)로 결론냈습니다.',
      metric: '5일', metricLabel: '패키지 보류 해소', evidence: ['D-011', 'D-012', 'D-033', 'D-043'] },
    { cat: '성과 학습', icon: 'learn', title: 'UGC형 소재 CTR이 제품설명형의 2.3배',
      body: 'UGC형 CTR 1.92%, 제품설명형 0.84%였습니다. 중형 크리에이터 CPA는 7,800원으로 대형(18,900원)보다 2.4배 효율적이었고, UGC 중심으로 바꾼 뒤 CTR은 1.46%→1.71%, CPA는 6,900원(-11.5%)이 됐습니다.',
      metric: '2.3배', metricLabel: 'UGC vs 설명형 CTR', evidence: ['ML-OL-012', 'D-034', 'ML-OL-013'] },
    { cat: '성과 학습', icon: 'learn', title: '할인 없는 프로모션이 목표와 수익성을 함께 달성',
      body: 'Pair Your Moment(증정형)는 2개 구매비중 19.4%(목표 15%)에 CM 36.2%를 기록했습니다. BREAK BAR 체험은 30일 구매전환 13.1%(목표 12%)였습니다.',
      metric: '36.2%', metricLabel: '증정형 행사 CM', evidence: ['D-045', 'ML-OL-017', 'D-046', 'ML-OL-018'] },
    { cat: '병목', icon: 'block', title: '미완료·지연 업무 7건 중 5건이 외부 의존',
      body: '인쇄소 일정(A-010), ODM 회신(A-002), 공급처 장기계약(A-008), A사 API 승인(A-023), 채널 토큰 규격(A-048)이 걸렸습니다. 나머지 2건(A-026·A-050)은 시스템 개발 건이라 데이터전략팀 완료율이 가장 낮았습니다.',
      metric: '5/7', metricLabel: '외부 의존 지연·미완료', evidence: ['A-002', 'A-008', 'A-010', 'A-023', 'A-048', 'A-026', 'A-050'] },
    { cat: '리스크 신호', icon: 'alert', title: '긴급회의 3건이 출시 전후 68일에 집중',
      body: '품질(10/8), 품절(10/19), 브랜드 표현(12/15) 위기가 모두 출시 직전부터 9주 안에 일어났습니다. 3건 모두 다음 회의에서 종결 기준을 충족했고 같은 유형은 다시 생기지 않았습니다.',
      metric: '68일', metricLabel: '위기 집중 구간', evidence: ['ML-OL-010', 'ML-OL-011', 'ML-OL-014'] },
    { cat: '리스크 신호', icon: 'alert', title: '미결 이슈 24건 중 14건은 종결 기록 없이 사라짐',
      body: 'OI-001(ODM 슬롯), OI-004(원료 단일공급), OI-010(광고 대비 재고) 등은 이후 회의록에 상태 갱신이 없습니다. 019 KPT에서 지적한 "선행 체크 부재"와 같은 문제로, 차년도에는 이슈 종결 조건을 필수 필드로 두는 것이 필요합니다.',
      metric: '14건', metricLabel: '후속 미기재 이슈', evidence: ['OI-001', 'OI-004', 'OI-010', 'D-054'] },
    { cat: '성과 요약', icon: 'summary', title: '브랜드 지표는 초과, 판매·수익성은 미달',
      body: '보조인지도 116.8%, 90일 반복구매 111.4%로 목표를 넘었습니다. 반면 POS 97.4%, 유효점포 93.5%, 누적 CM 33.8%(목표 35%)로 판매·수익성은 못 미쳤고, 최종평가는 "혼합 성과"로 확정됐습니다(D-057).',
      metric: '혼합', metricLabel: '최종 평가', evidence: ['D-057', 'ML-OL-020'] }
  ],

  nextYear: {
    flows: [
      { theme: '재고·수요', problem: '출시 72시간 핵심점 품절률 8.7%', problemEv: 'ML-OL-011',
        learning: '미디어 집행 속도와 재고커버가 연동되지 않았고, 균등배분 관행이 고회전 상권 수요를 못 따라감',
        plan: '재고커버 5일 미만이면 미디어 증액 금지(D-025·D-032 룰 표준화) + 상·중·하 수요 시나리오별 생산 슬롯 사전확보', planEv: 'D-054' },
      { theme: '수익성', problem: '누적 CM 33.8% (목표 35%)', problemEv: 'ML-OL-020',
        learning: '할인형 프로모션 4건이 모두 CM 30~33%에 머물렀고 재구매 개선 효과도 미미',
        plan: '프로모션 사전 증분효과 기준 도입, 증정·체험형 중심 운영, 차년도 CM 목표 36.5%', planEv: 'D-061' },
      { theme: '유통 효율', problem: '유효점포 5,140점 (93.5%), B사 저회전 132점', problemEv: 'ML-OL-017',
        learning: '점포 수 확대보다 기여이익 기준 관리가 성과에 직결됨',
        plan: '"유효점포·기여이익" KPI 전환, 88점 철수 후 대체상권 60점, 목표 5,800점', planEv: 'D-058' },
      { theme: '브랜드 커뮤니케이션', problem: '승인 외 "저당" 표현 노출 89만', problemEv: 'ML-OL-014',
        learning: '구버전 브리프가 함께 돌았고, 게시 전 승인 단계가 없었음 (버전관리 공백)',
        plan: 'Creator Approval Gate 상시화, 게시 전 승인율 100%를 핵심 예방 KPI로', planEv: 'D-041' },
      { theme: '의사결정 속도', problem: '패키지 결정 보류(004) → 인쇄 일정 압박', problemEv: 'ML-OL-004',
        learning: '화면 목업 평가와 실제 매대 결과가 달랐음 (A안 61% vs B안 78%)',
        plan: '패키지 실물검증을 5단계 Gate 템플릿의 필수 단계로 넣음', planEv: 'D-054' },
      { theme: '구독·CX', problem: '구독 배송 CS율 12.5% (목표 8%)', problemEv: 'ML-OL-017',
        learning: '셀프변경 기능 없이 확장하면 CS가 먼저 무너짐 (기능 개발 3일 지연)',
        plan: '기능을 먼저 갖춘 뒤 확장, 월 신규 500명 상한, CS율 8% 넘으면 확장 중단', planEv: 'D-060' }
    ],
    strategy: {
      '유지': ['72시간 워룸 (템플릿·역할 표준화)', '실물 매대 테스트', '중형 크리에이터·UGC 소재', '원제품 레시피 유지', 'BREAK BAR 체험 포맷', 'POS/출고 지표 정의 통일'],
      '중단': ['대형 크리에이터 추가 집행', '전국 2+1 등 할인형 프로모션', 'B사 저회전 88점 운영', '시즌 한정 신규 패키지 제작', '체험 행사 규모 자동 확대'],
      '개선': ['프로모션 사전 증분효과 기준', '수요 시나리오별 생산 슬롯', '콘텐츠 승인·버전관리 Gate', '이슈 종결 조건 필수 기록', '외부 의존 업무 마감 5영업일 선행'],
      '신규': ['Vanilla Light 2SKU (2027.10 출시)', '구독 정식화 (월 500명 상한)', '2SKU 공용자재·공통 병형', '신제품 5단계 Gate 템플릿']
    },
    strategyEv: { '유지': ['ML-OL-019', 'D-053'], '중단': ['D-034', 'D-038', 'D-058', 'D-047'], '개선': ['D-054', 'ML-OL-010'], '신규': ['D-059', 'D-060', 'ML-OL-018'] },
    kpis: [
      { name: '제품군 판매', unit: '만 병', thisYear: 116.842, next: 170 },
      { name: '유효 점포', unit: '점', thisYear: 5140, next: 5800 },
      { name: '공헌이익률(CM)', unit: '%', thisYear: 33.8, next: 36.5 },
      { name: '90일 반복구매율', unit: '%', thisYear: 31.2, next: 33 }
    ],
    risks: [
      { name: '2SKU 재고·진열 복잡도', level: 4, prob: 4, ev: 'OI-022', note: '물류비 연 4,600만 원 증가 추정' },
      { name: '바닐라 SKU의 원제품 잠식', level: 3, prob: 3, ev: 'ML-OL-018', note: '상품팀 카니벌라이제이션 우려' },
      { name: '구독 확장 시 CS율 재상승', level: 3, prob: 2, ev: 'D-060', note: 'CS율 8% 초과 시 확장 중단' },
      { name: '할인 없는 운영의 판매 둔화', level: 4, prob: 3, ev: 'D-061', note: '판매 목표 170만 병 (+45%)' },
      { name: '원료 환율 변동', level: 2, prob: 3, ev: 'OI-008', note: '환율 5% 상승 시 병당 +29원' },
      { name: '외부 파트너 일정 지연', level: 3, prob: 4, ev: 'A-023', note: '지연·미완료 7건 중 5건이 외부 의존' }
    ],
    priorities: [
      { id: 'A-058', title: 'Vanilla Light 프로젝트(ML-VL-001) 킥오프·Gate1', due: '2027-07-02', owner: '정하늘/박서진' },
      { id: 'A-060', title: '종료보고·Decision/Action 로그 아카이브', due: '2027-06-30', owner: '이수민/서준호' },
      { id: 'A-059', title: 'B사 88점 철수 및 대체상권 60점 제안', due: '2027-07-09', owner: '윤재민/배민석' },
      { id: 'D-054', title: '5대 표준 개선과제 전사 적용', due: '2027-07', owner: 'PM 공통' }
    ],
    kpt: {
      Keep: ['72시간 워룸', '실제 매대 테스트', 'POS/출고 지표정의 통일', '중형 크리에이터 전환'],
      Problem: ['패키지 의사결정 지연', '초도 CAPA 부족', 'C사 프로모션 마진 훼손', '구독 기능 개발 지연'],
      Try: ['유효점포·기여이익 관리', '프로모션 사전 증분효과 기준', '2SKU 공용자재 설계']
    }
  }
};
