// Service Worker: cache vỏ giao diện + trang offline. Dữ liệu Supabase/API KHÔNG bao giờ được cache
// (tránh hiển thị ca/lương cũ). Đổi VERSION mỗi lần muốn ép trình duyệt tải lại cache.
const VERSION = "v1";
const SHELL = `shell-${VERSION}`;
const PRECACHE = ["/offline.html", "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  // Xoá cache của phiên bản cũ
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return; // bỏ qua Supabase, API xuất Excel...

  // Điều hướng trang: ưu tiên mạng, mất mạng thì hiện trang offline
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
    return;
  }
  // File tĩnh (JS/CSS/ảnh/font): cache-first, tải mới lưu thêm vào cache
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone(); caches.open(SHELL).then((c) => c.put(req, copy)); return res;
    })));
  }
});
