import csv, json, sys, time, os, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor
src, out = sys.argv[1], sys.argv[2]
dates = sorted({r['일자'] for r in csv.DictReader(open(src, encoding='utf-8-sig'))})
res = json.load(open(out, encoding='utf-8')) if os.path.exists(out) else {}
todo = [d for d in dates if d not in res]
print('dates', len(dates), 'todo', len(todo), flush=True)
def get(d):
    q = urllib.parse.urlencode({'Type':'json','ATPT_OFCDC_SC_CODE':'S10','SD_SCHUL_CODE':'9010081','MLSV_YMD':d.replace('-',''),'pSize':5})
    for i in range(4):
        try:
            with urllib.request.urlopen('https://open.neis.go.kr/hub/mealServiceDietInfo?'+q, timeout=15) as r:
                j = json.loads(r.read().decode('utf-8'))
            rows = j['mealServiceDietInfo'][1]['row'] if 'mealServiceDietInfo' in j else []
            return d, [{k: x.get(k) for k in ('MMEAL_SC_NM','DDISH_NM','CAL_INFO','MLSV_FGR','NTR_INFO')} for x in rows]
        except Exception as e:
            time.sleep(1.5*(i+1))
    return d, None
n=0
with ThreadPoolExecutor(4) as ex:
    for d, rows in ex.map(get, todo):
        if rows is not None: res[d] = rows
        n+=1
        if n % 50 == 0:
            json.dump(res, open(out,'w',encoding='utf-8'), ensure_ascii=False); print(n, flush=True)
json.dump(res, open(out,'w',encoding='utf-8'), ensure_ascii=False)
print('done', len(res), 'missing', len([d for d in dates if d not in res]))
