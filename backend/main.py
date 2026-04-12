import os
import requests
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List, Dict, Any

app = FastAPI(title="Greenstar AMap Backend API")

# Allow CORS for local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# You can also set this via env var
AMAP_KEY = os.environ.get("AMAP_KEY", "0e59aae0d84f39b4665eba7acc9f49a9")

@app.get("/api/poi/around")
def get_poi_around(
    lat: float,
    lng: float,
    keywords: Optional[str] = None,
    types: Optional[str] = None,
    radius: int = 3000,
    page_num: int = 1,
    page_size: int = 50
):
    """
    Search related POIs using the reliable AMap v3 API to bypass frontend restrictions
    """
    around_url = "https://restapi.amap.com/v3/place/around"
    
    # Base parameters for v3
    params: Dict[str, Any] = {
        "key": AMAP_KEY,
        "location": f"{lng},{lat}", # format is longitude,latitude
        "radius": radius,
        "offset": page_size, # how many items per page
        "page": page_num,
        "extensions": "all" # get all fields (like biz_ext, photos)
    }
    
    if keywords:
        params["keywords"] = keywords
    
    if types:
        params["types"] = types

    try:
        res = requests.get(around_url, params=params, timeout=10)
        res.raise_for_status()
        data = res.json()
        
        if data.get("status") == "1":
            pois = data.get("pois", [])
            # Return raw POIs or transformed structure.
            # Returning raw list allows the frontend to map this correctly.
            return {"status": "1", "pois": pois, "count": data.get("count", 0)}
        else:
            return {"status": data.get("status"), "info": data.get("info"), "pois": []}
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/poi/text")
def get_poi_text(
    keywords: str,
    city: str,
    page_num: int = 1,
    page_size: int = 50
):
    """
    Fallback or direct user search using global text API.
    """
    text_url = "https://restapi.amap.com/v3/place/text"
    
    params = {
        "key": AMAP_KEY,
        "keywords": keywords,
        "city": city,
        "offset": page_size,
        "page": page_num,
        "extensions": "all"
    }
    
    try:
        res = requests.get(text_url, params=params, timeout=10)
        res.raise_for_status()
        data = res.json()
        
        if data.get("status") == "1":
            return {"status": "1", "pois": data.get("pois", []), "count": data.get("count", 0)}
        else:
            return {"status": data.get("status"), "info": data.get("info"), "pois": []}
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
