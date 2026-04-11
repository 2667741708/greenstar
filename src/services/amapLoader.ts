// 极简静态挂载探测器：由于 @amap/amap-jsapi-loader (动态创建 script 标签) 
// 在本地某些代理环境（如 Surge/Clash）下容易触发 TCP RST / ERR_CONNECTION_CLOSED 拦截，
// 我们回退到在 index.html 头部显式阻塞式注入 JS API 的方案，但是通过 Promise 封装保护其他模块的异步按序加载需求。

let amapPromise: Promise<any> | null = null;

export const loadAMap = (): Promise<any> => {
  if (amapPromise) {
    return amapPromise;
  }

  amapPromise = new Promise((resolve, reject) => {
    // 轮询等待 index.html 中静态加载的 window.AMap 就绪
    let attempts = 0;
    const checkInterval = setInterval(() => {
      if ((window as any).AMap) {
        clearInterval(checkInterval);
        resolve((window as any).AMap);
      } else {
        attempts++;
        if (attempts > 100) { // 最多等待 10 秒
          clearInterval(checkInterval);
          reject(new Error("本地静态高德地图 JS API 加载超时"));
        }
      }
    }, 100);
  });

  return amapPromise;
};
