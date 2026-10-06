'use strict';
/* Spherical geometry helpers. Metres, degrees. */

const R = 6371008.8;
const rad = d => d * Math.PI / 180;
const deg = r => r * 180 / Math.PI;

function distance(a, b) {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 +
            Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function bearing(a, b) {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
            Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Point `dist` metres from `p` along `brng` degrees. */
function destination(p, brng, dist) {
  const d = dist / R, br = rad(brng), la = rad(p.lat), lo = rad(p.lon);
  const lat = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(br));
  const lon = lo + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(la),
                              Math.cos(d) - Math.sin(la) * Math.sin(lat));
  return { lat: deg(lat), lon: ((deg(lon) + 540) % 360) - 180 };
}

module.exports = { distance, bearing, destination };
