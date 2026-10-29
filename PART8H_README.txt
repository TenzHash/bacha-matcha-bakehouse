BACHA - PART 8H (on top of your bacha_part8g)
=============================================
1. STABLE MAP. The hand-made map (js/16-map.js, ~240 lines of tile maths) is replaced by LEAFLET 1.9.4, a long-standing,
   widely used open-source map library (BSD-2 licence). Same two places as before: Store control -> delivery area preview,
   and Orders -> "Delivery map". Pins, the dashed delivery circle, tap-to-place-shop and the order pop-ups work as before,
   and now also get proper pinch/double-tap zoom, smooth panning and keyboard control from Leaflet.
2. LAYERS BUTTON (top-right of every map): "Map" (OpenStreetMap) and "Satellite" (Esri World Imagery). The choice is remembered
   on that device. The credit line at the bottom of the map changes with the layer:
     Map:        (c) OpenStreetMap contributors
     Satellite:  Tiles (c) Esri - Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP,
                 and the GIS User Community
3. ROUTE PLANNER (Orders -> Delivery map -> "Delivery route" under the map). This is route PLANNING (not live GPS tracking of a rider).
   - Tap a pin -> "Add to route", or use the "Add a stop" chips, or "Add all shown orders".
   - "Best order" re-sorts the stops into a short trip. Arrows move a stop up/down, x removes it. Numbers show on the pins.
   - Tick "Start at the shop" (default) and/or "Come back to the shop". Untick start-at-shop and Google Maps starts from the
     phone's own location instead (handy when the rider opens the link on their phone).
   - The blue line is the road route with distance and driving time. If the routing server cannot be reached you get a dotted
     straight line and a straight-line distance instead; the Google Maps link still works.
   - "Open in Google Maps" opens the whole trip (shop -> stops) in Google Maps / the Google Maps app. "Copy link" copies it so it
     can be sent on Messenger/Viber to the rider. Google Maps takes at most 10 stops per link, so longer routes become
     "Part 1 of 2", "Part 2 of 2" (part 2 starts where part 1 ended). The app allows up to 25 stops per route.
   - Orders whose map link has no coordinates (short maps.app.goo.gl links) still cannot be placed; they stay listed under the map.

RULES / POLICIES THIS FOLLOWS (so the maps keep working - please keep them if you edit js/16-map.js)
   - Leaflet: BSD-2. Its "Leaflet" credit stays in the corner.
   - OpenStreetMap tiles (operations.osmfoundation.org/policies/tiles): visible, linked credit; official tile.openstreetmap.org address;
     zoom <= 19; the browser's normal Referer is sent; tiles are only loaded when the map is open (no bulk download / prefetch).
     It is meant for light use like an admin screen. If the shop ever gets heavy traffic on the maps, use a paid tile provider
     (change the url in MAP_BASES.osm in js/16-map.js).
   - Esri World Imagery: credit text shown while Satellite is on, as above. Fine for light use; if Esri ever asks for a key,
     create a free ArcGIS developer key and add it to the Satellite url.
   - Route line = OSRM public demo server (router.project-osrm.org), OpenStreetMap data. Its policy: max 1 request/second and light use.
     The code waits >= 1.1 s between requests, only asks when a route has 2+ points, waits 0.6 s after your last change and caches
     every route. The credit "Route: OSRM" is added to the map while a road route is shown. For heavy daily use, host your own OSRM or use a paid router.
   - Google Maps: only opened with the official Maps URLs (maps/dir/?api=1...). No Google map pictures are copied into the app.

LOADING LEAFLET (important - read once)
   The tools used to prepare this zip could not download Leaflet (those download sites were blocked), so Leaflet is NOT inside vendor/ yet.
   The app handles this: it first looks in vendor/leaflet/ and, if the files are not there, loads the same version 1.9.4 from
   unpkg.com (then cdn.jsdelivr.net as backup). So with internet the maps work as they are.
   To make it fully self-contained (like the other libraries in vendor/):
     1. Download https://github.com/Leaflet/Leaflet/releases/download/v1.9.4/leaflet.zip  (or npm pack leaflet@1.9.4).
     2. Copy leaflet.js, leaflet.css and the images/ folder into vendor/leaflet/  (so vendor/leaflet/leaflet.js exists).
   Map pictures themselves always need internet. Opening index.html straight from a folder (file://) makes OpenStreetMap refuse tiles
   because no website address is sent; from your online site it works.

TESTED HERE: route ordering, Google Maps link building (incl. >9 waypoints split), OSRM reply handling, 1 request/second limit,
   the whole route panel in a real browser at phone width (add/move/remove/best order/copy link/start-at-shop/return/offline fallback),
   and the Map/Satellite layer setup + credits - using a stand-in for Leaflet. NOT TESTED: the real Leaflet files drawing real tiles
   (not downloadable here). Please open Orders -> Delivery map once on your site and check the Map/Satellite button and a route.
No Supabase changes in this part.
