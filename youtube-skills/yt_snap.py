#!/usr/bin/env python3
"""YUSANDO CHANNEL: save per-video lifetime view snapshots and report 60min / 24h / 48h gains.

  python3 yt_snap.py save pre|main  < rows.tsv
      each line: video_id<TAB>views<TAB>length(H:MM:SS)<TAB>published_at<TAB>title
      (for "pre", id and views are enough)
  python3 yt_snap.py report
Snapshot folder: $YT_SNAP_DIR or ./snaps next to this script.
"""
import sys, json, os, glob, datetime as dt

D = os.environ.get("YT_SNAP_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "snaps")
os.makedirs(D, exist_ok=True)
now = dt.datetime.now(dt.timezone.utc)


def secs(s):
    try:
        p = [int(x) for x in s.split(":")]
        return sum(v * 60 ** i for i, v in enumerate(reversed(p)))
    except Exception:
        return None


def parse_ts(s):
    return dt.datetime.fromisoformat(s.replace("Z", "+00:00"))


def save(label):
    rows = {}
    for line in sys.stdin:
        f = line.rstrip("\n").split("\t")
        if len(f) < 2 or not f[1].strip().isdigit():
            continue
        r = {"v": int(f[1])}
        if len(f) > 2 and f[2]:
            r["len"] = secs(f[2])
        if len(f) > 3 and f[3]:
            r["pub"] = f[3]
        if len(f) > 4 and f[4]:
            r["t"] = f[4]
        rows[f[0].strip()] = r
    path = os.path.join(D, now.strftime("%Y%m%dT%H%M%SZ") + "_" + label + ".json")
    with open(path, "w") as fh:
        json.dump({"at": now.isoformat(), "label": label, "rows": rows}, fh, ensure_ascii=False)
    print(f"saved {len(rows)} videos -> {os.path.basename(path)}")


def load_all():
    out = []
    for p in sorted(glob.glob(os.path.join(D, "*.json"))):
        with open(p) as fh:
            j = json.load(fh)
        j["at"] = dt.datetime.fromisoformat(j["at"])
        j["path"] = p
        out.append(j)
    return out


def nearest(snaps, target, tol_h):
    c = [s for s in snaps if abs((s["at"] - target).total_seconds()) <= tol_h * 3600]
    return min(c, key=lambda s: abs((s["at"] - target).total_seconds())) if c else None


def report():
    snaps = load_all()
    mains = [s for s in snaps if s["label"] == "main"]
    if not mains:
        print("main snapshot がありません")
        return
    cur = mains[-1]
    t0, R = cur["at"], cur["rows"]
    meta = {}
    for s in reversed(snaps):  # newest first: length / publish date / title
        for k, r in s["rows"].items():
            m = meta.setdefault(k, {})
            for f in ("len", "pub", "t"):
                if f in r:
                    m.setdefault(f, r[f])

    def title(k):
        return meta.get(k, {}).get("t", k)

    def is_short(k):
        L = meta.get(k, {}).get("len")
        return L is not None and L <= 180

    def diff(prev):
        tot = {"all": 0, "long": 0, "short": 0}
        per = {}
        for k, r in R.items():
            p = prev["rows"].get(k, {}).get("v")
            if p is None:
                pub = meta.get(k, {}).get("pub")
                if pub and parse_ts(pub) > prev["at"]:
                    p = 0  # published after the previous snapshot
                else:
                    continue
            d = r["v"] - p
            per[k] = d
            tot["all"] += d
            tot["short" if is_short(k) else "long"] += d
        return tot, per

    print(f"計測時刻: {t0:%Y-%m-%d %H:%M} UTC ／ 動画別累計の合計 {sum(r['v'] for r in R.values()):,}回（{len(R)}本）")
    for label, hours, tol, src in (("60分", 1, 0.5, "pre"), ("24時間", 24, 3, "main"), ("48時間", 48, 3, "main")):
        prev = nearest([s for s in snaps if s["label"] == src and s is not cur], t0 - dt.timedelta(hours=hours), tol)
        if not prev:
            print(f"{label}: 比べられる計測がまだありません")
            continue
        tot, per = diff(prev)
        span = (t0 - prev["at"]).total_seconds() / 3600
        print(f"{label}（実際の間隔 {span:.1f}時間）: 合計 {tot['all']:,}回 ／ 長尺 {tot['long']:,}回 ／ ショート {tot['short']:,}回")
        if hours == 48:
            for k in sorted([k for k in per if not is_short(k)], key=lambda k: -per[k])[:5]:
                print(f"  48時間の長尺上位: {title(k)}  +{per[k]:,}回（累計 {R[k]['v']:,}）")

    print("公開72時間以内の長尺:")
    found = False
    for k, r in sorted(R.items(), key=lambda kv: meta.get(kv[0], {}).get("pub", "")):
        pub = meta.get(k, {}).get("pub")
        if not pub or is_short(k):
            continue
        age = (t0 - parse_ts(pub)).total_seconds() / 3600
        if not 0 < age <= 72 or r["v"] == 0:  # 0 views = private / scheduled
            continue
        found = True
        v = r["v"]
        # value at ~24h after publish, from any snapshot within 3h of that moment
        at24 = nearest([s for s in snaps if k in s["rows"]], parse_ts(pub) + dt.timedelta(hours=24), 3)
        if age < 24:
            judge = "24時間たっていないので判定前"
        else:
            base = at24["rows"][k]["v"] if at24 else v
            note = "" if at24 else "（24時間時点の計測がないため現在の値で判定）"
            judge = ("当たり" if base >= 2000 else "様子見" if base >= 500 else "見直し") + f"：24時間で約{base:,}回{note}"
        print(f"  {title(k)}: 公開から{age:.0f}時間で {v:,}回（平均 {v / age:.0f}回/時）→ {judge}")
    if not found:
        print("  なし")

    longs = sorted([(title(k), r["v"]) for k, r in R.items() if not is_short(k) and r["v"] >= 10000], key=lambda x: -x[1])
    print(f"1万回を超えた長尺: {len(longs)}本 " + "、".join(f"{t[:22]}（{v:,}）" for t, v in longs))
    near = sorted([(title(k), r["v"]) for k, r in R.items() if not is_short(k) and 7000 <= r["v"] < 10000], key=lambda x: -x[1])
    if near:
        print("1万回まであと少し: " + "、".join(f"{t[:22]}（{v:,}）" for t, v in near))

    for s in snaps:  # keep 10 days
        if (now - s["at"]).days > 10:
            os.remove(s["path"])


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "save" and len(sys.argv) == 3:
        save(sys.argv[2])
    elif len(sys.argv) == 2 and sys.argv[1] == "report":
        report()
    else:
        print(__doc__)
