export type IntegrityVerdict = 'VALID' | 'SUSPICIOUS' | 'INVALID';

export type IntegrityReasonCode =
  | 'IMPOSSIBLE_SPEED'
  | 'IMPOSSIBLE_ACCELERATION'
  | 'GPS_JUMP'
  | 'TIMESTAMP_ANOMALY'
  | 'LOCATION_MOCKING'
  | 'DUPLICATE_POINTS'
  | 'STALE_TELEMETRY'
  | 'SIGNAL_GAP'
  | 'ROUTE_SHORTCUT'
  | 'INSUFFICIENT_TELEMETRY';

export interface IntegrityAssessmentResult {
  verdict: IntegrityVerdict;
  evidenceScore: number; // 0 to 100
  reasonCodes: IntegrityReasonCode[];
  geometryQualityScore: number;
  kinematicQualityScore: number;
  metadataQualityScore: number;
  details: string;
}
