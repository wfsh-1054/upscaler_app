const CACHE_NAME = 'upscaler-v4'; // 升級為 v4，強制更新 HTML

// 這裡列出的網址必須與 HTML 中引用的完全一致
const ASSETS = [
  './', 
  './upscaler_app.html', 
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@latest/dist/tf.min.js',
  'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500;700&display=swap',
  'https://unpkg.com/lucide@latest',
  'https://cdn.jsdelivr.net/npm/upscaler@latest/+esm',
  'https://cdn.jsdelivr.net/npm/@upscalerjs/default-model@latest/+esm'
];

self.addEventListener('install', (event) => {
  self.skipWaiting(); // 強制讓新的 SW 立刻接手
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
         ASSETS.map(url => cache.add(url).catch(err => console.warn('Failed to cache:', url, err)))
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          // 清除所有非 v4 的舊快取
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

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // [關鍵] 忽略 blob: 和 data: 協議，防止 iOS Safari 崩潰或載入失敗
  if (url.protocol === 'data:' || url.protocol === 'blob:') return;
  
  // 只處理 HTTP/HTTPS 的 GET 請求
  if (!url.protocol.startsWith('http') || event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // 1. 如果有快取，直接回傳
      if (cachedResponse) return cachedResponse;

      // 2. 沒快取則發送請求
      return fetch(event.request).then((networkResponse) => {
         // 確保回應有效
         if(!networkResponse || networkResponse.status !== 200 || (networkResponse.type !== 'basic' && networkResponse.type !== 'cors')) {
             return networkResponse;
         }
         
         // 3. 動態快取新資源 (如模型權重檔)
         const responseToCache = networkResponse.clone();
         caches.open(CACHE_NAME).then((cache) => {
             cache.put(event.request, responseToCache);
         });
         
         return networkResponse;
      }).catch((error) => console.error('Fetch failed:', error));
    })
  );
});
