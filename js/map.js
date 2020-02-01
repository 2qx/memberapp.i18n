"use strict";

var map = null;
var popup;
var postpopup;
var markersDict = {};
var firstload = true;


function getAndPopulateMap(geohash, posttrxid) {

    geohash = san(geohash);
    posttrxid = san(posttrxid);

    if (map == null) {

        map = L.map('map', { attributionControl: false });

        //Use attribution control as a close button
        var att = L.control.attribution();
        att.setPrefix("");
        att.addAttribution(getMapCloseButtonHTML()).setPosition('topright').addTo(map);
        //Load locations onto map when bounds_changed event fires. Only want this to happen one time. 
        map.on('zoomend', loadLocationListFromServerAndPlaceOnMap);
        map.on('dragend', loadLocationListFromServerAndPlaceOnMap);

        //Set London location and open street map tiles
        if (!map.restoreView()) {
            map.setView([51.505, -0.09], 13);
        }
        var layer = L.tileLayer(mapTileProvider,
            {
                crossOrigin: true,
                edgeBufferTiles: 1, //turning this up floods the service and slows responses by 10X
            });

        layer.addTo(map);

        //Attribution
        var att2 = L.control.attribution();
        att2.addAttribution(getOSMattributionHTML()).setPosition('bottomright').addTo(map);

        //Popup for thread related to location
        //popup = L.popup({ autoPan: true, minWidth: 550, maxWidth: getWidth(), maxHeight: getHeight() });
        popup = L.popup({ autoPan: true });
        postpopup = L.popup({ autoPan: true, minWidth: 300 });
    }
    if (geohash == null || geohash == "") {
        //Try to zoom to current position
        setTimeout(function () { navigator.geolocation.getCurrentPosition(function (location) { map.setView([location.coords.latitude, location.coords.longitude], 13); }); }, 1000);
    } else {
        var zoomLocation = decodeGeoHash(geohash);
        zoomLocation = [zoomLocation.latitude[0], zoomLocation.longitude[0]];
        setTimeout(function () {
            if (posttrxid != null && posttrxid != "") {
                popup.txid = posttrxid;
            }

            if (posttrxid != null && posttrxid != "") {
                popup.setLatLng(zoomLocation).setContent(mapThreadLoadingHTML("")).openOn(map);
                getAndPopulateThread(posttrxid, posttrxid, 'mapthread');
            }

        }, 1000);
    }

    //post to map by clicking on it
    map.on('click', onMapClick);

    //map.on('moveend', onMapMove);
    map.on('moveend', function () {
        suspendPageReload = true;
        if (firstload && popup.txid != null) {
            location.href = "#map?geohash=" + encodeGeoHash(map.getCenter().lat, map.getCenter().lng) + "&post=" + popup.txid;
            firstload = false;
        }
        else if (popup.isOpen() && popup.txid != null) {
            location.href = "#map?geohash=" + encodeGeoHash(popup._latlng.lat, popup._latlng.lng) + "&post=" + popup.txid;
        } else {
            location.href = "#map?geohash=" + encodeGeoHash(map.getCenter().lat, map.getCenter().lng);
        }
        setTimeout(function () { suspendPageReload = false; }, 1000);
    });

    popup.on('close', function (e) {
        //This doesn't seem to fire.
        //Its purpose is to change the anchor link when the popup is closed
        console.log('map popup closed');
        popup.txid = null;
        map.moveend();
    });

}



function openOverlay(e) {
    var marker = e.sourceTarget;
    popup.setLatLng(e.latlng).setContent(mapThreadLoadingHTML(marker.previewHTML)).openOn(map);
    getAndPopulateThread(marker.roottxid, marker.txid, 'mapthread');
    popup.txid = marker.roottxid;
    popup.txidloc = e.latlng;
    suspendPageReload = true;
    location.href = "#map?geohash=" + encodeGeoHash(e.latlng.lat, e.latlng.lng) + "&post=" + popup.txid;
    setTimeout(function () { suspendPageReload = false; }, 1000);
    return;
}

function openPreview(e) {
    var marker = e.sourceTarget;
    marker.bindTooltip(marker.previewHTML).openTooltip();
    return;
}

function round_100m(x) {
    let precision = 0.001
    var y = +x + (precision === undefined ? 0.5 : precision / 2);
    return y - (y % (precision === undefined ? 1 : +precision));
}

function getMapBoundParams(mapBounds) {
    var ne = mapBounds.getNorthEast();
    var sw = mapBounds.getSouthWest();
    return "&north=" + round_100m(ne.lat)
        + "&east=" + round_100m(ne.lng)
        + "&south=" + round_100m(sw.lat)
        + "&west=" + round_100m(sw.lng);

}

function onMapClick(e) {

    var htmlContent = getMapPostHTML(e.latlng.lat, e.latlng.lng, (pubkey == ''));

    postpopup.setLatLng(e.latlng).setContent(htmlContent).openOn(map);
}


function loadLocationListFromServerAndPlaceOnMap(event) {

    var mapBounds = map.getBounds();
    var url = dropdowns.contentserver + '?action=map&address=' + pubkey + getMapBoundParams(mapBounds);
    fetchJSON(url).then(function (data) {
        for (var i = 0; i < data.length; i++) {
            var pageName = san(data[i].txid);
            var marker = markersDict[pageName];
            if (marker == null) {
                markersDict[pageName] = createMarker(data[i])
                cacheMapData(data);
            }
        }
    }, function (status) { //error detection....
        console.log('Attempting to resolve response from cache:' + status);
        var centerHash = encodeGeoHash(map.getCenter().lat, map.getCenter().lng);
        searchCache(centerHash).then(function (data) {
            var contents = "";
            for (var i = 0; i < data.length; i++) {
                var pageName = san(data[i].txid);
                var marker = markersDict[pageName];
                if (marker == null) {
                    markersDict[pageName] = createMarker(data[i])
                }
            }
        });
        updateStatus(status);
    });

}

function createMarker(m){
    var marker = L.marker([Number(m.lat), Number(m.lon)]).addTo(map);
    marker.txid = san(m.txid);
    marker.roottxid = san(m.roottxid);
    marker.previewHTML = ds(m.message);
    marker.on('click', openOverlay);
    marker.on('mouseover', openPreview);
    return marker;
}

function cacheMapData(data) {
    if (window.indexedDB) {
        assureDB();
        return dbs.get(DATABASE).then(db => new Promise((resolve, reject) => {
            var tx = db.transaction("messages", "readwrite");
            var objStore = tx.objectStore("messages");
            data.forEach(function (message) {
                resolve(objStore.add(message));
            });
          }));
    }
}



function searchCache(geohash) {
    return new Promise((resolve, reject) => {
        if (window.indexedDB) {
            assureDB();
            return dbs.get(DATABASE).then(db => new Promise((resolve, reject) => {
                var tx = db.transaction("messages");
                var objStore = tx.objectStore("messages");
                var index = objStore.index("geohash");
                var results = []
                index.openCursor(null, "nextunique").onsuccess = function (e) {
                    var cursor = e.target.result;
                    if (cursor) {
                        if(cursor.key.startsWith(geohash.substr(0, 2))){
                            request = objectStore.get(cursor.primaryKey);
                            request.onsuccess = function (evt) {
                              var obj = evt.target.result;
                              results.push(obj)
                            };
                        }
                        cursor.continue();
                    } else {
                        resolve(results)
                    }
                };
              }));
        } else {
            console.log("indexedDB not supported");
            resolve([])
        }
    });
}
