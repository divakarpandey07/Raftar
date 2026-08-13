export interface Coordinate {
  latitude: number;
  longitude: number;
  altitude?: number;
  timestamp?: number; // epoch ms
}

const EARTH_RADIUS_METERS = 6371000;

/**
 * Calculates geodesic distance between two points using the Haversine formula.
 */
export function haversineDistanceMeters(p1: Coordinate, p2: Coordinate): number {
  const lat1Rad = (p1.latitude * Math.PI) / 180;
  const lat2Rad = (p2.latitude * Math.PI) / 180;
  const deltaLat = ((p2.latitude - p1.latitude) * Math.PI) / 180;
  const deltaLon = ((p2.longitude - p1.longitude) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

/**
 * Computes elevation gain and loss from an array of coordinates with altitudes.
 * Applies a 3-point moving threshold (ignoring elevation noise < 2m).
 */
export function computeElevationProfile(points: Coordinate[]): { gainMeters: number; lossMeters: number } {
  let gain = 0;
  let loss = 0;
  if (points.length < 2) return { gainMeters: 0, lossMeters: 0 };

  const ELEVATION_NOISE_THRESHOLD = 2.0; // meters

  for (let i = 1; i < points.length; i++) {
    const alt1 = points[i - 1].altitude ?? 0;
    const alt2 = points[i].altitude ?? 0;
    const diff = alt2 - alt1;

    if (Math.abs(diff) >= ELEVATION_NOISE_THRESHOLD) {
      if (diff > 0) gain += diff;
      else loss += Math.abs(diff);
    }
  }

  return {
    gainMeters: Math.round(gain * 100) / 100,
    lossMeters: Math.round(loss * 100) / 100
  };
}

/**
 * Computes 1km / 1mi interval splits from time-series points.
 */
export function computeSplits(points: Coordinate[], splitDistanceMeters: number = 1000) {
  const splits = [];
  let currentSplitDistance = 0;
  let splitStartTime = points[0]?.timestamp ?? 0;
  let splitStartAlt = points[0]?.altitude ?? 0;
  let splitIndex = 1;

  for (let i = 1; i < points.length; i++) {
    const dist = haversineDistanceMeters(points[i - 1], points[i]);
    currentSplitDistance += dist;

    if (currentSplitDistance >= splitDistanceMeters || i === points.length - 1) {
      const splitEndTime = points[i].timestamp ?? splitStartTime;
      const durationSeconds = Math.max(1, Math.round((splitEndTime - splitStartTime) / 1000));
      const paceSecPerKm = Math.round((durationSeconds / currentSplitDistance) * 1000);
      const elevationDiff = (points[i].altitude ?? 0) - splitStartAlt;

      splits.push({
        split_number: splitIndex++,
        distance_meters: Math.round(currentSplitDistance * 10) / 10,
        duration_seconds: durationSeconds,
        avg_pace_sec_km: paceSecPerKm,
        elevation_change_meters: Math.round(elevationDiff * 10) / 10
      });

      currentSplitDistance = 0;
      splitStartTime = splitEndTime;
      splitStartAlt = points[i].altitude ?? 0;
    }
  }

  return splits;
}

/**
 * Polyline encoder algorithm (precision 1e5 / 1e6)
 */
export function encodePolyline(points: Coordinate[], precision: number = 1e5): string {
  let encoded = '';
  let prevLat = 0;
  let prevLon = 0;

  for (const point of points) {
    const lat = Math.round(point.latitude * precision);
    const lon = Math.round(point.longitude * precision);

    const dLat = lat - prevLat;
    const dLon = lon - prevLon;

    prevLat = lat;
    prevLon = lon;

    encoded += encodeSignedNumber(dLat);
    encoded += encodeSignedNumber(dLon);
  }

  return encoded;
}

function encodeSignedNumber(num: number): string {
  let sgn_num = num < 0 ? ~(num << 1) : num << 1;
  let encodeString = '';
  while (sgn_num >= 0x20) {
    encodeString += String.fromCharCode((0x20 | (sgn_num & 0x1f)) + 63);
    sgn_num >>= 5;
  }
  encodeString += String.fromCharCode(sgn_num + 63);
  return encodeString;
}

/**
 * Douglas-Peucker polyline simplification algorithm for rendering efficiency
 */
export function simplifyPolyline(points: Coordinate[], toleranceMeters: number = 3.0): Coordinate[] {
  if (points.length <= 2) return points;

  let maxDistance = 0;
  let index = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const distance = perpendicularDistance(points[i], points[0], points[points.length - 1]);
    if (distance > maxDistance) {
      index = i;
      maxDistance = distance;
    }
  }

  if (maxDistance > toleranceMeters) {
    const left = simplifyPolyline(points.slice(0, index + 1), toleranceMeters);
    const right = simplifyPolyline(points.slice(index), toleranceMeters);
    return left.slice(0, -1).concat(right);
  } else {
    return [points[0], points[points.length - 1]];
  }
}

function perpendicularDistance(p: Coordinate, p1: Coordinate, p2: Coordinate): number {
  const d = haversineDistanceMeters(p1, p2);
  if (d === 0) return haversineDistanceMeters(p, p1);
  const d1 = haversineDistanceMeters(p, p1);
  const d2 = haversineDistanceMeters(p, p2);
  const s = (d + d1 + d2) / 2;
  const area = Math.sqrt(Math.max(0, s * (s - d) * (s - d1) * (s - d2)));
  return (2 * area) / d;
}
