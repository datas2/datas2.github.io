const CACHE_VERSION = "v1";
const CACHE_NAME = `basic-english-cache-${CACHE_VERSION}`;

// List here the essential files for the app to work offline.
// Adjust the paths according to your repository structure.
const PRECACHE_URLS = [
	"/basic-english/", // root (can be /basic-english/ if in subpath)
	"/basic-english/app.js", // main JS
	"/basic-english/index.html", // main page
	"/basic-english/manifest.json", // manifest
	"/basic-english/style.css", // main CSS
	"/basic-english/words.json", // word data
	// add other important assets (images, fonts, etc.)
];

// Installation: pre-cache essential assets
self.addEventListener("install", (event) => {
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then((cache) => cache.addAll(PRECACHE_URLS))
			.then(() => self.skipWaiting()),
	);
});

// Activation: clean up old caches
self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys
						.filter(
							(key) =>
								key.startsWith("basic-english-cache-") &&
								key !== CACHE_NAME,
						)
						.map((key) => caches.delete(key)),
				),
			)
			.then(() => self.clients.claim()),
	);
});

// Cache strategy: "cache-first, fallback to network"
// 1. Try to respond from the cache.
// 2. If not available, fetch from the network and cache it for future use.
self.addEventListener("fetch", (event) => {
	const { request } = event;

	// Optional: ignore requests from other domains or non-GET methods
	if (
		request.method !== "GET" ||
		!request.url.startsWith(self.location.origin)
	) {
		return;
	}

	event.respondWith(
		caches.match(request).then((cachedResponse) => {
			if (cachedResponse) {
				return cachedResponse;
			}

			return fetch(request)
				.then((networkResponse) => {
					// If the response is not valid, return it directly
					if (
						!networkResponse ||
						networkResponse.status !== 200 ||
						networkResponse.type !== "basic"
					) {
						return networkResponse;
					}

					// Clone the response before caching it
					const responseToCache = networkResponse.clone();

					caches.open(CACHE_NAME).then((cache) => {
						cache.put(request, responseToCache);
					});

					return networkResponse;
				})
				.catch(() => {
					// Here you can return a custom offline page if you want
					// return caches.match('/offline.html');
					return new Response(
						"You are offline and this resource is not cached.",
						{
							status: 503,
							headers: {
								"Content-Type": "text/plain; charset=utf-8",
							},
						},
					);
				});
		}),
	);
});
