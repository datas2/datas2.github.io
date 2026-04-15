const CACHE_VERSION = "v1";
const CACHE_NAME = `basic-english-cache-${CACHE_VERSION}`;

// List here the essential files for the app to work offline.
// Adjust the paths according to your repository structure.
const PRECACHE_URLS = [
	"/basic-english/", // root
	"/basic-english/app.js",
	"/basic-english/index.html",
	"/basic-english/manifest.json",
	"/basic-english/style.css",
	"/basic-english/words.json",
	"/basic-english/offline.html", // offline page
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
self.addEventListener("fetch", (event) => {
	const { request } = event;

	// Ignore non-GET or cross-origin requests
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
					if (
						!networkResponse ||
						networkResponse.status !== 200 ||
						networkResponse.type !== "basic"
					) {
						return networkResponse;
					}

					const responseToCache = networkResponse.clone();

					caches.open(CACHE_NAME).then((cache) => {
						cache.put(request, responseToCache);
					});

					return networkResponse;
				})
				.catch(() =>
					// On failure (offline and not cached), show offline page
					caches
						.match("/basic-english/offline.html")
						.then((offline) => {
							if (offline) return offline;

							return new Response(
								"You are offline and this resource is not cached.",
								{
									status: 503,
									headers: {
										"Content-Type":
											"text/plain; charset=utf-8",
									},
								},
							);
						}),
				);
		}),
	);
});
