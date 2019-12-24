// sw.js

// A list of local resources we always want to be cached.
const PRECACHE_URLS = [
    'manifest.json',
    'css/article.css',
    'img/bch.png',
    'css/base.css',
    'locale/en.json',
    'js/leaflet/leaflet.js'
];


const API_URLS = new RegExp(
    '^(?:' +
    [
        "https:\/\/memberjs.org\/",
        "https:\/\/memberjs.org:8123\/",
        "https:\/\/memberjs.org:8124\/"
    ]
        .join("|") + ')$'
);

const VERSION = '3.1.0.9';
const RUNTIME = 'runtime-' + VERSION;
const INSTALL = 'install-' + VERSION;


self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(INSTALL).then((cache) => {
            return cache.addAll(PRECACHE_URLS);
        })
    );
});

self.addEventListener("activate", function (event) {
    console.log('service worker activated.');
    const currentCaches = [INSTALL, RUNTIME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return cacheNames.filter(cacheName => !currentCaches.includes(cacheName));
        }).then(cachesToDelete => {
            return Promise.all(cachesToDelete.map(cacheToDelete => {
                return caches.delete(cacheToDelete);
            }));
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', function (event) {
    // Skip cross-origin requests, like those for Google Analytics.
    if (event.request.url.startsWith(self.location.origin)) {
        event.respondWith(
            caches.match(event.request).then(cachedResponse => {
                if (cachedResponse) {
                    return cachedResponse;
                }
                return caches.open(RUNTIME).then(cache => {
                    return fetch(event.request).then(response => {
                        // Put a copy of the response in the runtime cache.
                        return cache.put(event.request, response.clone()).then(() => {
                            return response;
                        });
                    });
                });
            })
        );
    }
});

self.addEventListener('fetch', function (event) {
    if (event.request.url.match(API_URLS)) {
        // Only call event.respondWith() if this looks like a server request.
        // Because we don't call event.respondWith() for member API requests, they will not be
        // handled by the service worker, and the default network behavior will apply.
        event.respondWith(
            fetch(event.request).then(function (response) {
                if (!response.ok) {
                    // An HTTP error response code (40x, 50x) won't cause the fetch() promise to reject.
                    // We need to explicitly throw an exception to trigger the catch() clause.
                    throw Error('response status ' + response.status);
                }
                // If the response was okay, cache it and return
                return caches.open(RUNTIME).then(cache => {
                    return fetch(event.request).then(response => {
                        // Put a copy of the response in the runtime cache.
                        return cache.put(event.request, response.clone()).then(() => {
                            return response;
                        });
                    });
                });
            }).catch(function (error) {
                console.warn('Constructing a fallback response, ' +
                    'due to an error while fetching the real response:', error);
                return caches.open(RUNTIME).then(cache => {
                    // Put a copy of the response in the runtime cache.
                    return cache.get(event.request).then((fallbackResponse) => {
                        return new Response(JSON.stringify(fallbackResponse), {
                            headers: {'Content-Type': 'application/json'}
                        });
                    });
                });
            })
        );
    }
});