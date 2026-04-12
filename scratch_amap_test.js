const fetch = require('node-fetch');

async function testAMap() {
  const AMAP_KEY = '0e59aae0d84f39b4665eba7acc9f49a9';
  const url = `https://restapi.amap.com/v5/place/around?key=${AMAP_KEY}&location=120.3826,36.0671&radius=10000&page_size=50&page_num=1&show_fields=photos,business&types=110000|050000|060000|100000|080000|140000`;
  const resp = await fetch(url);
  const data = await resp.json();
  console.log(`REST results count:`, data.pois ? data.pois.length : 0);
  if (data.pois) {
    console.log(`First 3:`, data.pois.slice(0,3).map(p => p.name));
  }
}
testAMap().catch(console.error);
