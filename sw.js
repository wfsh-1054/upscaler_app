const CACHE_NAME = 'upscaler-v1';

// 這裡列出的網址必須與 HTML 中引用的完全一致，才能確保被快取
const ASSETS = [
  './', 
  './upscaler_app.html', // 建議確保您的網頁檔名也是這個，或加入 index.html
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@latest/dist/tf.min.js',
  'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500;700&display=swap',
  'https://unpkg.com/lucide@latest',
  // 注意：ESM 模組的快取比較特殊，我們在 fetch 事件中也會動態快取
  'https://cdn.jsdelivr.net/npm/upscaler@latest/+esm',
  'https://cdn.jsdelivr.net/npm/@upscalerjs/default-model@latest/+esm'
];

// 安裝階段：預先快取核心資源
self.addEventListener('install', (event) => {
  self.skipWaiting(); // 強制讓新的 SW 立刻接手
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // 使用 Promise.allSettled 避免單一資源失敗導致整個安裝失敗
      return Promise.allSettled(
         ASSETS.map(url => cache.add(url).catch(err => console.warn('Failed to cache:', url, err)))
      );
    })
  );
});

// 啟用階段：清除舊版快取
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Clearing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// 攔截請求：優先使用快取，無快取則網路請求 (Stale-while-revalidate / Cache First 混合策略)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // [重要修正] 忽略 blob: 和 data: 協議
  // iOS/Safari 對於 Service Worker 嘗試處理 blob URL 非常敏感，必須直接放行
  if (url.protocol === 'data:' || url.protocol === 'blob:') {
    return;
  }

  // [重要修正] 只處理 HTTP/HTTPS 的 GET 請求
  if (!url.protocol.startsWith('http') || event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // 1. 如果有快取，直接回傳
      if (cachedResponse) {
        return cachedResponse;
      }

      // 2. 如果沒快取，發送網路請求
      return fetch(event.request).then((networkResponse) => {
         // 過濾條件：只快取成功的 GET 請求
         // 確保回應有效且是基礎類型或是 CORS 允許的
         if(!networkResponse || networkResponse.status !== 200 || (networkResponse.type !== 'basic' && networkResponse.type !== 'cors')) {
             return networkResponse;
         }

         // 動態快取：將新抓到的資源 (如模型權重檔 chunks) 存入快取
         const responseToCache = networkResponse.clone();
         caches.open(CACHE_NAME).then((cache) => {
             cache.put(event.request, responseToCache);
         });

         return networkResponse;
      }).catch((error) => {
        console.error('Fetch failed:', error);
        // 3. 離線且無快取時的處理
        // 這裡可以選擇回傳一個 fallback 圖片或頁面，目前保持原樣以免干擾 API 錯誤處理
      });
    })
  );
});
