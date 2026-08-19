import { EnvironmentalTelemetryEngine } from '../src/environmental/environmental-telemetry-engine';
import { NotificationEngine } from '../src/notifications/notification-engine';

describe('Phase 21 & 22: Environmental Telemetry & Multi-Channel Notifications', () => {
  describe('EnvironmentalTelemetryEngine', () => {
    test('1. Heat Index Calculation: Computes valid apparent temperature under hot and humid conditions', () => {
      // 32°C at 70% humidity
      const heatIndex = EnvironmentalTelemetryEngine.calculateHeatIndexCelsius(32.0, 70.0);
      expect(heatIndex).toBeGreaterThan(38.0); // High apparent temperature
    });

    test('2. Environmental Strain Classification: Identifies high thermal strain and hazardous AQI', () => {
      const heatAssessment = EnvironmentalTelemetryEngine.assessStrain({
        temperatureCelsius: 34.0,
        apparentTemperatureCelsius: 41.0,
        relativeHumidityPercent: 75,
        windSpeedMps: 2.1,
        windDirectionDegrees: 180,
        weatherCode: 'CLEAR'
      });
      expect(heatAssessment.strainCategory).toBe('HIGH_HEAT_STRAIN');
      expect(heatAssessment.coachingNote).toContain('Internal HR drift expected');

      const aqiAssessment = EnvironmentalTelemetryEngine.assessStrain({
        temperatureCelsius: 22.0,
        apparentTemperatureCelsius: 22.0,
        relativeHumidityPercent: 45,
        windSpeedMps: 1.0,
        windDirectionDegrees: 0,
        aqiUsEpa: 165,
        weatherCode: 'SMOG'
      });
      expect(aqiAssessment.strainCategory).toBe('HAZARDOUS_AIR_QUALITY');
      expect(aqiAssessment.coachingNote).toContain('unhealthy range');
    });

    test('3. Activity Snapshotting: Creates immutable snapshot with coaching notes', () => {
      const snapshot = EnvironmentalTelemetryEngine.createSnapshot(
        'act-env-1',
        {
          temperatureCelsius: 24.0,
          apparentTemperatureCelsius: 24.0,
          relativeHumidityPercent: 50,
          windSpeedMps: 3.5,
          windDirectionDegrees: 270,
          aqiUsEpa: 45,
          weatherCode: 'CLEAR'
        }
      );
      expect(snapshot.activityId).toBe('act-env-1');
      expect(snapshot.environmentalStrain).toBe('OPTIMAL');
    });
  });

  describe('NotificationEngine', () => {
    test('1. Idempotent Dispatch: Rejects exact duplicate idempotency keys', () => {
      const engine = new NotificationEngine();

      const res1 = engine.dispatch({
        recipientId: 'ath-1',
        category: 'ACHIEVEMENT_UNLOCKED',
        priority: 'HIGH',
        title: 'Centurion Ride Unlocked!',
        body: 'You completed your first 100km ride.',
        channels: ['IN_APP', 'PUSH'],
        idempotencyKey: 'badge-centurion-act-101'
      });

      expect(res1.dispatched).toBe(true);
      expect(res1.notification?.isRead).toBe(false);

      // Duplicate attempt
      const res2 = engine.dispatch({
        recipientId: 'ath-1',
        category: 'ACHIEVEMENT_UNLOCKED',
        title: 'Centurion Ride Unlocked!',
        body: 'You completed your first 100km ride.',
        channels: ['IN_APP', 'PUSH'],
        idempotencyKey: 'badge-centurion-act-101'
      });

      expect(res2.dispatched).toBe(false);
      expect(res2.reason).toBe('DUPLICATE_IDEMPOTENCY_KEY');
    });

    test('2. In-App Inbox & Read State Management', () => {
      const engine = new NotificationEngine();

      engine.dispatch({
        recipientId: 'ath-1',
        category: 'SOCIAL_KUDOS',
        title: 'Kudos Received',
        body: 'Priya gave you kudos on your morning run.',
        idempotencyKey: 'kudos-user2-act-101'
      });

      expect(engine.getUnreadCount('ath-1')).toBe(1);

      const inAppList = engine.getInAppNotifications('ath-1');
      expect(inAppList.length).toBe(1);

      engine.markAsRead(inAppList[0].id);
      expect(engine.getUnreadCount('ath-1')).toBe(0);
    });
  });
});
