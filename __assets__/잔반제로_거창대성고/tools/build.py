"""Build app/data.js: compact records + dish table + baseline model coefficients."""
import sys, json, collections, numpy as np
from datetime import date
sys.path.insert(0, sys.argv[3])
from prep import load, norm, classify, clean_display, CATS, MEALS, OUTLIER_L
import re

waste_csv, neis_json, _, out_js = sys.argv[1:5]
upcoming_json = sys.argv[5] if len(sys.argv) > 5 else None
recs = load(waste_csv, neis_json)

# dish table (all dishes, keyed by normalized name; display = most common cleaned variant)
variants = collections.defaultdict(collections.Counter)
for r in recs:
    for x in r["dishes"]:
        variants[norm(x)][x] += 1
keys = sorted(variants, key=lambda k: -sum(variants[k].values()))
kid = {k: i for i, k in enumerate(keys)}

train = [r for r in recs if not r["out"] and r["dishes"] and r["people"]]
att_mean = np.zeros((3, 7))
for m in range(3):
    for wd in range(7):
        v = [r["people"] for r in train if r["mi"] == m and r["wd"] == wd]
        att_mean[m, wd] = np.mean(v) if v else 0


def base_x(mi, wd, year, month, people):
    a = np.zeros(3)
    a[mi] = people / 100
    return np.concatenate([np.eye(21)[mi * 7 + wd], np.eye(3)[year - 2023], a, np.eye(12)[month - 1]])


NB = 21 + 3 + 3 + 12
dcount = collections.Counter(norm(x) for r in train for x in set(r["dishes"]))
vocab = [k for k in keys if dcount[k] >= 4]
vi = {k: i for i, k in enumerate(vocab)}
X = np.array([np.concatenate([base_x(r["mi"], r["wd"], r["year"], r["month"], r["people"]),
                              np.bincount([vi[norm(x)] for x in set(r["dishes"]) if norm(x) in vi], minlength=len(vocab)).clip(0, 1)])
              for r in train])
y = np.array([r["kg"] for r in train])
ALPHA = 40
P = np.eye(X.shape[1]) * ALPHA
P[:NB, :NB] = 0
P[21:24, 21:24] = np.eye(3)        # year collinear with meal cells: light penalty
P[NB - 12:NB, NB - 12:NB] = np.eye(12) * 0.5   # month collinear too
w = np.linalg.solve(X.T @ X + P + np.eye(X.shape[1]) * 1e-6, X.T @ y)
pred = X @ w
mae = float(np.abs(pred - y).mean())
resid = y - X[:, :NB] @ w[:NB]      # residual vs baseline only (for "served-day" averages)
print("train MAE", round(mae, 3), "baseline-mean MAE", round(float(np.abs(y - y.mean()).mean()), 3))

# cross-validated MAE for the honest number shown in the app
folds = np.random.default_rng(0).integers(0, 5, len(train))
errs = []
for f in range(5):
    tr, te = folds != f, folds == f
    wf = np.linalg.solve(X[tr].T @ X[tr] + P + np.eye(X.shape[1]) * 1e-6, X[tr].T @ y[tr])
    errs.append(np.abs(X[te] @ wf - y[te]))
cv_mae = float(np.concatenate(errs).mean())
print("CV MAE", round(cv_mae, 3))

coef = {kid[k]: round(float(w[NB + i]), 3) for i, k in enumerate(vocab)}
served_resid = collections.defaultdict(list)
for r, e in zip(train, resid):
    for x in set(r["dishes"]):
        served_resid[kid[norm(x)]].append(float(e))

dishes = []
for k in keys:
    i = kid[k]
    n = sum(variants[k].values())
    sr = served_resid.get(i, [])
    dishes.append([
        variants[k].most_common(1)[0][0], classify(k), n,
        coef.get(i),                                   # ridge effect (kg), None if <4 serves
        round(sum(sr) / (len(sr) + 4), 3) if sr else None,  # shrunk served-day residual (kg)
    ])

meals_with_menu = sum(1 for r in recs if r["dishes"])
rows = []
for r in recs:
    d = date.fromisoformat(r["date"])
    rows.append([int(r["date"].replace("-", "")), r["mi"], r["L"], r["people"] or 0, round(r["kcal"]) if r["kcal"] else 0,
                 [kid[norm(x)] for x in r["dishes"]], 1 if r["out"] else 0])

model = {
    "cell": [round(float(v), 3) for v in w[:21]],
    "year": {str(2023 + i): round(float(w[21 + i]), 3) for i in range(3)},
    "att": [round(float(v), 4) for v in w[24:27]],
    "month": [round(float(v), 3) for v in w[27:39]],
    "attMean": [[round(float(v)) for v in row] for row in att_mean],
    "cvMae": round(cv_mae, 2),
    "trainRows": len(train),
    "alpha": ALPHA,
}
data = {
    "meta": {"school": "거창대성고등학교", "office": "S10", "code": "9010081",
             "built": date.today().isoformat(), "outlierL": OUTLIER_L, "kgPerL": 0.9,
             "years": [2023, 2024, 2025], "records": len(recs), "withMenu": meals_with_menu},
    "cats": CATS, "dishes": dishes, "recs": rows, "model": model, "upcoming": {},
}
if upcoming_json:
    for d, rs in sorted(json.load(open(upcoming_json, encoding="utf-8")).items()):
        meals = []
        for r in rs:
            kc = re.match(r"[\d.]+", r.get("CAL_INFO") or "")
            names = [x for x in (clean_display(s) for s in r["DDISH_NM"].split("<br/>")) if x]
            meals.append([MEALS.index(r["MMEAL_SC_NM"]), int(r["MLSV_FGR"] or 0), round(float(kc.group())) if kc else 0, names])
        data["upcoming"][d.replace("-", "")] = sorted(meals)
    data["meta"]["upcomingTo"] = max(data["upcoming"]) if data["upcoming"] else None
    print("upcoming days", len(data["upcoming"]))
with open(out_js, "w", encoding="utf-8") as f:
    f.write("/* 거창대성고 2023~2025 급식 메뉴(NEIS) + 잔반량 기록. build.py로 생성 */\n")
    f.write("window.JANBAN=" + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")

print("dishes", len(dishes), "vocab", len(vocab), "recs", len(rows))
ranked = sorted([d for d in dishes if d[3] is not None], key=lambda d: d[3])
print("LOW", [(d[0], d[2], d[3]) for d in ranked[:15]])
print("HIGH", [(d[0], d[2], d[3]) for d in ranked[-15:]])
print("cats", collections.Counter(d[1] for d in dishes))
print("기타 sample", [d[0] for d in dishes if d[1] == "기타"][:60])
print(model)
