/* ==========================================================================
   🦉 올빼미 급식 비교소 — app.js
   --------------------------------------------------------------------------
   자료: NEIS 교육정보 개방 포털 공개 API (https://open.neis.go.kr)
     · 학교기본정보  schoolInfo
     · 급식식단정보  mealServiceDietInfo

   이 파일은 8개의 묶음(섹션)으로 되어 있습니다.
     1. 자료 정하기 (상수)
     2. 자주 쓰는 짧은 도구들
     3. NEIS API 부르기
     4. 글자를 자료로 바꾸기 (파싱)
     5. 분석하기 (점수 계산)
     6. 화면 만들기 (HTML 만들어 넣기)
     7. 그림 그리기 (SVG 레이더 차트)
     8. 버튼과 연결하기
   ========================================================================== */
'use strict';

/* ==========================================================================
   1. 자료 정하기 (상수)
   ========================================================================== */

/** NEIS API 주소 앞부분 */
const API_BASE = 'https://open.neis.go.kr/hub/';

/** 17개 시도교육청 코드. NEIS가 정해 둔 코드라서 그대로 적어야 합니다. */
const SIDO_LIST = [
  ['', '전국(시도 상관없이)'],
  ['B10', '서울특별시교육청'], ['C10', '부산광역시교육청'],
  ['D10', '대구광역시교육청'], ['E10', '인천광역시교육청'],
  ['F10', '광주광역시교육청'], ['G10', '대전광역시교육청'],
  ['H10', '울산광역시교육청'], ['I10', '세종특별자치시교육청'],
  ['J10', '경기도교육청'],     ['K10', '강원특별자치도교육청'],
  ['M10', '충청북도교육청'],   ['N10', '충청남도교육청'],
  ['P10', '전북특별자치도교육청'], ['Q10', '전라남도교육청'],
  ['R10', '경상북도교육청'],   ['S10', '경상남도교육청'],
  ['T10', '제주특별자치도교육청'],
];

/** 알레르기 유발 식품 번호 (식품위생법 표시 대상) */
const ALLERGEN = {
  1: '난류(계란)', 2: '우유', 3: '메밀', 4: '땅콩', 5: '대두(콩)', 6: '밀',
  7: '고등어', 8: '게', 9: '새우', 10: '돼지고기', 11: '복숭아', 12: '토마토',
  13: '아황산류', 14: '호두', 15: '닭고기', 16: '쇠고기', 17: '오징어',
  18: '조개류(굴·전복·홍합 등)', 19: '잣',
};

/* --------------------------------------------------------------------------
   ⚠️ 영양 참고 기준값 (1인 1회 중식 기준)
   학교급식법 시행규칙 별표 3 「학교급식의 영양관리기준」을 참고한 값입니다.
   ★ 고시가 바뀔 수 있으니, 수업 전에 최신 값을 확인하고 이 숫자만 고치면 됩니다.
   ★ 조식·석식에는 이 기준이 그대로 맞지 않습니다 (중식 기준입니다).
   -------------------------------------------------------------------------- */
const STANDARD = {
  e13: { label: '초등 1~3학년', 에너지: 534, 단백질: 8.4,  비타민A: 97,  티아민: 0.20, 리보플라빈: 0.24, 비타민C: 13.4, 칼슘: 184, 철분: 2.4 },
  e46: { label: '초등 4~6학년', 에너지: 634, 단백질: 11.7, 비타민A: 127, 티아민: 0.24, 리보플라빈: 0.30, 비타민C: 19.6, 칼슘: 217, 철분: 3.0 },
  m:   { label: '중학교',       에너지: 800, 단백질: 16.6, 비타민A: 167, 티아민: 0.34, 리보플라빈: 0.43, 비타민C: 26.7, 칼슘: 267, 철분: 4.5 },
  h:   { label: '고등학교',     에너지: 900, 단백질: 20.0, 비타민A: 200, 티아민: 0.40, 리보플라빈: 0.50, 비타민C: 33.4, 칼슘: 300, 철분: 5.4 },
};

/** 학교급 이름 → 어떤 기준을 쓸지 */
function levelOf(schoolKind) {
  if (!schoolKind) return 'm';
  if (schoolKind.includes('초등')) return 'e46';   // 학년을 알 수 없어 4~6학년 기준을 씁니다
  if (schoolKind.includes('중'))   return 'm';
  if (schoolKind.includes('고'))   return 'h';
  return 'm';
}

/* --------------------------------------------------------------------------
   식품군 사전 — 요리 이름에 이 낱말이 들어 있으면 그 식품군으로 봅니다.
   규칙: "가장 긴 낱말이 이긴다". (예: 배추김치 → '배'(과일)보다 '배추'(채소)가 길다)
   같은 길이면 아래 목록에서 먼저 나온 식품군이 이깁니다.
   -------------------------------------------------------------------------- */
const FOOD_GROUPS = [
  {
    key: '단백질', label: '고기·생선·달걀·콩', color: '#c0504d',
    words: ['고기', '쇠고기', '소고기', '돼지', '돈육', '제육', '수육', '육개장', '갈비', '떡갈비',
      '불고기', '장조림', '산적', '육전', '닭', '치킨', '찜닭', '오리', '햄', '소시지', '비엔나',
      '베이컨', '스팸', '너겟', '너깃', '함박', '미트볼', '스테이크', '탕수', '탕수육', '까스',
      '가스', '커틀렛', '크로켓', '고로케', '깐풍', '유린', '강정', '멘보샤', '순대', '곱창',
      '생선', '고등어', '삼치', '갈치', '임연수', '코다리', '동태', '명태', '조기', '가자미',
      '오징어', '새우', '게살', '맛살', '꽃게', '참치', '멸치', '쭈꾸미', '주꾸미', '낙지', '문어',
      '어묵', '달걀', '계란', '메추리', '두부', '순두부', '유부', '완자', '콩', '콩자반',
      '목살', '삼겹', '등심', '안심', '채끝', '훈제', '돈까스', '롤까스'],
  },
  {
    key: '유제품', label: '우유·유제품', color: '#4f7bc0',
    words: ['우유', '흰우유', '초코우유', '바나나우유', '두유', '요구르트', '요거트', '요플레',
      '야쿠르트', '치즈', '체다', '모짜렐라', '리코타', '밀크', '라떼', '생크림', '크림',
      '버터', '푸딩', '아이스크림'],
  },
  {
    key: '과일', label: '과일류', color: '#d1607f',
    words: ['사과', '배', '귤', '감귤', '오렌지', '바나나', '포도', '청포도', '수박', '참외',
      '딸기', '토마토', '방울토마토', '키위', '멜론', '파인애플', '자두', '복숭아', '천도복숭아',
      '한라봉', '천혜향', '블루베리', '망고', '과일', '후르츠', '프루츠', '애플', '단감', '홍시',
      '대추', '살구', '체리', '레몬', '자몽', '무화과', '석류', '유자'],
  },
  {
    key: '채소', label: '채소류', color: '#4a9b5c',
    words: ['나물', '무침', '김치', '겉절이', '깍두기', '총각김치', '열무', '얼갈이', '샐러드',
      '생채', '숙채', '쌈', '야채', '채소', '브로콜리', '시금치', '콩나물', '숙주', '오이',
      '상추', '양상추', '배추', '양배추', '파프리카', '버섯', '가지', '애호박', '호박', '단호박',
      '도라지', '미역', '파래', '톳', '조미김', '김구이', '단무지', '피클', '장아찌', '부추',
      '시래기', '취나물', '참나물', '우엉', '연근', '당근', '죽순', '마늘', '양파', '대파',
      '쪽파', '셀러리', '샐러리', '콜라비', '비타민', '청경채', '두릅', '냉이', '달래', '곤드레'],
  },
  {
    key: '곡류', label: '곡류·주식', color: '#c9932f',
    words: ['밥', '백미', '흑미', '현미', '잡곡', '보리', '통밀', '기장', '죽', '국수', '면',
      '라면', '우동', '파스타', '스파게티', '라이스', '빵', '떡', '만두', '김밥', '주먹밥',
      '유부초밥', '덮밥', '국밥', '리조또', '필라프', '누룽지', '수제비', '떡국', '칼국수',
      '쫄면', '비빔면', '냉면', '짜장', '자장', '토스트', '시리얼', '또띠아', '부리또',
      '와플', '팬케이크', '마카로니', '감자', '고구마', '옥수수'],
  },
];

/** 위 다섯 군데 어디에도 안 들어가면 '기타' */
const GROUP_ETC = { key: '기타', label: '기타·후식·국물', color: '#8b93a8' };

/** 가공식품·튀김으로 볼 낱말 (완벽하지 않습니다 — 수업에서 함께 고쳐 보세요!) */
const PROCESSED_WORDS = ['튀김', '튀기', '까스', '가스', '너겟', '너깃', '후라이', '프라이',
  '강정', '탕수', '소시지', '햄', '베이컨', '스팸', '어묵', '맛살', '크랩', '만두', '핫도그',
  '치킨', '크로켓', '고로케', '피자', '버거', '라면', '프랑크', '비엔나', '미트볼', '함박',
  '커틀렛', '유린기', '깐풍', '멘보샤', '통조림', '케이크', '쿠키', '도넛', '츄러스', '웨지'];

/** 점수 항목 5개 */
const AXES = [
  { key: 'energy',  label: '열량 적정성',   short: '열량',       desc: '권장 열량에 가까울수록 높음' },
  { key: 'protein', label: '단백질 충분도', short: '단백질',     desc: '권장 단백질을 채웠는지' },
  { key: 'variety', label: '식단 다양성',   short: '다양성',     desc: '식품군 수 + 요리 수' },
  { key: 'micro',   label: '미량영양소',    short: '미량영양소', desc: '칼슘·철분·비타민A·C 달성률' },
  { key: 'fresh',   label: '가공·튀김 절제', short: '가공·튀김',  desc: '가공/튀김 요리가 적을수록 높음' },
];

/** 항목 중요도(가중치) 기본값 — 슬라이더로 바꿀 수 있습니다 */
let WEIGHTS = { energy: 25, protein: 20, variety: 20, micro: 20, fresh: 15 };

/** 화면에 보여 줄 영양소 순서 */
const NUTRI_ORDER = ['에너지', '탄수화물', '단백질', '지방', '칼슘', '철분', '비타민A', '비타민C', '티아민', '리보플라빈'];

/* ==========================================================================
   2. 자주 쓰는 짧은 도구들
   ========================================================================== */

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** API에서 온 글자를 화면에 안전하게 넣기 위해 특수문자를 바꿉니다 */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** 2026-07-08  →  20260708 (NEIS가 원하는 모양) */
const toYmd   = s => String(s).replace(/-/g, '');
/** 20260708  →  2026-07-08 */
const fromYmd = s => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;

/** 오늘 날짜를 2026-07-08 모양으로 */
function todayISO() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 소수점 정리 */
const round1 = n => Math.round(n * 10) / 10;
const clamp  = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** 알림줄 보여 주기 */
function setStatus(html, kind = '') {
  const box = $('#status');
  if (!html) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.className = 'status ' + kind;
  box.innerHTML = html;
}

/* ==========================================================================
   3. NEIS API 부르기
   ========================================================================== */

/** 저장된 인증키 (없으면 빈 문자열) */
function getKey() {
  return localStorage.getItem('neisKey') || '';
}

/**
 * NEIS API를 부르는 함수.
 * @param {string} endpoint  'schoolInfo' 또는 'mealServiceDietInfo'
 * @param {object} params    주소 뒤에 붙일 조건들
 * @returns {Promise<Array>} 결과 줄(row)들의 배열. 자료가 없으면 빈 배열 []
 */
async function callNeis(endpoint, params) {
  const q = new URLSearchParams({ Type: 'json', pIndex: 1, pSize: 100, ...params });
  const key = getKey();
  if (key) q.set('KEY', key);

  const url = API_BASE + endpoint + '?' + q.toString();
  console.log('부르는 주소 👉', url);      // F12 → Console 에서 확인할 수 있습니다

  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    throw new Error('NETWORK');           // 인터넷이 안 되거나 학교 방화벽에 막힌 경우
  }
  if (!res.ok) throw new Error('HTTP ' + res.status);

  const data = await res.json();

  // 자료가 아예 없을 때 NEIS는 { RESULT: {...} } 만 보내 줍니다.
  if (data.RESULT) {
    if (data.RESULT.CODE === 'INFO-200') return [];       // 해당하는 데이터가 없음
    throw new Error(data.RESULT.CODE + ' : ' + data.RESULT.MESSAGE);
  }

  const body = data[endpoint];
  if (!body) return [];

  const head = body[0]?.head?.[1]?.RESULT;
  if (head && head.CODE !== 'INFO-000') throw new Error(head.CODE + ' : ' + head.MESSAGE);

  const rows = body[1]?.row || [];
  rows.totalCount = body[0]?.head?.[0]?.list_total_count ?? rows.length;
  return rows;
}

/** 학교 이름으로 찾기 */
function searchSchools(name, sido) {
  const params = { SCHUL_NM: name };
  if (sido) params.ATPT_OFCDC_SC_CODE = sido;
  return callNeis('schoolInfo', params);
}

/** 학교 한 곳의 하루 급식 가져오기 */
function fetchMeal(school, ymd) {
  return callNeis('mealServiceDietInfo', {
    ATPT_OFCDC_SC_CODE: school.ATPT_OFCDC_SC_CODE,
    SD_SCHUL_CODE: school.SD_SCHUL_CODE,
    MLSV_YMD: ymd,
  });
}

/* ==========================================================================
   4. 글자를 자료로 바꾸기 (파싱)
   NEIS는 모든 것을 '긴 글자 한 줄'로 줍니다. 이것을 쓸 수 있게 쪼갭니다.
   ========================================================================== */

/** '<br/>' 로 이어진 글자를 배열로 쪼갭니다 */
function splitBr(text) {
  return String(text || '')
    .split(/<br\s*\/?>/i)
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * DDISH_NM 쪼개기
 * '통밀밥 (6)<br/>순두부찌개 (1.5.9.13)'
 *   → [{name:'통밀밥', allergens:[6], ...}, {name:'순두부찌개', allergens:[1,5,9,13], ...}]
 */
function parseDishes(ddish) {
  return splitBr(ddish).map(raw => {
    let s = raw.replace(/\*/g, '').trim();          // 앞의 * 지우기

    // 맨 끝 괄호 안이 숫자와 점뿐이면 알레르기 번호입니다
    let allergens = [];
    const m = s.match(/\(([\d.\s]+)\)\s*$/);
    if (m) {
      allergens = m[1].split('.').map(v => parseInt(v.trim(), 10)).filter(Number.isFinite);
      s = s.slice(0, m.index).trim();
    }
    // (자), (완), (과) 같은 학교별 표시는 지웁니다
    const name = s.replace(/\((자|완|과|꿀함유|[^)]{1,6})\)\s*$/, '').trim() || s;

    return {
      name,
      allergens,
      group: classifyDish(name),                              // 어느 식품군인가
      processed: PROCESSED_WORDS.some(w => name.includes(w)), // 가공/튀김인가
    };
  });
}

/** 요리 이름을 식품군으로 분류합니다 — "가장 긴 낱말이 이긴다" */
function classifyDish(name) {
  let best = GROUP_ETC, bestLen = 0;
  for (const g of FOOD_GROUPS) {
    for (const w of g.words) {
      if (name.includes(w) && w.length > bestLen) { bestLen = w.length; best = g; }
    }
  }
  return best;
}

/**
 * NTR_INFO 쪼개기
 * '탄수화물(g) : 87.3<br/>단백질(g) : 40.4'
 *   → { 탄수화물:{value:87.3, unit:'g'}, 단백질:{value:40.4, unit:'g'} }
 */
function parseNutrients(ntr) {
  const out = {};
  for (const line of splitBr(ntr)) {
    const m = line.match(/^(.+?)\s*\(([^)]*)\)\s*:\s*([\d.]+)/);
    if (!m) continue;
    const name = m[1].trim();                        // 비타민A
    out[name] = { value: parseFloat(m[3]), unit: m[2].trim() };
  }
  return out;
}

/** CAL_INFO '697.5 Kcal' → 697.5 */
function parseCalorie(cal) {
  const m = String(cal || '').match(/[\d.]+/);
  return m ? parseFloat(m[0]) : null;
}

/** ORPLC_INFO → { '쌀':'국내산', '배추':'국내산', ... } */
function parseOrigin(orplc) {
  const out = {};
  for (const line of splitBr(orplc)) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    if (k && v) out[k] = v;
  }
  return out;
}

/* ==========================================================================
   5. 분석하기 (점수 계산)
   ========================================================================== */

/* --------------------------------------------------------------------------
   점수 5가지. 하나하나가 작은 함수라서 따로 고치거나 새로 만들기 쉽습니다.
   모두 0~100점을 돌려주고, 계산할 자료가 없으면 null(=자료 없음)을 돌려줍니다.
   -------------------------------------------------------------------------- */

/** ① 열량 적정성 — 권장 열량에 가까울수록 100점 (많아도 감점!) */
function scoreEnergy(R) {
  if (R.kcal == null || !R.std.에너지) return null;
  const ratio = R.kcal / R.std.에너지;                 // 1.0 이면 딱 맞음
  return clamp(100 - Math.abs(ratio - 1) * 250, 0, 100);
}

/** ② 단백질 충분도 — 권장 단백질을 채우면 100점 */
function scoreProtein(R) {
  const p = R.nutri['단백질'];
  if (!p || !R.std.단백질) return null;
  return clamp((p.value / R.std.단백질) * 100, 0, 100);
}

/** ③ 식단 다양성 — 식품군 수(70%) + 요리 수(30%) */
function scoreVariety(R) {
  if (!R.dishes.length) return null;
  return clamp((R.groupsCovered / 5) * 70 + (Math.min(R.dishes.length, 7) / 7) * 30, 0, 100);
}

/** ④ 미량영양소 — 칼슘·철분·비타민A·비타민C 달성률의 평균 */
function scoreMicro(R) {
  const rates = ['칼슘', '철분', '비타민A', '비타민C']
    .filter(k => R.nutri[k] && R.std[k])
    .map(k => clamp((R.nutri[k].value / R.std[k]) * 100, 0, 100));
  return rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null;
}

/** ⑤ 가공·튀김 절제 — 가공/튀김 요리 비율이 낮을수록 100점 */
function scoreFresh(R) {
  if (!R.dishes.length) return null;
  return clamp(100 - (R.processedCnt / R.dishes.length) * 200, 0, 100);
}

/**
 * 급식 한 끼를 분석해서 정리된 자료 R 을 만들어 돌려줍니다.
 * R 이라는 상자를 하나 만들고, 필요한 것을 하나씩 넣는 방식입니다.
 * @param {object} meal    NEIS 급식 한 줄
 * @param {object} school  학교 정보
 * @param {string} levelKey  'e13' | 'e46' | 'm' | 'h'
 */
function analyze(meal, school, levelKey) {
  const R = {
    school, meal, levelKey,
    std: STANDARD[levelKey],
    mealName: meal.MMEAL_SC_NM,
    date: meal.MLSV_YMD,
    servings: Number(meal.MLSV_FGR) || null,
  };

  /* --- 긴 글자를 쓸 수 있는 자료로 바꿔 담기 --- */
  R.dishes = parseDishes(meal.DDISH_NM);
  R.kcal   = parseCalorie(meal.CAL_INFO);
  R.origin = parseOrigin(meal.ORPLC_INFO);
  R.nutri  = parseNutrients(meal.NTR_INFO);
  if (R.kcal != null) R.nutri['에너지'] = { value: R.kcal, unit: 'kcal' };

  /* --- 식품군별로 요리가 몇 가지인지 세기 --- */
  R.groupCount = {};
  for (const g of [...FOOD_GROUPS, GROUP_ETC]) R.groupCount[g.key] = 0;
  for (const d of R.dishes) R.groupCount[d.group.key]++;
  R.groupsCovered = FOOD_GROUPS.filter(g => R.groupCount[g.key] > 0).length;   // 0~5
  R.processedCnt  = R.dishes.filter(d => d.processed).length;

  /* --- 점수 5가지 --- */
  R.scores = {
    energy:  scoreEnergy(R),
    protein: scoreProtein(R),
    variety: scoreVariety(R),
    micro:   scoreMicro(R),
    fresh:   scoreFresh(R),
  };

  return R;
}

/** 항목 점수 5개를 가중치로 합쳐 총점을 냅니다 (자료 없는 항목은 빼고 계산) */
function totalScore(scores) {
  let sum = 0, w = 0;
  for (const ax of AXES) {
    const v = scores[ax.key];
    if (v == null) continue;
    sum += v * WEIGHTS[ax.key];
    w += WEIGHTS[ax.key];
  }
  return w ? sum / w : null;
}

/* ==========================================================================
   6. 화면 만들기
   ========================================================================== */

/** 지금 화면에 그려져 있는 분석 결과 (CSV 저장에도 씁니다) */
let CURRENT = null;

/** 막대 한 줄 만들기 (A와 B를 위아래로 나란히) */
function barRow(label, sub, aVal, bVal, max, unit, goal) {
  const bar = (v, cls) => {
    if (v == null) return `<div class="bar-track"><div class="bar-fill ${cls} low" style="width:0%">자료 없음</div></div>`;
    const pct = max > 0 ? clamp((v / max) * 100, 0, 100) : 0;
    const text = `${round1(v)}${unit || ''}`;
    return `<div class="bar-track">
      <div class="bar-fill ${cls}${pct < 30 ? ' low' : ''}" style="width:${pct.toFixed(1)}%">${text}</div>
    </div>`;
  };
  const goalMark = (goal != null && max > 0 && goal <= max)
    ? `<div class="bar-goal" style="left:${((goal / max) * 100).toFixed(1)}%"></div>` : '';

  return `<div class="bar-item">
    <div class="bar-label">${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</div>
    <div class="bar-track-set">${goalMark}${bar(aVal, 'a')}${bar(bVal, 'b')}</div>
  </div>`;
}

/** 총점 판 그리기 */
function renderScoreboard(A, B) {
  const card = (R, cls, colorVar) => {
    const t = totalScore(R.scores);
    return `<div class="score-card">
      <h3><span class="chip chip-${cls}">학교 ${cls.toUpperCase()}</span> ${esc(R.school.SCHUL_NM)}
        <small>${esc(R.school.SCHUL_KND_SC_NM || '')} · ${esc(STANDARD[R.levelKey].label)} 기준 적용</small></h3>
      <div class="gauge" style="--p:${t == null ? 0 : t.toFixed(1)}; --c:var(${colorVar})">
        <b>${t == null ? '–' : Math.round(t)}<i>점</i></b>
      </div>
    </div>`;
  };
  $('#scoreboard').innerHTML = card(A, 'a', '--a') + card(B, 'b', '--b');

  const tA = totalScore(A.scores), tB = totalScore(B.scores);
  const diff = (tA != null && tB != null) ? Math.abs(tA - tB) : null;
  let msg = `${fromYmd(A.date)} ${esc(A.mealName)} 기준입니다.`;
  if (diff != null) {
    msg += diff < 3
      ? ' 두 학교의 총점 차이가 3점 미만이라 <b>거의 비슷</b>합니다.'
      : ` 총점 차이는 <b>${round1(diff)}점</b>입니다.`;
  }
  $('#scoreSub').innerHTML = msg;
}

/** 항목별 점수 막대 */
function renderScoreBars(A, B) {
  $('#scoreBars').innerHTML = AXES
    .map(ax => barRow(ax.label, ax.desc, A.scores[ax.key], B.scores[ax.key], 100, '점'))
    .join('');
}

/** 가중치 슬라이더 */
function renderWeights(onChange) {
  $('#weights').innerHTML = AXES.map(ax => `
    <div class="weight-row">
      <label for="w-${ax.key}">${esc(ax.label)}</label>
      <input type="range" id="w-${ax.key}" min="0" max="40" step="5" value="${WEIGHTS[ax.key]}" data-wkey="${ax.key}">
      <output id="o-${ax.key}">${WEIGHTS[ax.key]}%</output>
    </div>`).join('');

  $$('#weights input[type="range"]').forEach(inp => {
    inp.addEventListener('input', () => {
      WEIGHTS[inp.dataset.wkey] = Number(inp.value);
      $('#o-' + inp.dataset.wkey).textContent = inp.value + '%';
      onChange();
    });
  });
}

/** 요리 한 줄 만들기 — 식품군 이름표 + 요리 이름 + 가공 표시 + 알레르기 번호 */
function dishLine(d) {
  return `<li>
    <span class="gname" style="border-color:${d.group.color};color:${d.group.color}">${esc(d.group.label.split('·')[0])}</span>
    <span class="dname">${esc(d.name)}</span>
    ${d.processed ? '<span class="flag" title="이름에 가공식품·튀김 낱말이 들어 있습니다">가공/튀김</span>' : ''}
    <span class="algs">${d.allergens.map(n =>
      `<span class="alg" title="${esc(ALLERGEN[n] || '기타')}">${n}</span>`).join('')}</span>
  </li>`;
}

/** 카드 아래쪽의 큰 숫자 상자 4개 */
function factsBox(R) {
  return `<div class="facts">
    <div class="fact"><b>${R.kcal == null ? '–' : round1(R.kcal)}</b><span>kcal</span></div>
    <div class="fact"><b>${R.dishes.length}</b><span>요리 수</span></div>
    <div class="fact"><b>${R.groupsCovered}/5</b><span>식품군</span></div>
    <div class="fact"><b>${R.servings ? R.servings.toLocaleString() : '–'}</b><span>급식 인원</span></div>
  </div>`;
}

/** 식단 카드 2장 */
function renderMealCards(A, B) {
  const card = (R, cls) => {
    const allAlg = [...new Set(R.dishes.flatMap(d => d.allergens))].sort((a, b) => a - b);

    return `<div class="meal-card ${cls}">
      <h3><span class="chip chip-${cls}">학교 ${cls.toUpperCase()}</span> ${esc(R.school.SCHUL_NM)}
        <small>${esc(R.school.ATPT_OFCDC_SC_NM || '')} · ${esc(R.school.LCTN_SC_NM || '')}</small></h3>
      <ul class="dish-list">${R.dishes.map(dishLine).join('') || '<li>식단 정보가 없습니다.</li>'}</ul>
      ${factsBox(R)}
      <p style="font-size:12px;color:var(--muted);margin:12px 0 0">
        알레르기 번호 모음: ${allAlg.length
          ? allAlg.map(n => `${n}(${esc(ALLERGEN[n] || '?')})`).join(', ')
          : '표시 없음'}
      </p>
    </div>`;
  };
  $('#mealCards').innerHTML = card(A, 'a') + card(B, 'b');
}

/** 영양소 막대 */
function renderNutriBars(A, B) {
  const rows = NUTRI_ORDER.map(name => {
    const a = A.nutri[name]?.value ?? null;
    const b = B.nutri[name]?.value ?? null;
    if (a == null && b == null) return '';

    const unit = A.nutri[name]?.unit || B.nutri[name]?.unit || '';
    // 기준선은 두 학교의 기준이 같을 때만 그립니다 (학교급이 다르면 기준도 다름)
    const gA = A.std[name], gB = B.std[name];
    const goal = (gA != null && gA === gB) ? gA : null;

    const max = Math.max(a ?? 0, b ?? 0, goal ?? 0) * 1.12 || 1;
    const sub = (gA != null || gB != null)
      ? `기준 A ${gA ?? '–'} / B ${gB ?? '–'}`
      : '';
    return barRow(`${name}${unit ? ` (${unit})` : ''}`, sub, a, b, max, '', goal);
  }).join('');

  $('#nutriBars').innerHTML = rows || '<p>영양 정보가 제공되지 않았습니다.</p>';

  $('#nutriHint').innerHTML = A.levelKey === B.levelKey
    ? `막대 길이는 두 학교 중 큰 값에 맞춰 그렸습니다.
       세로선(<b>기준</b>)은 <b>${esc(STANDARD[A.levelKey].label)}</b> 1인 1회 참고 기준값입니다.`
    : `막대 길이는 두 학교 중 큰 값에 맞춰 그렸습니다.
       두 학교의 <b>학교급이 달라 적용 기준도 다르므로</b> 세로 기준선은 생략했습니다
       (A: ${esc(A.std.label)} / B: ${esc(B.std.label)}). 항목 이름 아래에 각각의 기준값을 적어 두었습니다.`;
}

/** 식품군 구성 스택 바 */
function renderGroups(A, B) {
  const groups = [...FOOD_GROUPS, GROUP_ETC];

  $('#groupLegend').innerHTML = groups
    .map(g => `<span><i style="background:${g.color}"></i>${esc(g.label)}</span>`).join('');

  const stack = (R, cls) => {
    const total = R.dishes.length || 1;
    const segs = groups.filter(g => R.groupCount[g.key] > 0).map(g => {
      const n = R.groupCount[g.key];
      const pct = (n / total) * 100;
      return `<div style="background:${g.color};width:${pct}%" title="${esc(g.label)} ${n}가지">${pct > 12 ? n : ''}</div>`;
    }).join('');
    return `<div class="group-row">
      <div class="bar-label"><span class="chip chip-${cls}">${cls.toUpperCase()}</span>
        ${esc(R.school.SCHUL_NM)} — 요리 ${R.dishes.length}가지, 식품군 ${R.groupsCovered}/5</div>
      <div class="stack">${segs}</div>
    </div>`;
  };
  $('#groupStacks').innerHTML = stack(A, 'a') + stack(B, 'b');
}

/** 원산지 비교 표 */
function renderOrigin(A, B) {
  const keys = [...new Set([...Object.keys(A.origin), ...Object.keys(B.origin)])];
  if (!keys.length) {
    $('#originTable').innerHTML = '<tr><td>원산지 정보가 제공되지 않았습니다.</td></tr>';
    return;
  }
  const rows = keys.map(k => {
    const a = A.origin[k] || '–', b = B.origin[k] || '–';
    const cls = (a !== b) ? 'diff' : 'same';
    return `<tr><th style="width:30%">${esc(k)}</th>
      <td class="${cls}">${esc(a)}</td><td class="${cls}">${esc(b)}</td></tr>`;
  }).join('');

  $('#originTable').innerHTML =
    `<thead><tr><th>품목</th><th>${esc(A.school.SCHUL_NM)}</th><th>${esc(B.school.SCHUL_NM)}</th></tr></thead>
     <tbody>${rows}</tbody>`;
}

/** 자동 분석 코멘트 + 토론 질문 */
function renderComments(A, B) {
  const out = [];
  const nameA = A.school.SCHUL_NM, nameB = B.school.SCHUL_NM;

  /* 열량 */
  if (A.kcal != null && B.kcal != null) {
    const d = A.kcal - B.kcal;
    out.push(['info', `열량은 <b>${esc(nameA)} ${round1(A.kcal)}kcal</b>,
      <b>${esc(nameB)} ${round1(B.kcal)}kcal</b>로 차이가 ${round1(Math.abs(d))}kcal입니다.`]);

    for (const R of [A, B]) {
      const r = R.kcal / R.std.에너지;
      if (r > 1.25) out.push(['down', `${esc(R.school.SCHUL_NM)}은(는) ${esc(R.std.label)} 권장 열량(${R.std.에너지}kcal)의
        <b>${Math.round(r * 100)}%</b>로 다소 높습니다. 후식이나 튀김 요리가 있었는지 확인해 보세요.`]);
      else if (r < 0.8) out.push(['down', `${esc(R.school.SCHUL_NM)}은(는) 권장 열량의 <b>${Math.round(r * 100)}%</b>로
        다소 낮습니다. 일품요리(한 그릇 음식)만 나온 날일 수 있습니다.`]);
      else out.push(['up', `${esc(R.school.SCHUL_NM)}의 열량은 권장의 <b>${Math.round(r * 100)}%</b>로 적정 범위(80~120%)입니다.`]);
    }
  }

  /* 단백질 */
  for (const R of [A, B]) {
    const p = R.nutri['단백질']?.value;
    if (p == null) continue;
    const r = p / R.std.단백질;
    out.push([r >= 1 ? 'up' : 'down',
      `${esc(R.school.SCHUL_NM)}의 단백질은 <b>${round1(p)}g</b>으로 권장(${R.std.단백질}g)의 ${Math.round(r * 100)}%입니다.`]);
  }

  /* 다양성 */
  const varyMore = A.groupsCovered === B.groupsCovered ? null : (A.groupsCovered > B.groupsCovered ? A : B);
  if (varyMore) {
    out.push(['info', `식품군은 <b>${esc(varyMore.school.SCHUL_NM)}</b>이(가) 더 골고루 들어갔습니다
      (${A.groupsCovered}/5 vs ${B.groupsCovered}/5).`]);
  } else {
    out.push(['info', `두 학교 모두 식품군 <b>${A.groupsCovered}/5</b>로 같습니다.`]);
  }

  /* 빠진 식품군 알려 주기 */
  for (const R of [A, B]) {
    const missing = FOOD_GROUPS.filter(g => !R.groupCount[g.key]).map(g => g.label);
    if (missing.length) out.push(['down',
      `${esc(R.school.SCHUL_NM)}의 식단에서는 <b>${esc(missing.join(', '))}</b>(으)로 분류된 요리를 찾지 못했습니다.
       정말 없었을까요, 아니면 컴퓨터가 못 알아본 걸까요?`]);
  }

  /* 가공식품 */
  for (const R of [A, B]) {
    if (!R.dishes.length) continue;
    const pct = Math.round((R.processedCnt / R.dishes.length) * 100);
    out.push([pct >= 34 ? 'down' : 'up',
      `${esc(R.school.SCHUL_NM)}은(는) ${R.dishes.length}가지 중 <b>${R.processedCnt}가지(${pct}%)</b>가
       가공·튀김 낱말에 걸렸습니다.`]);
  }

  /* 원산지 */
  const originDiff = [...new Set([...Object.keys(A.origin), ...Object.keys(B.origin)])]
    .filter(k => (A.origin[k] || '') !== (B.origin[k] || ''));
  if (originDiff.length) out.push(['info',
    `원산지 표기가 다른 품목이 <b>${originDiff.length}개</b> 있습니다
     (예: ${esc(originDiff.slice(0, 3).join(', '))}).`]);

  $('#comments').innerHTML = out
    .map(([k, html]) => `<li class="${k}">${html}</li>`).join('');

  /* 토론 질문 */
  $('#questions').innerHTML = [
    `두 학교의 열량 차이가 생긴 가장 큰 이유는 어떤 요리 때문일까요?`,
    `‘좋은 급식’을 점수로 나타낼 때, 여러분은 어떤 항목에 가장 큰 중요도를 주고 싶나요? 위 슬라이더를 움직여 보고 그 이유를 적어 보세요.`,
    `컴퓨터가 식품군을 <b>잘못 분류한 요리</b>를 찾아보세요. 왜 틀렸을까요? app.js의 FOOD_GROUPS에 어떤 낱말을 넣으면 고칠 수 있을까요?`,
    `알레르기 번호가 많은 식단은 나쁜 급식일까요? 왜 그렇게 생각하나요?`,
    `${esc(A.school.SCHUL_KND_SC_NM || 'A')}와 ${esc(B.school.SCHUL_KND_SC_NM || 'B')}의 권장 기준이 다른 이유는 무엇일까요?`,
    `같은 학교의 다른 날짜를 비교하면 결과가 어떻게 달라질까요? 한 주 동안 조사해 보세요.`,
  ].map(q => `<li>${q}</li>`).join('');
}

/* ==========================================================================
   7. 그림 그리기 — SVG 레이더(거미줄) 차트
   ========================================================================== */

function renderRadar(A, B) {
  const size = 340, c = size / 2, R = 108, n = AXES.length;

  // i번째 축의, 중심에서 r만큼 떨어진 점의 좌표
  const pt = (i, r) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;   // 12시 방향부터 시계방향
    return [c + Math.cos(ang) * r, c + Math.sin(ang) * r];
  };
  const poly = vals => vals
    .map((v, i) => pt(i, (clamp(v ?? 0, 0, 100) / 100) * R).map(x => x.toFixed(1)).join(','))
    .join(' ');

  // 배경 거미줄 (25/50/75/100%)
  const rings = [25, 50, 75, 100].map(p => {
    const d = AXES.map((_, i) => pt(i, (p / 100) * R).map(x => x.toFixed(1)).join(',')).join(' ');
    return `<polygon points="${d}" fill="none" stroke="var(--line)" stroke-width="1"/>`;
  }).join('');

  // 중심에서 뻗어 나가는 선 + 축 이름
  const spokes = AXES.map((ax, i) => {
    const [x, y] = pt(i, R);
    const [lx, ly] = pt(i, R + 24);
    const anchor = lx > c + 6 ? 'start' : lx < c - 6 ? 'end' : 'middle';
    return `<line x1="${c}" y1="${c}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"
              stroke="var(--line)" stroke-width="1"/>
      <text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="${anchor}"
            font-size="11" font-weight="700" fill="var(--muted)">${esc(ax.short)}</text>`;
  }).join('');

  const vA = AXES.map(ax => A.scores[ax.key]);
  const vB = AXES.map(ax => B.scores[ax.key]);

  $('#radar').innerHTML = `
    <svg viewBox="-30 -18 ${size + 60} ${size + 36}" role="img"
         aria-label="다섯 항목 점수를 겹쳐 그린 레이더 차트">
      ${rings}${spokes}
      <polygon points="${poly(vB)}" fill="var(--b)" fill-opacity="0.22"
               stroke="var(--b)" stroke-width="2"/>
      <polygon points="${poly(vA)}" fill="var(--a)" fill-opacity="0.22"
               stroke="var(--a)" stroke-width="2"/>
      ${vA.map((v, i) => { const [x, y] = pt(i, (clamp(v ?? 0, 0, 100) / 100) * R);
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="var(--a)"/>`; }).join('')}
      ${vB.map((v, i) => { const [x, y] = pt(i, (clamp(v ?? 0, 0, 100) / 100) * R);
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="var(--b)"/>`; }).join('')}
    </svg>`;
}

/** 색 설명(범례) */
function renderLegend(A, B) {
  const html = `
    <span><i style="background:var(--a)"></i>${esc(A.school.SCHUL_NM)}</span>
    <span><i style="background:var(--b)"></i>${esc(B.school.SCHUL_NM)}</span>`;
  $('#legend1').innerHTML = html;
  $('#legend2').innerHTML = html;
}

/** 결과 전체 다시 그리기 */
function renderAll(A, B) {
  CURRENT = { A, B };
  renderLegend(A, B);
  renderScoreboard(A, B);
  renderScoreBars(A, B);
  renderRadar(A, B);
  renderMealCards(A, B);
  renderNutriBars(A, B);
  renderGroups(A, B);
  renderOrigin(A, B);
  renderComments(A, B);
  $('#result').hidden = false;
}

/** 가중치만 바뀌었을 때는 총점/코멘트만 다시 계산 */
function rescore() {
  if (!CURRENT) return;
  renderScoreboard(CURRENT.A, CURRENT.B);
}

/* ==========================================================================
   8. 버튼과 연결하기
   ========================================================================== */

/** 고른 학교를 담아 두는 곳 */
const PICKED = { A: null, B: null };

/** 학교 고르기 상자 하나를 작동시킵니다 (A와 B 둘 다 같은 함수를 씁니다) */
function setupPicker(slot) {
  const box     = $(`.picker[data-slot="${slot}"]`);
  const sidoSel = $('.sido', box);
  const input   = $('.q', box);
  const btn     = $('.searchBtn', box);
  const list    = $('.results', box);
  const chosen  = $('.chosen', box);

  // 시도 목록 채우기
  sidoSel.innerHTML = SIDO_LIST
    .map(([code, name]) => `<option value="${code}">${name.replace('교육청', '')}</option>`).join('');

  function show(school) {
    PICKED[slot] = school;
    chosen.className = 'chosen on';
    chosen.innerHTML = `<strong>${esc(school.SCHUL_NM)}</strong>
      <small>${esc(school.SCHUL_KND_SC_NM || '')} · ${esc(school.ATPT_OFCDC_SC_NM || '')}
      · 학교코드 ${esc(school.SD_SCHUL_CODE)}</small>`;
    list.innerHTML = '';
    localStorage.setItem('owl' + slot, JSON.stringify(school));
  }

  async function doSearch() {
    const q = input.value.trim();
    if (q.length < 2) { setStatus('학교 이름을 <b>2글자 이상</b> 입력해 주세요.', 'warn'); return; }

    btn.disabled = true;
    setStatus(`‘${esc(q)}’ 검색 중…`, 'loading');
    try {
      const rows = await searchSchools(q, sidoSel.value);
      if (!rows.length) {
        list.innerHTML = '';
        setStatus(`‘${esc(q)}’(으)로 찾은 학교가 없습니다. 이름을 조금 줄여서 다시 찾아보세요.`, 'warn');
        return;
      }
      list.innerHTML = rows.map((r, i) => `<li data-i="${i}">
        ${esc(r.SCHUL_NM)}
        <small>${esc(r.SCHUL_KND_SC_NM || '')} · ${esc(r.LCTN_SC_NM || '')} · ${esc(r.ATPT_OFCDC_SC_NM || '')}</small>
      </li>`).join('');
      $$('li', list).forEach(li =>
        li.addEventListener('click', () => show(rows[Number(li.dataset.i)])));

      const total = rows.totalCount;
      if (!getKey() && total > rows.length) {
        setStatus(`모두 <b>${total}곳</b> 중 <b>${rows.length}곳</b>만 보입니다.
          인증키가 없으면 한 번에 5줄까지만 받을 수 있습니다.
          아래 <b>🔑 NEIS 인증키 넣기</b>를 열어 키를 넣거나, 학교 이름을 더 자세히 입력해 보세요.`, 'warn');
      } else {
        setStatus(`${rows.length}곳을 찾았습니다. 목록에서 학교를 누르세요.`);
      }
    } catch (e) {
      showError(e);
    } finally {
      btn.disabled = false;
    }
  }

  btn.addEventListener('click', doSearch);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

  // 지난번에 고른 학교 되살리기
  const saved = localStorage.getItem('owl' + slot);
  if (saved) { try { show(JSON.parse(saved)); } catch (_) {} }
}

/** 오류를 학생이 알아볼 수 있는 말로 바꿔 보여 줍니다 */
function showError(e) {
  const msg = String(e.message || e);
  if (msg === 'NETWORK') {
    setStatus(`<b>NEIS에 연결하지 못했습니다.</b>
      <ol>
        <li>인터넷이 연결되어 있는지 확인하세요.</li>
        <li>학교 방화벽이 막을 수 있습니다. 휴대폰 핫스팟으로 시도해 보세요.</li>
        <li>그래도 안 되면 <b>🎬 예시 데이터로 먼저 보기</b> 버튼을 누르면 수업을 이어갈 수 있습니다.</li>
      </ol>`, 'error');
    return;
  }
  if (msg.includes('INFO-300')) {
    setStatus('<b>인증키가 올바르지 않습니다.</b> 🔑 상자를 열어 키를 다시 붙여넣거나, 키를 지우고(키 없이) 사용하세요.', 'error');
    return;
  }
  if (msg.includes('ERROR-337')) {
    setStatus('<b>오늘 사용할 수 있는 횟수를 다 썼습니다.</b> 인증키를 등록하면 훨씬 많이 쓸 수 있습니다.', 'error');
    return;
  }
  setStatus(`문제가 생겼습니다: <code>${esc(msg)}</code>`, 'error');
}

/** 두 학교 비교하기 (메인 동작) */
async function compare() {
  const A = PICKED.A, B = PICKED.B;
  if (!A || !B) { setStatus('학교 <b>A와 B를 모두</b> 골라 주세요.', 'warn'); return; }
  if (A.SD_SCHUL_CODE === B.SD_SCHUL_CODE) {
    setStatus('같은 학교를 두 번 골랐습니다. 서로 <b>다른 학교</b>를 골라 주세요.', 'warn'); return;
  }

  const ymd  = toYmd($('#date').value);
  const type = $('#mealType').value;          // 1 조식 / 2 중식 / 3 석식
  if (!ymd) { setStatus('날짜를 골라 주세요.', 'warn'); return; }

  $('#compareBtn').disabled = true;
  setStatus('급식 정보를 불러오는 중…', 'loading');

  try {
    // 두 학교를 동시에 부릅니다 (하나씩 기다리지 않으니 훨씬 빠릅니다)
    const [rowsA, rowsB] = await Promise.all([fetchMeal(A, ymd), fetchMeal(B, ymd)]);

    const pick = rows => rows.find(r => r.MMEAL_SC_CODE === type) || null;
    let mA = pick(rowsA), mB = pick(rowsB);

    const missing = [];
    if (!mA) missing.push(A.SCHUL_NM);
    if (!mB) missing.push(B.SCHUL_NM);

    if (missing.length) {
      const other = rows => [...new Set(rows.map(r => r.MMEAL_SC_NM))].join('/');
      const hintA = rowsA.length ? `${A.SCHUL_NM}: ${other(rowsA)} 있음` : `${A.SCHUL_NM}: 급식 없음`;
      const hintB = rowsB.length ? `${B.SCHUL_NM}: ${other(rowsB)} 있음` : `${B.SCHUL_NM}: 급식 없음`;
      setStatus(`<b>${esc(missing.join(', '))}</b>의 ${fromYmd(ymd)} 자료가 없습니다.
        (${esc(hintA)} / ${esc(hintB)})<br>
        주말·공휴일·방학이거나 학교가 아직 등록하지 않은 날일 수 있습니다.
        <b>🔎 급식 있는 날 찾기</b>를 눌러 보세요.`, 'warn');
      return;
    }

    const lv = $('#levelSel').value;
    const keyA = lv === 'auto' ? levelOf(A.SCHUL_KND_SC_NM) : lv;
    const keyB = lv === 'auto' ? levelOf(B.SCHUL_KND_SC_NM) : lv;

    renderAll(analyze(mA, A, keyA), analyze(mB, B, keyB));
    setStatus('');
    $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    showError(e);
  } finally {
    $('#compareBtn').disabled = false;
  }
}

/** 고른 날짜에서 거꾸로 세면서, 두 학교 모두 급식이 있는 날을 찾습니다 */
async function findRecent() {
  const A = PICKED.A, B = PICKED.B;
  if (!A || !B) { setStatus('먼저 학교 A와 B를 골라 주세요.', 'warn'); return; }

  const type = $('#mealType').value;
  const start = $('#date').value ? new Date($('#date').value) : new Date();

  $('#recentBtn').disabled = true;
  let checked = 0;
  try {
    for (let back = 0; back <= 30 && checked < 15; back++) {
      const d = new Date(start);
      d.setDate(d.getDate() - back);
      if (d.getDay() === 0 || d.getDay() === 6) continue;      // 토·일은 넘어감
      checked++;

      const p = n => String(n).padStart(2, '0');
      const ymd = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
      setStatus(`${fromYmd(ymd)} 확인 중… (${checked}번째)`, 'loading');

      const [ra, rb] = await Promise.all([fetchMeal(A, ymd), fetchMeal(B, ymd)]);
      const ok = ra.some(r => r.MMEAL_SC_CODE === type) && rb.some(r => r.MMEAL_SC_CODE === type);
      if (ok) {
        $('#date').value = fromYmd(ymd);
        setStatus(`두 학교 모두 급식이 있는 <b>${fromYmd(ymd)}</b>을(를) 찾았습니다. 이제 비교합니다.`);
        await compare();
        return;
      }
    }
    setStatus('최근 15번의 평일에서는 두 학교가 함께 급식한 날을 찾지 못했습니다. 날짜를 학기 중으로 바꿔 보세요.', 'warn');
  } catch (e) {
    showError(e);
  } finally {
    $('#recentBtn').disabled = false;
  }
}

/* --------------------------------------------------------------------------
   예시(데모) 자료 — 인터넷이 막힌 교실에서도 수업할 수 있게 넣어 둡니다.
   2026-07-08 중식, 실제 NEIS 응답을 그대로 옮긴 것입니다.
   -------------------------------------------------------------------------- */
const DEMO = {
  A: {
    school: { SCHUL_NM: '경기초등학교', SD_SCHUL_CODE: '7031110', ATPT_OFCDC_SC_CODE: 'B10',
      ATPT_OFCDC_SC_NM: '서울특별시교육청', SCHUL_KND_SC_NM: '초등학교', LCTN_SC_NM: '서울특별시' },
    meal: { MLSV_YMD: '20260708', MMEAL_SC_CODE: '2', MMEAL_SC_NM: '중식', MLSV_FGR: 582,
      DDISH_NM: '통밀밥 (6)<br/>순두부찌개 (1.5.9.13)<br/>브로콜리깨소스무침 (5.6.13)<br/>허브치킨플레로티 (1.2.5.6.12.13.15)<br/>배추김치 (9)<br/>사과 <br/>우유 (2)',
      CAL_INFO: '697.5 Kcal',
      NTR_INFO: '탄수화물(g) : 87.3<br/>단백질(g) : 40.4<br/>지방(g) : 19.9<br/>비타민A(R.E) : 103.6<br/>티아민(mg) : 0.4<br/>리보플라빈(mg) : 0.4<br/>비타민C(mg) : 14.2<br/>칼슘(mg) : 265.8<br/>철분(mg) : 2.8',
      ORPLC_INFO: '쇠고기(종류) : 국내산(육우)<br/>돼지고기 식육가공품 : 국내산<br/>쌀 : 국내산<br/>콩 가공품 : 국내산<br/>명태 : 러시아산<br/>낙지 : 베트남산' },
  },
  B: {
    school: { SCHUL_NM: '창원고등학교', SD_SCHUL_CODE: '9010114', ATPT_OFCDC_SC_CODE: 'S10',
      ATPT_OFCDC_SC_NM: '경상남도교육청', SCHUL_KND_SC_NM: '고등학교', LCTN_SC_NM: '경상남도' },
    meal: { MLSV_YMD: '20260708', MMEAL_SC_CODE: '2', MMEAL_SC_NM: '중식', MLSV_FGR: 630,
      DDISH_NM: '백미밥(자) <br/>아라비아따파스타 (2.5.6.10.12.13.15.16.18)<br/>단호박크림스프 <br/>리코타과일샐러드(자) (2)<br/>감자치즈롤까스(꿀함유) (2.5.6.10)<br/>깍두기(자) (9)',
      CAL_INFO: '1158.7 Kcal',
      NTR_INFO: '탄수화물(g) : 142.8<br/>단백질(g) : 32.8<br/>지방(g) : 50.8<br/>비타민A(R.E) : 145.8<br/>티아민(mg) : 0.5<br/>리보플라빈(mg) : 0.9<br/>비타민C(mg) : 19.7<br/>칼슘(mg) : 154.3<br/>철분(mg) : 4.5',
      ORPLC_INFO: '쇠고기(종류) : 국내산(한우)<br/>돼지고기 식육가공품 : 국내산<br/>쌀 : 국내산<br/>콩 : 국내산<br/>명태 : 국내산<br/>낙지 : 국내산' },
  },
};

function showDemo() {
  const lv = $('#levelSel').value;
  const mk = side => {
    const { school, meal } = DEMO[side];
    return analyze(meal, school, lv === 'auto' ? levelOf(school.SCHUL_KND_SC_NM) : lv);
  };
  $('#date').value = '2026-07-08';
  $('#mealType').value = '2';
  renderAll(mk('A'), mk('B'));
  setStatus('지금은 <b>예시 데이터</b>를 보고 있습니다. 실제 자료를 보려면 학교를 고르고 <b>📊 두 학교 비교하기</b>를 누르세요.', 'warn');
  $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** 결과를 CSV 파일로 저장 (엑셀에서 열립니다) */
function downloadCsv() {
  if (!CURRENT) return;
  const { A, B } = CURRENT;
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [];

  lines.push(['구분', A.school.SCHUL_NM, B.school.SCHUL_NM].map(q).join(','));
  lines.push(['날짜', fromYmd(A.date), fromYmd(B.date)].map(q).join(','));
  lines.push(['끼니', A.mealName, B.mealName].map(q).join(','));
  lines.push(['학교급', A.school.SCHUL_KND_SC_NM, B.school.SCHUL_KND_SC_NM].map(q).join(','));
  lines.push(['적용 기준', A.std.label, B.std.label].map(q).join(','));
  lines.push(['식단', A.dishes.map(d => d.name).join(' / '), B.dishes.map(d => d.name).join(' / ')].map(q).join(','));
  lines.push(['요리 수', A.dishes.length, B.dishes.length].map(q).join(','));
  lines.push(['식품군 수(5)', A.groupsCovered, B.groupsCovered].map(q).join(','));
  lines.push(['가공·튀김 요리 수', A.processedCnt, B.processedCnt].map(q).join(','));
  lines.push(['급식 인원', A.servings, B.servings].map(q).join(','));

  lines.push('');
  lines.push(['[영양소]', '', ''].map(q).join(','));
  for (const n of NUTRI_ORDER) {
    const a = A.nutri[n], b = B.nutri[n];
    if (!a && !b) continue;
    lines.push([`${n}(${a?.unit || b?.unit || ''})`, a?.value ?? '', b?.value ?? ''].map(q).join(','));
  }

  lines.push('');
  lines.push(['[항목 점수]', '', '중요도(%)'].map(q).join(','));
  for (const ax of AXES) {
    lines.push([ax.label,
      A.scores[ax.key] == null ? '' : round1(A.scores[ax.key]),
      B.scores[ax.key] == null ? '' : round1(B.scores[ax.key]),
      WEIGHTS[ax.key]].map(q).join(','));
  }
  const tA = totalScore(A.scores), tB = totalScore(B.scores);
  lines.push(['총점', tA == null ? '' : round1(tA), tB == null ? '' : round1(tB)].map(q).join(','));

  // ﻿(BOM)를 앞에 붙이면 엑셀에서 한글이 깨지지 않습니다
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `급식비교_${A.school.SCHUL_NM}_${B.school.SCHUL_NM}_${A.date}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** 밝은 화면 / 어두운 화면 바꾸기 */
function setupTheme() {
  const btn = $('#themeBtn');
  const apply = t => {
    if (t) document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
    btn.textContent = t === 'dark' ? '☀️' : '🌙';
  };
  apply(localStorage.getItem('owlTheme') || '');
  btn.addEventListener('click', () => {
    const now = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('owlTheme', now);
    apply(now);
    if (CURRENT) renderRadar(CURRENT.A, CURRENT.B);   // 차트 색 다시 맞추기
  });
}

/** 인증키 저장/지우기 */
function setupKeyBox() {
  const input = $('#apiKey'), state = $('#keyState');
  const refresh = () => {
    const k = getKey();
    state.textContent = k
      ? `저장됨 (…${k.slice(-6)}) — 검색 결과를 100곳까지 볼 수 있습니다.`
      : '저장된 키 없음 (키 없이 사용 중 — 검색 결과 5곳 제한)';
  };
  $('#saveKeyBtn').addEventListener('click', () => {
    const v = input.value.trim();
    if (!v) { setStatus('인증키를 붙여넣어 주세요.', 'warn'); return; }
    localStorage.setItem('neisKey', v);
    input.value = '';
    refresh();
    setStatus('인증키를 이 컴퓨터에 저장했습니다.');
  });
  $('#clearKeyBtn').addEventListener('click', () => {
    localStorage.removeItem('neisKey');
    refresh();
    setStatus('인증키를 지웠습니다. 키 없이 사용합니다.');
  });
  refresh();
}

/* --------------------------------------------------------------------------
   앱 시작!
   -------------------------------------------------------------------------- */
function init() {
  $('#date').value = todayISO();

  setupTheme();
  setupKeyBox();
  setupPicker('A');
  setupPicker('B');
  renderWeights(rescore);

  $('#compareBtn').addEventListener('click', compare);
  $('#recentBtn').addEventListener('click', findRecent);
  $('#demoBtn').addEventListener('click', showDemo);
  $('#csvBtn').addEventListener('click', downloadCsv);
  $('#printBtn').addEventListener('click', () => window.print());

  setStatus('학교 두 곳을 검색해서 고른 뒤 <b>📊 두 학교 비교하기</b>를 누르세요. ' +
            '처음이라면 <b>🎬 예시 데이터로 먼저 보기</b>부터 눌러 보세요.');
}

init();
