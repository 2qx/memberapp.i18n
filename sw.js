// sw.js

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
const version = '3.5.5.9';
const RUNTIME = 'runtime-' + version;
const INSTALL = 'install-' + version;
const API = 'api-' + version;
const MAP_TILES = 'offline-map-tiles';

const DATABASE = 'messagesDB'

var dbs = new Map(); // name --> Promise<IDBDatabase>

function assureDB() {
  var version_int = Number(version.replace(/\D/g,''));
  if (!dbs.has(DATABASE)) {
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
            resolve(cachedResponse);
          } else {
            var properties = { "status": 503, "statusText": "Service unavailable, no offline cache" };
            reject(new Response("", properties));
          }
        })
      });
    })
  });
}

self.addEventListener('fetch', async function (event) {

  // handle request to the self domain
  if (event.request.url.startsWith(self.location.origin)) {
    if (event.request.url.endsWith('/version')) {
      console.log(event.request.url.pathname);
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
        console.log(error)
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
  if (event.request.method !== 'GET'){
    var init = { "status": 503, "statusText": "Service Unavailable, or you are offline?" };
    return new Response("", init);
  };
  var url = new URL(event.request.url);
  var query = new Map(url.search.substring(1).split('&').map(kv => kv.split('=')));
  var action = query.get('action');
  if (action == 'thread') {
    return threadFromCache(event, query.get('txid'))
  } else {
    var init = { "status": 503, "statusText": "Service unavailable, no offline cache, this action is not supported" };
    return new Response("", init);
  }
}

function threadFromCache(event, txid) {
  assureDB();

  return dbs.get('messageDB').then(db => new Promise((resolve, reject) => {
    var tx = db.transaction("messages");
    var request = tx.objectStore("messages").get(txid);
    request.onerror = e => reject(request.error);
    request.onsuccess = e => {
      if (!(request.result == undefined)) {
        properties  = {}
        properties.headers = { 'Content-Type': 'text/application/json' };
        properties.status = 203;
        properties.statusText = "This response was built from your local datastore";
        resolve(new Response(JSON.stringify([request.result]), properties));
      } else {
        var init = { "status": 503, "statusText": "Service unavailable, no offline cache, not in local db" };
        reject(new Response("", init));
      }
    };
  }));
}