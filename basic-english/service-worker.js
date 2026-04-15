const CACHE_VERSION = "v1";
const CACHE_NAME = `basic-english-cache-${CACHE_VERSION}`;

// Liste aqui os arquivos essenciais para o app funcionar offline.
// Ajuste os paths conforme a estrutura do seu repositório.
const PRECACHE_URLS = [
	"/basic-english/", // raiz (pode ser /basic-english/ se estiver em subpath)
	"/basic-english/app.js", // JS principal
	"/basic-english/index.html", // página principal
	"/basic-english/manifest.json", // manifest
	"/basic-english/styles.css", // CSS principal
	"/basic-english/words.json", // dados de palavras
	// adicione outros assets importantes (imagens, fontes, etc.)
];

// Instalação: pré-cache dos assets essenciais
self.addEventListener("install", (event) => {
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then((cache) => cache.addAll(PRECACHE_URLS))
			.then(() => self.skipWaiting()),
	);
});

// Ativação: limpa caches antigos
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

// Estratégia de cache: "cache-first, fallback to network"
// 1. Tenta responder do cache.
// 2. Se não tiver, busca na rede e salva no cache para uso futuro.
self.addEventListener("fetch", (event) => {
	const { request } = event;

	// Opcional: ignore chamadas de outros domínios ou métodos não-GET
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
					// Se a resposta não for válida, retorna direto
					if (
						!networkResponse ||
						networkResponse.status !== 200 ||
						networkResponse.type !== "basic"
					) {
						return networkResponse;
					}

					// Clona a resposta antes de colocar em cache
					const responseToCache = networkResponse.clone();

					caches.open(CACHE_NAME).then((cache) => {
						cache.put(request, responseToCache);
					});

					return networkResponse;
				})
				.catch(() => {
					// Aqui você pode retornar uma página offline customizada se quiser
					// return caches.match('/offline.html');
					return new Response(
						"Você está offline e este recurso não está em cache.",
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
