// Stamped with the build id (version + short commit) at build time by
// scripts/stamp-sw.mjs (npm postbuild) so every deploy gets a fresh cache and the
// activate handler purges the old one. The literal placeholder only survives in
// local dev, where the worker doesn't cache anyway (http, not https).
const cacheName = "__BUILD_ID__";

const deleteCache = async (key) => {
  await caches.delete(key);
};

const deleteOldCaches = async () => {
  const cacheKeepList = [cacheName];
  const keyList = await caches.keys();
  const cachesToDelete = keyList.filter((key) => !cacheKeepList.includes(key));
  await Promise.all(cachesToDelete.map(deleteCache));
};

self.addEventListener("install", () => {
  // Activate this worker as soon as it finishes installing instead of waiting
  // for all tabs running the previous worker to close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await deleteOldCaches();
      // Take control of already-open pages so the new version applies on reload.
      await self.clients.claim();
    })(),
  );
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

// Model-weight downloads bypass the build-stamped cache: the engine verifies
// and stores them itself in the persistent "transformers-cache" bucket
// (client/src/app/llm/engine.ts). Caching them here too would double ~800 MB
// of storage and force a re-download every release when the activate handler
// purges this cache. huggingface.co redirects weight files to its LFS/xet
// CDNs, so match by suffix across those hosts.
const isModelWeightHost = (host) =>
  host === "huggingface.co" ||
  host.endsWith(".huggingface.co") ||
  host === "hf.co" ||
  host.endsWith(".hf.co");

self.addEventListener("fetch", (event) => {
  if (!event.request.url.startsWith("https:")) {
    return;
  }
  if (isModelWeightHost(new URL(event.request.url).host)) {
    return;
  }
  event.respondWith(cacheFirst(event.request, event));
});
