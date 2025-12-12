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
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // 1. 如果有快取，直接回傳
      if (cachedResponse) {
        return cachedResponse;
      }

      // 2. 如果沒快取，發送網路請求
      return fetch(event.request).then((networkResponse) => {
         // 過濾條件：只快取成功的 GET 請求
         if(!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic' && networkResponse.type !== 'cors') {
             return networkResponse;
         }

         // 動態快取：將新抓到的資源 (如模型權重檔 chunks) 存入快取
         const responseToCache = networkResponse.clone();
         caches.open(CACHE_NAME).then((cache) => {
             cache.put(event.request, responseToCache);
         });

         return networkResponse;
      }).catch(() => {
        // 3. 離線且無快取時的處理 (可選：回傳一個離線圖示或頁面)
        // 目前不回傳特定內容，讓瀏覽器處理
      });
    })
  );
});
