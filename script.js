const FAVORITES_KEY = 'greenmeal-favorite-menus';
function readFavorites() {
  try {
    const favorites = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
    return Array.isArray(favorites) ? favorites.filter((dish) => typeof dish === 'string') : [];
  } catch (error) {
    return [];
  }
}

const state = { meal: '중식', menu: [], categories: {}, groups: {}, favorites: new Set(readFavorites()), activeCategory: '밥류', search: '', basePrediction: null, lastResult: null, lastPrediction: null, predictionSignature: null, scenarioA: null, scenarioB: null, comparisonPending: false, comparisonSeen: false };
const CO2E_PER_KG_WASTE = 0.158;
const TREE_CO2_KG_PER_YEAR = 6.6;
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.addEventListener('pageshow', () => {
  (document.scrollingElement || document.documentElement).scrollTop = 0;
});

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[char]);
}

const HANGUL_INITIALS = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
function koreanInitials(value) {
  return [...value].map((char) => {
    const code = char.charCodeAt(0) - 0xAC00;
    return code >= 0 && code < 11172 ? HANGUL_INITIALS[Math.floor(code / 588)] : char;
  }).join('');
}

function matchesMenuSearch(value, query) {
  const compactQuery = query.replace(/\s/g, '').toLowerCase();
  const compactValue = value.replace(/\s/g, '').toLowerCase();
  const initials = koreanInitials(value).replace(/\s/g, '').toLowerCase();
  return compactValue.includes(compactQuery) || initials.includes(compactQuery);
}

function currentMenuSignature() {
  return `${state.meal}\u001f${[...state.menu].sort().join('\u001f')}`;
}

function hasCurrentPrediction() {
  return state.lastPrediction != null && state.predictionSignature === currentMenuSignature();
}

function updateScenarioControls() {
  const currentPrediction = hasCurrentPrediction();
  const comparisonLocked = state.comparisonPending && !state.comparisonSeen;
  $('#predictButton').disabled = !state.menu.length || comparisonLocked;
  $('#saveScenarioButton').disabled = !currentPrediction || comparisonLocked;
  $('#saveScenarioBButton').disabled = !state.scenarioA || !currentPrediction || comparisonLocked;
  $('#compareAnalysisButton').disabled = !state.scenarioA || !state.scenarioB;
}

function renderMenuItem(dish, categoryLabel = '') {
  const safeDish = escapeHtml(dish);
  const safeCategory = escapeHtml(categoryLabel);
  const favorite = state.favorites.has(dish);
  return `<span class="menu-entry"><button type="button" class="menu-chip ${state.menu.includes(dish) ? 'selected' : ''}" data-dish="${safeDish}">${safeCategory ? `<small class="menu-category-tag">${safeCategory}</small>` : ''}${safeDish}</button><button type="button" class="favorite-toggle ${favorite ? 'is-favorite' : ''}" data-favorite="${safeDish}" aria-label="${favorite ? '즐겨찾기에서 제거' : '즐겨찾기에 추가'}: ${safeDish}" aria-pressed="${favorite}" title="${favorite ? '즐겨찾기에서 제거' : '즐겨찾기에 추가'}">${favorite ? '★' : '☆'}</button></span>`;
}

function renderCatalog() {
  const categories = Object.keys(state.categories);
  const categoryLabels = { '고기·메인류': '메인 육류/생선', '국·찌개류': '국·찌개', '후식·음료': '후식/음료' };
  const getCategoryLabel = (category) => categoryLabels[category] || category;
  if (!categories.includes(state.activeCategory)) state.activeCategory = categories[0];
  const searching = state.search.trim().length > 0;
  const query = state.search.trim().toLowerCase();
  const favoriteDishes = [...state.favorites].filter((dish) => !searching || matchesMenuSearch(dish, query));
  $('#favoriteCatalog').hidden = favoriteDishes.length === 0;
  $('#favoriteCount').textContent = favoriteDishes.length;
  $('#favoriteList').innerHTML = favoriteDishes.map((dish) => renderMenuItem(dish, searching ? getCategoryLabel(categoryOf(dish)) : '')).join('');
  $('#categoryTabs').innerHTML = categories.map((category) => `<button type="button" class="category-tab ${!searching && category === state.activeCategory ? 'active' : ''}" data-category="${escapeHtml(category)}">${escapeHtml(getCategoryLabel(category))} <span>${state.categories[category].length}</span></button>`).join('');
  let groups = state.groups[state.activeCategory] || [];
  let searchBuckets = [];
  if (searching) {
    searchBuckets = categories.map((category) => {
      const matchingGroups = (state.groups[category] || []).map((group) => {
        const matchesFamily = matchesMenuSearch(group.label, query);
        const items = matchesFamily ? group.items : group.items.filter((dish) => matchesMenuSearch(dish, query));
        return items.length ? { ...group, items } : null;
      }).filter(Boolean);
      return { category, groups: matchingGroups };
    }).filter((bucket) => bucket.groups.length);
  }
  let familyIndex = 0;
  const renderGroup = (group) => {
    const index = familyIndex++;
    if (group.items.length === 1) return renderMenuItem(group.items[0]);
    return `<div class="family-group"><button type="button" class="family-toggle" data-group="${index}"><span>${escapeHtml(group.label)}</span><small>${group.items.length}개 파생형 <b>⌄</b></small></button><div class="variant-list" data-variants="${index}" hidden>${group.items.map((dish) => renderMenuItem(dish)).join('')}</div></div>`;
  };
  if (searching) {
    $('#menuList').innerHTML = searchBuckets.map((bucket) => {
      const resultCount = bucket.groups.reduce((total, group) => total + group.items.length, 0);
      return `<section class="search-category-group"><div class="search-category-heading"><span>${escapeHtml(getCategoryLabel(bucket.category))}</span><small>${resultCount}개</small></div><div class="search-category-items">${bucket.groups.map(renderGroup).join('')}</div></section>`;
    }).join('');
  } else {
    $('#menuList').innerHTML = groups.map(renderGroup).join('');
  }
  if (searching ? !searchBuckets.length : !groups.length) $('#menuList').innerHTML = '<span class="loading-line">검색 결과가 없습니다. 다른 메뉴 이름을 입력해 보세요.</span>';
  $$('.category-tab').forEach((button) => button.addEventListener('click', () => { state.activeCategory = button.dataset.category; renderCatalog(); }));
  $$('.family-toggle').forEach((button) => button.addEventListener('click', () => {
    const variants = document.querySelector(`[data-variants="${button.dataset.group}"]`);
    variants.hidden = !variants.hidden;
    button.classList.toggle('open', !variants.hidden);
  }));
  $$('[data-favorite]').forEach((button) => button.addEventListener('click', () => toggleFavorite(button.dataset.favorite)));
  $$('.menu-chip').forEach((button) => button.addEventListener('click', () => toggleDish(button.dataset.dish)));
}

function toggleFavorite(dish) {
  if (state.favorites.has(dish)) state.favorites.delete(dish);
  else state.favorites.add(dish);
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...state.favorites]));
  } catch (error) {
    // Keep favorites available for this page even when storage is disabled.
  }
  renderCatalog();
}

function renderChosen() {
  $('#chosenCount').textContent = state.menu.length;
  $('#chosenList').innerHTML = state.menu.length ? state.menu.map((dish) => `<span class="chosen-pill">${escapeHtml(dish)} <button type="button" aria-label="${escapeHtml(dish)} 제거" data-remove="${escapeHtml(dish)}">×</button></span>`).join('') : '<span class="empty-state">카테고리에서 메뉴를 골라 식단을 구성해 주세요.</span>';
  updateScenarioControls();
  $$('[data-remove]').forEach((button) => button.addEventListener('click', () => toggleDish(button.dataset.remove)));
  $$('.menu-chip').forEach((button) => button.classList.toggle('selected', state.menu.includes(button.dataset.dish)));
}

function categoryOf(dish) {
  return Object.keys(state.categories).find((category) => state.categories[category].includes(dish)) || '기타 메뉴';
}

function showSelectionNotice(message) {
  const notice = $('#selectionNotice');
  notice.textContent = message;
  window.clearTimeout(showSelectionNotice.timer);
  showSelectionNotice.timer = window.setTimeout(() => { notice.textContent = ''; }, 2600);
}

function updateTargetVisual(prediction) {
  const average = state.lastResult ? state.lastResult.prediction - state.lastResult.delta : null;
  const delta = prediction == null || average == null ? null : prediction - average;
  const scale = Math.max(2, (average || 0) * .35);
  const ratio = delta == null ? 0 : Math.max(-1, Math.min(1, delta / scale));
  $('#targetGauge').style.left = `${50 + ratio * 44}%`;
  $('#targetGauge').style.opacity = delta == null ? '0' : '1';
  $('#targetMarker').style.left = '50%';
  $('#mealAverageValue').textContent = average == null ? '-- kg' : `${average.toFixed(1)} kg`;
  const indicator = $('#currentTargetText');
  indicator.classList.toggle('above-average-value', delta > .05);
  indicator.classList.toggle('below-average-value', delta < -.05);
  indicator.textContent = delta == null
    ? '예측 전'
    : delta > .05 ? `▲ 평균보다 ${delta.toFixed(1)}kg 높음`
    : delta < -.05 ? `▼ 평균보다 ${Math.abs(delta).toFixed(1)}kg 낮음`
    : '평균과 비슷';
  document.querySelector('.result-panel').classList.toggle('above-average', delta > .05);
  updateScenarioControls();
}

function updateAdjustedPrediction() {
  if (!state.lastResult) return;
  const prediction = Math.max(0, state.basePrediction);
  const average = state.lastResult.prediction - state.lastResult.delta;
  const adjustedDelta = prediction - average;
  state.lastPrediction = prediction;
  $('#predictionValue').innerHTML = `${prediction.toFixed(2)}<small> kg</small>`;
  $('#averageDelta').textContent = `${adjustedDelta >= 0 ? '+' : ''}${adjustedDelta.toFixed(2)} kg`;
  $('#predictionNote').textContent = state.lastResult.note || '모델 예측값입니다.';
  updateTargetVisual(prediction);
}

function updateScenarioPanel() {
  if (!state.scenarioA) return;
  $('#saveScenarioBButton').disabled = !state.menu.length || !hasCurrentPrediction() || (state.comparisonPending && !state.comparisonSeen);
  $('#compareAnalysisButton').disabled = !state.scenarioA || !state.scenarioB;
  $('#scenarioAPrediction').textContent = `${state.scenarioA.prediction.toFixed(2)} kg`;
  $('#scenarioAMenu').textContent = state.scenarioA.menu.join(' · ');
  updateCarbonEstimate('scenarioA', state.scenarioA);
  if (state.scenarioB) {
    $('#scenarioBPrediction').textContent = `${state.scenarioB.prediction.toFixed(2)} kg`;
    $('#scenarioBMenu').textContent = state.scenarioB.menu.join(' · ');
    updateCarbonEstimate('scenarioB', state.scenarioB);
  } else {
    $('#scenarioBPrediction').textContent = '-- kg';
    $('#scenarioBMenu').textContent = '저장 전';
    updateCarbonEstimate('scenarioB', null);
  }
}

function updateCarbonEstimate(prefix, scenario) {
  const output = $(`#${prefix}Carbon`);
  const treeDays = $(`#${prefix}TreeDays`);
  if (!scenario) {
    output.textContent = '-- kg CO₂e';
    treeDays.textContent = '--일';
    return;
  }
  const co2e = Math.max(0, scenario.prediction) * CO2E_PER_KG_WASTE;
  output.textContent = `${co2e.toFixed(2)} kg CO₂e`;
  treeDays.textContent = `${Math.ceil(co2e / TREE_CO2_KG_PER_YEAR * 365).toLocaleString('ko-KR')}일`;
}

function closeScenarioComparison() {
  $('#comparePanel').hidden = true;
  if (state.comparisonPending && state.scenarioA && state.scenarioB) {
    state.comparisonPending = false;
    state.comparisonSeen = true;
    renderChosen();
    showSelectionNotice('비교를 확인했습니다. 새 예측을 진행할 수 있습니다.');
  }
}

async function saveScenarioB() {
  if (!hasCurrentPrediction() || !state.menu.length || state.comparisonPending) return;
  state.scenarioB = { prediction: state.lastPrediction, menu: [...state.menu], meal: state.meal };
  state.comparisonPending = true;
  state.comparisonSeen = false;
  updateScenarioPanel();
  clearSelectedMenu();
  $('#selectionNotice').textContent = '식단안 A와 B를 저장했습니다. 다음 예측 전에 비교 분석을 확인해 주세요.';
}

function toggleDish(dish) {
  if (state.menu.includes(dish)) {
    state.menu = state.menu.filter((item) => item !== dish);
  } else {
    const category = categoryOf(dish);
    const selectedInCategory = state.menu.filter((item) => categoryOf(item) === category).length;
    const limit = category === '밥류' || category === '국·찌개류' ? 1 : 3;
    if (selectedInCategory >= limit) {
      showSelectionNotice(`${category}는 ${limit}개까지만 선택할 수 있습니다.`);
      return;
    }
    state.menu = [...state.menu, dish];
  }
  renderChosen();
}

function clearSelectedMenu() {
  state.menu = [];
  $('#saveScenarioBButton').disabled = true;
  renderCatalog();
  renderChosen();
}

async function loadCatalog() {
  $('#apiState').textContent = '메뉴 목록 불러오는 중';
  try {
    const response = await fetch('/api/catalog');
    const data = await response.json();
    state.categories = data.categories || {};
    state.groups = data.groups || {};
    $('#apiState').textContent = '메뉴 목록 준비됨';
    renderCatalog(); renderChosen();
  } catch (error) {
    $('#apiState').textContent = '메뉴 목록을 불러오지 못했습니다';
    $('#menuList').innerHTML = '<span class="loading-line">메뉴를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.</span>';
  }
}

async function predict(force = false) {
  if (state.comparisonPending && !state.comparisonSeen) {
    showSelectionNotice('식단안 A와 B의 비교를 먼저 확인해 주세요.');
    return;
  }
  if (!state.menu.length) { $('#predictionNote').textContent = '메뉴를 한 가지 이상 선택해 주세요.'; return; }
  if (state.meal !== '조식' && !state.menu.some((dish) => categoryOf(dish) === '밥류')) {
    $('#warningTitle').textContent = '밥류를 선택해 주세요.';
    $('#warningText').textContent = '밥류 한 종류는 필수입니다. 밥류를 선택해야 잔반량을 예측할 수 있습니다.';
    $('#forcePredict').hidden = true;
    $('#rangeWarning').hidden = false;
    return;
  }
  if (!state.menu.some((dish) => ['반찬류', '김치·나물류'].includes(categoryOf(dish)))) {
    $('#warningTitle').textContent = '반찬을 선택해 주세요.';
    $('#warningText').textContent = '반찬류 또는 김치·나물류에서 최소 1개를 선택해야 잔반량을 예측할 수 있습니다.';
    $('#forcePredict').hidden = true;
    $('#rangeWarning').hidden = false;
    return;
  }
  if ((state.menu.length < 3 || state.menu.length > 7) && !force) {
    const warning = $('#rangeWarning');
    const isTooFew = state.menu.length < 3;
    $('#warningTitle').textContent = isTooFew ? '메뉴를 더 선택해 주세요.' : '메뉴가 너무 많이 선택되었습니다.';
    $('#warningText').textContent = isTooFew
      ? `현재 ${state.menu.length}개를 선택했습니다. 3개 이상 7개 이하를 권장하며, 지금 예측하면 값이 정확하지 않을 수 있습니다.`
      : `현재 ${state.menu.length}개를 선택했습니다. 3개 이상 7개 이하를 권장하며, 지금 예측하면 값이 정확하지 않을 수 있습니다.`;
    $('#forcePredict').hidden = false;
    warning.hidden = false;
    return;
  }
  $('#rangeWarning').hidden = true;
  $('#predictButton').disabled = true; $('#predictButton span').textContent = '산정 중...';
  try {
    const response = await fetch('/api/predict', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ meal:state.meal, dishes:state.menu }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    $('#resultLabel').textContent = `${state.meal} 예상 잔반량`;
    state.basePrediction = result.prediction;
    state.lastResult = result;
    state.predictionSignature = currentMenuSignature();
    $('#saveScenarioBButton').disabled = !state.scenarioA;
    updateAdjustedPrediction();
  } catch (error) { $('#predictionNote').textContent = '예측 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'; }
  $('#predictButton').disabled = false; $('#predictButton span').textContent = '예상 잔반량 확인';
}

async function loadReports() {
  try {
    const response = await fetch('/api/overview'); const data = await response.json();
    if ($('#dataRows')) $('#dataRows').textContent = data.rows;
    if ($('#trainedRows')) $('#trainedRows').textContent = `${data.trained_rows}건`;
    if ($('#maeValue')) $('#maeValue').textContent = Number.isFinite(data.mae) ? data.mae.toFixed(2) : '--';
    if ($('#featureCount')) $('#featureCount').textContent = data.menu_features ? `끼니 + ${data.menu_features}개 메뉴` : '끼니 기준 기본 모델';
    $('#mealBars').innerHTML = data.meals.map((meal) => `<div class="meal-average-item"><strong class="meal-average-value">${meal.average.toFixed(2)}<small>kg</small></strong><span class="meal-average-label">${meal.meal}</span></div>`).join('');
  } catch (error) { $('#mealBars').innerHTML = '<span class="bar-loading">리포트를 불러오지 못했습니다.</span>'; }
}

function localizeInterface() {
  document.title = '학교급식 잔반 예측';
  $('.eyebrow').textContent = '영양교사 업무 지원';
  $('.api-state').textContent = '메뉴 불러오는 중';
  $('.report-period').textContent = '2023–2025 실제 환산 무게';
  $('.chart-head span:first-child').textContent = '끼니별 평균 잔반 무게';
  $$('.section-kicker').forEach((label, index) => {
    label.textContent = ['식단 편성', '잔반 산정', '운영 통계', '예측 참고'][index] || '';
  });
  $('#menuSearch').placeholder = '메뉴명 또는 초성을 입력하세요';
  $('.live-pill').textContent = '기준 결과';
  $('#saveScenarioButton').textContent = '식단안 A 저장';
  $('#saveScenarioBButton').textContent = '식단안 B 저장';
  $('meta[name="description"]').content = '학교급식 메뉴 구성과 잔반량 예측을 지원합니다.';
}

function installDashboardExtras() {
  $('.contributor-block')?.remove();
  $('.target-block').innerHTML = '<div class="target-head"><span>해당 끼니 평균 잔반량</span><strong id="mealAverageValue">-- kg</strong></div><div class="target-gauge average-gauge"><i id="targetGauge"></i><b id="targetMarker" class="target-marker"></b></div><div class="target-foot"><span id="currentTargetText">예측 전</span><span class="target-legend"><i class="average-legend-line"></i>끼니 평균 <i class="prediction-legend-dot"></i>이번 식단</span></div>';
  const compareButton = document.createElement('button');
  compareButton.id = 'compareAnalysisButton';
  compareButton.type = 'button';
  compareButton.textContent = '비교 분석 열기';
  compareButton.disabled = true;
  $('.compare-actions').append(compareButton);
  const compareStep = document.createElement('div');
  compareStep.className = 'workflow-step workflow-step-compare';
  compareStep.innerHTML = '<span class="workflow-step-number">4</span><div><strong>잔반량 비교해보기</strong><span>식단안 A와 B를 저장해 예상량을 비교한 뒤 다음 예측을 진행합니다.</span></div>';
  $('.compare-actions').before(compareStep);

  const comparePanel = $('#comparePanel');
  comparePanel.querySelectorAll('.impact-toolbar, .impact-grid, .impact-note').forEach((element) => element.remove());
  comparePanel.querySelector('.compare-tabs')?.remove();
  const dialog = document.createElement('div');
  dialog.className = 'compare-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'compareDialogTitle');
  dialog.innerHTML = '<div class="compare-dialog-head"><h2 id="compareDialogTitle">식단안 비교</h2><button class="compare-close" id="closeCompare" type="button" aria-label="닫기">×</button></div>';
  while (comparePanel.firstChild) dialog.append(comparePanel.firstChild);
  const cards = dialog.querySelectorAll('.compare-card');
  cards.forEach((card, index) => {
    const prefix = index === 0 ? 'scenarioA' : 'scenarioB';
    const metrics = document.createElement('div');
    metrics.className = 'compare-carbon-metrics';
    metrics.innerHTML = `<div><span>CO₂e 배출 환산</span><strong id="${prefix}Carbon">-- kg CO₂e</strong></div><div><span>30년생 나무 1그루 정화 기간</span><strong id="${prefix}TreeDays">--일</strong></div>`;
    card.append(metrics);
  });
  const note = document.createElement('p');
  note.className = 'compare-carbon-note';
  note.textContent = '환산 참고값: 잔반 1kg당 약 0.158kg CO₂e입니다. 30년생 나무 1그루가 연간 약 6.6kg CO₂e를 흡수한다고 가정해 정화 일수를 환산했습니다.';
  dialog.querySelector('.compare-cards').after(note);
  comparePanel.append(dialog);
  document.body.append(comparePanel);
}

function installIntroSnapScroll() {
  const intro = $('.intro-cover');
  const destination = $('#top');
  if (!intro || !destination) return;
  const scroller = document.scrollingElement || document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const threshold = 180;
  const previewMax = 24;
  let accumulated = 0;
  let gestureDirection = '';
  let gestureAnchor = 0;
  let resetTimer = null;
  let snapTimer = null;
  let snapInProgress = false;

  const introEnd = () => destination.getBoundingClientRect().top + scroller.scrollTop;
  const returnToAnchor = () => {
    window.clearTimeout(resetTimer);
    accumulated = 0;
    gestureDirection = '';
    window.scrollTo({ top: gestureAnchor, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
  };

  const snapTo = (direction) => {
    if (snapInProgress) return;
    window.clearTimeout(resetTimer);
    window.clearTimeout(snapTimer);
    accumulated = 0;
    gestureDirection = '';
    snapInProgress = true;
    const target = direction === 'down' ? destination : intro;
    target.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
    snapTimer = window.setTimeout(() => { snapInProgress = false; }, 1000);
  };

  const collectInput = (direction, amount) => {
    const boundary = introEnd();
    const position = scroller.scrollTop;
    const inGestureZone = direction === 'down'
      ? position < boundary - 1
      : position > boundary - 1 && position <= boundary + threshold + previewMax;
    if (amount <= 0 || !inGestureZone) return false;
    if (gestureDirection && gestureDirection !== direction) {
      returnToAnchor();
      return true;
    }
    if (!gestureDirection) {
      gestureDirection = direction;
      gestureAnchor = position;
    }
    accumulated += amount;
    if (accumulated >= threshold) {
      snapTo(direction);
      return true;
    }
    const preview = Math.min(previewMax, accumulated * .12);
    scroller.scrollTop = direction === 'down'
      ? Math.min(boundary - 1, gestureAnchor + preview)
      : Math.max(boundary, gestureAnchor - preview);
    window.clearTimeout(resetTimer);
    resetTimer = window.setTimeout(returnToAnchor, 260);
    return true;
  };

  window.addEventListener('wheel', (event) => {
    if (event.defaultPrevented) return;
    if (event.ctrlKey) return;
    if (snapInProgress) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
    const deltaY = event.deltaY * unit;
    const direction = deltaY > 0 ? 'down' : 'up';
    if (collectInput(direction, Math.abs(deltaY)) && event.cancelable) event.preventDefault();
  }, { passive: false });

  let previousTouchY = null;
  window.addEventListener('touchstart', (event) => {
    previousTouchY = event.touches.length === 1 ? event.touches[0].clientY : null;
  }, { passive: true });
  window.addEventListener('touchmove', (event) => {
    if (event.defaultPrevented) return;
    if (previousTouchY == null || event.touches.length !== 1) return;
    const currentTouchY = event.touches[0].clientY;
    const deltaY = previousTouchY - currentTouchY;
    previousTouchY = currentTouchY;
    if (snapInProgress) return;
    const direction = deltaY > 0 ? 'down' : 'up';
    if (collectInput(direction, Math.abs(deltaY)) && event.cancelable) event.preventDefault();
  }, { passive: false });
  window.addEventListener('touchend', () => {
    previousTouchY = null;
    if (accumulated > 0 && accumulated < threshold) returnToAnchor();
  }, { passive: true });
}

function installBottomSnapScroll() {
  const main = $('#top');
  const blankPage = $('.bottom-reserved-space');
  if (!main || !blankPage) return;
  const scroller = document.scrollingElement || document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const threshold = 100;
  const previewMax = 24;
  let pending = null;
  let resetTimer = null;
  let snapTimer = null;
  let snapping = false;
  let ignoreMomentumUntil = 0;

  const bounds = () => {
    const mainTop = main.getBoundingClientRect().top + scroller.scrollTop;
    const blankTop = blankPage.getBoundingClientRect().top + scroller.scrollTop;
    return { mainTop, blankTop, triggerTop: Math.max(mainTop, blankTop - window.innerHeight - threshold) };
  };

  const returnToAnchor = () => {
    window.clearTimeout(resetTimer);
    if (!pending) return;
    const anchor = pending.anchor;
    pending = null;
    window.scrollTo({ top: anchor, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
  };

  const snapTo = (target) => {
    window.clearTimeout(resetTimer);
    window.clearTimeout(snapTimer);
    pending = null;
    snapping = true;
    window.scrollTo({ top: target, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    snapTimer = window.setTimeout(() => { snapping = false; }, 1000);
  };

  const collectInput = (direction, amount) => {
    if (amount <= 0) return false;
    if (pending && pending.direction !== direction) {
      returnToAnchor();
      return true;
    }
    const position = scroller.scrollTop;
    const { mainTop, blankTop, triggerTop } = bounds();
    if (!pending) {
      const nextPosition = position + (direction === 'down' ? amount : -amount);
      const lastMainView = Math.max(mainTop, blankTop - window.innerHeight);
      const target = direction === 'down'
        ? position < blankTop - 1 && (position >= triggerTop || nextPosition >= triggerTop) ? blankTop : null
        : position >= lastMainView - 1 ? lastMainView : null;
      if (target == null) return false;
      pending = { direction, anchor: position, target, amount: 0 };
    }
    pending.amount += amount;
    if (pending.amount >= threshold) {
      snapTo(pending.target);
      return true;
    }
    const preview = Math.min(previewMax, pending.amount * .12);
    scroller.scrollTop = direction === 'down'
      ? Math.min(pending.target - 1, pending.anchor + preview)
      : Math.max(pending.target + 1, pending.anchor - preview);
    window.clearTimeout(resetTimer);
    resetTimer = window.setTimeout(returnToAnchor, 300);
    return true;
  };

  window.addEventListener('wheel', (event) => {
    if (event.defaultPrevented) return;
    if (event.ctrlKey) return;
    if (snapping) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
    const delta = event.deltaY * unit;
    if (collectInput(delta > 0 ? 'down' : 'up', Math.abs(delta)) && event.cancelable) event.preventDefault();
  }, { passive: false });

  let previousTouchY = null;
  window.addEventListener('touchstart', (event) => {
    previousTouchY = event.touches.length === 1 ? event.touches[0].clientY : null;
  }, { passive: true });
  window.addEventListener('touchmove', (event) => {
    if (event.defaultPrevented) return;
    if (previousTouchY == null || event.touches.length !== 1) return;
    const current = event.touches[0].clientY;
    const delta = previousTouchY - current;
    previousTouchY = current;
    if (snapping) return;
    if (collectInput(delta > 0 ? 'down' : 'up', Math.abs(delta)) && event.cancelable) event.preventDefault();
  }, { passive: false });
  window.addEventListener('touchend', () => {
    previousTouchY = null;
    if (pending && pending.amount < threshold) returnToAnchor();
  }, { passive: true });
}

function installSectionSnapScroll() {
  const intro = $('.intro-cover');
  const main = $('#top');
  const bottomSpace = $('.bottom-reserved-space');
  if (!intro || !main || !bottomSpace) return;
  const scroller = document.scrollingElement || document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const introThreshold = 90;
  const bottomThreshold = 90;
  const previewMax = 12;
  let pending = null;
  let resetTimer = null;
  let snapTimer = null;
  let snapping = false;

  const bounds = () => ({
    mainTop: main.getBoundingClientRect().top + scroller.scrollTop,
    bottomTop: bottomSpace.getBoundingClientRect().top + scroller.scrollTop,
  });

  const returnToAnchor = () => {
    window.clearTimeout(resetTimer);
    if (!pending) return;
    const anchor = pending.anchor;
    pending = null;
    window.scrollTo({ top: anchor, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
  };

  const getTransition = (direction, position, amount) => {
    const { mainTop, bottomTop } = bounds();
    if (direction === 'down') {
      if (position < mainTop - 1) return { target: mainTop, threshold: introThreshold };
      const bottomTrigger = Math.max(mainTop, bottomTop - window.innerHeight - bottomThreshold);
      if (position < bottomTop - 1 && position + amount >= bottomTrigger) {
        return { target: bottomTop, threshold: bottomThreshold };
      }
    } else {
      const previousPage = Math.max(mainTop, bottomTop - window.innerHeight);
      if (position > previousPage + 1) {
        return { target: previousPage, threshold: bottomThreshold };
      }
      if (position >= mainTop - 1 && position - amount <= mainTop + 1) {
        return { target: 0, threshold: introThreshold };
      }
    }
    return null;
  };

  const finishSnap = () => {
    if (!snapping) return;
    snapping = false;
    window.clearTimeout(snapTimer);
  };

  const snapTo = (target) => {
    window.clearTimeout(resetTimer);
    pending = null;
    snapping = true;
    window.scrollTo({ top: target, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    snapTimer = window.setTimeout(finishSnap, reduceMotion.matches ? 60 : 650);
  };

  const collectInput = (direction, amount) => {
    if (amount <= 0) return false;
    if (pending && pending.direction !== direction) {
      returnToAnchor();
      return true;
    }
    const position = scroller.scrollTop;
    if (!pending) {
      const transition = getTransition(direction, position, amount);
      if (!transition) return false;
      pending = { direction, anchor: position, target: transition.target, threshold: transition.threshold, amount: 0 };
    }
    pending.amount += amount;
    if (pending.amount >= pending.threshold) {
      snapTo(pending.target);
      return true;
    }
    const preview = Math.min(previewMax, pending.amount * .12);
    scroller.scrollTop = direction === 'down'
      ? Math.min(pending.target - 1, pending.anchor + preview)
      : Math.max(pending.target + 1, pending.anchor - preview);
    window.clearTimeout(resetTimer);
    resetTimer = window.setTimeout(returnToAnchor, 300);
    return true;
  };

  const handleWheel = (event) => {
    if (event.ctrlKey || event.defaultPrevented) return;
    if (snapping) {
      if (event.cancelable) event.preventDefault();
      return;
    }
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
    const delta = event.deltaY * unit;
    if (collectInput(delta > 0 ? 'down' : 'up', Math.abs(delta)) && event.cancelable) event.preventDefault();
  };

  window.addEventListener('wheel', handleWheel, { passive: false });
  window.addEventListener('scrollend', finishSnap, { passive: true });
  let previousTouchY = null;
  window.addEventListener('touchstart', (event) => {
    previousTouchY = event.touches.length === 1 ? event.touches[0].clientY : null;
  }, { passive: true });
  window.addEventListener('touchmove', (event) => {
    if (previousTouchY == null || event.touches.length !== 1) return;
    const current = event.touches[0].clientY;
    const delta = previousTouchY - current;
    previousTouchY = current;
    if (snapping) {
      if (event.cancelable) event.preventDefault();
      return;
    }
    if (collectInput(delta > 0 ? 'down' : 'up', Math.abs(delta)) && event.cancelable) event.preventDefault();
  }, { passive: false });
  window.addEventListener('touchend', () => {
    previousTouchY = null;
    if (pending && pending.amount < pending.threshold) returnToAnchor();
  }, { passive: true });
  window.addEventListener('touchcancel', () => { previousTouchY = null; }, { passive: true });
}

installDashboardExtras();
installSectionSnapScroll();
localizeInterface();
$$('.meal-button').forEach((button) => button.addEventListener('click', () => { state.meal = button.dataset.meal; $$('.meal-button').forEach((item) => item.classList.toggle('active', item === button)); renderChosen(); }));
$('#clearMenu').addEventListener('click', clearSelectedMenu);
$('#clearChosenButton').addEventListener('click', clearSelectedMenu);
$('#menuSearch').addEventListener('input', (event) => { state.search = event.target.value; renderCatalog(); });
$('#clearSearch').addEventListener('click', () => { state.search = ''; $('#menuSearch').value = ''; renderCatalog(); $('#menuSearch').focus(); });
$('#predictButton').addEventListener('click', () => predict(false));
$('#forcePredict').addEventListener('click', () => predict(true));
$('#compareAnalysisButton').addEventListener('click', () => { if (state.scenarioA && state.scenarioB) $('#comparePanel').hidden = false; });
$('#saveScenarioButton').addEventListener('click', () => { if (!hasCurrentPrediction()) return; state.scenarioA = { prediction: state.lastPrediction, menu: [...state.menu], meal: state.meal }; state.scenarioB = null; state.comparisonPending = false; state.comparisonSeen = false; updateScenarioPanel(); clearSelectedMenu(); showSelectionNotice('식단안 A를 저장했습니다. 다른 식단을 구성해 B안으로 저장하세요.'); });
$('#saveScenarioBButton').addEventListener('click', saveScenarioB);
$('#closeCompare').addEventListener('click', closeScenarioComparison);
$('#comparePanel').addEventListener('click', (event) => { if (event.target.id === 'comparePanel') closeScenarioComparison(); });
updateTargetVisual(null);
loadCatalog(); loadReports();
