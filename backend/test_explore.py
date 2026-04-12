import requests
import os
import json

AMAP_KEY = os.environ.get("AMAP_KEY", "0e59aae0d84f39b4665eba7acc9f49a9")
# We reproduce exactly the backend API call for default exploring around a location.
URL = "https://restapi.amap.com/v3/place/around"

# Coordinates seen from the app (e.g., somewhere in Shanghai where that wind power corp exists)
# Let's search broadly just to see what comes up and what types they are
lat, lng = 31.23, 121.47 # Shanghai general
# Try to recreate the types used in constants.ts
TYPES = "110000|050000|060000|100000|080000|140000"

params = {
    "key": AMAP_KEY,
    "location": f"{lng},{lat}",
    "radius": 30000,   # we expanded to 30000m earlier
    "types": TYPES,
    "extensions": "all",
    "offset": 50,
    "page": 1,
    "sortrule": "distance"  # AMap defaults to distance sometimes unless we override?
}

print(f"[*] Calling AMap API around {lng},{lat} with radius {params['radius']} and types {TYPES}...")
res = requests.get(URL, params=params)
data = res.json()

if data.get("status") == "1":
    pois = data.get("pois", [])
    print(f"[+] Found {len(pois)} POIs. Analyzing irrelevant ones...")
    for poi in pois:
        name = poi.get("name", "Unknown")
        pcode = poi.get("pcode", "")
        type_str = poi.get("type", "")
        typecode = poi.get("typecode", "")
        
        # Output the specific types AMap categorizes "company-like" names so we can ban them!
        if "公司" in name or "检票口" in name or "集团" in name or "厂" in name or "政府" in name:
            print(f"  [Weird POI detected!] Name: {name} | type: {type_str} ({typecode})")
            
    print("\n--- Summary of some regular POIs to compare ---")
    for poi in pois[:5]:
        print(f"  [Regular] {poi.get('name')} | type: {poi.get('type')} ({poi.get('typecode')})")
else:
    print(f"[-] API failed: {data}")

