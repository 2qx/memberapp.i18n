// sw.js
importScripts('js/lib/geohash.js');

// A list of local resources we always want to be cached.
const PRECACHE_URLS = [
    'pwa/manifest.webmanifest',
    'css/article.css',
    'css/base.css',
    'css/none.css',
    'img/bch.png',
    'js/leaflet/leaflet.js',
    'index.html',
    'locale/en.json'
];

//If updating version here, also update version in login.js
const version = '3.7.4';

const RUNTIME = 'runtime-' + version;
const INSTALL = 'install-' + version;
const API = 'api-' + version;
const MAP_TILES = 'offline-map-tiles';

const DATABASE = 'messagesDB';
var dbs = new Map(); // name --> Promise<IDBDatabase>

if (!dbs.has(DATABASE)) {
    const version_int = Number(version.replace(/\D/g, ''));
    dbs.set(DATABASE, new Promise((resolve, reject) => {
        var request = indexedDB.open(DATABASE, version_int);
        request.onupgradeneeded = function (event) {
            var objStore = event.target.result.createObjectStore("messages", { keyPath: "txid", autoIncrement: false });
            objStore.createIndex("geohash", "geohash", { unique: false });
            objStore.createIndex("firstseen", "firstseen", { unique: false });
            objStore.createIndex("roottxid", "roottxid", { unique: false });
            objStore.createIndex("nametxid", "nametxid", { unique: false });
        };
        request.onerror = e => reject(request.error);
        request.onsuccess = e => resolve(request.result);
    }));
}


self.addEventListener('install', (event) => {
    self.skipWaiting()
    event.waitUntil(
        caches.open(INSTALL).then((cache) => {
            return cache.addAll(PRECACHE_URLS);
        })
    );
});

self.addEventListener("activate", function (event) {

    //console.log('[ServiceWorker] Activated.');
    const currentCaches = [INSTALL, RUNTIME, MAP_TILES, API];

    self.clients.matchAll({
        includeUncontrolled: true
    }).then(function (clientList) {
        var urls = clientList.map(function (client) {
            return client.url;
        });
        //console.log('[ServiceWorker] Matching clients:', urls.join(', '));
    });
    event.waitUntil(
        caches.keys().then(function (cacheNames) {
            return Promise.all(
                cacheNames.map(function (cacheName) {
                    if (cacheName !== !currentCaches.includes(cacheName)) {
                        //console.log('[ServiceWorker] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(function () {
            //console.log('[ServiceWorker] Claiming clients for version: ' + version);
            return self.clients.claim();
        })
    );

});


function alwaysReturnCached(event, cacheName) {
    event.respondWith(
        caches.match(event.request).then(function (cachedResponse) {
            if (cachedResponse) {
                return cachedResponse;
            } else {
                return fetch(event.request).then(function (response) {
                    var networkResponse = response.clone()
                    caches.open(cacheName).then(function (cache) {
                        cache.put(event.request, networkResponse);
                    });
                    return response;
                });
            }
        })
    );
}

function networkThenCache(event, cacheName) {
    return new Promise(function (resolve, reject) {
        caches.open(cacheName).then(function (cache) {
            return fetch(event.request).then(function (response) {
                var networkResponse = response.clone()
                cache.put(event.request, networkResponse);
                resolve(response);
            }).catch(function (error) {
                return caches.match(event.request).then(function (cachedResponse) {
                    if (cachedResponse) {
                        var init = { "status": 203, "statusText": "Not authoritative, viewing offline cache version" };
                        resolve(new Response(cachedResponse.body, init));
                    } else {
                        var properties = { "status": 503, "statusText": "Service unavailable, this resource was not cached" };
                        reject(new Response("", properties));
                    }
                })
            });
        })
    });
}

self.addEventListener('fetch', async function (event) {

    // handle request to the self
    if (event.request.url.startsWith(self.location.origin)) {
        if (event.request.url.endsWith('/version')) {
            event.respondWith(new Response(version, {
                headers: {
                    'content-type': 'text/plain'
                }
            }));
        }
        else {
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
    }
    // Handle map tiles
    else if (event.request.url.startsWith('https:\/\/tile.openstreetmap.org\/')) {
        return alwaysReturnCached(event, MAP_TILES)
    }
    // Handle API requests
    else if (event.request.url.startsWith('https:\/\/memberjs.org:8123\/')) {
        // Will return a fresh response from the API or fallback a matching query
        event.respondWith(
            networkThenCache(event, API).then(response => {
                return response
            }).catch(error => {
                return buildCachedApiResponse(event)
            })
        );
    }
    // ticker requests
    else if (event.request.url == 'https:\/\/api.coinmarketcap.com\/v1\/ticker\/bitcoin-cash\/') {
        return await networkThenCache(event, API);
    }
});

self.addEventListener('install', (event) => {
    self.skipWaiting();
});


function buildCachedApiResponse(event) {
    if (event.request.method !== 'GET') {
        var init = { "status": 503, "statusText": "Service Unavailable, or you are offline?" };
        return new Response("", init);
    };
    var url = new URL(event.request.url);
    var query = new Map(url.search.substring(1).split('&').map(kv => kv.split('=')));
    var action = query.get('action');
    switch (action) {
        case 'thread':
            return offlineApiThread(query)
        case 'map':
            return offlineApiMap(query)
        default:
            return new Response("",
                {
                    "status": 503,
                    "statusText": "Service unavailable, no offline cache, and a service for this type of request is not implemented locally"
                }
            );
    }
}

function offlineApiThread(query) {
    var roottxid = query.get('txid')
    return dbs.get(DATABASE).then(db => new Promise((resolve, reject) => {
        var results = []
        var tx = db.transaction("messages");
        var objectStore = tx.objectStore("messages");
        var index = objectStore.index("roottxid");
        range = IDBKeyRange.only(roottxid)
        index.openCursor(range).onsuccess = function (e) {
            var cursor = e.target.result;
            if (cursor) {
                var request = objectStore.get(cursor.primaryKey);
                request.onsuccess = function (evt) {
                    JSON.stringify(evt.target.result)
                    results.push(evt.target.result);
                };
                cursor.continue();
            } else {
                resolve(
                    new Response(
                        JSON.stringify(results),
                        {
                            headers: { 'Content-Type': 'text/application/json' },
                            status: 203,
                            statusText: "Not authoritative, offline response"
                        }
                    )
                );
            }
        };
    })).catch(function (e) {
        reject(
            new Response(
                JSON.stringify(e),
                {
                    headers: { 'Content-Type': 'text/application/json' },
                    status: 503,
                    statusText: "An Error occured getting the thread"
                }
            )
        );
    });
}

function cmpStartsWith(strA, strB) {
    var max = strA.length <= strB.length ? strA.length : strB.length;
    for (i = 0; i < max; i++) {
        if (strA[i] != strB[i]) {
            return i
        }
    }
    return max
}

function offlineApiMap(query) {
    var nw = encodeGeoHash(query.get("north"), query.get("west"), 6)
        , se = encodeGeoHash(query.get("south"), query.get("east"), 6);
    var similerUpTo = cmpStartsWith(nw, se)
    nw = nw.substring(0, similerUpTo + 1);
    se = se.substring(0, similerUpTo + 1);
    return dbs.get(DATABASE).then(db => new Promise((resolve, reject) => {
        var tx = db.transaction("messages");
        var objectStore = tx.objectStore("messages");
        var index = objectStore.index("geohash");
        var results = []
        index.openCursor(null, "nextunique").onsuccess = function (e) {
            var cursor = e.target.result;
            var i = 0;
            if (cursor) {
                if ((cursor.key.startsWith(nw) || cursor.key.startsWith(se)) && i < 100) {
                    var request = objectStore.get(cursor.primaryKey);
                    request.onsuccess = function (evt) {
                        results.push(evt.target.result);
                        i++;
                    };
                }
                cursor.continue();
            } else {
                resolve(
                    new Response(
                        JSON.stringify(results),
                        {
                            headers: { 'Content-Type': 'text/application/json' },
                            status: 203,
                            statusText: "Not authoritative, offline response"
                        }
                    )
                );
            }
        };
    })).catch(function (e) {
        reject(
            new Response(
                JSON.stringify(e),
                {
                    headers: { 'Content-Type': 'text/application/json' },
                    status: 503,
                    statusText: "An Error occured getting map data"
                }
            )
        );
    });
}