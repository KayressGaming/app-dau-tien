const CACHE_NAME = 'to1-cache-v1'; // Đổi tên v2, v3... ở đây mỗi khi bạn muốn ép người dùng cập nhật lớn
const urlsToCache = [
  './',
  './index.html',
  './script.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});

// Lắng nghe lệnh từ file HTML để áp dụng bản cập nhật mới
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});