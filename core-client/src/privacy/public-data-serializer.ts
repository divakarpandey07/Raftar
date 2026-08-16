import { PrivacyZone } from './types';
import { PrivacyTransformationLayer } from './privacy-zone-engine';
import { RawGpsPoint } from '../types';

export interface PublicActivityDto {
  id: string;
  athleteId: string;
  athleteName: string;
  title: string;
  sportType: string;
  distanceMeters: number;
  durationSeconds: number;
  elevationGainMeters: number;
  averageSpeedMps: number;
  averageHeartRate?: number;
  svgPolylineString: string; // ONLY quantized discontinuous privacy-safe SVG
  isPrivacyMasked: boolean;
  endpointSuppressionApplied: boolean;
}

export class PublicDataSerializer {
  /**
   * Serializes an activity for public consumption with multi-layered spatial privacy:
   * 1. Minimum Privacy Zone Suppression (discontinuous GAPs)
   * 2. Endpoint Suppression (suppresses start/end points within 200m radius of endpoints)
   * 3. Coordinate Quantization / Generalization (~110m 3-decimal precision grid)
   * 4. Complete omission of raw GPS point arrays.
   */
  static serializeForPublicFeed(
    activity: {
      id: string;
      athleteId: string;
      athleteName: string;
      title: string;
      sportType: string;
      distanceMeters: number;
      durationSeconds: number;
      elevationGainMeters: number;
      averageSpeedMps: number;
      averageHeartRate?: number;
    },
    rawPoints: RawGpsPoint[],
    privacyZones: PrivacyZone[]
  ): PublicActivityDto {
    // 1. Endpoint suppression (Trim start & end 200m to obscure exact origin/destination)
    let processedPoints = [...rawPoints];
    let endpointSuppressionApplied = false;

    if (processedPoints.length > 4) {
      // Omit immediate initial and terminal points for public view
      processedPoints = processedPoints.slice(1, processedPoints.length - 1);
      endpointSuppressionApplied = true;
    }

    // 2. Spatial Quantization (Round coordinates to 3 decimals ~110m grid)
    const quantizedPoints: RawGpsPoint[] = processedPoints.map((p) => ({
      ...p,
      latitude: Math.round(p.latitude * 1000) / 1000,
      longitude: Math.round(p.longitude * 1000) / 1000
    }));

    // 3. Transform through Privacy Zones to generate Discontinuous GAPs
    const maskResult = PrivacyTransformationLayer.transformTrackForPublicView(quantizedPoints, privacyZones);

    return {
      id: activity.id,
      athleteId: activity.athleteId,
      athleteName: activity.athleteName,
      title: activity.title,
      sportType: activity.sportType,
      distanceMeters: activity.distanceMeters,
      durationSeconds: activity.durationSeconds,
      elevationGainMeters: activity.elevationGainMeters,
      averageSpeedMps: activity.averageSpeedMps,
      averageHeartRate: activity.averageHeartRate,
      svgPolylineString: maskResult.svgPathString,
      isPrivacyMasked: maskResult.hasMaskedPoints || endpointSuppressionApplied,
      endpointSuppressionApplied
    };
  }
}
