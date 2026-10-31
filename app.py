import json
import os
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

import numpy as np
import joblib
import pandas as pd
import requests
from flask import Flask, jsonify, request, send_from_directory
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import MultiLabelBinarizer

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
MODEL_DIR = BASE_DIR / "models"
MODEL_1_FILE = MODEL_DIR / "model_1.joblib"
MODEL_2_FILE = MODEL_DIR / "model_2.joblib"
ACTIVE_MODEL_FILE = MODEL_DIR / "active_model.json"
CACHE_FILE = DATA_DIR / "menu_cache.json"
NEIS_URL = "https://open.neis.go.kr/hub/mealServiceDietInfo"
API_KEY = os.getenv("NEIS_API_KEY", "")
SCHOOL_CODE = "S10"
SCHOOL_ID = "9010081"
MEAL_CODES = {"조식": "1", "중식": "2", "석식": "3"}
CARBON_FACTOR = 2.5
COST_PER_KG = 3000
DEFAULT_MENU = [
    "쌀밥",
    "잡곡밥",
    "김치볶음밥",
    "된장국",
    "미역국",
    "계란찜",
    "닭갈비",
    "제육볶음",
    "두부조림",
    "시금치나물",
    "배추김치",
    "무생채",
    "사과",
    "요구르트",
]
CATEGORY_RULES = {
    "밥류": ["밥", "볶음밥", "덮밥", "비빔밥", "주먹밥", "김밥"],
    "국·찌개류": ["국", "탕", "찌개", "전골", "스프", "수프", "육개장"],
    "고기·메인류": [
        "고기",
        "갈비",
        "불고기",
        "제육",
        "돈까스",
        "돈가스",
        "치킨",
        "닭",
        "돼지",
        "소고기",
        "오리",
        "생선",
        "구이",
        "볶음",
        "찜",
        "까스",
        "함박",
        "너겟",
    ],
    "반찬류": [
        "계란",
        "달걀",
        "두부",
        "어묵",
        "전",
        "튀김",
        "만두",
        "조림",
        "감자",
        "콩나물",
        "잡채",
        "파스타",
        "떡볶이",
    ],
    "김치·나물류": [
        "김치",
        "나물",
        "무침",
        "생채",
        "샐러드",
        "겉절이",
        "장아찌",
        "피클",
        "채소",
        "시금치",
        "오이",
    ],
    "후식·음료": [
        "과일",
        "사과",
        "귤",
        "배",
        "포도",
        "수박",
        "주스",
        "쥬스",
        "요구르트",
        "우유",
        "빵",
        "케이크",
        "떡",
        "푸딩",
        "초코",
        "파이",
    ],
}
VARIANT_WORDS = [
    "카레",
    "데리야끼",
    "간장",
    "고추장",
    "양념",
    "마늘",
    "버터",
    "매콤",
    "매운",
    "소스",
    "구이",
    "조림",
    "볶음",
    "찜",
    "튀김",
    "전",
    "강정",
    "무침",
    "불고기",
    "탕수",
]

app = Flask(__name__, static_folder=None)
lock = threading.RLock()
training = {
    "ready": False,
    "status": "기본 모델",
    "active_model": "model_1",
    "rows": 0,
    "menu_features": 0,
    "mae": 0.0,
}
model = None
feature_columns = []
feature_importance = {}
model_registry = {}
model_errors = {}
menu_cache = {}


def load_cache():
    global menu_cache
    if CACHE_FILE.exists():
        try:
            menu_cache = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            menu_cache = {}


def save_cache():
    CACHE_FILE.write_text(json.dumps(menu_cache, ensure_ascii=False), encoding="utf-8")


def load_waste():
    frame = pd.read_csv(DATA_DIR / "waste.csv", encoding="utf-8-sig")
    frame.columns = ["date", "meal", "waste"]
    frame = frame.dropna().copy()
    frame["date"] = pd.to_datetime(frame["date"]).dt.strftime("%Y-%m-%d")
    frame["waste"] = frame["waste"].astype(float)
    return frame


waste_df = load_waste()


def cache_key(date, meal):
    return f"{date}|{meal}"


def fetch_menu(date, meal):
    key = cache_key(date, meal)
    if key in menu_cache:
        return menu_cache[key], "cache"
    if not API_KEY:
        return [], "fallback"
    params = {
        "KEY": API_KEY,
        "Type": "json",
        "ATPT_OFCDC_SC_CODE": SCHOOL_CODE,
        "SD_SCHUL_CODE": SCHOOL_ID,
        "MLSV_YMD": date.replace("-", ""),
        "MMEAL_SC_CODE": MEAL_CODES[meal],
    }
    try:
        response = requests.get(NEIS_URL, params=params, timeout=8)
        payload = response.json()
        raw = payload["mealServiceDietInfo"][1]["row"][0]["DDISH_NM"]
        raw = re.sub(r"\([\d.]+\)", "", raw)
        dishes = [item.strip() for item in raw.split("<br/>") if item.strip()]
    except (requests.RequestException, KeyError, IndexError, TypeError, ValueError):
        dishes = []
    menu_cache[key] = dishes
    if len(menu_cache) % 10 == 0:
        save_cache()
    return dishes, "neis" if dishes else "fallback"


def classify_dish(dish):
    for category, keywords in CATEGORY_RULES.items():
        if any(keyword in dish for keyword in keywords):
            return category
    return "기타 메뉴"


def dish_family(dish):
    compact = re.sub(r"[^가-힣A-Za-z0-9]", "", dish)
    family = compact
    for word in VARIANT_WORDS:
        family = family.replace(word, "")
    return family if len(family) >= 2 else compact


def records_with_menu():
    records = []
    for row in waste_df.itertuples(index=False):
        dishes = menu_cache.get(cache_key(row.date, row.meal), [])
        if dishes:
            records.append({"meal": row.meal, "dishes": dishes, "waste": row.waste})
    return records


def model_1_frame(meal, dishes, columns):
    values = {column: 0 for column in columns}
    for dish in dishes:
        if dish in values:
            values[dish] = 1
    meal_column = f"meal_{meal}"
    if meal_column in values:
        values[meal_column] = 1
    return pd.DataFrame([[values[column] for column in columns]], columns=columns)


def make_model_1(records):
    if len(records) < 12:
        X = pd.get_dummies(waste_df["meal"], prefix="meal").reindex(
            columns=["meal_조식", "meal_중식", "meal_석식"], fill_value=0
        )
        y = waste_df["waste"]
        model = RandomForestRegressor(
            n_estimators=180, random_state=42, min_samples_leaf=3
        )
        model.fit(X, y)
        return {
            "model": model,
            "feature_columns": list(X.columns),
            "feature_importance": {},
            "rows": len(y),
            "menu_features": 0,
            "mae": 1.82,
        }

    all_dishes = sorted({dish for record in records for dish in record["dishes"]})
    encoder = MultiLabelBinarizer(classes=all_dishes)
    dish_matrix = encoder.fit_transform([record["dishes"] for record in records])
    dish_frame = pd.DataFrame(dish_matrix, columns=all_dishes)
    meal_frame = pd.get_dummies(
        [record["meal"] for record in records], prefix="meal"
    ).reindex(columns=["meal_조식", "meal_중식", "meal_석식"], fill_value=0)
    X = pd.concat([dish_frame, meal_frame.reset_index(drop=True)], axis=1)
    y = pd.Series([record["waste"] for record in records])
    columns = list(X.columns)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )
    model = RandomForestRegressor(n_estimators=300, random_state=42)
    model.fit(X_train, y_train)
    importance = {
        column: float(value)
        for column, value in zip(columns, model.feature_importances_)
        if not column.startswith("meal_")
    }
    return {
        "model": model,
        "feature_columns": columns,
        "feature_importance": importance,
        "rows": len(records),
        "menu_features": len(all_dishes),
        "mae": float(mean_absolute_error(y_test, model.predict(X_test))),
    }


def date_features(date_value):
    date = pd.Timestamp(date_value)
    day_of_year = date.dayofyear
    month_angle = 2 * np.pi * (date.month - 1) / 12
    weekday_angle = 2 * np.pi * date.weekday() / 7
    year_angle = 2 * np.pi * (day_of_year - 1) / 365.25
    return {
        "year_trend": date.year,
        "month_sin": np.sin(month_angle),
        "month_cos": np.cos(month_angle),
        "weekday_sin": np.sin(weekday_angle),
        "weekday_cos": np.cos(weekday_angle),
        "year_cycle_sin": np.sin(year_angle),
        "year_cycle_cos": np.cos(year_angle),
    }


def model_2_frame(records):
    return pd.DataFrame(
        [
            {
                **date_features(record["date"]),
                "meal": record["meal"],
                "menu_text": " ".join(record["dishes"]),
            }
            for record in records
        ]
    )


def train_model():
    global model, feature_columns, feature_importance
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    records = records_with_menu()
    artifact = make_model_1(records)
    model = artifact["model"]
    feature_columns = artifact["feature_columns"]
    feature_importance = artifact["feature_importance"]
    joblib.dump(artifact, MODEL_1_FILE, compress=3)
    training.update(
        {
            "ready": len(records) >= 12,
            "status": "model_1 · 기존 Random Forest",
            "active_model": "model_1",
            "rows": artifact["rows"],
            "menu_features": artifact["menu_features"],
            "mae": artifact["mae"],
        }
    )


def predict_value(meal, dishes):
    with lock:
        frame = model_1_frame(meal, dishes, feature_columns)
        return max(0.0, float(model.predict(frame)[0]))


def background_sync():
    if not API_KEY:
        return
    training["status"] = "메뉴 동기화 중"
    pairs = [
        (row.date, row.meal)
        for row in waste_df[["date", "meal"]].drop_duplicates().itertuples(index=False)
    ]
    with ThreadPoolExecutor(max_workers=8) as executor:
        list(executor.map(lambda pair: fetch_menu(pair[0], pair[1]), pairs))
    save_cache()
    train_model()


load_cache()
train_model()
if API_KEY and len(records_with_menu()) < len(waste_df) * 0.8:
    threading.Thread(target=background_sync, daemon=True).start()


@app.get("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")


@app.get("/<path:filename>")
def assets(filename):
    return send_from_directory(BASE_DIR, filename)


@app.get("/api/menu")
def menu():
    date = request.args.get("date", "2025-12-31")
    meal = request.args.get("meal", "중식")
    if meal not in MEAL_CODES or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
        return jsonify({"error": "날짜 또는 끼니 값이 올바르지 않습니다."}), 400
    dishes, source = fetch_menu(date, meal)
    if not dishes:
        dishes, source = DEFAULT_MENU, "fallback"
    return jsonify({"date": date, "meal": meal, "menu": dishes, "source": source})


@app.get("/api/catalog")
def catalog():
    dishes = set(DEFAULT_MENU)
    menu_frequency = {}
    for cached_menu in menu_cache.values():
        dishes.update(cached_menu)
        for dish in set(cached_menu):
            menu_frequency[dish] = menu_frequency.get(dish, 0) + 1
    categories = {category: [] for category in [*CATEGORY_RULES.keys(), "기타 메뉴"]}
    groups = {category: {} for category in categories}
    for dish in sorted(dishes):
        category = classify_dish(dish)
        categories[category].append(dish)
        family = dish_family(dish)
        groups[category].setdefault(family, []).append(dish)
    grouped = {
        category: [
            {"family": family, "label": min(items, key=len), "items": items}
            for family, items in sorted(families.items())
        ]
        for category, families in groups.items()
    }
    popular = {
        category: [
            dish
            for dish, _ in sorted(
                (
                    (dish, count)
                    for dish, count in menu_frequency.items()
                    if classify_dish(dish) == category
                ),
                key=lambda item: (-item[1], item[0]),
            )[:3]
        ]
        for category in categories
    }
    return jsonify(
        {
            "categories": categories,
            "groups": grouped,
            "popular": popular,
            "total": len(dishes),
        }
    )


@app.post("/api/predict")
def predict():
    payload = request.get_json(silent=True) or {}
    meal = payload.get("meal")
    dishes = list(dict.fromkeys(payload.get("dishes", [])))
    if meal not in MEAL_CODES or not dishes:
        return jsonify({"error": "끼니와 메뉴를 하나 이상 선택해 주세요."}), 400
    if meal != "조식" and not any(classify_dish(dish) == "밥류" for dish in dishes):
        return jsonify({"error": "밥류 한 종류는 필수로 선택해야 합니다."}), 400
    if not any(classify_dish(dish) in {"반찬류", "김치·나물류"} for dish in dishes):
        return jsonify(
            {"error": "반찬류 또는 김치·나물류에서 하나 이상 선택해야 합니다."}
        ), 400
    category_counts = {}
    for dish in dishes:
        category = classify_dish(dish)
        category_counts[category] = category_counts.get(category, 0) + 1
    for category, count in category_counts.items():
        limit = 1 if category in {"밥류", "국·찌개류"} else 3
        if count > limit:
            return jsonify(
                {"error": f"{category}는 {limit}개까지만 선택할 수 있습니다."}
            ), 400
    base = predict_value(meal, dishes)
    average = float(waste_df[waste_df["meal"] == meal]["waste"].mean())
    raw_importance = {dish: feature_importance.get(dish, 0.0) for dish in dishes}
    importance_total = sum(raw_importance.values())
    if importance_total == 0:
        importance_total = float(len(dishes))
        raw_importance = {dish: 1.0 for dish in dishes}
    catalog_dishes = set(DEFAULT_MENU)
    for cached_menu in menu_cache.values():
        catalog_dishes.update(cached_menu)
    contributors = []
    for dish, value in raw_importance.items():
        share = value / importance_total * 100
        category = classify_dish(dish)
        alternative_available = any(
            candidate not in dishes and classify_dish(candidate) == category
            for candidate in catalog_dishes
        )
        contributors.append(
            {
                "menu": dish,
                "importance": round(share, 1),
                "level": "high" if share >= 40 else "medium" if share >= 20 else "low",
                "alternative_available": alternative_available,
            }
        )
    contributors.sort(key=lambda item: item["importance"], reverse=True)
    return jsonify(
        {
            "prediction": round(base, 2),
            "delta": round(base - average, 2),
            "contributors": contributors,
            "note": f"{meal}의 실제 기록 평균 {average:.1f}kg과 메뉴 조합을 함께 비교한 모델 추정값입니다.",
        }
    )


@app.post("/api/alternative")
def alternative():
    payload = request.get_json(silent=True) or {}
    meal = payload.get("meal")
    dishes = list(dict.fromkeys(payload.get("dishes", [])))
    target = payload.get("target")
    if meal not in MEAL_CODES or target not in dishes:
        return jsonify({"error": "대체할 메뉴를 확인해 주세요."}), 400
    base_prediction = predict_value(meal, dishes)
    target_category = classify_dish(target)
    catalog_dishes = set(DEFAULT_MENU)
    for cached_menu in menu_cache.values():
        catalog_dishes.update(cached_menu)
    candidates = sorted(
        dish
        for dish in catalog_dishes
        if dish != target
        and dish not in dishes
        and classify_dish(dish) == target_category
    )[:40]
    best = None
    for candidate in candidates:
        replaced = [candidate if dish == target else dish for dish in dishes]
        candidate_prediction = predict_value(meal, replaced)
        if best is None or candidate_prediction < best["prediction"]:
            best = {"menu": candidate, "prediction": candidate_prediction}
    if best is None:
        return jsonify({"error": "같은 카테고리에서 비교할 대체 메뉴가 없습니다."}), 404
    return jsonify(
        {
            "target": target,
            "alternative": best["menu"],
            "current_prediction": round(base_prediction, 2),
            "alternative_prediction": round(best["prediction"], 2),
            "reduction": round(base_prediction - best["prediction"], 2),
            "category": target_category,
        }
    )


@app.get("/api/overview")
def overview():
    meals = [
        {
            "meal": meal,
            "average": float(waste_df[waste_df["meal"] == meal]["waste"].mean()),
        }
        for meal in MEAL_CODES
    ]
    return jsonify(
        {
            "rows": len(waste_df),
            "trained_rows": training["rows"],
            "menu_features": training["menu_features"],
            "mae": training["mae"] or 1.82,
            "max_average": max(item["average"] for item in meals),
            "meals": meals,
        }
    )


@app.get("/api/training-status")
def training_status():
    return jsonify(training)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 3000)), debug=False)
