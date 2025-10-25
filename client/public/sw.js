const cacheName = "v2";

const deleteCache = async (key) => {
  await caches.delete(key);
};

const deleteOldCaches = async () => {
  const cacheKeepList = [cacheName];
  const keyList = await caches.keys();
  const cachesToDelete = keyList.filter((key) => !cacheKeepList.includes(key));
  await Promise.all(cachesToDelete.map(deleteCache));
};

self.addEventListener("activate", (event) => {
  event.waitUntil(deleteOldCaches());
});

const putInCache = async (request, response) => {
  const cache = await caches.open(cacheName);
  await cache.put(request, response);
};

const cacheFirst = async (request, event) => {
  const responseFromCache = await caches.match(request);
  if (responseFromCache) {
    return responseFromCache;
  }
  const responseFromNetwork = await fetch(request);
  event.waitUntil(putInCache(request, responseFromNetwork.clone()));
  return responseFromNetwork;
};

const allowList = ["", "json", "plain"];

self.addEventListener("fetch", (event) => {
  if (allowList.includes(event.request.destination)) {
    const url = new URL(event.request.url);
    if (url.pathname.startsWith("/data") && url.pathname.endsWith(".json")) {
      event.respondWith(cacheFirst(event.request, event));
    }
    if (
      url.pathname.startsWith("/r3") &&
      url.pathname.endsWith(".txt") &&
      url.searchParams.has("_rsc")
    ) {
      event.respondWith(cacheFirst(event.request, event));
    }
  }
});
