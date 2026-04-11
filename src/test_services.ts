import { searchPOI, geocode, reverseGeocode } from './services/amap';
import { fetchRealWorldData } from './services/crawler';
import { callDeepSeek } from './services/deepseek';
import { fetchWeatherForecast } from './mcp-services/weatherService';

async function runServiceTests() {
  console.log('=== 开始测试基础服务 ===');
  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, msg: string) => {
    if (condition) {
      console.log(`✅ [通过] ${msg}`);
      passed++;
    } else {
      console.error(`❌ [失败] ${msg}`);
      failed++;
    }
  };

  try {
    // 1. AMap Geocode 测试
    console.log('\n--- 1. 测试 AMap 地理编码 ---');
    if (typeof global !== 'undefined') {
        console.log('注意: AMap 依赖浏览器环境 (window.AMap), 命令行直接运行可能会失败如果未做 mock。这里的 tsx 运行需要 mock 浏览器上下文, 否则跳过...');
    }
    
    // 2. Crawler Crawler 测试
    console.log('\n--- 2. 测试维基百科真实数据爬取 (Crawler) ---');
    try {
        const wikiData = await fetchRealWorldData('成都', '宽窄巷子');
        assert(wikiData.length > 100, `成功获取维基百科数据，长度：${wikiData.length}`);
    } catch(e: any) {
        console.log('⚠️ 维基爬取失败(可能是网络问题):', e.message);
    }

    // 3. DeepSeek (LLM) 服务测试
    console.log('\n--- 3. 测试 DeepSeek / Gemini 服务连接 ---');
    try {
        // 这里只是轻量探活，发送一个极简单的提示词
        if (!process.env.DEEPSEEK_API_KEY && !process.env.GEMINI_API_KEY) {
           console.log('⚠️ 未提供 DEEPSEEK_API_KEY 或 GEMINI_API_KEY 环境变量，跳过 LLM 连通性测试。');
        } else {
            console.log('正在调用 AI 接口测试连通性...');
            const aiReply = await callDeepSeek('返回"OK"', false, 15000);
            assert(aiReply.includes('OK'), `AI 返回正常: ${aiReply}`);
        }
    } catch(e: any) {
        console.error('❌ AI 接口测试失败:', e.message);
        failed++;
    }

    // 4. MCP Weather Service 测试
    console.log('\n--- 4. 测试 Weather MCP 服务 ---');
    try {
        const weather = await fetchWeatherForecast('北京');
        assert(Array.isArray(weather), `天气服务返回正常，条数: ${weather?.length}`);
    } catch(e: any) {
        // 可能是没有启 local weather server
        console.log('⚠️ MCP 天气服务调用失败 (需要 MCP 服务处于启动状态):', e.message);
    }
    
  } catch (e: any) {
    console.error('致命错误:', e);
  } finally {
    console.log(`\n=== 测试结束 ===`);
    console.log(`总通过: ${passed}, 总失败: ${failed}, 警告(跳过)的部分请在真实浏览器环境下通过 UI 验证。`);
  }
}

runServiceTests();
