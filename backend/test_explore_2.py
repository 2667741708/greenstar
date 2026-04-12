import requests
import os
import json

AMAP_KEY = os.environ.get("AMAP_KEY", "0e59aae0d84f39b4665eba7acc9f49a9")
URL = "https://restapi.amap.com/v3/place/text"
params = {
    "key": AMAP_KEY,
    "keywords": "上海电气风电集团股份有限公司",
    "city": "上海",
    "extensions": "all"
}
res = requests.get(URL, params=params)
data = res.json()
if data.get("status") == "1":
    pois = data.get("pois", [])
    for poi in pois:
        print(f"Name: {poi.get('name')} | type: {poi.get('type')} ({poi.get('typecode')})")

params = {
    "key": AMAP_KEY,
    "keywords": "上海站(检票口)",
    "city": "上海",
    "extensions": "all"
}
res = requests.get(URL, params=params)
data = res.json()
if data.get("status") == "1":
    pois = data.get("pois", [])
    for poi in pois[:2]:
        print(f"Name: {poi.get('name')} | type: {poi.get('type')} ({poi.get('typecode')})")
