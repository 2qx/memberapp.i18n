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
const VERSION = '3.5.1.9';
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
    if (event.request.url.startsWith(self.location.origin) && event.request.method == 'GET') {
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


// Register event listener for the 'push' event.
self.addEventListener('push', function(event) {
    event.waitUntil(
        // Retrieve a list of the clients of this service worker.
        self.clients.matchAll().then(function(clientList) {
            // Check if there's at least one focused client.
            var focused = clientList.some(function(client) {
                return client.focused;
            });

            var notificationMessage;
            if (focused) {
                notificationMessage = 'You\'re still here, thanks!';
            } else if (clientList.length > 0) {
                notificationMessage = 'You haven\'t closed the page, ' +
                    'click here to focus it!';
            } else {
                notificationMessage = 'You have closed the page, ' +
                    'click here to re-open it!';
            }

            return self.registration.showNotification('Memberapp', {
                body: notificationMessage,
            });
        })
    );
});

// Register event listener for the 'notificationclick' event.
self.addEventListener('notificationclick', function(event) {
    event.waitUntil(
        // Retrieve a list of the clients of this service worker.
        self.clients.matchAll().then(function(clientList) {
            // If there is at least one client, focus it.
            if (clientList.length > 0) {
                return clientList[0].focus();
            }

            // Otherwise, open a new page.
            return self.clients.openWindow('/#notifications?start=0&limit=25');
        })
    );
});