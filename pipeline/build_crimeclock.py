"""Crime Clock — a weekday × hour heatmap of when crime happens (state + per district).

Answers the operational question a patrol planner actually asks: WHEN do we deploy?
Reads the incident timestamp of every FIR (incidentFromDate) and bins into a 7×24 grid.

Output: frontend/public/crime-clock.json  { state:[7][24], districts:{name:[7][24]} }
Run: python3 -m pipeline.build_crimeclock
"""
import json
import os
from datetime import datetime

DATA = "pipeline/data"
REF = "pipeline/reference"
OUT = "frontend/public/crime-clock.json"


def main():
    dmap = {d["districtId"]: d["name"] for d in json.load(open(f"{REF}/districts.json", encoding="utf-8"))["districts"]}
    state = [[0] * 24 for _ in range(7)]
    districts = {name: [[0] * 24 for _ in range(7)] for name in dmap.values()}

    n = 0
    with open(os.path.join(DATA, "cases.jsonl"), encoding="utf-8") as f:
        for line in f:
            c = json.loads(line)
            raw = c.get("incidentFromDate")
            if not raw or len(raw) < 13:
                continue
            try:
                dt = datetime.fromisoformat(raw)
            except ValueError:
                continue
            wd, hr = dt.weekday(), dt.hour  # Mon=0..Sun=6
            state[wd][hr] += 1
            dn = dmap.get(c["districtId"])
            if dn:
                districts[dn][wd][hr] += 1
            n += 1

    json.dump({"state": state, "districts": districts}, open(OUT, "w", encoding="utf-8"), separators=(",", ":"))
    peak = max(range(7 * 24), key=lambda k: state[k // 24][k % 24])
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    print(f"crime-clock: {n} timed FIRs → {OUT} ({os.path.getsize(OUT)/1024:.0f} KB)")
    print(f"  state peak: {days[peak // 24]} {peak % 24:02d}:00  (count {state[peak // 24][peak % 24]})")


if __name__ == "__main__":
    main()
