import { SafetyBeaconService } from '../src/safety/safety-beacon-service';

describe('SafetyBeaconService (Heartbeat, SOS Countdown & Battery State Machine)', () => {
  test('evaluates connection heartbeat states (CONNECTED -> DEGRADED_NETWORK -> OFFLINE)', () => {
    const service = new SafetyBeaconService();
    const session = service.startSession('ath-solo', ['+919876543210']);

    // 1. Fresh heartbeat (age = 5s) -> CONNECTED
    const now = Date.now();
    service.ingestHeartbeat({
      sessionId: session.sessionId,
      latitude: 19.0760,
      longitude: 72.8777,
      speedMps: 6.0,
      batteryPercentage: 90,
      timestamp: now
    });

    const status1 = service.evaluateLiveStatus(session.sessionId, now + 5000);
    expect(status1.connectionStatus).toBe('CONNECTED');

    // 2. Degraded network (age = 60s) -> DEGRADED_NETWORK (Silence != SOS)
    const status2 = service.evaluateLiveStatus(session.sessionId, now + 60000);
    expect(status2.connectionStatus).toBe('DEGRADED_NETWORK');
    expect(status2.sosState).toBe('IDLE');

    // 3. Offline (age = 150s) -> OFFLINE
    const status3 = service.evaluateLiveStatus(session.sessionId, now + 150000);
    expect(status3.connectionStatus).toBe('OFFLINE');
  });

  test('manages SOS countdown grace window and confirmation', () => {
    const service = new SafetyBeaconService();
    const session = service.startSession('ath-solo', ['+919876543210']);

    const now = Date.now();
    service.ingestHeartbeat({
      sessionId: session.sessionId,
      latitude: 19.0760,
      longitude: 72.8777,
      speedMps: 0,
      batteryPercentage: 80,
      timestamp: now
    });

    // 1. Trigger SOS -> Starts in COUNTDOWN
    service.triggerSos(session.sessionId);
    const s1 = service.evaluateLiveStatus(session.sessionId, now + 2000);
    expect(s1.sosState).toBe('COUNTDOWN');

    // 2. After 10s grace window -> Promoted to CONFIRMED_SOS
    const s2 = service.evaluateLiveStatus(session.sessionId, now + 11000);
    expect(s2.sosState).toBe('CONFIRMED_SOS');

    // 3. Resolve SOS
    service.resolveSos(session.sessionId);
    const s3 = service.evaluateLiveStatus(session.sessionId, now + 12000);
    expect(s3.sosState).toBe('RESOLVED');
  });

  test('evaluates battery health state machine and critical warning', () => {
    const service = new SafetyBeaconService();
    const session = service.startSession('ath-solo', ['+919876543210']);

    const now = Date.now();
    service.ingestHeartbeat({
      sessionId: session.sessionId,
      latitude: 19.0760,
      longitude: 72.8777,
      speedMps: 5.0,
      batteryPercentage: 8, // Critical < 10%
      timestamp: now
    });

    const status = service.evaluateLiveStatus(session.sessionId, now);
    expect(status.batteryHealth).toBe('CRITICAL');
    expect(status.warningMessage).toContain('Critical: Beacon device battery < 10%');
  });
});
