/* ==========================================================================
   🦉 올빼미 급식 비교소 — 4단계 app.js
   --------------------------------------------------------------------------
   이번 단계 목표
     · 영양소를 '막대그래프'로 그린다 (CSS의 width 만으로!)
     · 권장 기준값과 비교하는 '기준선'을 넣는다
     · 요리 이름을 보고 식품군을 자동으로 분류한다 → 컴퓨터의 한계도 함께 본다

   3단계 코드에 ★ 표시된 부분이 새로 늘었습니다.
   ========================================================================== */
'use strict';

/* ---------- ① 짧은 도구 ---------- */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const round1 = n => Math.round(n * 10) / 10;
const clamp  = (n, lo, hi) => Math.min(hi, Math.max(lo, n));      // ★ 값을 lo~hi 안으로 가두기
const toYmd   = s => String(s).replace(/-/g, '');
const fromYmd = s => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;

function todayISO() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function setStatus(html, kind = '') {
  const box = $('#status');
  if (!html) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false; box.className = 'status ' + kind; box.innerHTML = html;
}

/* ---------- ② 시도교육청 / 알레르기 / 영양소 순서 ---------- */
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
const ALLERGEN = {
  1: '난류(계란)', 2: '우유', 3: '메밀', 4: '땅콩', 5: '대두(콩)', 6: '밀',
  7: '고등어', 8: '게', 9: '새우', 10: '돼지고기', 11: '복숭아', 12: '토마토',
  13: '아황산류', 14: '호두', 15: '닭고기', 16: '쇠고기', 17: '오징어',
  18: '조개류(굴·전복·홍합 등)', 19: '잣',
};
const NUTRI_ORDER = ['에너지', '탄수화물', '단백질', '지방', '칼슘', '철분',
  '비타민A', '비타민C', '티아민', '리보플라빈'];

/* ==========================================================================
   ★ ③ 영양 참고 기준값 (1인 1회 중식 기준)
   학교급식법 시행규칙 별표 3 「학교급식의 영양관리기준」 참고값입니다.
   고시가 바뀔 수 있으니 최신 값을 확인하고 이 숫자만 고치면 됩니다.
   ========================================================================== */
const STANDARD = {
  e13: { label: '초등 1~3학년', 에너지: 534, 단백질: 8.4,  비타민A: 97,  티아민: 0.20, 리보플라빈: 0.24, 비타민C: 13.4, 칼슘: 184, 철분: 2.4 },
  e46: { label: '초등 4~6학년', 에너지: 634, 단백질: 11.7, 비타민A: 127, 티아민: 0.24, 리보플라빈: 0.30, 비타민C: 19.6, 칼슘: 217, 철분: 3.0 },
  m:   { label: '중학교',       에너지: 800, 단백질: 16.6, 비타민A: 167, 티아민: 0.34, 리보플라빈: 0.43, 비타민C: 26.7, 칼슘: 267, 철분: 4.5 },
  h:   { label: '고등학교',     에너지: 900, 단백질: 20.0, 비타민A: 200, 티아민: 0.40, 리보플라빈: 0.50, 비타민C: 33.4, 칼슘: 300, 철분: 5.4 },
};

/** ★ 학교급 이름 → 어떤 기준을 쓸지 정하기 */
function levelOf(kind) {
  if (!kind) return 'm';
  if (kind.includes('초등')) return 'e46';    // 학년을 알 수 없어 4~6학년 기준
  if (kind.includes('중'))   return 'm';
  if (kind.includes('고'))   return 'h';
  return 'm';
}

/* ==========================================================================
   ★ ④ 식품군 사전
   요리 이름에 이 낱말이 들어 있으면 그 식품군으로 봅니다.
   규칙: "가장 긴 낱말이 이긴다"
     예) '배추김치' 에는 '배'(과일)도 '배추'(채소)도 들어 있습니다.
         더 긴 '배추'가 이겨서 → 채소류. 똑똑하죠?
   ========================================================================== */
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
const GROUP_ETC = { key: '기타', label: '기타·후식·국물', color: '#8b93a8' };

/** ★ 가공식품·튀김으로 볼 낱말 (완벽하지 않습니다 — 수업에서 함께 고쳐 보세요!) */
const PROCESSED_WORDS = ['튀김', '튀기', '까스', '가스', '너겟', '너깃', '후라이', '프라이',
  '강정', '탕수', '소시지', '햄', '베이컨', '스팸', '어묵', '맛살', '크랩', '만두', '핫도그',
  '치킨', '크로켓', '고로케', '피자', '버거', '라면', '프랑크', '비엔나', '미트볼', '함박',
  '커틀렛', '유린기', '깐풍', '멘보샤', '통조림', '케이크', '쿠키', '도넛', '츄러스', '웨지'];

/** ★ 요리 이름 → 식품군 ("가장 긴 낱말이 이긴다") */
function classifyDish(name) {
  let best = GROUP_ETC, bestLen = 0;
  for (const g of FOOD_GROUPS) {
    for (const w of g.words) {
      if (name.includes(w) && w.length > bestLen) { bestLen = w.length; best = g; }
    }
  }
  return best;
}

/* ==========================================================================
   ⑤ NEIS API 부르기 (3단계와 같음)
   ========================================================================== */
const API_BASE = 'https://open.neis.go.kr/hub/';
function getKey() { return localStorage.getItem('neisKey') || ''; }

async function callNeis(endpoint, params) {
  const q = new URLSearchParams({ Type: 'json', pIndex: 1, pSize: 100, ...params });
  const key = getKey();
  if (key) q.set('KEY', key);
  const url = API_BASE + endpoint + '?' + q.toString();
  console.log('부르는 주소 👉', url);      // F12 → Console 에서 확인할 수 있습니다

  let res;
  try { res = await fetch(url); }
  catch (e) { throw new Error('NETWORK'); }
  if (!res.ok) throw new Error('HTTP ' + res.status);

  const data = await res.json();
  if (data.RESULT) {
    if (data.RESULT.CODE === 'INFO-200') return [];
    throw new Error(data.RESULT.CODE + ' : ' + data.RESULT.MESSAGE);
  }
  const body = data[endpoint];
  if (!body) return [];
  const rows = body[1]?.row || [];
  rows.totalCount = body[0]?.head?.[0]?.list_total_count ?? rows.length;
  return rows;
}
function searchSchools(name, sido) {
  const params = { SCHUL_NM: name };
  if (sido) params.ATPT_OFCDC_SC_CODE = sido;
  return callNeis('schoolInfo', params);
}
function fetchMeal(school, ymd) {
  return callNeis('mealServiceDietInfo', {
    ATPT_OFCDC_SC_CODE: school.ATPT_OFCDC_SC_CODE,
    SD_SCHUL_CODE: school.SD_SCHUL_CODE,
    MLSV_YMD: ymd,
  });
}

/* ==========================================================================
   ⑥ 파싱 (3단계와 같음 + 식품군/가공 판정 추가 ★)
   ========================================================================== */
function splitBr(text) {
  return String(text || '').split(/<br\s*\/?>/i).map(s => s.trim()).filter(Boolean);
}

function parseDishes(ddish) {
  return splitBr(ddish).map(raw => {
    let s = raw.replace(/\*/g, '').trim();
    let allergens = [];
    const m = s.match(/\(([\d.\s]+)\)\s*$/);
    if (m) {
      allergens = m[1].split('.').map(v => parseInt(v.trim(), 10)).filter(Number.isFinite);
      s = s.slice(0, m.index).trim();
    }
    const name = s.replace(/\((자|완|과|꿀함유|[^)]{1,6})\)\s*$/, '').trim() || s;

    return {
      name, allergens,
      group: classifyDish(name),                                        // ★
      processed: PROCESSED_WORDS.some(w => name.includes(w)),            // ★
    };
  });
}

function parseNutrients(ntr) {
  const out = {};
  for (const line of splitBr(ntr)) {
    const m = line.match(/^(.+?)\s*\(([^)]*)\)\s*:\s*([\d.]+)/);
    if (!m) continue;
    out[m[1].trim()] = { value: parseFloat(m[3]), unit: m[2].trim() };
  }
  return out;
}
function parseCalorie(cal) {
  const m = String(cal || '').match(/[\d.]+/);
  return m ? parseFloat(m[0]) : null;
}
function parseOrigin(orplc) {
  const out = {};
  for (const line of splitBr(orplc)) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    const k = line.slice(0, i).trim(), v = line.slice(i + 1).trim();
    if (k && v) out[k] = v;
  }
  return out;
}

/* ==========================================================================
   ⑦ 급식 한 끼 정리하기 (★ 식품군 세기 추가)
   ========================================================================== */
function analyze(meal, school, levelKey) {
  const R = {
    school, meal, levelKey,
    std: STANDARD[levelKey],
    mealName: meal.MMEAL_SC_NM,
    date: meal.MLSV_YMD,
    servings: Number(meal.MLSV_FGR) || null,
  };

  R.dishes = parseDishes(meal.DDISH_NM);
  R.kcal   = parseCalorie(meal.CAL_INFO);
  R.origin = parseOrigin(meal.ORPLC_INFO);
  R.nutri  = parseNutrients(meal.NTR_INFO);
  if (R.kcal != null) R.nutri['에너지'] = { value: R.kcal, unit: 'kcal' };

  // ★ 식품군별로 요리가 몇 가지인지 세기
  R.groupCount = {};
  for (const g of [...FOOD_GROUPS, GROUP_ETC]) R.groupCount[g.key] = 0;
  for (const d of R.dishes) R.groupCount[d.group.key]++;
  R.groupsCovered = FOOD_GROUPS.filter(g => R.groupCount[g.key] > 0).length;   // 0~5
  R.processedCnt  = R.dishes.filter(d => d.processed).length;

  return R;
}

/* ==========================================================================
   ★ ⑧ 막대그래프 한 줄 만들기 — 이번 단계의 핵심!
   ==========================================================================
   그래프 라이브러리 없이 만듭니다. 원리는 아주 간단합니다.

      막대 길이(%) = 내 값 ÷ 가장 큰 값 × 100

   이 숫자를 CSS 의 width 에 넣어 주면 그게 바로 막대그래프입니다!
   -------------------------------------------------------------------------- */
function barRow(label, sub, aVal, bVal, max, unit, goal) {
  const bar = (v, cls) => {
    if (v == null) {
      return `<div class="bar-track"><div class="bar-fill ${cls} low" style="width:0%">자료 없음</div></div>`;
    }
    const pct = max > 0 ? clamp((v / max) * 100, 0, 100) : 0;    // ← 여기가 계산!
    return `<div class="bar-track">
      <div class="bar-fill ${cls}${pct < 30 ? ' low' : ''}" style="width:${pct.toFixed(1)}%">${round1(v)}${unit || ''}</div>
    </div>`;
  };
  // 권장 기준값 위치에 세로선 하나 세우기
  const goalMark = (goal != null && max > 0 && goal <= max)
    ? `<div class="bar-goal" style="left:${((goal / max) * 100).toFixed(1)}%"></div>` : '';

  return `<div class="bar-item">
    <div class="bar-label">${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</div>
    <div class="bar-track-set">${goalMark}${bar(aVal, 'a')}${bar(bVal, 'b')}</div>
  </div>`;
}

/* ---------- ★ ⑨ 영양소 막대 그리기 ---------- */
function renderNutriBars(A, B) {
  const rows = NUTRI_ORDER.map(name => {
    const a = A.nutri[name]?.value ?? null;
    const b = B.nutri[name]?.value ?? null;
    if (a == null && b == null) return '';                 // 둘 다 없으면 줄을 안 만듦

    const unit = A.nutri[name]?.unit || B.nutri[name]?.unit || '';
    const gA = A.std[name], gB = B.std[name];
    // 두 학교의 기준이 같을 때만 기준선을 그립니다 (학교급이 다르면 기준도 다름)
    const goal = (gA != null && gA === gB) ? gA : null;

    const max = Math.max(a ?? 0, b ?? 0, goal ?? 0) * 1.12 || 1;
    const sub = (gA != null || gB != null) ? `기준 A ${gA ?? '–'} / B ${gB ?? '–'}` : '';
    return barRow(`${name}${unit ? ` (${unit})` : ''}`, sub, a, b, max, '', goal);
  }).join('');

  $('#nutriBars').innerHTML = rows || '<p>영양 정보가 제공되지 않았습니다.</p>';
  $('#nutriHint').innerHTML = A.levelKey === B.levelKey
    ? `막대 길이는 두 학교 중 큰 값에 맞춰 그렸습니다.
       세로선(<b>기준</b>)은 <b>${esc(STANDARD[A.levelKey].label)}</b> 1인 1회 참고 기준값입니다.`
    : `두 학교의 <b>학교급이 달라 기준도 다르므로</b> 세로 기준선은 생략했습니다
       (A: ${esc(A.std.label)} / B: ${esc(B.std.label)}).`;
}

/* ---------- ★ ⑩ 식품군 구성 (누적 막대) ---------- */
function renderGroups(A, B) {
  const groups = [...FOOD_GROUPS, GROUP_ETC];

  // 색 설명(범례)
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

/* ==========================================================================
   ⑪ 식단 카드 (★ 식품군 이름표와 가공/튀김 표시가 추가됨)
   ========================================================================== */
/** ★ 요리 한 줄 만들기 — 3단계 것에 '식품군 이름표'와 '가공/튀김' 표시가 늘었습니다 */
function dishLine(d) {
  return `<li>
    <span class="gname" style="border-color:${d.group.color};color:${d.group.color}">${esc(d.group.label.split('·')[0])}</span>
    <span class="dname">${esc(d.name)}</span>
    ${d.processed ? '<span class="flag">가공/튀김</span>' : ''}
    <span class="algs">${d.allergens.map(n =>
      `<span class="alg" title="${esc(ALLERGEN[n] || '기타')}">${n}</span>`).join('')}</span>
  </li>`;
}

/** ★ 큰 숫자 상자 — '식품군 n/5' 가 늘었습니다 */
function factsBox(R) {
  return `<div class="facts">
    <div class="fact"><b>${R.kcal == null ? '–' : round1(R.kcal)}</b><span>kcal</span></div>
    <div class="fact"><b>${R.dishes.length}</b><span>요리 수</span></div>
    <div class="fact"><b>${R.groupsCovered}/5</b><span>식품군</span></div>
    <div class="fact"><b>${R.servings ? R.servings.toLocaleString() : '–'}</b><span>급식 인원</span></div>
  </div>`;
}

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
          ? allAlg.map(n => `${n}(${esc(ALLERGEN[n] || '?')})`).join(', ') : '표시 없음'}
      </p>
    </div>`;
  };
  $('#mealCards').innerHTML = card(A, 'a') + card(B, 'b');
}

/* ---------- ⑫ 원산지 표 (3단계와 같음) ---------- */
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

/* ---------- ⑬ 색 설명 + 전체 그리기 ---------- */
let CURRENT = null;

function renderLegend(A, B) {
  const html = `<span><i style="background:var(--a)"></i>${esc(A.school.SCHUL_NM)}</span>
                <span><i style="background:var(--b)"></i>${esc(B.school.SCHUL_NM)}</span>`;
  $('#legend1').innerHTML = html;
  $('#legend2').innerHTML = html;
}

function renderAll(A, B) {
  CURRENT = { A, B };
  renderLegend(A, B);
  renderMealCards(A, B);
  renderNutriBars(A, B);      // ★
  renderGroups(A, B);         // ★
  renderOrigin(A, B);
  $('#scoreboard').innerHTML = '<p>종합 점수와 레이더 차트는 <b>5단계</b>에서 만듭니다. 🏅</p>';
  $('#result').hidden = false;
}

/* ==========================================================================
   ⑭ 학교 고르기 / 오류 / 인증키 / 비교 (3단계와 거의 같음)
   ========================================================================== */
const PICKED = { A: null, B: null };

function setupPicker(slot) {
  const box     = $(`.picker[data-slot="${slot}"]`);
  const sidoSel = $('.sido', box), input = $('.q', box), btn = $('.searchBtn', box);
  const list    = $('.results', box), chosen = $('.chosen', box);

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
        list.innerHTML = ''; setStatus(`‘${esc(q)}’(으)로 찾은 학교가 없습니다.`, 'warn'); return;
      }
      list.innerHTML = rows.map((r, i) => `<li data-i="${i}">
        ${esc(r.SCHUL_NM)}
        <small>${esc(r.SCHUL_KND_SC_NM || '')} · ${esc(r.LCTN_SC_NM || '')} · ${esc(r.ATPT_OFCDC_SC_NM || '')}</small>
      </li>`).join('');
      $$('li', list).forEach(li =>
        li.addEventListener('click', () => show(rows[Number(li.dataset.i)])));
      setStatus(!getKey() && rows.totalCount > rows.length
        ? `모두 <b>${rows.totalCount}곳</b> 중 <b>${rows.length}곳</b>만 보입니다. 🔑 인증키를 넣어 보세요.`
        : `${rows.length}곳을 찾았습니다. 목록에서 학교를 누르세요.`,
        !getKey() && rows.totalCount > rows.length ? 'warn' : '');
    } catch (e) { showError(e); } finally { btn.disabled = false; }
  }

  btn.addEventListener('click', doSearch);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

  const saved = localStorage.getItem('owl' + slot);
  if (saved) { try { show(JSON.parse(saved)); } catch (_) {} }
}

function showError(e) {
  const msg = String(e.message || e);
  if (msg === 'NETWORK') { setStatus('<b>NEIS에 연결하지 못했습니다.</b> 인터넷 연결을 확인하세요.', 'error'); return; }
  if (msg.includes('INFO-300')) { setStatus('<b>인증키가 올바르지 않습니다.</b>', 'error'); return; }
  setStatus(`문제가 생겼습니다: <code>${esc(msg)}</code>`, 'error');
}

function setupKeyBox() {
  const input = $('#apiKey'), state = $('#keyState');
  const refresh = () => {
    const k = getKey();
    state.textContent = k ? `저장됨 (…${k.slice(-6)})` : '저장된 키 없음 (검색 결과 5곳 제한)';
  };
  $('#saveKeyBtn').addEventListener('click', () => {
    const v = input.value.trim();
    if (!v) { setStatus('인증키를 붙여넣어 주세요.', 'warn'); return; }
    localStorage.setItem('neisKey', v); input.value = ''; refresh(); setStatus('인증키를 저장했습니다.');
  });
  $('#clearKeyBtn').addEventListener('click', () => {
    localStorage.removeItem('neisKey'); refresh(); setStatus('인증키를 지웠습니다.');
  });
  refresh();
}

async function compare() {
  const A = PICKED.A, B = PICKED.B;
  if (!A || !B) { setStatus('학교 <b>A와 B를 모두</b> 골라 주세요.', 'warn'); return; }
  if (A.SD_SCHUL_CODE === B.SD_SCHUL_CODE) { setStatus('서로 <b>다른 학교</b>를 골라 주세요.', 'warn'); return; }

  const ymd = toYmd($('#date').value), type = $('#mealType').value;
  if (!ymd) { setStatus('날짜를 골라 주세요.', 'warn'); return; }

  $('#compareBtn').disabled = true;
  setStatus('급식 정보를 불러오는 중…', 'loading');
  try {
    const [rowsA, rowsB] = await Promise.all([fetchMeal(A, ymd), fetchMeal(B, ymd)]);
    const pick = rows => rows.find(r => r.MMEAL_SC_CODE === type) || null;
    const mA = pick(rowsA), mB = pick(rowsB);

    const missing = [];
    if (!mA) missing.push(A.SCHUL_NM);
    if (!mB) missing.push(B.SCHUL_NM);
    if (missing.length) {
      setStatus(`<b>${esc(missing.join(', '))}</b>의 ${fromYmd(ymd)} 자료가 없습니다.
        학기 중 평일로 날짜를 바꿔 보세요.`, 'warn');
      return;
    }

    // ★ 학교급에 맞는 기준을 고릅니다
    const lv = $('#levelSel').value;
    const keyA = lv === 'auto' ? levelOf(A.SCHUL_KND_SC_NM) : lv;
    const keyB = lv === 'auto' ? levelOf(B.SCHUL_KND_SC_NM) : lv;

    renderAll(analyze(mA, A, keyA), analyze(mB, B, keyB));
    setStatus('');
    $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) { showError(e); } finally { $('#compareBtn').disabled = false; }
}

/* ---------- ⑮ 앱 시작 ---------- */
function init() {
  $('#date').value = todayISO();
  setupKeyBox();
  setupPicker('A');
  setupPicker('B');
  $('#compareBtn').addEventListener('click', compare);
  $('#printBtn')?.addEventListener('click', () => window.print());

  setStatus('4단계 완성! 비교해 보고, <b>컴퓨터가 식품군을 잘못 분류한 요리</b>를 찾아보세요. 🔍');
}

init();
