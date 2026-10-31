const FAVORITES_KEY = 'greenmeal-favorite-menus';
function readFavorites() {
  try {
    const favorites = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
    return Array.isArray(favorites) ? favorites.filter((dish) => typeof dish === 'string') : [];
  } catch (error) {
    return [];
  }
}

const state = { meal: '중식', menu: [], categories: {}, groups: {}, popular: {}, favorites: new Set(readFavorites()), activeCategory: '밥류', search: '', basePrediction: null, lastResult: null, lastPrediction: null, scenarioA: null, scenarioB: null, autoPredictTimer: null };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

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
  $('#predictButton').disabled = state.menu.length === 0;
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
  const target = Math.max(1, Number($('#targetWaste').value) || 12);
  const ratio = prediction == null ? 0 : prediction / target * 100;
  const cappedRatio = Math.min(100, Math.max(0, ratio));
  $('#targetGauge').style.width = `${cappedRatio}%`;
  $('#targetMarker').style.left = `${Math.min(100, 100)}%`;
  const overTarget = prediction != null && prediction > target;
  document.querySelector('.result-panel').classList.toggle('over-target', overTarget);
  $('#currentTargetText').textContent = prediction == null ? '예측 전' : `${prediction.toFixed(2)}kg · ${overTarget ? '목표 초과' : '목표 이내'}`;
  const riskBadge = $('#riskBadge');
  riskBadge.classList.remove('risk-pending', 'risk-safe', 'risk-caution', 'risk-danger');
  if (prediction == null) {
    riskBadge.classList.add('risk-pending');
    riskBadge.innerHTML = '<i></i> 식단 입력 대기';
    $('#riskDescription').textContent = '식단을 구성하면 위험도를 분석합니다.';
    $('#riskAmount').textContent = `목표 ${target}kg`;
    return;
  }
  const level = prediction <= target * .8 ? 'safe' : prediction <= target ? 'caution' : 'danger';
  const labels = { safe: '안심', caution: '주의', danger: '경고' };
  riskBadge.classList.add(`risk-${level}`);
  riskBadge.innerHTML = `<i></i> ${labels[level]}`;
  $('#riskDescription').textContent = level === 'safe' ? '목표보다 여유 있는 예측입니다.' : level === 'caution' ? '목표에 가까워 메뉴를 점검해 보세요.' : '목표를 넘을 수 있어 식단 조정을 권장합니다.';
  $('#riskAmount').textContent = `목표 ${target}kg`;
}

function updateKpis(prediction) {
  if (prediction == null || !state.lastResult) {
    $('#kpiWasteValue').innerHTML = '--<small>kg</small>';
    $('#kpiWasteDelta').textContent = '끼니 평균 대비 대기';
    $('#kpiWasteDelta').classList.remove('delta-positive', 'delta-negative');
    $('#carbonTrees').innerHTML = '--<small>그루</small>';
    $('#carbonCo2').textContent = 'CO₂ --kg';
    return;
  }
  const average = state.lastResult.prediction - state.lastResult.delta;
  const delta = prediction - average;
  const savedWaste = Math.max(0, -delta);
  const co2 = savedWaste * 2.5;
  const trees = co2 / 6.6;
  $('#kpiWasteValue').innerHTML = `${prediction.toFixed(1)}<small>kg</small>`;
  $('#kpiWasteDelta').textContent = delta < -.05
    ? `▼ ${Math.abs(delta).toFixed(1)}kg 감소`
    : delta > .05 ? `▲ ${delta.toFixed(1)}kg 증가` : '끼니 평균과 비슷';
  $('#kpiWasteDelta').classList.toggle('delta-positive', delta > 0);
  $('#kpiWasteDelta').classList.toggle('delta-negative', delta < 0);
  $('#carbonTrees').innerHTML = `${trees.toFixed(1)}<small>그루</small>`;
  $('#carbonCo2').textContent = `CO₂ ${co2.toFixed(1)}kg 절감 추정`;
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
  updateKpis(prediction);
}

function clearPredictionDisplay() {
  state.basePrediction = null;
  state.lastResult = null;
  state.lastPrediction = null;
  $('#predictionValue').innerHTML = '--<small> kg</small>';
  $('#averageDelta').textContent = '--';
  $('#predictionNote').textContent = '식단을 구성하면 예상 잔반량을 확인할 수 있습니다.';
  updateTargetVisual(null);
  updateKpis(null);
}

function menuIsPredictable() {
  return state.menu.length > 0
    && (state.meal === '조식' || state.menu.some((dish) => categoryOf(dish) === '밥류'))
    && state.menu.some((dish) => ['반찬류', '김치·나물류'].includes(categoryOf(dish)));
}

function scheduleAutoPrediction() {
  window.clearTimeout(state.autoPredictTimer);
  state.autoPredictTimer = window.setTimeout(() => {
    if (menuIsPredictable()) predict(true);
  }, 220);
}

function loadPopularTemplate() {
  const pick = (category) => state.popular[category]?.[0] || state.categories[category]?.[0];
  const sideCategory = state.popular['반찬류']?.length ? '반찬류' : '김치·나물류';
  state.menu = [...new Set([
    pick('밥류'),
    pick('국·찌개류'),
    pick('고기·메인류'),
    pick(sideCategory),
  ].filter(Boolean))];
  state.lastPrediction = null;
  renderCatalog();
  renderChosen();
  clearPredictionDisplay();
  scheduleAutoPrediction();
}

function updateScenarioPanel() {
  if (!state.scenarioA) return;
  $('#saveScenarioBButton').disabled = !state.menu.length || state.lastPrediction == null;
  $('#compareAnalysisButton').disabled = !state.scenarioB;
  $('#scenarioAPrediction').textContent = `${state.scenarioA.prediction.toFixed(2)} kg`;
  $('#scenarioAMenu').textContent = state.scenarioA.menu.join(' · ');
  if (state.scenarioB) {
    $('#scenarioBPrediction').textContent = `${state.scenarioB.prediction.toFixed(2)} kg`;
    $('#scenarioBMenu').textContent = state.scenarioB.menu.join(' · ');
    updateImpact();
  }
}

async function saveScenarioB() {
  if (state.lastPrediction == null || !state.menu.length) return;
  state.scenarioB = { prediction: state.lastPrediction, menu: [...state.menu], meal: state.meal };
  updateScenarioPanel();
  clearSelectedMenu();
}

function updateImpact() {
  if (!state.scenarioA || !state.scenarioB) return;
  const days = Number($('#impactPeriod').value);
  const dailyReduction = state.scenarioA.prediction - state.scenarioB.prediction;
  const wasteReduction = dailyReduction * days;
  const carbonReduction = wasteReduction * 2.5;
  $('#impactWaste').textContent = `${wasteReduction >= 0 ? '+' : ''}${wasteReduction.toFixed(1)}`;
  $('#impactCarbon').textContent = `${carbonReduction >= 0 ? '+' : ''}${carbonReduction.toFixed(1)}`;
  $('#impactNote').textContent = dailyReduction >= 0
    ? `B 식단을 ${days}일 적용한다고 가정한 모델 추정치입니다. 하루 ${dailyReduction.toFixed(2)}kg 감소가 누적됩니다.`
    : `B 식단은 A보다 하루 ${Math.abs(dailyReduction).toFixed(2)}kg 많게 예측됩니다. 다른 조합을 비교해 보세요.`;
}

async function compareScenarioB() {
  if (!state.scenarioA || !state.menu.length) return;
  const response = await fetch('/api/predict', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ meal:state.meal, dishes:state.menu }) });
  const result = await response.json();
  if (!response.ok) { $('#predictionNote').textContent = result.error; return; }
  state.lastPrediction = result.prediction;
  state.scenarioB = { prediction: result.prediction, menu: [...state.menu], meal: state.meal };
  updateScenarioPanel();
}

function loadScenario(scenario) {
  if (!scenario) return;
  state.meal = scenario.meal || state.meal;
  state.menu = [...scenario.menu];
  clearPredictionDisplay();
  $$('.meal-button').forEach((item) => item.classList.toggle('active', item.dataset.meal === state.meal));
  renderCatalog();
  renderChosen();
  predict(false);
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
  clearPredictionDisplay();
  $('#saveScenarioBButton').disabled = true;
  renderChosen();
  scheduleAutoPrediction();
}

function clearSelectedMenu() {
  state.menu = [];
  clearPredictionDisplay();
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
    state.popular = data.popular || {};
    $('#apiState').textContent = '메뉴 목록 준비됨';
    renderCatalog(); renderChosen();
  } catch (error) {
    $('#apiState').textContent = '메뉴 목록을 불러오지 못했습니다';
    $('#menuList').innerHTML = '<span class="loading-line">메뉴를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.</span>';
  }
}

async function predict(force = false) {
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
    $('#mealBars').innerHTML = data.meals.map((meal) => `<div class="bar-group"><span class="bar-value">${meal.average.toFixed(1)}</span><div class="bar" style="--height:${Math.max(25, meal.average / data.max_average * 100)}%"></div><span class="bar-label">${meal.meal}</span></div>`).join('');
  } catch (error) { $('#mealBars').innerHTML = '<span class="bar-loading">리포트를 불러오지 못했습니다.</span>'; }
}

function localizeInterface() {
  document.title = '학교급식 잔반 관리';
  $('.eyebrow').textContent = '영양교사 업무 지원';
  $('.api-state').textContent = '메뉴 불러오는 중';
  $$('.section-kicker').forEach((label, index) => {
    label.textContent = ['식단 편성', '잔반 산정', '운영 통계', '예측 참고'][index] || '';
  });
  $('#menuSearch').placeholder = '메뉴명 또는 초성을 입력하세요';
  $('.live-pill').textContent = '기준 결과';
  $('.stat-number span').innerHTML = 'kg<br />평균 오차';
  $$('.stat-row b')[1].textContent = '랜덤 포레스트';
  $('#saveScenarioButton').textContent = '식단안 A 저장';
  $('#saveScenarioBButton').textContent = '식단안 B 저장';
  $('meta[name="description"]').content = '학교급식 메뉴 구성과 잔반 관리를 지원합니다.';
}

function installDashboardExtras() {
  $('.contributor-block')?.remove();
  const compareButton = document.createElement('button');
  compareButton.id = 'compareAnalysisButton';
  compareButton.type = 'button';
  compareButton.textContent = '비교 분석 열기';
  compareButton.disabled = true;
  $('.compare-actions').append(compareButton);

  const comparePanel = $('#comparePanel');
  const dialog = document.createElement('div');
  dialog.className = 'compare-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'compareDialogTitle');
  dialog.innerHTML = '<div class="compare-dialog-head"><div><span class="compare-eyebrow">식단 시뮬레이션</span><h2 id="compareDialogTitle">식단안 비교 분석</h2></div><button class="compare-close" id="closeCompare" type="button" aria-label="닫기">×</button></div>';
  while (comparePanel.firstChild) dialog.append(comparePanel.firstChild);
  comparePanel.append(dialog);
  document.body.append(comparePanel);
}

installDashboardExtras();
localizeInterface();
$$('.meal-button').forEach((button) => button.addEventListener('click', () => { state.meal = button.dataset.meal; $$('.meal-button').forEach((item) => item.classList.toggle('active', item === button)); $('#resultLabel').textContent = `${state.meal} 예상 잔반량`; clearPredictionDisplay(); scheduleAutoPrediction(); }));
$('#clearMenu').addEventListener('click', clearSelectedMenu);
$('#clearChosenButton').addEventListener('click', clearSelectedMenu);
$('#menuSearch').addEventListener('input', (event) => { state.search = event.target.value; renderCatalog(); });
$('#clearSearch').addEventListener('click', () => { state.search = ''; $('#menuSearch').value = ''; renderCatalog(); $('#menuSearch').focus(); });
$('#predictButton').addEventListener('click', () => predict(false));
$('#forcePredict').addEventListener('click', () => predict(true));
$('#targetWaste').addEventListener('input', () => state.lastResult ? updateAdjustedPrediction() : updateTargetVisual(null));
$('#popularTemplateButton').addEventListener('click', loadPopularTemplate);
$('#compareAnalysisButton').addEventListener('click', () => { if (state.scenarioA && state.scenarioB) $('#comparePanel').hidden = false; });
$('#saveScenarioButton').addEventListener('click', () => { if (state.lastPrediction == null) return; state.scenarioA = { prediction: state.lastPrediction, menu: [...state.menu], meal: state.meal }; updateScenarioPanel(); clearSelectedMenu(); });
$('#saveScenarioBButton').addEventListener('click', saveScenarioB);
$('#impactPeriod').addEventListener('change', updateImpact);
$$('.compare-tab').forEach((tab) => tab.addEventListener('click', () => { $$('.compare-tab').forEach((item) => item.classList.toggle('active', item === tab)); loadScenario(tab.dataset.scenario === 'a' ? state.scenarioA : state.scenarioB); }));
$('#closeCompare').addEventListener('click', () => { $('#comparePanel').hidden = true; });
$('#comparePanel').addEventListener('click', (event) => { if (event.target.id === 'comparePanel') $('#comparePanel').hidden = true; });
updateTargetVisual(null); updateKpis(null);
loadCatalog(); loadReports();
