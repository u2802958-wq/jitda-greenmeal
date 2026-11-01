/* 대성 잔반 예보 — 거창대성고 급식 잔반 예보·분석 앱 (서버 없이 동작) */
(() => {
  'use strict';
  const D = window.JANBAN;
  if (!D) {
    document.querySelector('main').innerHTML = '<div class="card empty"><b>data.js 파일을 찾지 못했어요</b>index.html과 같은 폴더에 data.js가 있는지 확인해 주세요.</div>';
    return;
  }

  /* ---------- 기본 도구 ---------- */
  const MEALS = ['조식', '중식', '석식'];
  const WD = ['월', '화', '수', '목', '금', '토', '일'];
  const M = D.model;
  const BASE_KGL = D.meta.kgPerL;          // 모델 학습에 쓴 환산 계수(0.9)
  const TREE_KG = 6.6;                      // 30년생 소나무 1그루 연간 CO2 흡수량(kg)
  const EFF_T = 0.4;                        // 잔반 주의/잘 먹음 표시 기준(kg)
  const MIN_N = 5;                          // 메뉴 지수를 보여줄 최소 제공 횟수
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const nf = (v, d = 1) => (v == null || !isFinite(v)) ? '–' : Number(v).toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const sign = (v, d = 1) => (v > 0.0001 ? '+' : v < -0.0001 ? '−' : '±') + nf(Math.abs(v), d);
  const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
  const sum = a => a.reduce((s, v) => s + v, 0);
  const josa = (w, a, b) => {
    w = w.replace(/\(.*?\)\s*$/, '').trim() || w;
    const c = w.charCodeAt(w.length - 1) - 0xac00;
    if (c < 0 || c > 11171) return `${a}(${b})`;
    return c % 28 ? a : b;
  };

  const store = {
    get(k, def) { try { const v = localStorage.getItem('janban.' + k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
    set(k, v) { try { localStorage.setItem('janban.' + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  };
  const S = Object.assign({ kgPerL: 0.9, co2: 2.5, won: 3000, goal: 10 }, store.get('settings', {}));
  let LOG = store.get('log', {});            // { 'YYYY-MM-DD|끼니번호': 리터 }
  let MENU_CACHE = store.get('menus', {});    // { YYYYMMDD: { t, rows } }

  const kgOf = L => L * S.kgPerL;
  const kgS = kg09 => kg09 / BASE_KGL * S.kgPerL;   // 모델 단위(kg@0.9) → 현재 환산 계수
  const errKg = () => kgS(M.cvMae);

  /* ---------- 날짜 ---------- */
  const toStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromStr = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = fromStr(s); d.setDate(d.getDate() + n); return toStr(d); };
  const wdOf = s => (fromStr(s).getDay() + 6) % 7;
  const todayStr = () => toStr(new Date());
  const mondayOf = s => addDays(s, -wdOf(s));
  const dayLabel = s => { const d = fromStr(s); return `${d.getMonth() + 1}월 ${d.getDate()}일 ${WD[wdOf(s)]}요일`; };
  const shortLabel = s => { const d = fromStr(s); return `${d.getMonth() + 1}.${d.getDate()}(${WD[wdOf(s)]})`; };

  /* ---------- 메뉴 이름 정리 (build.py와 같은 규칙) ---------- */
  function cleanName(x) {
    return x.replace(/\(\s*[\d.\s]+\)?\s*$/, '').replace(/\([\d.\s]+\)/g, '').replace(/-(중|석|조)\s*$/, '')
      .replace(/\s+/g, ' ').replace(/^[\s*#]+|[\s*#]+$/g, '');
  }
  function norm(x) {
    let n = x.replace(/\(.*?\)|\(.*$/g, '');
    n = n.split('*')[0].replace(/-(중|석|조)$/, '').replace(/[^가-힣A-Za-z0-9/&]/g, '');
    if (n.length > 4) n = n.replace(/^(친환경|수제|국산|유기농)/, '');
    return n || x;
  }

  /* ---------- 자료 ---------- */
  const DISH = D.dishes.map((a, id) => ({ id, name: a[0], cat: a[1], n: a[2], coef: a[3], eff: a[4], recs: [] }));
  const HIST = D.recs.map(a => {
    const s = String(a[0]);
    const date = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
    return { date, y: +s.slice(0, 4), m: +s.slice(4, 6), wd: wdOf(date), mi: a[1], L: a[2], people: a[3], kcal: a[4], dishes: a[5], out: !!a[6] };
  });
  HIST.forEach((r, i) => r.dishes.forEach(id => DISH[id].recs.push(i)));
  const HIST_KEY = new Map(HIST.map(r => [r.date + '|' + r.mi, r]));
  const NORM = new Map();
  DISH.forEach(d => { const k = norm(d.name); if (!NORM.has(k)) NORM.set(k, d.id); });
  const findDish = name => { const id = NORM.get(norm(name)); return id == null ? null : id; };
  const hasEff = d => d && d.eff != null && d.recs.length >= MIN_N;
  const STAPLE = new Set(DISH.filter(d => d.cat === '김치·절임' || (d.cat === '밥·면' && /밥$/.test(d.name) && d.n >= 40)).map(d => d.id));

  /* 미세먼지처럼 4단계: 같은 달·요일·끼니의 평소 잔반(kg) 대비 비율로 나눔 */
  const LEVELS = ['좋음', '보통', '나쁨', '매우나쁨'];
  const TYP_C = [...Array(21)].map((_, c) => mean(HIST.filter(r => !r.out && r.mi * 7 + r.wd === c).map(r => r.L * BASE_KGL)) || 1);
  const TYP_M = new Map();
  HIST.forEach(r => { if (r.out) return; const k = (r.mi * 7 + r.wd) * 13 + r.m, v = TYP_M.get(k) || { s: 0, n: 0 }; v.s += r.L * BASE_KGL; v.n++; TYP_M.set(k, v); });
  const typical = (mi, wd, m) => { const v = TYP_M.get((mi * 7 + wd) * 13 + m); return v && v.n >= 4 ? v.s / v.n : TYP_C[mi * 7 + wd]; };
  const quant = v => { v.sort((a, b) => a - b); const q = p => v[Math.floor(p * (v.length - 1))]; return [q(0.3), q(0.65), q(0.88)]; };
  const TH = quant(HIST.filter(r => !r.out).map(r => r.L * BASE_KGL / typical(r.mi, r.wd, r.m)));
  const levelBy = (th, ratio) => ratio < th[0] ? 0 : ratio < th[1] ? 1 : ratio < th[2] ? 2 : 3;
  function face(lv) {
    const mouth = ['M7.6 14.2q4.4 4 8.8 0', 'M8.4 15.2h7.2', 'M8 16.4q4 -3 8 0', 'M7.4 17.2q4.6 -4.8 9.2 0'][lv];
    const brow = lv === 3 ? '<path class="face-ink" d="M6.6 7.6l3.2 1.4M17.4 7.6l-3.2 1.4" stroke-width="1.5" stroke-linecap="round"/>' : '';
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="face-bg" cx="12" cy="12" r="11"/><circle class="face-dot" cx="8.6" cy="10.6" r="1.35"/><circle class="face-dot" cx="15.4" cy="10.6" r="1.35"/>${brow}<path class="face-ink" d="${mouth}" stroke-width="1.7" stroke-linecap="round"/></svg>`;
  }
  const lvlHTML = lv => `<span class="lvl lvl-${lv}">${face(lv)}${LEVELS[lv]}</span>`;

  /* ---------- 예측 모델 (build.py에서 학습한 계수) ---------- */
  function predictRaw(mi, wd, month, year, people, ids) {
    const yr = String(Math.min(2025, Math.max(2023, year)));
    const ppl = people > 0 ? people : M.attMean[mi][wd];
    const base = M.cell[mi * 7 + wd] + M.year[yr] + M.att[mi] * ppl / 100 + M.month[month - 1];
    let adj = 0;
    (ids || []).forEach(id => { if (id != null && DISH[id].coef != null) adj += DISH[id].coef; });
    const kg09 = Math.max(0.5, base + adj);
    return { kg: kgS(kg09), base: kgS(base), adj: kgS(adj), ppl, g: kgS(kg09) * 1000 / ppl, ratio: kg09 / typical(mi, wd, month), lv: TH_P ? levelBy(TH_P, kg09 / typical(mi, wd, month)) : 1 };
  }
  /* 예보 단계는 과거 끼니들에 대한 예보값 분포로 나눔 (예보는 평균 쪽으로 모이므로 실측 기준과 따로 둠) */
  let TH_P = null;
  TH_P = quant(HIST.filter(r => !r.out).map(r => predictRaw(r.mi, r.wd, r.m, r.y, r.people, r.dishes).ratio));
  const predict = (mi, ds, people, ids) => { const d = fromStr(ds); return predictRaw(mi, wdOf(ds), d.getMonth() + 1, d.getFullYear(), people, ids); };
  function actualL(ds, mi) {
    const k = ds + '|' + mi;
    if (LOG[k] != null) return LOG[k];
    const r = HIST_KEY.get(k);
    return r ? r.L : null;
  }
  const actualLevel = (mi, ds, L) => levelBy(TH, L * BASE_KGL / typical(mi, wdOf(ds), +ds.slice(5, 7)));

  /* ---------- 식단 불러오기: 과거 기록 → NEIS 실시간 → 앱에 저장된 2026 식단 ---------- */
  const NEIS = 'https://open.neis.go.kr/hub/mealServiceDietInfo';
  async function fetchNeis(ymd) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 7000);
    try {
      const url = `${NEIS}?Type=json&ATPT_OFCDC_SC_CODE=${D.meta.office}&SD_SCHUL_CODE=${D.meta.code}&MLSV_YMD=${ymd}&pSize=5`;
      const res = await fetch(url, { signal: ctl.signal });
      if (!res.ok) throw new Error('NEIS 응답 오류 ' + res.status);
      const j = await res.json();
      if (j.RESULT && j.RESULT.CODE === 'INFO-200') return [];
      if (!j.mealServiceDietInfo) throw new Error(j.RESULT ? j.RESULT.MESSAGE : 'NEIS 응답 형식 오류');
      return j.mealServiceDietInfo[1].row
        .map(r => [MEALS.indexOf(r.MMEAL_SC_NM), Math.round(+r.MLSV_FGR || 0), Math.round(parseFloat(r.CAL_INFO) || 0), r.DDISH_NM.split('<br/>').map(cleanName).filter(Boolean)])
        .filter(m => m[0] >= 0).sort((a, b) => a[0] - b[0]);
    } finally { clearTimeout(timer); }
  }
  const dayCache = new Map();
  function getDay(ds) {
    if (!dayCache.has(ds)) dayCache.set(ds, loadDay(ds));
    return dayCache.get(ds);
  }
  const fromRows = (rows, source) => ({ source, meals: rows.map(([mi, people, kcal, names]) => ({ mi, people, kcal, names, ids: names.map(findDish) })) });
  async function loadDay(ds) {
    const hist = [0, 1, 2].map(mi => HIST_KEY.get(ds + '|' + mi)).filter(r => r && r.dishes.length);
    if (hist.length) return { source: 'hist', meals: hist.map(r => ({ mi: r.mi, names: r.dishes.map(id => DISH[id].name), ids: r.dishes.slice(), people: r.people, kcal: r.kcal })) };
    const ymd = ds.replace(/-/g, '');
    const c = MENU_CACHE[ymd];
    if (c && Date.now() - c.t < 6 * 3600e3) return fromRows(c.rows, 'live');
    try {
      const rows = await fetchNeis(ymd);
      MENU_CACHE[ymd] = { t: Date.now(), rows };
      const keys = Object.keys(MENU_CACHE).sort();
      while (keys.length > 150) delete MENU_CACHE[keys.shift()];
      store.set('menus', MENU_CACHE);
      return fromRows(rows, 'live');
    } catch (e) {
      if (c) return fromRows(c.rows, 'live');
      if (D.upcoming && D.upcoming[ymd]) return fromRows(D.upcoming[ymd], 'saved');
      const inSaved = D.meta.upcomingTo && ymd <= D.meta.upcomingTo && ymd >= '20260101';
      return { source: inSaved ? 'saved' : 'none', meals: [], error: e && e.name === 'AbortError' ? '응답 시간 초과' : (e && e.message) || String(e) };
    }
  }
  function peopleFor(ds, mi) {
    const ymd = ds.replace(/-/g, '');
    const rows = (MENU_CACHE[ymd] && MENU_CACHE[ymd].rows) || (D.upcoming && D.upcoming[ymd]) || [];
    const r = rows.find(x => x[0] === mi);
    return r && r[1] ? r[1] : M.attMean[mi][wdOf(ds)];
  }
  const SRC_LABEL = { hist: ['hist', '2023~2025 실제 기록'], live: ['live', 'NEIS 실시간 식단'], saved: ['saved', '앱에 저장된 2026 식단'], none: ['none', '식단을 불러오지 못함'] };
  const srcTag = s => `<span class="src ${SRC_LABEL[s][0]}">${SRC_LABEL[s][1]}</span>`;

  /* ---------- 공통 UI ---------- */
  const tipEl = $('#tooltip');
  function showTip(e, html) {
    tipEl.innerHTML = html;
    tipEl.hidden = false;
    const r = tipEl.getBoundingClientRect();
    let x = e.clientX + 14, y = e.clientY + 14;
    if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
    if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 14;
    tipEl.style.left = Math.max(8, x) + 'px';
    tipEl.style.top = Math.max(8, y) + 'px';
  }
  const hideTip = () => { tipEl.hidden = true; };
  addEventListener('scroll', hideTip, { passive: true });
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }
  function setSeg(el, val) { $$('button', el).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === String(val)))); }
  const isDark = () => {
    const t = document.documentElement.dataset.theme;
    return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  };
  const effTag = d => {
    if (!hasEff(d)) return '';
    if (d.eff >= EFF_T) return `<span class="tag up">▲ 잔반 주의 ${sign(kgS(d.eff))}</span>`;
    if (d.eff <= -EFF_T) return `<span class="tag down">▼ 잘 먹음 ${sign(kgS(d.eff))}</span>`;
    return '';
  };
  const dishTag = id => id == null ? '<span class="tag new">새 메뉴</span>' : effTag(DISH[id]);
  function rankItem(no, d, sub, maxAbs) {
    const w = Math.min(50, Math.abs(d.eff) / maxAbs * 50);
    const bar = d.eff >= 0 ? `<i style="left:50%;width:${w}%;background:var(--div-pos)"></i>` : `<i style="right:50%;width:${w}%;background:var(--div-neg)"></i>`;
    return `<li><button class="rank-item" type="button" data-dish="${d.id}"><span class="rank-no">${no}</span><span class="rank-name">${esc(d.name)}<small>${esc(sub)}</small></span><span class="rank-bar" aria-hidden="true">${bar}</span><span class="rank-val">${sign(kgS(d.eff), 2)}</span></button></li>`;
  }
  const CAT_TIP = {
    '채소·나물': '처음엔 조금만 받고, 맛있으면 한 번 더 받아요.',
    '국·찌개': '국물은 먹을 만큼만, 건더기 위주로 떠요.',
    '밥·면': '밥과 면은 평소의 2/3만 받고 모자라면 더 받아요.',
    '메인요리': '한 번에 많이 담지 말고 나눠서 받아요.',
    '반찬': '반찬은 먼저 맛을 보고 더 받아요.',
    '김치·절임': '김치는 한 집게면 충분해요.',
    '후식·음료': '먹지 않을 후식은 받지 않고 친구와 나눠요.',
    '기타': '먹을 만큼만 받아요.',
  };

  /* ---------- 차트 ---------- */
  function niceScale(max, count = 4) {
    if (!(max > 0)) return { top: 1, step: 0.25 };
    const raw = max / count, p = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / p;
    const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
    return { top: Math.ceil(max / step - 1e-9) * step, step };
  }
  const roundTop = (x, y, w, h, r) => { r = Math.min(r, h, w / 2); return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`; };
  function gridY(s, top, step, ml, W, mr, mt, ih, fmtTick) {
    for (let t = 0; t <= top + 1e-9; t += step) {
      const y = mt + ih - t / top * ih;
      s.push(`<line x1="${ml}" x2="${W - mr}" y1="${y}" y2="${y}" stroke="var(--grid)" stroke-width="1"/>`);
      s.push(`<text x="${ml - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${fmtTick(t)}</text>`);
    }
  }
  function barChart(el, o) {
    const W = Math.max(280, el.clientWidth || 600), H = o.height || 230, ml = 44, mr = 8, mt = 24, mb = 28;
    const vals = o.values, real = vals.filter(v => v != null);
    const { top, step } = niceScale(Math.max(0, ...real));
    const iw = W - ml - mr, ih = H - mt - mb, band = iw / vals.length, bw = Math.min(46, band * 0.64);
    const iMax = vals.indexOf(Math.max(...real)), iMin = vals.indexOf(Math.min(...real));
    const s = [`<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(o.aria || '')}">`];
    gridY(s, top, step, ml, W, mr, mt, ih, o.fmtTick || (t => nf(t, step < 1 ? 1 : 0)));
    s.push(`<line x1="${ml}" x2="${W - mr}" y1="${mt + ih}" y2="${mt + ih}" stroke="var(--axis)"/>`);
    vals.forEach((v, i) => {
      const x = ml + band * i + (band - bw) / 2;
      s.push(`<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle" font-size="12" fill="var(--ink-2)">${esc(o.labels[i])}</text>`);
      if (v == null) return;
      const h = Math.max(1, v / top * ih), y = mt + ih - h;
      s.push(`<path d="${roundTop(x, y, bw, h, 4)}" fill="${o.color || 'var(--s1)'}"/>`);
      if ((i === iMax || i === iMin) && real.length > 1) s.push(`<text x="${x + bw / 2}" y="${y - 7}" text-anchor="middle" font-size="12" font-weight="700" fill="var(--ink)">${o.fmt(v)}</text>`);
    });
    vals.forEach((v, i) => s.push(`<rect class="hit" data-i="${i}" x="${ml + band * i}" y="${mt}" width="${band}" height="${ih + mb}" fill="transparent"/>`));
    s.push('</svg>');
    el.innerHTML = s.join('');
    $$('.hit', el).forEach(r => {
      const f = e => { const i = +r.dataset.i; if (vals[i] != null) showTip(e, o.tip(i)); };
      r.addEventListener('pointermove', f); r.addEventListener('pointerdown', f); r.addEventListener('pointerleave', hideTip);
    });
  }
  function lineChart(el, o) {
    const W = Math.max(280, el.clientWidth || 700), H = o.height || 260, ml = 44, mr = 58, mt = 14, mb = 28;
    const all = o.series.flatMap(s => s.values).filter(v => v != null);
    const { top, step } = niceScale(Math.max(0, ...all));
    const n = o.xLabels.length, iw = W - ml - mr, ih = H - mt - mb;
    const X = i => ml + (n === 1 ? iw / 2 : i / (n - 1) * iw), Y = v => mt + ih - v / top * ih;
    const s = [`<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(o.aria || '')}">`];
    gridY(s, top, step, ml, W, mr, mt, ih, o.fmtTick || (t => nf(t, step < 1 ? 1 : 0)));
    s.push(`<line x1="${ml}" x2="${W - mr}" y1="${mt + ih}" y2="${mt + ih}" stroke="var(--axis)"/>`);
    const every = W < 480 ? 2 : 1;
    o.xLabels.forEach((l, i) => { if (i % every === 0) s.push(`<text x="${X(i)}" y="${H - 8}" text-anchor="middle" font-size="12" fill="var(--ink-2)">${esc(l)}</text>`); });
    const ends = [];
    o.series.forEach(se => {
      let d = '', pen = false;
      se.values.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`; pen = true; });
      s.push(`<path d="${d}" fill="none" stroke="${se.color}" stroke-width="${se.dim ? 1.5 : 2.4}" stroke-linejoin="round" stroke-linecap="round" opacity="${se.dim ? 0.3 : 1}"/>`);
      se.values.forEach((v, i) => {   // 앞뒤가 비어 있는 점은 선이 안 보이므로 점으로 표시
        if (v != null && se.values[i - 1] == null && se.values[i + 1] == null) s.push(`<circle cx="${X(i)}" cy="${Y(v)}" r="3" fill="${se.color}" opacity="${se.dim ? 0.3 : 1}"/>`);
      });
      let li = se.values.length - 1; while (li >= 0 && se.values[li] == null) li--;
      if (li >= 0) ends.push({ y: Y(se.values[li]), x: X(li), name: se.name, color: se.color, dim: se.dim });
    });
    ends.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 15) ends[i].y = ends[i - 1].y + 15;
    ends.forEach(e => s.push(`<g opacity="${e.dim ? 0.45 : 1}"><circle cx="${W - mr + 10}" cy="${e.y}" r="4" fill="${e.color}"/><text x="${W - mr + 18}" y="${e.y + 4}" font-size="12" font-weight="600" fill="var(--ink-2)">${esc(e.name)}</text></g>`));
    s.push('<g class="hov"></g>');
    s.push(`<rect class="hit" x="${ml}" y="${mt}" width="${iw}" height="${ih}" fill="transparent"/>`);
    s.push('</svg>');
    el.innerHTML = s.join('');
    const svg = $('svg', el), hov = $('.hov', el), hit = $('.hit', el);
    const move = e => {
      const r = svg.getBoundingClientRect(), px = (e.clientX - r.left) * (W / r.width);
      const i = Math.max(0, Math.min(n - 1, Math.round((px - ml) / iw * (n - 1))));
      let g = `<line x1="${X(i)}" x2="${X(i)}" y1="${mt}" y2="${mt + ih}" stroke="var(--axis)" stroke-width="1"/>`;
      const rows = [];
      o.series.forEach(se => {
        const v = se.values[i];
        if (v == null) return;
        g += `<circle cx="${X(i)}" cy="${Y(v)}" r="5" fill="${se.color}" stroke="var(--surface)" stroke-width="2"/>`;
        rows.push(`<div class="tt-row"><i style="--c:${se.color}"></i>${esc(se.name)} <b>${o.fmt(v)}</b></div>`);
      });
      hov.innerHTML = g;
      if (rows.length) showTip(e, `<b>${esc(o.xLabels[i])}</b>${rows.join('')}`); else hideTip();
    };
    hit.addEventListener('pointermove', move); hit.addEventListener('pointerdown', move);
    hit.addEventListener('pointerleave', () => { hov.innerHTML = ''; hideTip(); });
  }
  const RAMP_L = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'];
  const RAMP_D = ['#15283f', '#173455', '#1a416b', '#1c4f84', '#1c5cab', '#256abf', '#2a78d6', '#3987e5', '#5598e7', '#6da7ec', '#86b6ef', '#9ec5f4', '#b7d3f6'];
  function rampColor(t) {
    const R = isDark() ? RAMP_D : RAMP_L;
    const c = R[Math.max(0, Math.min(R.length - 1, Math.round(t * (R.length - 1))))];
    const [r, g, b] = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    return { bg: c, fg: 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.36 ? '#0b0b0b' : '#ffffff' };
  }

  /* ---------- 오늘 예보 ---------- */
  let curDate = todayStr();
  async function renderToday() {
    const ds = curDate;
    $('#d-date').value = ds;
    $('#today-hero').innerHTML = '<div class="card empty"><b>식단을 불러오는 중…</b>NEIS 교육정보 개방 포털에서 식단을 확인하고 있어요.</div>';
    $('#today-meals').innerHTML = '';
    const day = await getDay(ds);
    if (ds !== curDate) return;
    const meals = day.meals.filter(m => m.names.length);
    if (!meals.length) {
      const why = day.source === 'none'
        ? `<b>식단을 불러오지 못했어요</b>인터넷 연결을 확인해 주세요. (${esc(day.error || '')})<br>앱에는 ${D.meta.upcomingTo ? D.meta.upcomingTo.slice(0, 4) + '년 ' + (+D.meta.upcomingTo.slice(4, 6)) + '월' : ''}까지의 식단이 저장되어 있어요.`
        : `<b>${dayLabel(ds)}은 급식이 없는 날이에요</b>방학, 공휴일, 귀가 주말에는 식단이 없어요.`;
      $('#today-hero').innerHTML = `<div class="card empty">${why}<div style="margin-top:12px"><button class="btn" id="find-next" type="button">다음 급식일 찾기</button></div></div>`;
      $('#find-next').onclick = findNextMealDay;
      $('#today-note').innerHTML = srcTag(day.source);
      return;
    }
    const P = meals.map(m => ({ m, p: predict(m.mi, ds, m.people, m.ids), act: actualL(ds, m.mi) }));
    const totKg = sum(P.map(x => x.p.kg));
    const totPpl = sum(P.map(x => x.p.ppl));
    const dayLv = Math.round(mean(P.map(x => x.p.lv)));
    const acts = P.filter(x => x.act != null);
    let actualHTML = '';
    if (acts.length) {
      const aKg = sum(acts.map(x => kgOf(x.act))), pKg = sum(acts.map(x => x.p.kg));
      const diff = (aKg - pKg) / pKg * 100;
      actualHTML = `<div class="hero-actual">실측 <b class="num">${nf(aKg)} kg</b> (${acts.length}끼 ${day.source === 'hist' && !acts.some(x => LOG[ds + '|' + x.m.mi] != null) ? '기록' : '입력'}) · 예보보다 <span class="${diff <= 0 ? 'delta-down' : 'delta-up'}">${nf(Math.abs(diff), 0)}% ${diff <= 0 ? '적음 ▼' : '많음 ▲'}</span></div>`;
    }
    const tip = makeTip(P.map(x => x.m));
    $('#today-hero').innerHTML = `<div class="hero">
      <div class="hero-main">
        <div class="hero-kicker">${dayLabel(ds)} · 하루 잔반 예보 ${srcTag(day.source)}</div>
        <div class="hero-figure">
          <span class="lvl lvl-${dayLv} hero-face">${face(dayLv)}</span>
          <div><div class="hero-num num">${nf(totKg)}<small>kg</small></div><div class="hero-level">${LEVELS[dayLv]} <span class="muted small">· 끼니마다 ±${nf(errKg())}kg 오차</span></div></div>
        </div>
        <div class="hero-stats">
          <span>탄소 <b class="num">${nf(totKg * S.co2, 0)} kgCO₂e</b></span>
          <span>손실 비용 약 <b class="num">${nf(totKg * S.won / 10000, 1)}만 원</b></span>
          <span>1인당 한 끼 <b class="num">${nf(totKg * 1000 / totPpl, 0)} g</b></span>
        </div>
        ${season(ds)}
        ${actualHTML}
      </div>
      <div class="hero-tip"><h3>오늘의 실천</h3><p>${tip.main}</p><p class="tip-sub">${tip.sub}</p></div>
    </div>`;
    $('#today-meals').innerHTML = P.map(x => mealCard(ds, x)).join('');
    $$('#today-meals .quick-log').forEach(f => f.addEventListener('submit', e => {
      e.preventDefault();
      const mi = +f.dataset.mi, v = parseFloat($('input', f).value);
      const k = ds + '|' + mi;
      if (isNaN(v)) { delete LOG[k]; toast(`${MEALS[mi]} 기록을 지웠어요`); }
      else { LOG[k] = Math.round(v * 10) / 10; toast(`${shortLabel(ds)} ${MEALS[mi]} ${v}L 저장했어요`); }
      store.set('log', LOG);
      renderToday();
    }));
    const missing = meals.filter(m => m.ids.some(id => id == null)).length;
    $('#today-note').innerHTML = `예보는 같은 끼니·요일·월·급식 인원의 과거 평균에 메뉴 영향을 더한 값이에요. 좋음·보통·나쁨·매우나쁨은 같은 달·요일·끼니의 평소(2023~2025년) 잔반과 비교한 단계예요. 실제 잔반을 입력하면 탄소·기록 탭에서 목표 달성도를 볼 수 있어요.${missing ? ' ‘새 메뉴’는 2023~2025년에 없던 메뉴라 메뉴 영향 없이 계산해요.' : ''}`;
  }
  const MONTH_RANK = M.month.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v).map(x => x.i);
  function season(ds) {
    const mo = +ds.slice(5, 7), r = MONTH_RANK.indexOf(mo - 1);
    if (r <= 2) return `<div class="small muted">${mo}월은 3년 기록에서 잔반이 많은 달 ${r + 1}위예요. 평소보다 한 번 더 신경 써 주세요.</div>`;
    if (r >= 9) return `<div class="small muted">${mo}월은 3년 기록에서 잔반이 적은 편인 달이에요.</div>`;
    return '';
  }
  function mealCard(ds, { m, p, act }) {
    let actual = '';
    if (act != null) {
      const diff = kgOf(act) - p.kg;
      actual = `<div class="meal-actual">${lvlHTML(actualLevel(m.mi, ds, act))} 실측 <b class="num">${nf(kgOf(act))} kg</b> <span class="muted">(${act} L)</span> · 예보보다 <span class="${diff <= 0 ? 'delta-down' : 'delta-up'}">${nf(Math.abs(diff))}kg ${diff <= 0 ? '적음' : '많음'}</span></div>`;
    }
    return `<article class="card meal-card">
      <div class="meal-top"><div><h2 class="meal-name">${MEALS[m.mi]}</h2><div class="meal-meta num">${m.people ? m.people + '명' : '인원 미정'}${m.kcal ? ' · ' + m.kcal + ' kcal' : ''}</div></div>${lvlHTML(p.lv)}</div>
      <div class="meal-fc"><b class="num">${nf(p.kg)}</b><span class="unit">kg 예상</span><span class="pm">±${nf(errKg())} · 1인당 ${nf(p.g, 0)}g</span></div>
      ${actual}
      <ul class="tray">${m.names.map((nm, i) => `<li><button class="dish-btn" type="button" ${m.ids[i] == null ? 'disabled' : `data-dish="${m.ids[i]}"`}><span class="nm">${esc(nm)}</span>${dishTag(m.ids[i])}</button></li>`).join('')}</ul>
      <form class="quick-log" data-mi="${m.mi}"><label for="ql-${m.mi}">실제 잔반</label><input class="input num" id="ql-${m.mi}" type="number" min="0" max="300" step="0.5" inputmode="decimal" value="${act ?? ''}" placeholder="리터"><span class="small muted">L</span><button class="btn sm" type="submit">저장</button></form>
    </article>`;
  }
  function makeTip(meals) {
    const items = [];
    meals.forEach(m => m.ids.forEach(id => { if (id != null && hasEff(DISH[id])) items.push({ m, d: DISH[id] }); }));
    if (!items.length) return { main: '먹을 만큼만 받고, 받은 음식은 끝까지 먹어요.', sub: '오늘 메뉴는 과거 기록이 적어 메뉴별 정보가 없어요.' };
    items.sort((a, b) => b.d.eff - a.d.eff);
    const top = items[0], best = items[items.length - 1];
    if (top.d.eff >= EFF_T) {
      return {
        main: `${MEALS[top.m.mi]} ‘${esc(top.d.name)}’${josa(top.d.name, '은', '는')} 평소보다 잔반이 ${nf(kgS(top.d.eff))}kg 많았던 메뉴예요. ${CAT_TIP[top.d.cat]}`,
        sub: `과거 ${top.d.recs.length}번 제공된 기록 기준이에요.${best.d.eff <= -EFF_T ? ` ${MEALS[best.m.mi]} ‘${esc(best.d.name)}’${josa(best.d.name, '은', '는')} 잘 먹는 메뉴예요.` : ''}`,
      };
    }
    return { main: `오늘은 잔반이 많았던 메뉴가 없어요. ‘${esc(best.d.name)}’처럼 잘 먹는 메뉴도 먹을 만큼만 받아요.`, sub: '받은 만큼 다 먹는 것이 탄소를 줄이는 가장 쉬운 방법이에요.' };
  }
  async function findNextMealDay() {
    const btn = $('#find-next');
    if (btn) { btn.disabled = true; btn.textContent = '찾는 중…'; }
    let ds = curDate;
    for (let i = 0; i < 21; i++) {
      ds = addDays(ds, 1);
      const day = await getDay(ds);
      if (day.meals.some(m => m.names.length)) { curDate = ds; renderToday(); return; }
      if (day.source === 'none') break;
    }
    if (btn) { btn.disabled = false; btn.textContent = '다음 급식일 찾기'; }
    toast('3주 안에 급식이 있는 날을 찾지 못했어요');
  }

  /* ---------- 주간 예보 ---------- */
  let weekStart = mondayOf(todayStr());
  async function renderWeek() {
    const ws = weekStart, days = [...Array(7)].map((_, i) => addDays(ws, i));
    const a = fromStr(days[0]), b = fromStr(days[6]);
    $('#w-label').textContent = `${a.getFullYear()}. ${a.getMonth() + 1}.${a.getDate()} ~ ${b.getMonth() + 1}.${b.getDate()}`;
    $('#week-table').innerHTML = '<div class="empty">식단을 불러오는 중…</div>';
    const res = await Promise.all(days.map(getDay));
    if (ws !== weekStart) return;
    const today = todayStr();
    let tot = 0, cnt = 0, nAct = 0, worst = null;
    const seen = new Map();
    const rows = days.map((ds, di) => {
      const day = res[di];
      let dayKg = 0, dayHas = false;
      const cells = [0, 1, 2].map(mi => {
        const m = day.meals.find(x => x.mi === mi && x.names.length);
        if (!m) return `<td><div class="wk-none">${day.source === 'none' ? '불러오기 실패' : '급식 없음'}</div></td>`;
        const p = predict(mi, ds, m.people, m.ids), act = actualL(ds, mi);
        const kg = act != null ? kgOf(act) : p.kg, lv = act != null ? actualLevel(mi, ds, act) : p.lv;
        tot += p.kg; cnt++; dayKg += kg; dayHas = true;
        if (act != null) nAct++;
        if (!worst || p.kg > worst.kg) worst = { g: p.g, kg: p.kg, ds, mi };
        const ds2 = m.ids.map((id, i) => ({ id, nm: m.names[i] })).filter(x => x.id != null && hasEff(DISH[x.id]));
        ds2.forEach(x => { if (!seen.has(x.id)) seen.set(x.id, `${WD[di]} ${MEALS[mi]}`); });
        const warn = ds2.filter(x => DISH[x.id].eff >= EFF_T).sort((x, y) => DISH[y.id].eff - DISH[x.id].eff)[0];
        const main = m.names.find((nm, i) => m.ids[i] != null && DISH[m.ids[i]].cat === '메인요리') || m.names[Math.min(1, m.names.length - 1)];
        const lvColor = ['var(--good)', 'var(--warn)', 'var(--serious)', 'var(--crit)'][lv];
        return `<td><button class="wk-cell" type="button" data-goto="${ds}" style="--lv:${lvColor}" aria-label="${shortLabel(ds)} ${MEALS[mi]} ${nf(kg)}kg ${LEVELS[lv]}">
          <span class="wk-kg num">${lvlHTML(lv).replace(LEVELS[lv], '')}${nf(kg)} kg ${act != null ? '<span class="mark-actual">실측</span>' : ''}</span>
          <span class="wk-dish">${warn ? `<span style="color:var(--up-text);font-weight:700">▲</span> ${esc(warn.nm)}` : esc(main)}</span>
        </button></td>`;
      }).join('');
      return `<tr><th scope="row" class="wk-day ${ds === today ? 'today' : ''}">${WD[di]}<small class="num">${fromStr(ds).getMonth() + 1}.${fromStr(ds).getDate()}</small></th>${cells}<td class="wk-total num">${dayHas ? nf(dayKg) + ' kg' : ''}</td></tr>`;
    }).join('');
    $('#week-table').innerHTML = `<table class="week-table"><thead><tr><th></th><th>조식</th><th>중식</th><th>석식</th><th class="wk-total">하루</th></tr></thead><tbody>${rows}</tbody></table>`;
    const srcs = [...new Set(res.map(r => r.source))].filter(s => s !== 'none' || res.every(r => r.source === 'none'));
    $('#week-kpis').innerHTML = [
      ['주간 예상 잔반', cnt ? `${nf(tot)}<small>kg</small>` : '–', `${cnt}끼 기준`],
      ['예상 탄소 배출', cnt ? `${nf(tot * S.co2, 0)}<small>kgCO₂e</small>` : '–', `소나무 ${nf(tot * S.co2 / TREE_KG, 1)}그루의 1년 흡수량`],
      ['잔반이 가장 많을 끼니', worst ? `${WD[wdOf(worst.ds)]} ${MEALS[worst.mi]}` : '–', worst ? `1인당 ${nf(worst.g, 0)}g · ${nf(worst.kg)}kg 예상` : ''],
      ['실측 입력', `${nAct}<small>/ ${cnt}끼</small>`, srcs.map(s => SRC_LABEL[s][1]).join(', ')],
    ].map(([l, v, s]) => `<div class="kpi"><div class="kpi-label">${l}</div><div class="kpi-value num">${v}</div><div class="kpi-sub">${s}</div></div>`).join('');
    const ds = [...seen.keys()].map(id => DISH[id]);
    const maxAbs = Math.max(0.3, ...ds.map(d => Math.abs(d.eff)));
    const up = ds.filter(d => d.eff > 0.1).sort((a, b) => b.eff - a.eff).slice(0, 6);
    const down = ds.filter(d => d.eff < -0.1).sort((a, b) => a.eff - b.eff).slice(0, 6);
    $('#week-up').innerHTML = up.length ? up.map((d, i) => rankItem(i + 1, d, seen.get(d.id), maxAbs)).join('') : '<li class="empty">이번 주에는 잔반 주의 메뉴가 없어요</li>';
    $('#week-down').innerHTML = down.length ? down.map((d, i) => rankItem(i + 1, d, seen.get(d.id), maxAbs)).join('') : '<li class="empty">과거 기록이 있는 메뉴가 없어요</li>';
  }

  /* ---------- 실측 자료 (2023~2025 기록 + 앱에서 입력한 기록) ---------- */
  function actualRecords() {
    const out = [], seen = new Set();
    HIST.forEach(r => {
      const k = r.date + '|' + r.mi;
      seen.add(k);
      if (LOG[k] != null) out.push(Object.assign({}, r, { L: LOG[k], out: LOG[k] >= D.meta.outlierL }));
      else out.push(r);
    });
    Object.keys(LOG).forEach(k => {
      if (seen.has(k)) return;
      const [date, mi] = k.split('|');
      out.push({ date, y: +date.slice(0, 4), m: +date.slice(5, 7), wd: wdOf(date), mi: +mi, L: LOG[k], people: peopleFor(date, +mi), kcal: 0, dishes: [], out: LOG[k] >= D.meta.outlierL, user: true });
    });
    return out;
  }
  const gOf = r => r.people > 0 ? kgOf(r.L) * 1000 / r.people : null;
  const yearsOf = recs => [...new Set(recs.map(r => r.y))].sort();
  const YEAR_COLOR = { 2023: 'var(--s1)', 2024: 'var(--s2)', 2025: 'var(--s3)', 2026: 'var(--s4)', 2027: 'var(--s1)' };

  /* ---------- 요일 분석 ---------- */
  let stYear = 'all', stMetric = 'kg', stWd = 3;
  function renderStats() {
    const ALL = actualRecords(), years = yearsOf(ALL);
    if (stYear !== 'all' && !years.includes(stYear)) stYear = 'all';
    $('#st-year').innerHTML = ['all', ...years].map(y => `<button type="button" data-v="${y}" aria-pressed="${String(y) === String(stYear)}">${y === 'all' ? '전체' : y}</button>`).join('');
    setSeg($('#st-metric'), stMetric);
    const R = ALL.filter(r => !r.out && (stYear === 'all' || r.y === stYear));
    const nOut = ALL.filter(r => r.out && (stYear === 'all' || r.y === stYear)).length;
    const unit = stMetric === 'kg' ? 'kg' : 'g';
    const val = r => stMetric === 'kg' ? kgOf(r.L) : gOf(r);
    // KPI
    const totKg = sum(R.map(r => kgOf(r.L)));
    const dates = new Set(R.map(r => r.date));
    const gAll = R.map(gOf).filter(v => v != null);
    const cells = [];
    for (let wd = 0; wd < 7; wd++) for (let mi = 0; mi < 3; mi++) {
      const v = R.filter(r => r.wd === wd && r.mi === mi).map(val).filter(x => x != null);
      cells.push({ wd, mi, v: mean(v), n: v.length });
    }
    const real = cells.filter(c => c.v != null);
    const hi = real.reduce((a, c) => (!a || c.v > a.v ? c : a), null);
    $('#st-kpis').innerHTML = [
      ['총 잔반량', totKg >= 1000 ? `${nf(totKg / 1000, 2)}<small>톤</small>` : `${nf(totKg, 0)}<small>kg</small>`, `${R.length.toLocaleString()}끼 · 급식 ${dates.size}일`],
      ['급식일 하루 평균', `${nf(totKg / Math.max(1, dates.size))}<small>kg</small>`, '조식+중식+석식'],
      ['1인당 한 끼 평균', `${nf(mean(gAll), 0)}<small>g</small>`, '잔반 무게 ÷ 급식 인원'],
      ['잔반 최다 끼니', hi ? `${WD[hi.wd]} ${MEALS[hi.mi]}` : '–', hi ? `평균 ${nf(hi.v, stMetric === 'kg' ? 1 : 0)}${unit}` : ''],
    ].map(([l, v, s]) => `<div class="kpi"><div class="kpi-label">${l}</div><div class="kpi-value num">${v}</div><div class="kpi-sub">${s}</div></div>`).join('');
    // 히트맵
    const lo = Math.min(...real.map(c => c.v)), hiV = Math.max(...real.map(c => c.v));
    const dg = stMetric === 'kg' ? 1 : 0;
    let h = '<div class="heat"><div></div>' + MEALS.map(m => `<div class="hh">${m}</div>`).join('');
    for (let wd = 0; wd < 7; wd++) {
      h += `<div class="hr">${WD[wd]}</div>`;
      for (let mi = 0; mi < 3; mi++) {
        const c = cells[wd * 3 + mi];
        if (c.v == null) { h += '<div class="hc" style="background:var(--surface-2);color:var(--muted)">–</div>'; continue; }
        const col = rampColor(hiV > lo ? (c.v - lo) / (hiV - lo) : 0.5);
        h += `<div class="hc" data-wd="${wd}" data-mi="${mi}" style="background:${col.bg};color:${col.fg}">${nf(c.v, dg)}<small>${c.n}끼</small></div>`;
      }
    }
    h += `</div><div class="heat-scale"><span class="num">${nf(lo, dg)}${unit}</span><span class="bar" style="background:linear-gradient(90deg,${rampColor(0).bg},${rampColor(0.5).bg},${rampColor(1).bg})"></span><span class="num">${nf(hiV, dg)}${unit}</span></div>`;
    $('#st-heat').innerHTML = h;
    $('#st-heat-unit').textContent = stMetric === 'kg' ? '한 끼 잔반(kg)' : '1인당 한 끼 잔반(g)';
    $$('#st-heat .hc[data-wd]').forEach(el => {
      const c = cells[+el.dataset.wd * 3 + +el.dataset.mi];
      const f = e => showTip(e, `<b>${WD[c.wd]}요일 ${MEALS[c.mi]}</b><br>평균 ${nf(c.v, dg)}${unit} · ${c.n}끼`);
      el.addEventListener('pointermove', f); el.addEventListener('pointerdown', f); el.addEventListener('pointerleave', hideTip);
    });
    // 요일 막대
    const byWd = [...Array(7)].map((_, wd) => {
      if (stMetric === 'g') return mean(R.filter(r => r.wd === wd).map(gOf).filter(v => v != null));
      const per = new Map();
      R.filter(r => r.wd === wd).forEach(r => per.set(r.date, (per.get(r.date) || 0) + kgOf(r.L)));
      return per.size ? mean([...per.values()]) : null;
    });
    $('#st-bar-unit').textContent = stMetric === 'kg' ? '급식일 하루 합계 평균(kg)' : '1인당 한 끼 평균(g)';
    barChart($('#st-bar'), {
      labels: WD, values: byWd, aria: '요일별 하루 잔반',
      fmt: v => nf(v, dg) + unit,
      tip: i => `<b>${WD[i]}요일</b><br>${stMetric === 'kg' ? '하루 합계' : '1인당'} 평균 ${nf(byWd[i], dg)}${unit}`,
    });
    // 월별 추이
    const series = years.map(y => ({
      name: String(y), color: YEAR_COLOR[y] || 'var(--s1)', dim: stYear !== 'all' && y !== stYear,
      values: [...Array(12)].map((_, mi) => {
        const rs = ALL.filter(r => !r.out && r.y === y && r.m === mi + 1);
        if (!rs.length) return null;
        if (stMetric === 'g') return mean(rs.map(gOf).filter(v => v != null));
        const per = new Map();
        rs.forEach(r => per.set(r.date, (per.get(r.date) || 0) + kgOf(r.L)));
        return mean([...per.values()]);
      }),
    })).filter(s => s.values.some(v => v != null));
    $('#st-line-unit').textContent = stMetric === 'kg' ? '급식일 하루 합계 평균(kg)' : '1인당 한 끼 평균(g)';
    $('#st-line-legend').innerHTML = series.map(s => `<span><i style="--c:${s.color}"></i>${s.name}년</span>`).join('');
    lineChart($('#st-line'), {
      xLabels: [...Array(12)].map((_, i) => `${i + 1}월`), series, aria: '연도별 월별 잔반 추이',
      fmt: v => nf(v, dg) + unit,
    });
    // 요일별 메뉴
    $('#st-wd').innerHTML = WD.map((w, i) => `<button class="chip" type="button" data-wd="${i}" aria-pressed="${i === stWd}">${w}</button>`).join('');
    const RW = R.filter(r => r.wd === stWd && r.dishes.length);
    const freq = new Map();
    RW.forEach(r => new Set(r.dishes).forEach(id => { if (!STAPLE.has(id)) freq.set(id, (freq.get(id) || 0) + 1); }));
    const topDishes = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
    $('#st-wd-dishes').innerHTML = `<caption class="tbl-cap">${WD[stWd]}요일에 자주 나온 메뉴</caption><thead><tr><th>메뉴</th><th class="r">이 요일</th><th class="r">잔반 지수</th></tr></thead><tbody>${topDishes.map(([id, c]) => {
      const d = DISH[id];
      const ef = hasEff(d) ? `<span class="${d.eff >= EFF_T ? 'delta-up' : d.eff <= -EFF_T ? 'delta-down' : ''}">${sign(kgS(d.eff), 2)}</span>` : '<span class="muted">–</span>';
      return `<tr><td><button class="link-btn" type="button" data-dish="${id}">${esc(d.name)}</button> <span class="muted small">${d.cat}</span></td><td class="r">${c}회</td><td class="r">${ef}</td></tr>`;
    }).join('') || '<tr><td colspan="3" class="muted">자료가 없어요</td></tr>'}</tbody>`;
    const topMeals = R.filter(r => r.wd === stWd).sort((a, b) => (val(b) || 0) - (val(a) || 0)).slice(0, 6);
    $('#st-wd-top').innerHTML = `<caption class="tbl-cap">${WD[stWd]}요일 잔반이 가장 많았던 끼니</caption><thead><tr><th>날짜</th><th>메뉴</th><th class="r">잔반</th></tr></thead><tbody>${topMeals.map(r => {
      const names = r.dishes.filter(id => !STAPLE.has(id)).slice(0, 3).map(id => DISH[id].name).join(', ');
      return `<tr><td style="white-space:nowrap"><button class="link-btn" type="button" data-goto="${r.date}">${r.date.slice(2).replace(/-/g, '.')}</button><br><span class="muted small">${MEALS[r.mi]}</span></td><td class="small">${esc(names || '(앱 입력 기록)')}</td><td class="r"><b>${nf(val(r), dg)}${unit}</b></td></tr>`;
    }).join('') || '<tr><td colspan="3" class="muted">자료가 없어요</td></tr>'}</tbody>`;
    $('#st-note').innerHTML = `원자료 단위는 리터(L)이며 1L = ${S.kgPerL}kg으로 환산했어요. 25L 이상인 이상값 ${nOut}건은 평균에서 뺐어요. 2025년 1·2월은 기록된 날이 적어요.`;
  }

  /* ---------- 메뉴 분석 ---------- */
  let mCat = '전체', mMin = 5;
  function renderMenu() {
    $('#m-cats').innerHTML = ['전체', ...D.cats].map(c => `<button class="chip" type="button" data-cat="${c}" aria-pressed="${c === mCat}">${c}</button>`).join('');
    $('#m-min').value = String(mMin);
    const pool = DISH.filter(d => d.eff != null && d.recs.length >= mMin && (mCat === '전체' || d.cat === mCat));
    const maxAbs = Math.max(0.3, ...pool.map(d => Math.abs(d.eff)));
    const up = pool.filter(d => d.eff > 0).sort((a, b) => b.eff - a.eff).slice(0, 15);
    const down = pool.filter(d => d.eff < 0).sort((a, b) => a.eff - b.eff).slice(0, 15);
    const sub = d => ` ${d.recs.length}회${mCat === '전체' ? ' · ' + d.cat : ''}`;
    $('#m-up').innerHTML = up.map((d, i) => rankItem(i + 1, d, sub(d), maxAbs)).join('') || '<li class="empty">조건에 맞는 메뉴가 없어요</li>';
    $('#m-down').innerHTML = down.map((d, i) => rankItem(i + 1, d, sub(d), maxAbs)).join('') || '<li class="empty">조건에 맞는 메뉴가 없어요</li>';
    const cats = D.cats.map(c => {
      const ds = DISH.filter(d => d.cat === c && hasEff(d));
      const w = sum(ds.map(d => d.recs.length));
      return { c, n: ds.length, eff: w ? sum(ds.map(d => d.eff * d.recs.length)) / w : 0 };
    }).filter(x => x.n >= 3).sort((a, b) => b.eff - a.eff);
    const cMax = Math.max(0.05, ...cats.map(x => Math.abs(x.eff)));
    $('#m-cat-bars').innerHTML = cats.map((x, i) => {
      const w = Math.abs(x.eff) / cMax * 50;
      const bar = x.eff >= 0 ? `<i style="left:50%;width:${w}%;background:var(--div-pos)"></i>` : `<i style="right:50%;width:${w}%;background:var(--div-neg)"></i>`;
      return `<li><button class="rank-item" type="button" data-cat="${x.c}"><span class="rank-no">${i + 1}</span><span class="rank-name">${x.c}<small>메뉴 ${x.n}개</small></span><span class="rank-bar" aria-hidden="true">${bar}</span><span class="rank-val">${sign(kgS(x.eff), 2)}</span></button></li>`;
    }).join('');
  }
  function openDish(id) {
    const d = DISH[id];
    const rs = d.recs.map(i => HIST[i]).sort((a, b) => b.date.localeCompare(a.date) || b.mi - a.mi);
    const valid = rs.filter(r => !r.out);
    const wdCnt = WD.map((_, i) => rs.filter(r => r.wd === i).length), wdMax = Math.max(1, ...wdCnt);
    const miCnt = MEALS.map((_, i) => rs.filter(r => r.mi === i).length);
    const alts = hasEff(d) ? DISH.filter(x => x.cat === d.cat && x.id !== d.id && hasEff(x) && x.eff < Math.min(-0.1, d.eff - 0.3)).sort((a, b) => a.eff - b.eff).slice(0, 6) : [];
    const efText = hasEff(d) ? `<span class="${d.eff >= EFF_T ? 'delta-up' : d.eff <= -EFF_T ? 'delta-down' : ''}">${sign(kgS(d.eff), 2)} kg</span>` : '<span class="muted">기록 부족</span>';
    $('#dlg-body').innerHTML = `
      <div class="dlg-head"><div><span class="chip">${d.cat}</span><h2 id="dlg-title" style="margin-top:8px">${esc(d.name)}</h2></div><button class="icon-btn" type="button" data-close aria-label="닫기">✕</button></div>
      <div class="stat-row">
        <div><div class="kpi-label">제공 횟수</div><b>${rs.length}회</b></div>
        <div><div class="kpi-label">잔반 지수</div><b>${efText}</b></div>
        <div><div class="kpi-label">나온 날 평균 잔반</div><b>${nf(mean(valid.map(r => kgOf(r.L))))} kg</b></div>
        <div><div class="kpi-label">마지막 제공</div><b>${rs[0] ? rs[0].date.slice(2).replace(/-/g, '.') : '–'}</b></div>
      </div>
      <div>
        <div class="kpi-label" style="margin-bottom:6px">요일별 제공 횟수 · ${MEALS.map((m, i) => `${m} ${miCnt[i]}`).join(' · ')}</div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;align-items:end;height:84px">
          ${wdCnt.map((c, i) => `<div style="display:grid;gap:4px;justify-items:center;align-self:end"><span class="small num">${c || ''}</span><span style="width:70%;max-width:28px;height:${Math.max(2, c / wdMax * 48)}px;background:var(--s1);border-radius:4px 4px 0 0"></span><span class="small muted">${WD[i]}</span></div>`).join('')}
        </div>
      </div>
      <div class="table-wrap"><table class="wd-table"><thead><tr><th>최근 제공</th><th>함께 나온 메뉴</th><th class="r">끼니 잔반</th></tr></thead><tbody>
        ${rs.slice(0, 8).map(r => `<tr><td style="white-space:nowrap"><button class="link-btn" type="button" data-goto="${r.date}" data-close>${r.date.slice(2).replace(/-/g, '.')}(${WD[r.wd]})</button><br><span class="small muted">${MEALS[r.mi]}</span></td><td class="small">${esc(r.dishes.filter(x => x !== id && !STAPLE.has(x)).slice(0, 4).map(x => DISH[x].name).join(', '))}</td><td class="r">${r.out ? '<span class="muted small">이상값</span>' : `<b>${nf(kgOf(r.L))}kg</b>`}</td></tr>`).join('')}
      </tbody></table></div>
      ${alts.length ? `<div><div class="kpi-label" style="margin-bottom:6px">같은 분류에서 더 잘 먹은 메뉴</div><div class="alt-btns">${alts.map(x => `<button type="button" data-dish="${x.id}">${esc(x.name)} ${sign(kgS(x.eff), 1)}</button>`).join('')}</div></div>` : ''}
      <div class="row"><button class="btn primary" type="button" id="dlg-add">식단 짜보기에 넣기</button><button class="btn" type="button" data-close>닫기</button></div>
      <p class="note">잔반 지수는 이 메뉴가 나온 날의 끼니 잔반이 같은 조건의 평소보다 얼마나 많았는지 평균 낸 값이에요(제공 횟수가 적으면 0 쪽으로 보정).</p>`;
    $('#dlg-add').onclick = () => { addToPlan(DISH[id].name); closeDlg(); location.hash = '#plan'; };
    const dlg = $('#dish-dlg');
    if (!dlg.open) { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); }
    dlg.scrollTop = 0;
  }
  function closeDlg() { const dlg = $('#dish-dlg'); if (dlg.open) { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); } }

  /* ---------- 식단 짜보기 ---------- */
  let plan = store.get('plan', null);
  if (!plan || !Array.isArray(plan.names)) {
    const sample = [...HIST].reverse().find(r => r.mi === 1 && r.dishes.length >= 5 && r.dishes.some(id => hasEff(DISH[id]) && DISH[id].eff >= EFF_T));
    plan = { mi: 1, wd: sample ? sample.wd : 0, month: new Date().getMonth() + 1, ppl: '', names: sample ? sample.dishes.map(id => DISH[id].name) : [] };
  }
  const savePlan = () => store.set('plan', plan);
  function addToPlan(name) {
    name = cleanName(name || '').trim();
    if (!name) return;
    const id = findDish(name);
    const nm = id != null ? DISH[id].name : name;
    if (plan.names.some(x => norm(x) === norm(nm))) { toast('이미 들어 있는 메뉴예요'); return; }
    plan.names.push(nm); savePlan();
  }
  function renderPlan() {
    if (!$('#p-wd').options.length) {
      $('#p-wd').innerHTML = WD.map((w, i) => `<option value="${i}">${w}요일</option>`).join('');
      $('#p-month').innerHTML = [...Array(12)].map((_, i) => `<option value="${i + 1}">${i + 1}월</option>`).join('');
    }
    $('#p-meal').value = String(plan.mi); $('#p-wd').value = String(plan.wd); $('#p-month').value = String(plan.month);
    const defPpl = M.attMean[plan.mi][plan.wd];
    $('#p-ppl').placeholder = `평소 ${defPpl}명`;
    $('#p-ppl').value = plan.ppl || '';
    const ids = plan.names.map(findDish);
    $('#p-chips').innerHTML = plan.names.length ? plan.names.map((nm, i) => `<span class="sim-chip">${esc(nm)}<button type="button" data-rm="${i}" aria-label="${esc(nm)} 빼기">×</button></span>`).join('') : '<span class="muted small">메뉴를 추가하면 예상 잔반량이 계산돼요.</span>';
    const p = predictRaw(plan.mi, plan.wd, plan.month, 2026, +plan.ppl || 0, ids);
    $('#p-result').innerHTML = `
      <div class="card-title">예상 잔반량 <span class="muted">${WD[plan.wd]}요일 ${MEALS[plan.mi]} · ${plan.month}월 · ${p.ppl}명</span></div>
      <div class="sim-big"><span class="lvl lvl-${p.lv} hero-face">${face(p.lv)}</span><div><b class="num">${nf(p.kg)}</b> <span class="unit" style="font-weight:600">kg</span><div class="lvl-text" style="font-weight:700">${LEVELS[p.lv]} <span class="muted small">±${nf(errKg())}kg</span></div></div></div>
      <div class="stat-row">
        <div><div class="kpi-label">1인당</div><b>${nf(p.g, 0)} g</b></div>
        <div><div class="kpi-label">탄소</div><b>${nf(p.kg * S.co2, 1)} kg</b></div>
        <div><div class="kpi-label">손실 비용</div><b>${nf(p.kg * S.won, 0)}원</b></div>
        <div><div class="kpi-label">메뉴 영향</div><b class="${p.adj > 0.05 ? 'delta-up' : p.adj < -0.05 ? 'delta-down' : ''}">${sign(p.adj, 2)} kg</b></div>
      </div>
      <p class="note">기본 예상 <b>${nf(p.base)}kg</b>(끼니·요일·월·인원)에 메뉴 영향 <b>${sign(p.adj, 2)}kg</b>을 더했어요.</p>`;
    const rows = plan.names.map((nm, i) => {
      const id = ids[i], d = id != null ? DISH[id] : null;
      let ef = '<span class="muted small">새 메뉴</span>', alt = '';
      if (d && hasEff(d)) {
        const v = kgS(d.eff), w = Math.min(50, Math.abs(d.eff) / 1.2 * 50);
        ef = `<span style="display:inline-flex;align-items:center;gap:8px"><span class="rank-bar" style="width:70px" aria-hidden="true">${d.eff >= 0 ? `<i style="left:50%;width:${w}%;background:var(--div-pos)"></i>` : `<i style="right:50%;width:${w}%;background:var(--div-neg)"></i>`}</span><b class="num ${d.eff >= EFF_T ? 'delta-up' : d.eff <= -EFF_T ? 'delta-down' : ''}">${sign(v, 2)}</b></span>`;
        if (d.eff >= 0.25) {
          const inPlan = new Set(plan.names.map(norm));
          const alts = DISH.filter(x => x.cat === d.cat && hasEff(x) && x.eff < Math.min(-0.1, d.eff - 0.3) && !inPlan.has(norm(x.name))).sort((a, b) => a.eff - b.eff).slice(0, 3);
          alt = alts.length ? `<div class="alt-btns">${alts.map(x => `<button type="button" data-swap="${i}" data-to="${x.id}" title="${esc(nm)} 대신 넣기">→ ${esc(x.name)} ${sign(kgS(x.eff), 1)}</button>`).join('')}</div>` : '<span class="muted small">대체 후보 없음</span>';
        }
      } else if (d) ef = `<span class="muted small">기록 ${d.recs.length}회</span>`;
      return `<tr><td>${d ? `<button class="link-btn" type="button" data-dish="${id}">${esc(nm)}</button>` : esc(nm)}</td><td class="small muted">${d ? d.cat : '–'}</td><td>${ef}</td><td>${alt}</td><td class="r"><button class="btn sm" type="button" data-rm="${i}">빼기</button></td></tr>`;
    }).join('');
    $('#p-table').innerHTML = `<thead><tr><th>메뉴</th><th>분류</th><th>잔반 지수(kg)</th><th>더 잘 먹은 대체 메뉴</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="muted">메뉴를 추가해 주세요</td></tr>'}</tbody>`;
    $('#p-note').innerHTML = `예측 모델은 2023~2025년 ${M.trainRows.toLocaleString()}끼로 학습했고, 처음 보는 날에 대한 평균 오차는 약 ±${nf(errKg())}kg이에요. 잔반량은 요일·끼니·계절·급식 인원의 영향이 크고 메뉴 하나의 영향은 대체로 0.5kg 안쪽이라, 메뉴 교체 효과는 참고용으로 보세요.`;
  }

  /* ---------- 탄소·기록 ---------- */
  let cYear = null;
  function renderCarbon() {
    const ALL = actualRecords().filter(r => !r.out), years = yearsOf(ALL);
    if (!cYear || !years.includes(cYear)) cYear = years.includes(2025) ? 2025 : years[years.length - 1];
    const stat = y => {
      const rs = ALL.filter(r => r.y === y), kg = sum(rs.map(r => kgOf(r.L)));
      return { y, rs, kg, perMeal: rs.length ? kg / rs.length : 0, user: rs.some(r => r.user) };
    };
    const ys = years.map(stat);
    $('#c-years').innerHTML = ys.map((s, i) => {
      const prev = ys[i - 1], co2 = s.kg * S.co2;
      const delta = prev && prev.perMeal ? (s.perMeal - prev.perMeal) / prev.perMeal * 100 : null;
      const deltaHTML = delta == null ? '<span class="muted small">기준 연도</span>' : `<span class="${delta <= 0 ? 'delta-down' : 'delta-up'}">${delta <= 0 ? '▼' : '▲'} ${nf(Math.abs(delta), 1)}%</span> <span class="muted small">한 끼 평균, ${prev.y}년 대비</span>`;
      return `<article class="card year-card">
        <div class="card-head" style="margin:0"><h3>${s.y}년</h3>${s.user ? '<span class="chip">앱 입력 포함</span>' : ''}</div>
        <div class="yc-big num">${co2 >= 1000 ? nf(co2 / 1000, 1) + '<small>tCO₂e</small>' : nf(co2, 0) + '<small>kgCO₂e</small>'}</div>
        <div>${deltaHTML}</div>
        <dl class="yc-rows">
          <dt>잔반량</dt><dd>${nf(s.kg, 0)} kg</dd>
          <dt>기록된 끼니</dt><dd>${s.rs.length.toLocaleString()}끼</dd>
          <dt>한 끼 평균</dt><dd>${nf(s.perMeal, 1)} kg</dd>
          <dt>손실 비용(추정)</dt><dd>${nf(s.kg * S.won / 10000, 0)}만 원</dd>
          <dt>흡수에 필요한 소나무</dt><dd>${nf(co2 / TREE_KG, 0)}그루</dd>
        </dl>
      </article>`;
    }).join('');
    // 월별 막대
    $('#c-year').innerHTML = years.map(y => `<button type="button" data-v="${y}" aria-pressed="${y === cYear}">${y}</button>`).join('');
    const rsY = ALL.filter(r => r.y === cYear);
    const monthly = [...Array(12)].map((_, i) => { const rs = rsY.filter(r => r.m === i + 1); return rs.length ? sum(rs.map(r => kgOf(r.L))) : null; });
    const mCnt = [...Array(12)].map((_, i) => rsY.filter(r => r.m === i + 1).length);
    barChart($('#c-bar'), {
      labels: [...Array(12)].map((_, i) => String(i + 1)), values: monthly, color: YEAR_COLOR[cYear], aria: `${cYear}년 월별 잔반량`,
      fmt: v => nf(v, 0) + 'kg',
      tip: i => `<b>${cYear}년 ${i + 1}월</b><br>잔반 ${nf(monthly[i], 0)}kg · ${mCnt[i]}끼<br>탄소 ${nf(monthly[i] * S.co2, 0)} kgCO₂e`,
    });
    renderScenario(ys);
    renderGoal();
    renderLogTable();
    $('#set-kgl').value = S.kgPerL; $('#set-co2').value = S.co2; $('#set-won').value = S.won; $('#set-goal').value = S.goal;
    $('#c-sources').innerHTML = `<b>탄소 계수 ${S.co2} kgCO₂e/kg</b>: FAO(2013) 「Food Wastage Footprint」의 음식물 낭비 전 과정(생산·유통·폐기) 배출량을 무게로 나눈 값(약 2.5)을 기본으로 했어요. <b>소나무 1그루</b>: 30년생 소나무의 연간 CO₂ 흡수량 ${TREE_KG}kg(국립산림과학원). <b>손실 비용 ${S.won.toLocaleString()}원/kg</b>은 식재료비와 처리비를 합친 추정값이에요.`;
  }
  function renderScenario(ys) {
    const base = ys.filter(s => !s.user).slice(-1)[0] || ys[ys.length - 1];
    if (!base) return;
    const pct = +$('#c-pct').value;
    $('#c-pct-out').textContent = pct + '%';
    $('#c-base-label').textContent = `${base.y}년 잔반 ${nf(base.kg, 0)}kg 기준, 1년 동안`;
    const kg = base.kg * pct / 100, co2 = kg * S.co2, trees = co2 / TREE_KG;
    $('#c-save').innerHTML = [
      ['줄어드는 잔반', `${nf(kg, 0)}<small>kg</small>`],
      ['줄어드는 탄소', `${nf(co2, 0)}<small>kgCO₂e</small>`],
      ['아끼는 비용', `${nf(kg * S.won / 10000, 0)}<small>만 원</small>`],
      ['소나무 효과', `${nf(trees, 0)}<small>그루</small>`],
    ].map(([l, v]) => `<div class="kpi"><div class="kpi-label">${l}</div><div class="kpi-value num">${v}</div></div>`).join('');
    const per = trees > 120 ? 10 : 1, icons = Math.round(trees / per);
    $('#c-trees').innerHTML = '<svg aria-hidden="true"><use href="#i-tree"/></svg>'.repeat(Math.min(icons, 150));
    $('#c-trees-note').textContent = `나무 아이콘 1개 = 소나무 ${per}그루. 우리 학교가 잔반을 ${pct}% 줄이면 30년생 소나무 ${nf(trees, 0)}그루가 1년 동안 흡수하는 만큼 탄소를 줄여요.`;
  }
  function renderGoal() {
    const entries = Object.entries(LOG).map(([k, L]) => { const [date, mi] = k.split('|'); return { date, mi: +mi, L }; });
    const box = $('#goal-box');
    if (!entries.length) {
      box.innerHTML = `<p class="note">아직 입력한 기록이 없어요. 날짜와 끼니별 잔반(L)을 저장하면 2025년 같은 달·같은 끼니 평균과 비교해 <b>${S.goal}% 줄이기</b> 목표 달성도를 보여 드려요. 오늘 예보 화면의 각 끼니 카드에서도 바로 입력할 수 있어요.</p>`;
      return;
    }
    const ref = (mi, m) => {
      for (const y of [2025, 2024, 2023]) {
        const v = HIST.filter(r => !r.out && r.y === y && r.mi === mi && r.m === m).map(r => r.L);
        if (v.length >= 5) return mean(v);
      }
      return mean(HIST.filter(r => !r.out && r.mi === mi).map(r => r.L));
    };
    const exp = sum(entries.map(e => ref(e.mi, +e.date.slice(5, 7)))), got = sum(entries.map(e => e.L));
    const red = (1 - got / exp) * 100, prog = Math.max(0, Math.min(100, red / S.goal * 100));
    box.innerHTML = `<div style="display:grid;gap:8px">
      <div class="row" style="justify-content:space-between;align-items:center"><b>목표: 잔반 ${S.goal}% 줄이기</b><span class="small">${red >= S.goal ? '<span class="delta-down">✓ 목표 달성</span>' : `목표까지 ${nf(Math.max(0, S.goal - red), 1)}%p`}</span></div>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(prog)}" aria-label="목표 달성도"><i style="width:${prog}%"></i></div>
      <p class="note">입력한 ${entries.length}끼의 잔반 합계는 <b>${nf(kgOf(got))}kg</b>으로, 지난해 같은 달·끼니 평균(${nf(kgOf(exp))}kg)보다 <span class="${red >= 0 ? 'delta-down' : 'delta-up'}">${nf(Math.abs(red), 1)}% ${red >= 0 ? '적어요' : '많아요'}</span>. 줄어든 탄소 ${nf(Math.max(0, kgOf(exp - got)) * S.co2, 1)} kgCO₂e.</p>
    </div>`;
  }
  function renderLogTable() {
    const keys = Object.keys(LOG).sort().reverse();
    $('#log-table').innerHTML = `<thead><tr><th>날짜</th><th>끼니</th><th class="r">잔반</th><th class="r">예보</th><th></th></tr></thead><tbody>${keys.map(k => {
      const [ds, mi] = k.split('|'), L = LOG[k];
      const hist = HIST_KEY.get(k);
      const p = predict(+mi, ds, hist ? hist.people : peopleFor(ds, +mi), hist ? hist.dishes : []);
      return `<tr><td class="num">${shortLabel(ds)}</td><td>${MEALS[+mi]}</td><td class="r"><b>${L} L</b> <span class="muted small">${nf(kgOf(L))}kg</span></td><td class="r small">${nf(p.kg)}kg</td><td class="r"><button class="btn sm danger" type="button" data-del="${k}">삭제</button></td></tr>`;
    }).join('') || '<tr><td colspan="5" class="muted">기록이 없어요</td></tr>'}</tbody>`;
  }
  const CSV_HEAD = '연도,월,일자,요일,끼니,원자료 발생량(L),환산 무게(kg),이상값 확인,원본 파일';
  function logCsv() {
    return [CSV_HEAD, ...Object.keys(LOG).sort().map(k => {
      const [ds, mi] = k.split('|'), L = LOG[k];
      return [ds.slice(0, 4), +ds.slice(5, 7), ds, WD[wdOf(ds)], MEALS[+mi], L.toFixed(1), (L * S.kgPerL).toFixed(1), L >= D.meta.outlierL ? '확인 필요' : '', '대성 잔반 예보 앱 입력'].join(',');
    })].join('\r\n');
  }
  function importCsv(text) {
    const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) return 0;
    const head = lines[0].split(',').map(s => s.trim());
    let iDate = head.indexOf('일자'), iMeal = head.indexOf('끼니'), iL = head.findIndex(h => /L\)|발생량|리터/.test(h));
    let start = 1;
    if (iDate < 0 || iMeal < 0 || iL < 0) { iDate = 0; iMeal = 1; iL = 2; start = /\d{4}-\d{2}-\d{2}/.test(lines[0]) ? 0 : 1; }
    let n = 0;
    lines.slice(start).forEach(l => {
      const c = l.split(',').map(s => s.trim());
      const ds = (c[iDate] || '').replace(/\./g, '-').replace(/\//g, '-');
      const mi = MEALS.indexOf(c[iMeal]), L = parseFloat(c[iL]);
      if (/^\d{4}-\d{2}-\d{2}$/.test(ds) && mi >= 0 && !isNaN(L)) { LOG[ds + '|' + mi] = L; n++; }
    });
    store.set('log', LOG);
    return n;
  }

  /* ---------- 전광판 ---------- */
  let boardTimer = null, wakeLock = null;
  const BOARD_MSG = [
    ['먹을 만큼만 받기', '부족하면 더 받으러 오는 것이 잔반을 줄이는 가장 쉬운 방법이에요.'],
    ['잔반 1kg = 탄소 2.5kg', '버려진 음식은 기르고, 옮기고, 처리하는 동안 온실가스를 내요.'],
    ['처음 보는 메뉴는 한 입 먼저', '맛을 보고 마음에 들면 더 받아요.'],
    ['국물은 먹을 만큼만', '국과 찌개는 건더기 위주로 받아요.'],
    ['후식은 먹을 때만', '먹지 않을 후식은 받지 않고 친구와 나눠요.'],
  ];
  function openBoard() {
    const b = $('#board');
    b.hidden = false;
    document.body.style.overflow = 'hidden';
    try { const p = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* 전체화면 미지원 */ }
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(l => { wakeLock = l; }).catch(() => {}); } catch (e) { /* 화면 켜짐 유지 미지원 */ }
    renderBoard();
    clearInterval(boardTimer);
    boardTimer = setInterval(renderBoard, 30000);
  }
  function closeBoard() {
    $('#board').hidden = true;
    document.body.style.overflow = '';
    clearInterval(boardTimer);
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* 무시 */ }
    try { if (wakeLock) wakeLock.release(); } catch (e) { /* 무시 */ }
    wakeLock = null;
  }
  async function renderBoard() {
    const now = new Date(), hr = now.getHours() + now.getMinutes() / 60;
    let ds = toStr(now), mi = hr < 9 ? 0 : hr < 13.5 ? 1 : hr < 19.5 ? 2 : 3;
    if (mi === 3) { ds = addDays(ds, 1); mi = 0; }
    if (ds !== todayStr()) dayCache.delete(ds);
    const day = await getDay(ds);
    if ($('#board').hidden) return;
    const meals = day.meals.filter(m => m.names.length);
    const meal = meals.find(m => m.mi === mi) || meals.find(m => m.mi > mi) || null;
    const msg = BOARD_MSG[Math.floor(now.getTime() / 60000) % BOARD_MSG.length];
    // 어제 실측
    const yd = addDays(todayStr(), -1);
    const yAct = [0, 1, 2].map(i => ({ i, L: actualL(yd, i) })).filter(x => x.L != null);
    let yHTML = `<div class="bd-label">어제 잔반</div><div class="bd-msg">아직 기록이 없어요<small>잔반을 기록하면 여기에 결과가 나와요.</small></div>`;
    if (yAct.length) {
      const got = sum(yAct.map(x => kgOf(x.L)));
      const exp = sum(yAct.map(x => { const h = HIST_KEY.get(yd + '|' + x.i); return predict(x.i, yd, h ? h.people : peopleFor(yd, x.i), h ? h.dishes : []).kg; }));
      const diff = (got - exp) / exp * 100;
      yHTML = `<div class="bd-label">어제 잔반 (${yAct.length}끼)</div><div class="bd-msg num">${nf(got)} kg · 예보보다 <span class="${diff <= 0 ? 'delta-down' : 'delta-up'}">${nf(Math.abs(diff), 0)}% ${diff <= 0 ? '적어요 ▼' : '많아요 ▲'}</span><small>탄소 ${nf(got * S.co2, 0)} kgCO₂e</small></div>`;
    }
    let left, right;
    if (meal) {
      const p = predict(meal.mi, ds, meal.people, meal.ids);
      left = `<div class="bd-label">${dayLabel(ds)}${meal.people ? ` · ${meal.people}명` : ''}</div><div class="bd-meal">${MEALS[meal.mi]}</div>
        <ul class="bd-menu">${meal.names.map((nm, i) => `<li><span>${esc(nm)}</span>${dishTag(meal.ids[i]).replace('새 메뉴', '새 메뉴')}</li>`).join('')}</ul>`;
      const tip = makeTip([meal]);
      right = `<div class="bd-label">이번 끼니 잔반 예보</div>
        <div class="bd-fc"><span class="lvl lvl-${p.lv}">${face(p.lv)}</span><div><b class="num">${nf(p.kg)}</b><span class="bd-label"> kg</span><div class="lvl-text">${LEVELS[p.lv]}</div></div></div>
        <div class="bd-msg">${tip.main}</div>`;
    } else {
      left = `<div class="bd-label">${dayLabel(ds)}</div><div class="bd-meal">급식 없음</div><div class="bd-msg">${day.source === 'none' ? '식단을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.' : '오늘은 남은 급식이 없어요.'}</div>`;
      right = `<div class="bd-label">오늘의 약속</div><div class="bd-msg">${msg[0]}<small>${msg[1]}</small></div>`;
    }
    $('#board').innerHTML = `
      <div class="bd-top"><div class="bd-brand"><svg class="brand-mark" aria-hidden="true"><use href="#i-mark"/></svg><div class="bd-title">대성 잔반 예보</div></div>
        <div class="bd-clock num">${pad(now.getHours())}:${pad(now.getMinutes())}<small>${now.getMonth() + 1}월 ${now.getDate()}일 ${WD[(now.getDay() + 6) % 7]}요일</small></div></div>
      <div class="bd-main"><div class="bd-panel">${left}</div><div class="bd-panel">${right}<hr style="border:0;border-top:1px solid var(--line);width:100%;margin:0">${yHTML}<hr style="border:0;border-top:1px solid var(--line);width:100%;margin:0"><div class="bd-msg">${msg[0]}<small>${msg[1]}</small></div></div></div>
      <div class="bd-foot"><span>30초마다 새로 고침 · 시간에 맞춰 조식/중식/석식이 바뀌어요</span><button class="btn" type="button" id="bd-close">닫기 (Esc)</button></div>`;
    $('#bd-close').onclick = closeBoard;
  }

  /* ---------- 라우팅과 이벤트 ---------- */
  const VIEWS = { today: renderToday, week: renderWeek, stats: renderStats, menu: renderMenu, plan: renderPlan, carbon: renderCarbon };
  let current = 'today';
  function route() {
    let v = location.hash.slice(1);
    if (!VIEWS[v]) v = 'today';
    Object.keys(VIEWS).forEach(n => { $('#v-' + n).hidden = n !== v; });
    $$('.nav a, .tabbar a').forEach(a => { if (a.getAttribute('href') === '#' + v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    const changed = current !== v;
    current = v;
    hideTip();
    VIEWS[v]();
    if (changed) scrollTo(0, 0);
  }
  addEventListener('hashchange', route);
  function goDate(ds) {
    curDate = ds;
    closeDlg();
    if (location.hash !== '#today') location.hash = '#today'; else { renderToday(); scrollTo(0, 0); }
  }
  function rerender() { dayCache.clear(); VIEWS[current](); }

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-dish],[data-goto],[data-close],[data-cat],[data-wd],[data-rm],[data-swap],[data-del]');
    if (!t) return;
    if (t.matches('[data-goto]')) { goDate(t.dataset.goto); return; }
    if (t.matches('[data-dish]')) { openDish(+t.dataset.dish); return; }
    if (t.matches('[data-close]')) { closeDlg(); return; }
    if (t.matches('#m-cats [data-cat], #m-cat-bars [data-cat]')) { mCat = mCat === t.dataset.cat && t.closest('#m-cat-bars') ? '전체' : t.dataset.cat; renderMenu(); return; }
    if (t.matches('#st-wd [data-wd]')) { stWd = +t.dataset.wd; renderStats(); return; }
    if (t.matches('[data-rm]')) { plan.names.splice(+t.dataset.rm, 1); savePlan(); renderPlan(); return; }
    if (t.matches('[data-swap]')) { plan.names[+t.dataset.swap] = DISH[+t.dataset.to].name; savePlan(); renderPlan(); toast('대체 메뉴로 바꿨어요'); return; }
    if (t.matches('[data-del]')) {
      if (t.dataset.armed) { delete LOG[t.dataset.del]; store.set('log', LOG); renderCarbon(); toast('기록을 삭제했어요'); }
      else { t.dataset.armed = '1'; t.textContent = '한 번 더 누르면 삭제'; setTimeout(() => { if (t.isConnected) { delete t.dataset.armed; t.textContent = '삭제'; } }, 3000); }
    }
  });
  $('#dish-dlg').addEventListener('click', e => { if (e.target === e.currentTarget) closeDlg(); });

  // 오늘
  $('#d-prev').onclick = () => { curDate = addDays(curDate, -1); renderToday(); };
  $('#d-next').onclick = () => { curDate = addDays(curDate, 1); renderToday(); };
  $('#d-today').onclick = () => { curDate = todayStr(); renderToday(); };
  $('#d-date').addEventListener('change', e => { if (e.target.value) { curDate = e.target.value; renderToday(); } });
  // 주간
  $('#w-prev').onclick = () => { weekStart = addDays(weekStart, -7); renderWeek(); };
  $('#w-next').onclick = () => { weekStart = addDays(weekStart, 7); renderWeek(); };
  $('#w-today').onclick = () => { weekStart = mondayOf(todayStr()); renderWeek(); };
  // 요일 분석
  $('#st-year').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; stYear = b.dataset.v === 'all' ? 'all' : +b.dataset.v; renderStats(); });
  $('#st-metric').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; stMetric = b.dataset.v; renderStats(); });
  // 메뉴
  $('#dish-list').innerHTML = DISH.filter(d => d.recs.length).map(d => `<option value="${esc(d.name)}"></option>`).join('');
  const searchDish = () => {
    const v = $('#m-search').value.trim();
    if (!v) return;
    let id = findDish(v);
    if (id == null) { const hit = DISH.filter(d => d.recs.length && d.name.includes(v)).sort((a, b) => b.recs.length - a.recs.length)[0]; id = hit ? hit.id : null; }
    if (id == null) toast(`‘${v}’ 메뉴는 2023~2025년 기록에 없어요`); else openDish(id);
  };
  $('#m-search').addEventListener('change', searchDish);
  $('#m-search').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); searchDish(); } });
  $('#m-min').addEventListener('change', e => { mMin = +e.target.value; renderMenu(); });
  // 식단 짜보기
  const planAdd = () => { addToPlan($('#p-add').value); $('#p-add').value = ''; renderPlan(); };
  $('#p-add-btn').onclick = planAdd;
  $('#p-add').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); planAdd(); } });
  $('#p-meal').onchange = e => { plan.mi = +e.target.value; savePlan(); renderPlan(); };
  $('#p-wd').onchange = e => { plan.wd = +e.target.value; savePlan(); renderPlan(); };
  $('#p-month').onchange = e => { plan.month = +e.target.value; savePlan(); renderPlan(); };
  $('#p-ppl').onchange = e => { plan.ppl = e.target.value ? Math.max(10, Math.round(+e.target.value)) : ''; savePlan(); renderPlan(); };
  $('#p-clear').onclick = () => { plan.names = []; savePlan(); renderPlan(); };
  $('#p-load-random').onclick = () => {
    const pool = HIST.filter(r => r.dishes.length >= 4);
    const r = pool[Math.floor(Math.random() * pool.length)];
    Object.assign(plan, { mi: r.mi, wd: r.wd, month: r.m, ppl: r.people || '', names: r.dishes.map(id => DISH[id].name) });
    savePlan(); renderPlan(); toast(`${r.date} ${MEALS[r.mi]} 식단을 불러왔어요 (실제 잔반 ${nf(kgOf(r.L))}kg)`);
  };
  $('#p-load-today').onclick = async () => {
    const ds = todayStr(), day = await getDay(ds);
    const meals = day.meals.filter(m => m.names.length);
    const m = meals.find(x => x.mi === plan.mi) || meals[0];
    if (!m) { toast('오늘은 불러올 식단이 없어요'); return; }
    Object.assign(plan, { mi: m.mi, wd: wdOf(ds), month: fromStr(ds).getMonth() + 1, ppl: m.people || '', names: m.names.slice() });
    savePlan(); renderPlan(); toast(`오늘 ${MEALS[m.mi]} 식단을 불러왔어요`);
  };
  // 탄소·기록
  $('#c-year').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; cYear = +b.dataset.v; renderCarbon(); });
  $('#c-pct').addEventListener('input', () => renderScenario(yearsOf(actualRecords().filter(r => !r.out)).map(y => {
    const rs = actualRecords().filter(r => !r.out && r.y === y), kg = sum(rs.map(r => kgOf(r.L)));
    return { y, rs, kg, perMeal: rs.length ? kg / rs.length : 0, user: rs.some(r => r.user) };
  })));
  $('#lg-date').value = todayStr();
  const fillLogForm = () => { const ds = $('#lg-date').value; [0, 1, 2].forEach(i => { $('#lg-' + i).value = ds && LOG[ds + '|' + i] != null ? LOG[ds + '|' + i] : ''; }); };
  $('#lg-date').addEventListener('change', fillLogForm);
  fillLogForm();
  $('#log-form').addEventListener('submit', e => {
    e.preventDefault();
    const ds = $('#lg-date').value;
    if (!ds) return;
    let n = 0;
    [0, 1, 2].forEach(i => {
      const v = parseFloat($('#lg-' + i).value), k = ds + '|' + i;
      if (isNaN(v)) delete LOG[k]; else { LOG[k] = Math.round(v * 10) / 10; n++; }
    });
    store.set('log', LOG);
    toast(n ? `${shortLabel(ds)} ${n}끼 저장했어요` : `${shortLabel(ds)} 기록을 비웠어요`);
    renderCarbon();
  });
  $('#csv-export').onclick = () => {
    if (!Object.keys(LOG).length) { toast('저장할 기록이 없어요'); return; }
    const csv = logCsv();
    if (!window.JANBAN_NO_DOWNLOAD) try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
      a.download = `잔반기록_${todayStr()}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (err) { /* 다운로드가 막힌 환경: 아래 상자로 대신 보여 줌 */ }
    const box = $('#csv-box'); box.value = csv; box.hidden = false;
  };
  if (window.JANBAN_NO_DOWNLOAD) $('#csv-export').textContent = 'CSV 보기';
  $('#csv-copy').onclick = () => {
    const csv = logCsv(), box = $('#csv-box');
    box.value = csv; box.hidden = false;
    const fallback = () => { box.focus(); box.select(); toast('상자의 내용을 복사해 엑셀에 붙여 넣으세요'); };
    try { navigator.clipboard.writeText(csv).then(() => toast('CSV를 복사했어요. 엑셀에 붙여 넣으세요'), fallback); } catch (err) { fallback(); }
  };
  $('#csv-import').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { const n = importCsv(String(rd.result)); toast(n ? `${n}건을 가져왔어요` : '가져올 수 있는 줄이 없어요. 일자·끼니·발생량(L) 열이 있는지 확인해 주세요'); fillLogForm(); renderCarbon(); };
    rd.readAsText(f, 'utf-8');
    e.target.value = '';
  });
  [['set-kgl', 'kgPerL', 0.3, 1.5], ['set-co2', 'co2', 0.1, 10], ['set-won', 'won', 0, 50000], ['set-goal', 'goal', 1, 80]].forEach(([id, key, lo, hi]) => {
    $('#' + id).addEventListener('change', e => {
      const v = parseFloat(e.target.value);
      if (isNaN(v) || v < lo || v > hi) { e.target.value = S[key]; toast(`${lo}~${hi} 사이 값을 넣어 주세요`); return; }
      S[key] = v; store.set('settings', S); renderCarbon(); toast('계산 기준을 바꿨어요');
    });
  });
  // 전광판·테마
  $('#btn-board').onclick = openBoard;
  addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#board').hidden) closeBoard(); });
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && !$('#board').hidden) { /* 전체화면만 빠져나온 경우 전광판은 유지 */ } });
  const savedTheme = store.get('theme', null);
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
  $('#btn-theme').onclick = () => {
    const next = isDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    store.set('theme', next);
    if (current === 'stats' || current === 'carbon') VIEWS[current]();
  };
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (current === 'stats') renderStats(); });
  let rzTimer, lastW = innerWidth;
  addEventListener('resize', () => {
    clearTimeout(rzTimer);
    rzTimer = setTimeout(() => { if (Math.abs(innerWidth - lastW) > 30 && (current === 'stats' || current === 'carbon')) { lastW = innerWidth; VIEWS[current](); } }, 200);
  });
  // 자정이 지나면 오늘 날짜 갱신
  let lastDay = todayStr();
  setInterval(() => { const t = todayStr(); if (t !== lastDay) { if (curDate === lastDay) curDate = t; lastDay = t; dayCache.clear(); if (current === 'today') renderToday(); } }, 60000);

  route();
  window.__janban = { predict, DISH, HIST, rerender };
})();
