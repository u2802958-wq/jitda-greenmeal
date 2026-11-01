"""data.js 다시 만들기 (새 잔반 기록이 쌓였을 때 1년에 한두 번 실행)

사용법 (잔반제로_거창대성고 폴더에서):
    python tools/update_data.py ../data.csv

1. data.csv에 있는 날짜 중 아직 메뉴가 없는 날을 NEIS에서 받아 tools/cache/neis_menus.json에 더합니다.
2. 오늘 기준 앞뒤 기간의 식단을 받아 tools/cache/neis_upcoming.json에 저장합니다(인터넷이 막혔을 때 앱이 보여 줄 식단).
3. 예측 모델을 다시 학습하고 data.js를 새로 씁니다.
필요한 것: Python 3.9 이상, numpy (pip install numpy)
"""
import subprocess, sys
from datetime import date, timedelta
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
APP = TOOLS.parent
CACHE = TOOLS / "cache"


def run(*args):
    print(">", " ".join(str(a) for a in args), flush=True)
    subprocess.run([sys.executable, *map(str, args)], check=True)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    csv_path = Path(sys.argv[1]).resolve()
    CACHE.mkdir(exist_ok=True)
    run(TOOLS / "fetch_neis.py", csv_path, CACHE / "neis_menus.json")
    today = date.today()
    start = date(today.year, 1, 1)
    end = today + timedelta(days=60)
    run(TOOLS / "fetch_range.py", start.isoformat(), end.isoformat(), CACHE / "neis_upcoming.json")
    run(TOOLS / "build.py", csv_path, CACHE / "neis_menus.json", TOOLS, APP / "data.js", CACHE / "neis_upcoming.json")
    print("완료: data.js를 새로 만들었어요. 브라우저에서 index.html을 새로 고침하세요.")


if __name__ == "__main__":
    main()
