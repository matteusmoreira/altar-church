const STATIC_CACHE = "altar-static-v3";
const VOLUNTEER_CACHE_PREFIX = "altar-volunteer-readonly-v2-";
const STATIC_ASSETS = [
  "/offline.html",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/brand/altar/altar-church_simbolo_escuro_v1.png",
  "/manifest.webmanifest",
];
let activeUserId = null;

const volunteerCacheName = () =>
  activeUserId ? `${VOLUNTEER_CACHE_PREFIX}${activeUserId}` : null;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key !== STATIC_CACHE && !key.startsWith(VOLUNTEER_CACHE_PREFIX),
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SET_USER") activeUserId = event.data.userId || null;
  if (event.data?.type === "CLEAR_USER_DATA") {
    activeUserId = null;
    event.waitUntil(
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key.startsWith(VOLUNTEER_CACHE_PREFIX))
              .map((key) => caches.delete(key)),
          ),
        ),
    );
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/brand/altar/altar-church_simbolo_escuro_v1.png"
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            void caches
              .open(STATIC_CACHE)
              .then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
    return;
  }
  if (
    url.pathname === "/voluntariado" ||
    url.pathname === "/api/v1/volunteers/portal"
  ) {
    const privateCache = volunteerCacheName();
    if (!privateCache) {
      event.respondWith(
        fetch(request).catch(() => caches.match("/offline.html")),
      );
      return;
    }
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches
              .open(privateCache)
              .then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(
          async () =>
            (await caches
              .open(privateCache)
              .then((cache) => cache.match(request))) ||
            (await caches.match("/offline.html")),
        ),
    );
    return;
  }
  if (request.mode === "navigate")
    event.respondWith(
      fetch(request).catch(() => caches.match("/offline.html")),
    );
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data?.json() || {}; }
  catch { data = { body: event.data?.text() || "Nova atualização" }; }
  event.waitUntil(
    self.registration.showNotification(data.title || "Altar Church", {
      body: data.body || "Nova atualização",
      icon: "/brand/altar/altar-church_simbolo_escuro_v1.png",
      // Android masks the alpha channel: use the transparent mark, never the opaque app tile.
      badge: "/brand/altar/altar-church_simbolo_escuro_v1.png",
      data: { url: data.url || "/voluntariado" },
      tag: data.tag || (data.assignmentId ? `assignment-${data.assignmentId}` : undefined),
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/voluntariado";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const opened = clients.find(
          (client) => client.url === new URL(target, self.location.origin).href,
        );
        return opened ? opened.focus() : self.clients.openWindow(target);
      }),
  );
});
