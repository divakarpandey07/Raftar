import { ActivityIntegrityEngine } from '../src/integrity/activity-integrity-engine';
import { RawGpsPoint } from '../src/types';

describe('ActivityIntegrityEngine (Geometry, Kinematics & Metadata Verification)', () => {
  test('assigns high evidence score (100) and VALID verdict to clean athletic track', () => {
    const cleanTrack: RawGpsPoint[] = [
      { localActivityId: 'act-clean', pointIndex: 0, accuracy: 3, isEstimated: false, latitude: 19.0760, longitude: 72.8777, timestamp: 1000 },
      { localActivityId: 'act-clean', pointIndex: 1, accuracy: 3, isEstimated: false, latitude: 19.07603, longitude: 72.87773, timestamp: 2000 },
      { localActivityId: 'act-clean', pointIndex: 2, accuracy: 4, isEstimated: false, latitude: 19.07606, longitude: 72.87776, timestamp: 3000 },
      { localActivityId: 'act-clean', pointIndex: 3, accuracy: 3, isEstimated: false, latitude: 19.07609, longitude: 72.87779, timestamp: 4000 },
      { localActivityId: 'act-clean', pointIndex: 4, accuracy: 4, isEstimated: false, latitude: 19.07612, longitude: 72.87782, timestamp: 5000 },
      { localActivityId: 'act-clean', pointIndex: 5, accuracy: 3, isEstimated: false, latitude: 19.07615, longitude: 72.87785, timestamp: 6000 }
    ];

    const assessment = ActivityIntegrityEngine.evaluateTrack('act-clean', 'RUNNING', cleanTrack);
    expect(assessment.verdict).toBe('VALID');
    expect(assessment.evidenceScore).toBeGreaterThanOrEqual(90);
    expect(assessment.anomaliesCount).toBe(0);
  });

  test('flags impossible vehicle speed with INVALID verdict', () => {
    // 500m per second = 1800 km/h (impossible supersonic speed)
    const supersonicTrack: RawGpsPoint[] = [
      { localActivityId: 'act-fake', pointIndex: 0, accuracy: 4, isEstimated: false, latitude: 19.0760, longitude: 72.8777, timestamp: 1000 },
      { localActivityId: 'act-fake', pointIndex: 1, accuracy: 4, isEstimated: false, latitude: 19.0860, longitude: 72.8877, timestamp: 2000 },
      { localActivityId: 'act-fake', pointIndex: 2, accuracy: 4, isEstimated: false, latitude: 19.0960, longitude: 72.8977, timestamp: 3000 },
      { localActivityId: 'act-fake', pointIndex: 3, accuracy: 4, isEstimated: false, latitude: 19.1060, longitude: 72.9077, timestamp: 4000 },
      { localActivityId: 'act-fake', pointIndex: 4, accuracy: 4, isEstimated: false, latitude: 19.1160, longitude: 72.9177, timestamp: 5000 }
    ];

    const assessment = ActivityIntegrityEngine.evaluateTrack('act-fake', 'RUNNING', supersonicTrack);
    expect(assessment.verdict).toBe('INVALID');
    expect(assessment.evidenceScore).toBe(0);
    expect(assessment.reasons[0]).toContain('exceeds physical sport limit');
  });
});
