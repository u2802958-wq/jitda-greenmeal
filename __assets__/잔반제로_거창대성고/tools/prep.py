"""Join waste CSV with NEIS menus, normalize dish names, classify. Shared by model + build scripts."""
import csv, json, re, sys
from datetime import date

MEALS = ["조식", "중식", "석식"]
WEEK = ["월", "화", "수", "목", "금", "토", "일"]
OUTLIER_L = 25  # same threshold as 잔반량_무게환산 workbook (설정!B5)

CATS = ["밥·면", "국·찌개", "메인요리", "반찬", "채소·나물", "김치·절임", "후식·음료", "기타"]

SOUP_END = ("국", "탕", "찌개", "전골", "스프", "수프", "장국", "개장", "곰탕", "국밥")
RICE_IN = ("밥", "덮밥", "국수", "우동", "라면", "파스타", "스파게티", "짜장", "짬뽕", "리조또", "누들", "쌀국수", "비빔면", "냉면", "소바", "라멘", "볶음면", "칼국수", "수제비", "떡국", "또띠아", "버거", "샌드위치", "토스트", "핫도그", "피자", "브리또", "부리또", "라이스", "라볶이", "짜파구리", "알리오올리오", "오므라", "주먹밥", "카레", "커리", "규동", "가츠동", "부타동", "텐동", "난")
RICE_END = ("죽", "면", "밥")
KIMCHI = ("김치", "깍두기", "석박지", "섞박지", "겉절이", "피클", "단무지", "장아찌", "지(완)", "깻잎지", "무말랭이", "오이지", "절임", "무짠지", "백김치", "동치미", "나박")
DESSERT_END = ("사과", "귤", "배", "포도", "수박", "바나나", "키위", "오렌지", "딸기", "복숭아", "파인애플", "메론", "멜론", "참외", "토마토", "망고", "방울토망고", "자두", "체리", "머스켓", "머스캣", "한라봉", "천혜향", "레드향", "황금향", "자몽", "블루베리", "감", "홍시", "석류", "용과", "리치", "청포도", "거봉", "과일", "푸딩", "젤리", "주스", "쥬스", "에이드", "스무디", "라떼", "식혜", "수정과", "차", "우유", "요구르트", "요거트", "케이크", "케익", "쿠키", "머핀", "와플", "도넛", "도너츠", "타르트", "파이", "마카롱", "츄러스", "아이스크림", "빙수", "슈", "빵", "떡", "약과", "강정", "화채", "음료", "제로", "콜라", "사이다", "아이스티", "쿨피스", "요플레", "쿨에이드", "두유", "아몬드", "초콜렛", "초콜릿", "견과", "휘낭시에", "브라우니", "카스테라", "바게트", "빼빼로", "쥬시쿨", "카프리썬", "피크닉", "후레쉬업", "미숫가루", "펀치", "라빈스", "오란다", "마들렌", "크룽지", "트위스트", "스콘", "롤케익", "호떡", "츄러스", "샤베트", "셔벗", "아이스바", "크림빵", "모나카", "약밥")
DESSERT_IN = ("우유", "요구르트", "요거트", "시리얼", "콘푸라이트", "첵스", "오즈", "케이크", "아이스", "주스", "쥬스", "에이드", "젤리", "푸딩", "스무디", "음료", "모구모구", "쿨피스", "요플레", "따옴", "핫초코", "두유", "아몬드", "초콜", "견과", "라빈스", "쥬시쿨", "뿌셔")
MAIN_IN = ("고기", "갈비", "불고기", "제육", "돈까스", "돈가스", "까스", "커틀릿", "치킨", "닭", "돼지", "소고기", "쇠고기", "한우", "오리", "삼겹", "목살", "수육", "보쌈", "족발", "생선", "고등어", "갈치", "삼치", "연어", "가자미", "임연수", "동태", "조기", "꽁치", "새우", "오징어", "낙지", "쭈꾸미", "주꾸미", "함박", "스테이크", "너겟", "떡갈비", "탕수육", "깐풍", "윙", "봉", "등심", "안심", "폭립", "립", "바베큐", "바비큐", "훈제", "미트볼", "소세지", "소시지", "햄", "스팸", "베이컨", "장어", "꼬치", "산적", "찜닭", "닭강정", "유린기", "양장피", "팔보채", "깐쇼", "카츠", "가츠", "동파육", "돈마호크", "멘보샤", "감바스", "피쉬", "치밥", "닭꼬치", "LA", "떡갈비", "커틀렛", "까츠")
SIDE_IN = ("조림", "볶음", "구이", "전", "튀김", "계란", "달걀", "에그", "두부", "어묵", "만두", "잡채", "떡볶이", "감자", "찜", "맛살", "김자반", "김구이", "멸치", "진미채", "묵", "부침", "그라탕", "고로케", "크로켓", "치즈", "스크램블", "프리타타", "오믈렛", "콘", "샐러드", "김", "부각", "완자", "타코야끼", "카프레제", "코울슬로", "콩불", "지리")
VEG_IN = ("나물", "무침", "생채", "샐러드", "쌈", "숙주", "시금치", "콩나물", "브로콜리", "숙회", "초회", "겉절이", "채", "오이", "상추", "치커리", "버섯", "샐러")


def classify(name):
    n = name.split("/")[0]
    if n.endswith(SOUP_END) and not n.endswith(("탕수", "국밥")):
        return "국·찌개"
    if any(k in n for k in KIMCHI):
        return "김치·절임"
    if any(k in n for k in RICE_IN) or n.endswith(RICE_END):
        return "밥·면"
    if n.endswith(DESSERT_END) or any(k in name for k in DESSERT_IN):
        return "후식·음료"
    if any(k in n for k in MAIN_IN):
        return "메인요리"
    if any(k in n for k in VEG_IN[:6]) or n.endswith(("나물", "무침", "생채", "샐러드", "쌈")):
        return "채소·나물"
    if any(k in n for k in SIDE_IN):
        return "반찬"
    if any(k in n for k in VEG_IN):
        return "채소·나물"
    return "기타"


def clean_display(x):
    x = re.sub(r"\(\s*[\d.\s]+\)?\s*$", "", x)  # trailing allergen list, even if truncated
    x = re.sub(r"\([\d.\s]+\)", "", x)
    x = re.sub(r"-(중|석|조)\s*$", "", x)
    return re.sub(r"\s+", " ", x).strip(" *#")


def norm(x):
    n = re.sub(r"\(.*?\)|\(.*$", "", x)
    n = n.split("*")[0]
    n = re.sub(r"-(중|석|조)$", "", n)
    n = re.sub(r"[^가-힣A-Za-z0-9/&]", "", n)
    n = re.sub(r"^(친환경|수제|국산|유기농)", "", n) if len(n) > 4 else n
    return n or x


def load(waste_csv, neis_json):
    neis = json.load(open(neis_json, encoding="utf-8"))
    menus = {}
    for d, rows in neis.items():
        for r in rows:
            dishes = [clean_display(x) for x in r["DDISH_NM"].split("<br/>")]
            dishes = [x for x in dishes if x]
            kcal = re.match(r"[\d.]+", r.get("CAL_INFO") or "")
            menus[(d, r["MMEAL_SC_NM"])] = {
                "dishes": dishes,
                "kcal": float(kcal.group()) if kcal else None,
                "people": int(r["MLSV_FGR"]) if r.get("MLSV_FGR") else None,
            }
    recs = []
    for r in csv.DictReader(open(waste_csv, encoding="utf-8-sig")):
        d, m = r["일자"], r["끼니"]
        L = float(r["원자료 발생량(L)"])
        info = menus.get((d, m), {})
        dt = date.fromisoformat(d)
        recs.append({
            "date": d, "meal": m, "mi": MEALS.index(m), "wd": dt.weekday(), "year": dt.year, "month": dt.month,
            "L": L, "kg": float(r["환산 무게(kg)"]),
            "out": L >= OUTLIER_L,
            "dishes": info.get("dishes", []), "kcal": info.get("kcal"), "people": info.get("people"),
        })
    return recs
