import json, sys, time, os, urllib.request, urllib.parse
from datetime import date, timedelta
from concurrent.futures import ThreadPoolExecutor
start, end, out = date.fromisoformat(sys.argv[1]), date.fromisoformat(sys.argv[2]), sys.argv[3]
dates = [(start + timedelta(i)).isoformat() for i in range((end - start).days + 1)]
def get(d):
    q = urllib.parse.urlencode({'Type':'json','ATPT_OFCDC_SC_CODE':'S10','SD_SCHUL_CODE':'9010081','MLSV_YMD':d.replace('-',''),'pSize':5})
    for i in range(4):
        try:
            with urllib.request.urlopen('https://open.neis.go.kr/hub/mealServiceDietInfo?'+q, timeout=15) as r:
                j = json.loads(r.read().decode('utf-8'))
            rows = j['mealServiceDietInfo'][1]['row'] if 'mealServiceDietInfo' in j else []
            return d, [{k: x.get(k) for k in ('MMEAL_SC_NM','DDISH_NM','CAL_INFO','MLSV_FGR')} for x in rows]
        except Exception:
            time.sleep(1.5*(i+1))
    return d, None
with ThreadPoolExecutor(4) as ex:
    res = {d: rows for d, rows in ex.map(get, dates) if rows}
json.dump(res, open(out,'w',encoding='utf-8'), ensure_ascii=False)
print('days with menus', len(res), 'first', min(res) if res else None, 'last', max(res) if res else None)
