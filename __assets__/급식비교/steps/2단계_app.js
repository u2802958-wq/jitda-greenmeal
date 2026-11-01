/* ==========================================================================
   🦉 올빼미 급식 비교소 — 2단계 app.js
   --------------------------------------------------------------------------
   이번 단계 목표
     · 인터넷에서 자료를 받아오는 fetch 를 처음 써 본다
     · NEIS '학교기본정보(schoolInfo)' API로 학교를 검색한다
     · 검색 결과를 목록으로 보여 주고, 누르면 학교가 골라지게 한다

   1단계에서 만든 코드는 그대로 두고, ⑥⑦⑧ 부분이 새로 늘었습니다.
   ========================================================================== */
'use strict';

/* ---------- ① 짧은 도구 ---------- */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** API에서 온 글자를 화면에 안전하게 넣기 (해킹 방지 + 글자 깨짐 방지) */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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

/* ---------- ③ 오늘 날짜 ---------- */
function todayISO() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* ---------- ④ 알림줄 ---------- */
function setStatus(html, kind = '') {
  const box = $('#status');
  if (!html) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.className = 'status ' + kind;
  box.innerHTML = html;
}

/* ==========================================================================
   ⑤ 여기부터 새로 배우는 부분 — NEIS API 부르기
   ==========================================================================
   NEIS 주소는 이렇게 생겼습니다.

   https://open.neis.go.kr/hub/schoolInfo?Type=json&pSize=100&SCHUL_NM=창원고

   물음표(?) 뒤에 '조건=값'을 & 로 이어 붙입니다.
   우리가 손으로 붙이면 실수하기 쉬우니 URLSearchParams 가 대신 만들어 줍니다.
   -------------------------------------------------------------------------- */

const API_BASE = 'https://open.neis.go.kr/hub/';

/** 저장된 인증키 가져오기 (없으면 빈 문자열) */
function getKey() {
  return localStorage.getItem('neisKey') || '';
}

/**
 * NEIS API를 부르는 함수
 * async / await : "인터넷에서 답이 올 때까지 기다려" 라는 뜻입니다.
 */
async function callNeis(endpoint, params) {
  const q = new URLSearchParams({ Type: 'json', pIndex: 1, pSize: 100, ...params });
  const key = getKey();
  if (key) q.set('KEY', key);

  const url = API_BASE + endpoint + '?' + q.toString();
  console.log('부르는 주소 👉', url);      // F12 개발자도구 Console 에서 확인해 보세요!

  let res;
  try {
    res = await fetch(url);                // ← 인터넷에서 자료 받아오기
  } catch (e) {
    throw new Error('NETWORK');
  }
  if (!res.ok) throw new Error('HTTP ' + res.status);

  const data = await res.json();           // ← 받은 글자를 자바스크립트 자료로 바꾸기

  // 자료가 하나도 없으면 NEIS는 { RESULT: {...} } 만 보냅니다
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

/** 학교 이름으로 찾기 */
function searchSchools(name, sido) {
  const params = { SCHUL_NM: name };
  if (sido) params.ATPT_OFCDC_SC_CODE = sido;
  return callNeis('schoolInfo', params);
}

/* ==========================================================================
   ⑥ 고른 학교를 담아 두는 곳
   ========================================================================== */
const PICKED = { A: null, B: null };

/* ==========================================================================
   ⑦ 학교 고르기 상자 만들기
   A상자와 B상자는 생긴 게 똑같습니다.
   그래서 같은 함수를 두 번 부르기만 하면 됩니다. (코드를 두 번 쓰지 않기!)
   ========================================================================== */
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

  /** 학교 하나를 최종 선택했을 때 */
  function show(school) {
    PICKED[slot] = school;
    chosen.className = 'chosen on';
    chosen.innerHTML = `<strong>${esc(school.SCHUL_NM)}</strong>
      <small>${esc(school.SCHUL_KND_SC_NM || '')} · ${esc(school.ATPT_OFCDC_SC_NM || '')}
      · 학교코드 ${esc(school.SD_SCHUL_CODE)}</small>`;
    list.innerHTML = '';
    console.log(`${slot}에 고른 학교 👉`, school);
  }

  /** 검색 버튼을 눌렀을 때 */
  async function doSearch() {
    const q = input.value.trim();
    if (q.length < 2) { setStatus('학교 이름을 <b>2글자 이상</b> 입력해 주세요.', 'warn'); return; }

    btn.disabled = true;                       // 두 번 누르지 못하게 잠깐 막기
    setStatus(`‘${esc(q)}’ 검색 중…`, 'loading');
    try {
      const rows = await searchSchools(q, sidoSel.value);

      if (!rows.length) {
        list.innerHTML = '';
        setStatus(`‘${esc(q)}’(으)로 찾은 학교가 없습니다. 이름을 조금 줄여서 다시 찾아보세요.`, 'warn');
        return;
      }

      // 찾은 학교들을 <li> 목록으로 만들기 (map 으로 한 번에!)
      list.innerHTML = rows.map((r, i) => `<li data-i="${i}">
        ${esc(r.SCHUL_NM)}
        <small>${esc(r.SCHUL_KND_SC_NM || '')} · ${esc(r.LCTN_SC_NM || '')} · ${esc(r.ATPT_OFCDC_SC_NM || '')}</small>
      </li>`).join('');

      // 목록을 누르면 그 학교가 골라지게 하기
      $$('li', list).forEach(li =>
        li.addEventListener('click', () => show(rows[Number(li.dataset.i)])));

      if (!getKey() && rows.totalCount > rows.length) {
        setStatus(`모두 <b>${rows.totalCount}곳</b> 중 <b>${rows.length}곳</b>만 보입니다.
          인증키가 없으면 한 번에 5줄까지만 받을 수 있어요.
          아래 <b>🔑 NEIS 인증키 넣기</b>를 열어 키를 넣거나, 학교 이름을 더 자세히 적어 보세요.`, 'warn');
      } else {
        setStatus(`${rows.length}곳을 찾았습니다. 목록에서 학교를 누르세요.`);
      }
    } catch (e) {
      showError(e);
    } finally {
      btn.disabled = false;                    // 다시 누를 수 있게 풀어 주기
    }
  }

  btn.addEventListener('click', doSearch);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
}

/* ==========================================================================
   ⑧ 오류를 알아볼 수 있는 말로 바꿔 주기
   ========================================================================== */
function showError(e) {
  const msg = String(e.message || e);
  if (msg === 'NETWORK') {
    setStatus(`<b>NEIS에 연결하지 못했습니다.</b>
      <ol><li>인터넷이 연결되어 있는지 확인하세요.</li>
      <li>학교 방화벽이 막을 수 있습니다. 선생님께 알려 주세요.</li></ol>`, 'error');
    return;
  }
  if (msg.includes('INFO-300')) {
    setStatus('<b>인증키가 올바르지 않습니다.</b> 🔑 상자를 열어 키를 다시 넣거나 지워 주세요.', 'error');
    return;
  }
  setStatus(`문제가 생겼습니다: <code>${esc(msg)}</code>`, 'error');
}

/* ==========================================================================
   ⑨ 인증키 저장하기
   ========================================================================== */
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
    setStatus('인증키를 지웠습니다.');
  });
  refresh();
}

/* ---------- ⑩ 앱 시작 ---------- */
function init() {
  $('#date').value = todayISO();
  setupKeyBox();
  setupPicker('A');
  setupPicker('B');

  $('#compareBtn').addEventListener('click', () => {
    if (!PICKED.A || !PICKED.B) {
      setStatus('학교 <b>A와 B를 모두</b> 골라 주세요.', 'warn');
      return;
    }
    setStatus(`좋아요! <b>${esc(PICKED.A.SCHUL_NM)}</b>와 <b>${esc(PICKED.B.SCHUL_NM)}</b>를 골랐습니다.
               급식을 불러오는 것은 <b>3단계</b>에서 만듭니다. 🍚`);
  });

  setStatus('2단계 완성! 학교 이름을 넣고 <b>검색</b>을 눌러 보세요.');
}

init();
