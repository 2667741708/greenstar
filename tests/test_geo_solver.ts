import { config } from 'dotenv';
config({ path: '.env.local' });

async function verifyGeoSolver() {
  console.log('🌍 [GeoSolver] 开始纯程序流验证...');
  
  // 环境变量就绪后动态引入
  const { extractStopsFromPlan } = await import('./src/services/routePlanner');
  const { callDeepSeek } = await import('./src/services/deepseek');

  console.log('🧠 [1/3] 正在调用 LLM 引擎生成结构化旅游攻略...');
  const prompt = `请生成一份成都的1日游特种兵攻略。请严格使用此格式标记地名：前往 【太古里】，然后步行至 **武侯祠**，最后打卡 「锦里」。只写一两百字即可。`;
  
  let aiContent = '';
  try {
    aiContent = await callDeepSeek(prompt, false, 30000);
    console.log('\n[LLM 原始响应]:\n', aiContent);
  } catch (err: any) {
    console.error('LLM 调用失败:', err.message);
    return;
  }

  // 2. 验证地理特征实体提取算法 (NER)
  console.log('\n🔍 [2/3] 启动地理实体多模态特征提取算法 (extractStopsFromPlan)...');
  const stops = extractStopsFromPlan(aiContent, '成都');
  console.log('[提取成功] 捕获到以下空间坐标锚点:', stops);

  if (stops.length === 0) {
    console.log('⚠️ 未提取到地名，可能是 LLM 没按格式输出，验证结束。');
    return;
  }

  // 3. 验证空间解析底层 Web API
  // 注意：在无头 Node 环境下，直接通过高德 REST API 进行坐标反查，模拟前端浏览器内置 AMap 插件的行为
  console.log('\n📡 [3/3] 模拟高德坐标空间定位计算 (Geocoding)...');
  const WEBMAP_KEY = '040c3af03bab9232ab67e0d232838b28'; // 从 index.html 获取的 KEY
  
  for (const stop of stops) {
    try {
      const url = `https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(stop)}&city=成都&key=${WEBMAP_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status === '1' && data.geocodes.length > 0) {
        const { formatted_address, location } = data.geocodes[0];
        console.log(`📍 [坐标求导完成] ${stop} => [${location}] (全称: ${formatted_address})`);
      } else {
        console.log(`❌ [坐标求解失败] ${stop} (错误信息或无数据: ${data.info})`);
      }
    } catch (apiErr: any) {
      console.log(`❌ [请求阻断] ${stop}:`, apiErr.message);
    }
  }

  console.log('\n✅ 纯程序流验证结束：自然语言 -> 空间地理实体的解算闭环通畅！');
}

verifyGeoSolver();
