// sw.js

// A list of local resources we always want to be cached.

const PRECACHE_URLS = [
  'pwa/manifest.webmanifest',
  'css/article.css',
  'css/base.css',
  'img/bch.png',
  'js/leaflet/leaflet.js',
  'locale/en.json',
  'index.html'
];
const version = '3.5.5.9';
const RUNTIME = 'runtime-' + version;
const INSTALL = 'install-' + version;


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
  const currentCaches = [INSTALL, RUNTIME];

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
      //console.log('[ServiceWorker] Claiming clients for version', version);
      return self.clients.claim();
    })
  );
});

function alwaysReturnCached(event, cacheName) {
  event.respondWith(
    caches.match(event.request).then(function (cachedResponse) {
      return cachedResponse || fetch(event.request).then(function (response) {
        var cacheResponse = response.clone();
        caches.open(cacheName).then(function (cache) {
          cache.put(event.request, cacheResponse);
        });
        return response;
      });
    })
  );
}

function cacheResponseOrFallback(event, cacheName){
  event.respondWith(
    fetch(event.request).then(function(response) {
      if (!response.ok) {
        // An HTTP error response code (40x, 50x) won't cause the fetch() promise to reject.
        // We need to explicitly throw an exception to trigger the catch() clause.
        throw Error('response status ' + response.status);
      }
      var cacheResponse = response.clone();
      caches.open(cacheName).then(function (cache) {
        cache.put(event.request, cacheResponse);
      });
      return response;
    }).catch(function(error) {
      console.warn('Error fetching ' + event.request.url +' :', error);
      // return a stale version
      caches.match(event.request).then(function (cachedResponse) {
        return cachedResponse 
      })
    })
  );
}

self.addEventListener('fetch', function (event) {
  if (event.request.url.includes('/version')) {
    event.respondWith(
      new Response(
        version,
        {
          headers: {
            'content-type': 'text/plain'
          }
        }
      )
    );
  }
  else if (event.request.url.startsWith('https:\/\/api.maptiler.com')) {
    return alwaysReturnCached(event, 'mapbox-tiles')
  }
  else if (event.request.url.startsWith(self.location.origin)) {
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


self.addEventListener('install', (event) => {
  self.skipWaiting();
});

