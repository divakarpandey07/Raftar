import { AthleticTelemetryExtractor } from '../src/ai/athletic-telemetry-extractor';
import { AiCoachingNarrativeEngine } from '../src/ai/ai-coaching-narrative-engine';
import { DataQualityEngine } from '../src/ai/data-quality-engine';

describe('Phase 17: AI Athletic Intelligence & Guarded Coaching Engine', () => {
  test('1. Sport-Specific Decoupling: Evaluates running Pace-HR, cycling Power-HR, and swimming missingness', () => {
    // 30 steady points over 25 mins (1500s) for Running (3.5 m/s, HR 140 -> 144)
    const runningSteady = Array.from({ length: 30 }, (_, i) => ({
      speedMps: 3.5,
      heartRate: i < 15 ? 140 : 144,
      timestamp: 1000 + i * 50000
    }));

    const runResult = AthleticTelemetryExtractor.calculateAerobicDecoupling('RUNNING', runningSteady, 5250, 20);
    expect(runResult.status).toBe('LOW_DECOUPLING');
    expect(runResult.decouplingPercentage).toBeLessThanOrEqual(5.0);
    expect(runResult.modelVersion).toBe('decoupling-v1.2');
    expect(runResult.confidence).toBe('HIGH');
    expect(runResult.observedFacts.length).toBeGreaterThan(0);
    expect(runResult.derivedFindings.length).toBeGreaterThan(0);
    expect(runResult.interpretivePossibilities.length).toBeGreaterThan(0);

    // Elevated decoupling run (HR drifts from 135 to 155 BPM at same speed)
    const runningDrift = Array.from({ length: 30 }, (_, i) => ({
      speedMps: 3.5,
      heartRate: i < 15 ? 135 : 155,
      timestamp: 1000 + i * 50000
    }));
    const elevatedResult = AthleticTelemetryExtractor.calculateAerobicDecoupling('RUNNING', runningDrift, 5250, 20);
    expect(elevatedResult.status).toBe('ELEVATED_DECOUPLING');
    expect(elevatedResult.interpretivePossibilities.some((p) => p.includes('hydration-related'))).toBe(true);

    // Cycling with direct Power Meter telemetry (200W -> 195W, HR 150 -> 152)
    const cyclingSteady = Array.from({ length: 40 }, (_, i) => ({
      speedMps: 8.5,
      power: i < 20 ? 200 : 195,
      heartRate: i < 20 ? 150 : 152,
      timestamp: 1000 + i * 50000 // 2000s (> 30 mins)
    }));

    const cycleResult = AthleticTelemetryExtractor.calculateAerobicDecoupling('CYCLING', cyclingSteady, 17000, 50);
    expect(cycleResult.status).toBe('LOW_DECOUPLING');
    expect(cycleResult.observedFacts.some((f) => f.includes('Power Meter'))).toBe(true);

    // Swimming honest missingness
    const swimResult = AthleticTelemetryExtractor.calculateAerobicDecoupling('SWIMMING', runningSteady, 2000, 0);
    expect(swimResult.status).toBe('NOT_APPLICABLE_FOR_SPORT');

    // Rejection on excessive terrain gradient (> 15 m/km climbing)
    const hillyRun = AthleticTelemetryExtractor.calculateAerobicDecoupling('RUNNING', runningSteady, 5000, 250); // 50m/km
    expect(hillyRun.status).toBe('NOT_APPLICABLE_NON_STEADY_STATE');
  });

  test('2. Configurable ACWR Reference Bands: Evaluates configured reference bands and baseline history', () => {
    const now = Date.now();
    const dayMs = 24 * 3600 * 1000;

    // Athlete with insufficient baseline history (< 14 days) -> INSUFFICIENT_HISTORY
    const newAthleteWorkouts = [
      { tss: 50, timestamp: now - 1 * dayMs },
      { tss: 50, timestamp: now - 3 * dayMs }
    ];
    const newAthleteLoad = AthleticTelemetryExtractor.calculateAcwr('RUNNING', newAthleteWorkouts);
    expect(newAthleteLoad.status).toBe('INSUFFICIENT_HISTORY');
    expect(newAthleteLoad.confidence).toBe('INSUFFICIENT_DATA');
    expect(newAthleteLoad.modelVersion).toBe('acwr-v1.1');
    expect(newAthleteLoad.rulesetVersion).toBe('acwr-methodology-v1.1');

    // Athlete has steady 100 TSS weekly across 4 weeks (8 workouts x 50 TSS = 400 TSS)
    const pastOptimalWorkouts = [
      { tss: 50, timestamp: now - 2 * dayMs },
      { tss: 50, timestamp: now - 5 * dayMs },
      { tss: 50, timestamp: now - 9 * dayMs },
      { tss: 50, timestamp: now - 12 * dayMs },
      { tss: 50, timestamp: now - 16 * dayMs },
      { tss: 50, timestamp: now - 19 * dayMs },
      { tss: 50, timestamp: now - 23 * dayMs },
      { tss: 50, timestamp: now - 26 * dayMs }
    ];

    const optimalLoad = AthleticTelemetryExtractor.calculateAcwr('RUNNING', pastOptimalWorkouts);
    expect(optimalLoad.status).toBe('WITHIN_CONFIGURED_REFERENCE');
    expect(optimalLoad.acwrRatio).toBeGreaterThanOrEqual(0.8);
    expect(optimalLoad.acwrRatio).toBeLessThanOrEqual(1.3);
    expect(optimalLoad.confidence).toBe('HIGH');

    // Sudden spike in acute load (Far Above Configured Reference > 1.5)
    const pastSpikeWorkouts = [
      { tss: 160, timestamp: now - 1 * dayMs },
      { tss: 160, timestamp: now - 2 * dayMs },
      { tss: 160, timestamp: now - 4 * dayMs },
      { tss: 50, timestamp: now - 14 * dayMs },
      { tss: 50, timestamp: now - 18 * dayMs },
      { tss: 50, timestamp: now - 22 * dayMs },
      { tss: 50, timestamp: now - 26 * dayMs }
    ];

    const spikeLoad = AthleticTelemetryExtractor.calculateAcwr('RUNNING', pastSpikeWorkouts);
    expect(spikeLoad.status).toBe('FAR_ABOVE_CONFIGURED_REFERENCE');
    expect(spikeLoad.acwrRatio).toBeGreaterThan(1.5);
    expect(spikeLoad.explanation).toContain('substantially elevated');
  });

  test('3. DataQualityEngine & Guarded Narrative with Provenance Chains & Separated Evidence Classes', () => {
    // Data quality assessment (raw telemetry)
    const dq = DataQualityEngine.assessQuality(1800, 300, 290, 0, 'POLAR_H10_BLE');
    expect(dq.overallGrade).toBe('EXCELLENT');
    expect(dq.hrCoveragePct).toBe(97);

    const activity = {
      id: 'act-marine-drive',
      athleteName: 'Arjun',
      sportType: 'RUNNING' as const,
      distanceMeters: 10000,
      durationSeconds: 2700,
      elevationGainMeters: 50,
      averageSpeedMps: 3.70,
      averageHeartRate: 155
    };

    const splits = [
      { splitIndex: 1, distanceMeters: 5000, durationSeconds: 1380, averageHeartRate: 150 },
      { splitIndex: 2, distanceMeters: 5000, durationSeconds: 1320, averageHeartRate: 160 }
    ];

    const now = Date.now();
    const pastWorkouts = [
      { tss: 50, timestamp: now - 2 * 24 * 3600 * 1000 },
      { tss: 50, timestamp: now - 5 * 24 * 3600 * 1000 },
      { tss: 50, timestamp: now - 14 * 24 * 3600 * 1000 },
      { tss: 50, timestamp: now - 21 * 24 * 3600 * 1000 }
    ];

    const insights = AiCoachingNarrativeEngine.generateInsights(activity, splits, [], pastWorkouts);

    expect(insights.distanceKm).toBe(10);
    expect(insights.hasNegativeSplit).toBe(true);
    expect(insights.splitDeltaSeconds).toBe(-60);
    expect(insights.provenanceClaims.length).toBeGreaterThanOrEqual(2);
    expect(insights.provenanceClaims[0].claimType).toBe('OBSERVED');
    expect(insights.provenanceClaims[0].evidenceClass).toBe('TELEMETRY');
    expect(insights.provenanceClaims[0].inputSnapshotId).toBeDefined();
    expect(insights.coachingNarrative).toContain('Arjun');
    expect(insights.coachingNarrative).toContain('10 km');
    expect(insights.medicalDisclaimer).toContain('does not provide medical diagnosis');
  });
});
