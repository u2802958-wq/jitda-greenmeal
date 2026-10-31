const state = { meal: '중식', menu: [], categories: {}, groups: {}, activeCategory: '밥류', search: '', lastPrediction: null, scenarioA: null, scenarioB: null, alternative: null };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[char]);
}

function renderCatalog() {
  const categories = Object.keys(state.categories);
  if (!categories.includes(state.activeCategory)) state.activeCategory = categories[0];
  const searching = state.search.trim().length > 0;
  $('#categoryTabs').innerHTML = categories.map((category) => `<button type="button" class="category-tab ${!searching && category === state.activeCategory ? 'active' : ''}" data-category="${escapeHtml(category)}">${escapeHtml(category)} <span>${state.categories[category].length}</span></button>`).join('');
  let groups = state.groups[state.activeCategory] || [];
  if (searching) {
    const query = state.search.trim().toLowerCase();
    groups = categories.flatMap((category) => (state.groups[category] || []).map((group) => {
      const matchesFamily = group.label.toLowerCase().includes(query);
      const items = matchesFamily ? group.items : group.items.filter((dish) => dish.toLowerCase().includes(query));
      return items.length ? { ...group, items, category } : null;
    }).filter(Boolean));
  }
  $('#menuList').innerHTML = groups.map((group, index) => {
    if (group.items.length === 1) return `<button type="button" class="menu-chip ${state.menu.includes(group.items[0]) ? 'selected' : ''}" data-dish="${escapeHtml(group.items[0])}">${escapeHtml(group.items[0])}</button>`;
    return `<div class="family-group"><button type="button" class="family-toggle" data-group="${index}"><span>${escapeHtml(group.label)}${searching && group.category ? `<i>${escapeHtml(group.category)}</i>` : ''}</span><small>${group.items.length}개 파생형 <b>⌄</b></small></button><div class="variant-list" data-variants="${index}" hidden>${group.items.map((dish) => `<button type="button" class="menu-chip ${state.menu.includes(dish) ? 'selected' : ''}" data-dish="${escapeHtml(dish)}">${escapeHtml(dish)}</button>`).join('')}</div></div>`;
  }).join('');
  if (!groups.length) $('#menuList').innerHTML = '<span class="loading-line">검색 결과가 없습니다. 다른 메뉴 이름을 입력해 보세요.</span>';
  $$('.category-tab').forEach((button) => button.addEventListener('click', () => { state.activeCategory = button.dataset.category; renderCatalog(); }));
  $$('.family-toggle').forEach((button) => button.addEventListener('click', () => {
    const variants = document.querySelector(`[data-variants="${button.dataset.group}"]`);
    variants.hidden = !variants.hidden;
    button.classList.toggle('open', !variants.hidden);
  }));
  $$('.menu-chip').forEach((button) => button.addEventListener('click', () => toggleDish(button.dataset.dish)));
}

function renderChosen() {
  $('#chosenCount').textContent = state.menu.length;
  $('#chosenList').innerHTML = state.menu.length ? state.menu.map((dish) => `<span class="chosen-pill">${escapeHtml(dish)} <button type="button" aria-label="${escapeHtml(dish)} 제거" data-remove="${escapeHtml(dish)}">×</button></span>`).join('') : '<span class="empty-state">카테고리에서 메뉴를 골라 식단을 구성해 주세요.</span>';
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
}

function renderContributors(contributors) {
  $('#contributors').innerHTML = contributors.map((item) => `<div class="contributor-row"><span class="signal ${item.level}" aria-label="${item.level}"></span><strong>${escapeHtml(item.menu)}</strong><div class="contributor-bar"><i style="width:${Math.max(4, item.importance)}%"></i></div><small>${item.importance.toFixed(1)}%</small>${item.alternative_available ? `<button class="contributor-action" type="button" data-alternative="${escapeHtml(item.menu)}">대체</button>` : '<span class="contributor-no-alternative">대체 없음</span>'}</div>`).join('');
  $$('.contributor-action').forEach((button) => button.addEventListener('click', () => openAlternative(button.dataset.alternative)));
}

async function openAlternative(dish) {
  const modal = $('#alternativeModal');
  $('#alternativeCurrent').textContent = dish;
  $('#alternativeName').textContent = '계산 중...';
  $('#alternativeCurrentValue').textContent = `${state.lastPrediction?.toFixed(2) || '--'} kg`;
  $('#alternativeValue').textContent = '-- kg';
  modal.hidden = false;
  try {
    const response = await fetch('/api/alternative', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ meal:state.meal, dishes:state.menu, target:dish }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    state.alternative = result;
    $('#alternativeName').textContent = result.alternative;
    $('#alternativeCurrentValue').textContent = `${result.current_prediction.toFixed(2)} kg`;
    $('#alternativeValue').textContent = `${result.alternative_prediction.toFixed(2)} kg`;
    $('#alternativeText').textContent = result.reduction > 0 ? `${result.alternative}로 변경하면 예상 잔반량이 ${result.reduction.toFixed(2)}kg 줄어듭니다.` : '현재 모델에서는 예상 잔반량이 크게 줄지 않는 대안입니다.';
  } catch (error) {
    $('#alternativeName').textContent = '대안 없음';
    $('#alternativeText').textContent = error.message || '같은 카테고리에서 비교할 메뉴가 없습니다.';
  }
}

function updateScenarioPanel() {
  if (!state.scenarioA) return;
  $('#comparePanel').hidden = false;
  $('#saveScenarioBButton').disabled = !state.menu.length || state.lastPrediction == null;
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
  state.lastPrediction = null;
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
  state.lastPrediction = null;
  $('#saveScenarioBButton').disabled = true;
  renderChosen();
}

function clearSelectedMenu() {
  state.menu = [];
  state.lastPrediction = null;
  $('#saveScenarioBButton').disabled = true;
  renderCatalog();
  renderChosen();
}

async function loadCatalog() {
  $('#apiState').textContent = '전체 메뉴 카탈로그 불러오는 중';
  try {
    const response = await fetch('/api/catalog');
    const data = await response.json();
    state.categories = data.categories || {};
    state.groups = data.groups || {};
    $('#apiState').textContent = `${data.total}개 메뉴 · 날짜 제한 없음`;
    renderCatalog(); renderChosen();
  } catch (error) {
    $('#apiState').textContent = '메뉴 카탈로그 연결 지연';
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
  $('#predictButton').disabled = true; $('#predictButton span').textContent = '계산 중...';
  try {
    const response = await fetch('/api/predict', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ meal:state.meal, dishes:state.menu }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    $('#resultLabel').textContent = `${state.meal} 예상 잔반량`;
    $('#predictionValue').innerHTML = `${result.prediction.toFixed(2)}<small> kg</small>`;
    $('#predictionNote').textContent = result.note;
    $('#averageDelta').textContent = `${result.delta >= 0 ? '+' : ''}${result.delta.toFixed(2)} kg`;
    state.lastPrediction = result.prediction;
    $('#saveScenarioBButton').disabled = !state.scenarioA;
    updateTargetVisual(result.prediction);
    renderContributors(result.contributors || []);
  } catch (error) { $('#predictionNote').textContent = '예측 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'; }
  $('#predictButton').disabled = false; $('#predictButton span').textContent = '잔반량 예측하기';
}

async function loadReports() {
  try {
    const response = await fetch('/api/overview'); const data = await response.json();
    $('#dataRows').textContent = data.rows; $('#trainedRows').textContent = `${data.trained_rows}건`; $('#maeValue').textContent = data.mae.toFixed(2); $('#featureCount').textContent = data.menu_features ? `끼니 + ${data.menu_features}개 메뉴` : '끼니 기준 기본 모델';
    $('#mealBars').innerHTML = data.meals.map((meal) => `<div class="bar-group"><span class="bar-value">${meal.average.toFixed(1)}</span><div class="bar" style="--height:${Math.max(25, meal.average / data.max_average * 100)}%"></div><span class="bar-label">${meal.meal}</span></div>`).join('');
  } catch (error) { $('#mealBars').innerHTML = '<span class="bar-loading">리포트를 불러오지 못했습니다.</span>'; }
}

async function pollModelStatus() {
  try { const response = await fetch('/api/training-status'); const data = await response.json(); $('#modelStatus').textContent = data.ready ? 'Random Forest 준비됨' : '식단 데이터 동기화 중'; if (!data.ready) setTimeout(pollModelStatus, 5000); }
  catch (error) { $('#modelStatus').textContent = '기본 모델 사용 중'; }
}

$$('.meal-button').forEach((button) => button.addEventListener('click', () => { state.meal = button.dataset.meal; $$('.meal-button').forEach((item) => item.classList.toggle('active', item === button)); $('#resultLabel').textContent = `${state.meal} 예상 잔반량`; }));
$('#clearMenu').addEventListener('click', clearSelectedMenu);
$('#clearChosenButton').addEventListener('click', clearSelectedMenu);
$('#menuSearch').addEventListener('input', (event) => { state.search = event.target.value; renderCatalog(); });
$('#clearSearch').addEventListener('click', () => { state.search = ''; $('#menuSearch').value = ''; renderCatalog(); $('#menuSearch').focus(); });
$('#predictButton').addEventListener('click', () => predict(false));
$('#forcePredict').addEventListener('click', () => predict(true));
$('#targetWaste').addEventListener('input', () => updateTargetVisual(state.lastPrediction));
$('#saveScenarioButton').addEventListener('click', () => { if (state.lastPrediction == null) return; state.scenarioA = { prediction: state.lastPrediction, menu: [...state.menu], meal: state.meal }; updateScenarioPanel(); clearSelectedMenu(); });
$('#saveScenarioBButton').addEventListener('click', saveScenarioB);
$('#impactPeriod').addEventListener('change', updateImpact);
$$('.compare-tab').forEach((tab) => tab.addEventListener('click', () => { $$('.compare-tab').forEach((item) => item.classList.toggle('active', item === tab)); loadScenario(tab.dataset.scenario === 'a' ? state.scenarioA : state.scenarioB); }));
$('#closeAlternative').addEventListener('click', () => { $('#alternativeModal').hidden = true; });
$('#alternativeModal').addEventListener('click', (event) => { if (event.target.id === 'alternativeModal') $('#alternativeModal').hidden = true; });
$('#applyAlternative').addEventListener('click', () => { if (!state.alternative) return; state.menu = state.menu.map((dish) => dish === state.alternative.target ? state.alternative.alternative : dish); $('#alternativeModal').hidden = true; renderChosen(); predict(false); });
updateTargetVisual(null);
$('#refreshButton').addEventListener('click', loadCatalog);
loadCatalog(); loadReports(); pollModelStatus();
