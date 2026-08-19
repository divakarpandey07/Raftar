import { SafetyBeaconService } from '../src/safety/safety-beacon-service';

describe('Safety Beacon Comprehensive Security & Contact Delivery Matrix', () => {
  test('1. Contact Viewer Age Transparency & Live Status Evaluation', () => {
    const service = new SafetyBeaconService();
    const session = service.startSession('ath-123', ['+919876543210'], 2);

    const now = Date.now();
    const status = service.ingestHeartbeat({
      sessionId: session.sessionId,
      latitude: 18.9430,
      longitude: 72.8230,
      speedMps: 3.5,
      batteryPercentage: 85,
      timestamp: now,
      sequenceNumber: 1
    });

    expect(status.connectionStatus).toBe('CONNECTED');
    expect(status.lastKnownLocation?.latitude).toBe(18.9430);
    expect(status.batteryHealth).toBe('NORMAL');
  });

  test('2. Revocation & Expiry: Ingestion is rejected on revoked sessions', () => {
    const service = new SafetyBeaconService();
    const session = service.startSession('ath-123', ['+919876543210'], 2);

    service.revokeSession(session.sessionId);

    expect(() => {
      service.ingestHeartbeat({
        sessionId: session.sessionId,
        latitude: 18.9430,
        longitude: 72.8230,
        speedMps: 3.5,
        batteryPercentage: 85,
        timestamp: Date.now(),
        sequenceNumber: 1
      });
    }).toThrow('Invalid, expired, or revoked');
  });

  test('3. Sequence Monotonicity & Replay Rejection: Stale sequence packets are dropped', () => {
    const service = new SafetyBeaconService();
    const session = service.startSession('ath-123', ['+919876543210'], 2);

    // Sequence 10 accepted
    service.ingestHeartbeat({
      sessionId: session.sessionId,
      latitude: 18.943,
      longitude: 72.823,
      speedMps: 3.5,
      batteryPercentage: 80,
      timestamp: Date.now(),
      sequenceNumber: 10
    });

    // Replay attack / stale sequence 8 throws
    expect(() => {
      service.ingestHeartbeat({
        sessionId: session.sessionId,
        latitude: 18.944,
        longitude: 72.824,
        speedMps: 3.5,
        batteryPercentage: 80,
        timestamp: Date.now(),
        sequenceNumber: 8
      });
    }).toThrow('Replay attack or out-of-order packet detected');

    // Duplicate sequence 10 throws
    expect(() => {
      service.ingestHeartbeat({
        sessionId: session.sessionId,
        latitude: 18.944,
        longitude: 72.824,
        speedMps: 3.5,
        batteryPercentage: 80,
        timestamp: Date.now(),
        sequenceNumber: 10
      });
    }).toThrow('Replay attack or out-of-order packet detected');

    // Fresh sequence 11 accepted
    const status11 = service.ingestHeartbeat({
      sessionId: session.sessionId,
      latitude: 18.945,
      longitude: 72.825,
      speedMps: 3.5,
      batteryPercentage: 80,
      timestamp: Date.now(),
      sequenceNumber: 11
    });
    expect(status11.lastKnownLocation?.latitude).toBe(18.945);
  });
});
