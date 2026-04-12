import requests

url = "http://127.0.0.1:8000/api/poi/text"
params = {
    "keywords": "由马探案剧本杀",
    "city": "秦皇岛",
    "page_size": 5
}
try:
    response = requests.get(url, params=params)
    data = response.json()
    pois = data.get("pois", [])
    for poi in pois:
        print("====== POI Name ======")
        print(poi.get("name"))
        print("\n--- Photos ---")
        photos = poi.get("photos", [])
        if photos:
            for p in photos:
                print(p)
        else:
            print("NO PHOTOS FOUND IN API RESPONSE")
            
        print("\n--- Biz Ext (Business Indicators) ---")
        print(poi.get("biz_ext", "NO BIZ EXT"))
        print("\n--- typeinfo ---")
        print(poi.get("type"))
        print("\n")
except Exception as e:
    print("Error:", e)
