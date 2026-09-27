import json, os, re, sys, time, urllib.parse, urllib.request

ROOT = "C:/Users/sanji/AppData/Local/Temp/claude/D--Claude-code/f7e02157-53cf-4779-9064-ea41f9e4547c/scratchpad/flood_ds/raw"
UA = "NagarNetra-hackathon-research/1.0 (student project; training a flood classifier)"
API = "https://commons.wikimedia.org/w/api.php"
SKIP = re.compile(r"satellite|map|aerial|drone|diagram|flag|logo|graph|chart|poster|screenshot|nasa|landsat|modis|dam |river|cyclone|storm surge", re.I)

POS = ["waterlogged road", "waterlogging street", "flooded street India", "flooded road India", "monsoon flooded road",
       "Chennai floods street", "Mumbai floods street", "Kolkata waterlogged", "Kerala flood road", "Bangalore flooded road",
       "Hyderabad flooded road", "Delhi waterlogging", "Assam flood road", "flooded street", "urban flooding street",
       "waterlogged street monsoon", "rain flood road vehicles", "flooded road car"]
NEG = ["street India", "road India traffic", "Pune road", "Mumbai street", "Delhi street", "Bangalore road", "Chennai road",
       "Kolkata street", "Hyderabad road", "India city road", "highway India", "road Kerala", "market street India"]


def call(params):
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def search(query, want):
    found, offset = [], 0
    while len(found) < want and offset < 200:
        data = call({"action": "query", "generator": "search", "gsrsearch": query, "gsrnamespace": 6, "gsrlimit": 50,
                     "gsroffset": offset, "prop": "imageinfo", "iiprop": "url|size|extmetadata", "iiurlwidth": 640, "format": "json"})
        pages = list(data.get("query", {}).get("pages", {}).values())
        if not pages:
            break
        for p in pages:
            info = (p.get("imageinfo") or [{}])[0]
            title = p["title"]
            if not re.search(r"\.jpe?g$", title, re.I) or SKIP.search(title) or not info.get("thumburl"):
                continue
            if info.get("width", 0) < 640 or info.get("height", 0) < 400:
                continue
            found.append({"title": title, "url": info["thumburl"], "license": info.get("extmetadata", {}).get("LicenseShortName", {}).get("value", "")})
        offset += 50
        time.sleep(1.2)
    return found


def collect(kind, queries, limit):
    os.makedirs(f"{ROOT}/{kind}", exist_ok=True)
    seen, items = set(), []
    for q in queries:
        try:
            for it in search(q, 40):
                if it["title"] not in seen:
                    seen.add(it["title"])
                    items.append(it)
        except Exception as e:
            print("search failed", q, e)
        print(f"{kind}: {len(items)} candidates after '{q}'", flush=True)
        if len(items) >= limit * 2:
            break
    saved = []
    for i, it in enumerate(items[: limit * 2]):
        if len(saved) >= limit:
            break
        path = f"{ROOT}/{kind}/{kind}_{len(saved):04d}.jpg"
        try:
            req = urllib.request.Request(it["url"], headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            if len(data) < 15000:
                continue
            open(path, "wb").write(data)
            saved.append({"file": os.path.basename(path), "title": it["title"], "license": it["license"]})
        except Exception as e:
            print("download failed", it["title"][:50], str(e)[:60])
        time.sleep(1.0)
    json.dump(saved, open(f"{ROOT}/{kind}_sources.json", "w"), indent=1)
    print(f"{kind}: saved {len(saved)} images", flush=True)


collect("flooded", POS, 220)
collect("normal", NEG, 220)
print("DONE")
