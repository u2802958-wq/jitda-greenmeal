/* ==========================================================================
   🦉 올빼미 급식 비교소 — 3단계 app.js
   --------------------------------------------------------------------------
   이번 단계 목표
     · '급식식단정보(mealServiceDietInfo)' API로 하루 급식을 불러온다
     · NEIS가 준 '긴 글자 한 줄'을 쪼개서 쓸 수 있는 자료로 바꾼다 (파싱)
     · 두 학교의 식단을 카드 2장으로 나란히 보여 준다
     · 원산지 표를 만들어 다른 곳을 진하게 표시한다

   2단계 코드는 그대로 두고, ⑪⑫⑬ 이 새로 늘었습니다.
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

/** 2026-07-08 → 20260708 (NEIS가 원하는 모양) */
const toYmd   = s => String(s).replace(/-/g, '');
/** 20260708 → 2026-07-08 (사람이 읽기 좋은 모양) */
const fromYmd = s => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;

function todayISO() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function setStatus(html, kind = '') {
  const box = $('#status');
  if (!html) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.className = 'status ' + kind;
  box.innerHTML = html;
}

/* ---------- ② 시도교육청 코드 ---------- */
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

/* ---------- ③ 알레르기 유발 식품 번호 (새로 추가!) ---------- */
const ALLERGEN = {
  1: '난류(계란)', 2: '우유', 3: '메밀', 4: '땅콩', 5: '대두(콩)', 6: '밀',
  7: '고등어', 8: '게', 9: '새우', 10: '돼지고기', 11: '복숭아', 12: '토마토',
  13: '아황산류', 14: '호두', 15: '닭고기', 16: '쇠고기', 17: '오징어',
  18: '조개류(굴·전복·홍합 등)', 19: '잣',
};

/* ---------- ④ 화면에 보여 줄 영양소 순서 (새로 추가!) ---------- */
const NUTRI_ORDER = ['에너지', '탄수화물', '단백질', '지방', '칼슘', '철분',
  '비타민A', '비타민C', '티아민', '리보플라빈'];

/* ==========================================================================
   ⑤ NEIS API 부르기 (2단계와 같음)
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
  try { res = await fetch(url); } catch (e) { throw new Error('NETWORK'); }
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

/* ---------- ⑥ 급식 가져오기 (새로 추가!) ---------- */
function fetchMeal(school, ymd) {
  return callNeis('mealServiceDietInfo', {
    ATPT_OFCDC_SC_CODE: school.ATPT_OFCDC_SC_CODE,   // 어느 교육청
    SD_SCHUL_CODE: school.SD_SCHUL_CODE,             // 어느 학교
    MLSV_YMD: ymd,                                   // 어느 날
  });
}

/* ==========================================================================
   ⑦ 글자를 자료로 바꾸기 (파싱) — 이번 단계의 핵심!
   ==========================================================================
   NEIS는 이렇게 '한 줄로 이어진 글자'를 줍니다.

   DDISH_NM  : "통밀밥 (6)<br/>순두부찌개 (1.5.9.13)<br/>사과 <br/>우유 (2)"
   CAL_INFO  : "697.5 Kcal"
   NTR_INFO  : "탄수화물(g) : 87.3<br/>단백질(g) : 40.4<br/> …"
   ORPLC_INFO: "쌀 : 국내산<br/>배추 : 국내산<br/> …"

   이걸 그대로 화면에 뿌리면 <br/> 이 그대로 보이거나 계산을 할 수 없습니다.
   그래서 쪼개는 함수를 만듭니다.
   -------------------------------------------------------------------------- */

/** '<br/>' 로 이어진 글자를 배열로 쪼개기 */
function splitBr(text) {
  return String(text || '')
    .split(/<br\s*\/?>/i)      // <br>, <br/>, <BR /> 모두 처리
    .map(s => s.trim())        // 앞뒤 공백 지우기
    .filter(Boolean);          // 빈 칸 버리기
}

/**
 * 식단 쪼개기
 * "순두부찌개 (1.5.9.13)" → { name:'순두부찌개', allergens:[1,5,9,13] }
 */
function parseDishes(ddish) {
  return splitBr(ddish).map(raw => {
    let s = raw.replace(/\*/g, '').trim();       // 맨 앞의 * 지우기

    // 맨 끝 괄호 안이 숫자와 점뿐이면 알레르기 번호입니다
    let allergens = [];
    const m = s.match(/\(([\d.\s]+)\)\s*$/);
    if (m) {
      allergens = m[1].split('.').map(v => parseInt(v.trim(), 10)).filter(Number.isFinite);
      s = s.slice(0, m.index).trim();
    }
    // (자), (완), (과) 같은 학교별 표시도 지우기
    const name = s.replace(/\((자|완|과|꿀함유|[^)]{1,6})\)\s*$/, '').trim() || s;

    return { name, allergens };
  });
}

/**
 * 영양정보 쪼개기
 * "탄수화물(g) : 87.3" → { 탄수화물: { value:87.3, unit:'g' } }
 */
function parseNutrients(ntr) {
  const out = {};
  for (const line of splitBr(ntr)) {
    const m = line.match(/^(.+?)\s*\(([^)]*)\)\s*:\s*([\d.]+)/);
    if (!m) continue;
    out[m[1].trim()] = { value: parseFloat(m[3]), unit: m[2].trim() };
  }
  return out;
}

/** "697.5 Kcal" → 697.5 (숫자만 뽑아내기) */
function parseCalorie(cal) {
  const m = String(cal || '').match(/[\d.]+/);
  return m ? parseFloat(m[0]) : null;
}

/** "쌀 : 국내산" → { 쌀: '국내산' } */
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
   ⑧ 급식 한 끼를 정리하기
   ========================================================================== */
function analyze(meal, school) {
  // R 이라는 빈 상자를 만들고, 필요한 것을 하나씩 넣습니다.
  const R = {
    school, meal,
    mealName: meal.MMEAL_SC_NM,
    date: meal.MLSV_YMD,
    servings: Number(meal.MLSV_FGR) || null,
  };

  R.dishes = parseDishes(meal.DDISH_NM);
  R.kcal   = parseCalorie(meal.CAL_INFO);
  R.origin = parseOrigin(meal.ORPLC_INFO);
  R.nutri  = parseNutrients(meal.NTR_INFO);
  if (R.kcal != null) R.nutri['에너지'] = { value: R.kcal, unit: 'kcal' };

  return R;
}

/* ==========================================================================
   ⑨ 화면 만들기 — 식단 카드 2장
   ========================================================================== */
let CURRENT = null;

/** 요리 한 줄 만들기 (요리 이름 + 알레르기 번호) */
function dishLine(d) {
  return `<li>
    <span class="dname">${esc(d.name)}</span>
    <span class="algs">${d.allergens.map(n =>
      `<span class="alg" title="${esc(ALLERGEN[n] || '기타')}">${n}</span>`).join('')}</span>
  </li>`;
}

/** 카드 아래쪽의 큰 숫자 상자 */
function factsBox(R) {
  return `<div class="facts">
    <div class="fact"><b>${R.kcal == null ? '–' : round1(R.kcal)}</b><span>kcal</span></div>
    <div class="fact"><b>${R.dishes.length}</b><span>요리 수</span></div>
    <div class="fact"><b>${R.servings ? R.servings.toLocaleString() : '–'}</b><span>급식 인원</span></div>
  </div>`;
}

function renderMealCards(A, B) {
  const card = (R, cls) => {
    // 이 식단에 나온 알레르기 번호를 모두 모아 중복 없이 정렬
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

/* ---------- ⑩ 원산지 비교 표 ---------- */
function renderOrigin(A, B) {
  const keys = [...new Set([...Object.keys(A.origin), ...Object.keys(B.origin)])];
  if (!keys.length) {
    $('#originTable').innerHTML = '<tr><td>원산지 정보가 제공되지 않았습니다.</td></tr>';
    return;
  }
  const rows = keys.map(k => {
    const a = A.origin[k] || '–', b = B.origin[k] || '–';
    const cls = (a !== b) ? 'diff' : 'same';     // 다르면 진하게(diff)
    return `<tr><th style="width:30%">${esc(k)}</th>
      <td class="${cls}">${esc(a)}</td><td class="${cls}">${esc(b)}</td></tr>`;
  }).join('');

  $('#originTable').innerHTML =
    `<thead><tr><th>품목</th><th>${esc(A.school.SCHUL_NM)}</th><th>${esc(B.school.SCHUL_NM)}</th></tr></thead>
     <tbody>${rows}</tbody>`;
}

/** 아직 안 만든 칸은 잠깐 안내문으로 채워 둡니다 */
function renderAll(A, B) {
  CURRENT = { A, B };
  renderMealCards(A, B);
  renderOrigin(A, B);
  $('#nutriBars').innerHTML   = '<p>영양소 그래프는 <b>4단계</b>에서 만듭니다. 📊</p>';
  $('#groupStacks').innerHTML = '<p>식품군 분류는 <b>4단계</b>에서 만듭니다. 🧺</p>';
  $('#scoreboard').innerHTML  = '<p>점수 계산은 <b>5단계</b>에서 만듭니다. 🏅</p>';
  $('#result').hidden = false;
}

/* ==========================================================================
   ⑪ 학교 고르기 (2단계와 같음)
   ========================================================================== */
const PICKED = { A: null, B: null };

function setupPicker(slot) {
  const box     = $(`.picker[data-slot="${slot}"]`);
  const sidoSel = $('.sido', box);
  const input   = $('.q', box);
  const btn     = $('.searchBtn', box);
  const list    = $('.results', box);
  const chosen  = $('.chosen', box);

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
        setStatus(`‘${esc(q)}’(으)로 찾은 학교가 없습니다.`, 'warn');
        return;
      }
      list.innerHTML = rows.map((r, i) => `<li data-i="${i}">
        ${esc(r.SCHUL_NM)}
        <small>${esc(r.SCHUL_KND_SC_NM || '')} · ${esc(r.LCTN_SC_NM || '')} · ${esc(r.ATPT_OFCDC_SC_NM || '')}</small>
      </li>`).join('');
      $$('li', list).forEach(li =>
        li.addEventListener('click', () => show(rows[Number(li.dataset.i)])));
      if (!getKey() && rows.totalCount > rows.length) {
        setStatus(`모두 <b>${rows.totalCount}곳</b> 중 <b>${rows.length}곳</b>만 보입니다.
          🔑 인증키를 넣으면 더 많이 볼 수 있어요.`, 'warn');
      } else {
        setStatus(`${rows.length}곳을 찾았습니다. 목록에서 학교를 누르세요.`);
      }
    } catch (e) { showError(e); } finally { btn.disabled = false; }
  }

  btn.addEventListener('click', doSearch);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

  const saved = localStorage.getItem('owl' + slot);
  if (saved) { try { show(JSON.parse(saved)); } catch (_) {} }
}

function showError(e) {
  const msg = String(e.message || e);
  if (msg === 'NETWORK') {
    setStatus(`<b>NEIS에 연결하지 못했습니다.</b> 인터넷 연결을 확인하세요.`, 'error');
    return;
  }
  if (msg.includes('INFO-300')) {
    setStatus('<b>인증키가 올바르지 않습니다.</b> 🔑 상자에서 키를 지우고 다시 해 보세요.', 'error');
    return;
  }
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
    localStorage.setItem('neisKey', v); input.value = ''; refresh();
    setStatus('인증키를 저장했습니다.');
  });
  $('#clearKeyBtn').addEventListener('click', () => {
    localStorage.removeItem('neisKey'); refresh(); setStatus('인증키를 지웠습니다.');
  });
  refresh();
}

/* ==========================================================================
   ⑫ 두 학교 비교하기 — 이번 단계의 목표 동작!
   ========================================================================== */
async function compare() {
  const A = PICKED.A, B = PICKED.B;
  if (!A || !B) { setStatus('학교 <b>A와 B를 모두</b> 골라 주세요.', 'warn'); return; }
  if (A.SD_SCHUL_CODE === B.SD_SCHUL_CODE) {
    setStatus('서로 <b>다른 학교</b>를 골라 주세요.', 'warn'); return;
  }

  const ymd  = toYmd($('#date').value);
  const type = $('#mealType').value;          // '1' 조식 / '2' 중식 / '3' 석식
  if (!ymd) { setStatus('날짜를 골라 주세요.', 'warn'); return; }

  $('#compareBtn').disabled = true;
  setStatus('급식 정보를 불러오는 중…', 'loading');
  try {
    // Promise.all : 두 학교를 '동시에' 부르기 (하나씩 기다리면 두 배 느립니다)
    const [rowsA, rowsB] = await Promise.all([fetchMeal(A, ymd), fetchMeal(B, ymd)]);

    // 하루에 조식/중식/석식이 모두 올 수 있으니 우리가 고른 끼니만 찾습니다
    const pick = rows => rows.find(r => r.MMEAL_SC_CODE === type) || null;
    const mA = pick(rowsA), mB = pick(rowsB);

    const missing = [];
    if (!mA) missing.push(A.SCHUL_NM);
    if (!mB) missing.push(B.SCHUL_NM);
    if (missing.length) {
      setStatus(`<b>${esc(missing.join(', '))}</b>의 ${fromYmd(ymd)} 자료가 없습니다.
        주말·공휴일·방학이거나 학교가 아직 등록하지 않은 날일 수 있습니다.
        날짜를 학기 중 평일로 바꿔 보세요.`, 'warn');
      return;
    }

    renderAll(analyze(mA, A), analyze(mB, B));
    setStatus('');
    $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) { showError(e); } finally { $('#compareBtn').disabled = false; }
}

/* ---------- ⑬ 앱 시작 ---------- */
function init() {
  $('#date').value = todayISO();
  setupKeyBox();
  setupPicker('A');
  setupPicker('B');
  $('#compareBtn').addEventListener('click', compare);
  $('#printBtn')?.addEventListener('click', () => window.print());

  setStatus('3단계 완성! 학교 두 곳과 <b>학기 중 평일</b> 날짜를 고르고 비교해 보세요.');
}

init();
