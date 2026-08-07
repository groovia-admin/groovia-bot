// Plain Haversine distance — used only for the delivery-radius check at
// order submission. Doesn't touch PostGIS/geog at all: shops and
// customer_addresses both already carry plain latitude/longitude
// columns, and a straight-line distance over a few kilometers (a
// kirana shop's realistic delivery radius) doesn't need geodesic
// precision.
export function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
