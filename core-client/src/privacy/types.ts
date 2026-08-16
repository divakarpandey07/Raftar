import { RawGpsPoint } from '../types';

export interface PrivacyZone {
  id: string;
  athleteId: string;
  name: string;
  centerLatitude: number;
  centerLongitude: number;
  radiusMeters: number;
  isActive: boolean;
  createdAt: number;
}

export interface DiscontinuousTrackSegment {
  segmentIndex: number;
  points: RawGpsPoint[];
}

export interface MaskedTrackResult {
  originalPointCount: number;
  publicPointCount: number;
  maskedSegments: DiscontinuousTrackSegment[]; // Disjoint public sub-tracks separated by suppressed gaps
  hasMaskedPoints: boolean;
  privacyZonesApplied: string[];
  svgPathString: string; // SVG path with explicit M... L... gaps preventing straight-line interpolation leaks
}
