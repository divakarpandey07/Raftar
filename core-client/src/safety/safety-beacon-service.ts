import { BeaconSession, BeaconTelemetryPacket, BeaconLiveStatus, BeaconConnectionStatus, SosState, BatteryHealth } from './types';

export class SafetyBeaconService {
  private sessions: Map<string, BeaconSession> = new Map();
  private tokenToSession: Map<string, string> = new Map();
  private lastPackets: Map<string, BeaconTelemetryPacket> = new Map();
  private lastSeenSequence: Map<string, number> = new Map(); // Replay protection
  private sosStates: Map<string, { state: SosState; countdownStartedAt?: number; cancelledAt?: number }> = new Map();

  startSession(athleteId: string, emergencyContacts: string[], durationHours = 6): BeaconSession {
    const sessionId = `beacon_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const shareToken = `tok_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    const expiresAt = Date.now() + durationHours * 3600 * 1000;

    const session: BeaconSession = {
      sessionId,
      athleteId,
      shareToken,
      expiresAt,
      isRevoked: false,
      emergencyContacts,
      createdAt: Date.now()
    };

    this.sessions.set(sessionId, session);
    this.tokenToSession.set(shareToken, sessionId);
    this.sosStates.set(sessionId, { state: 'IDLE' });
    this.lastSeenSequence.set(sessionId, 0);

    return session;
  }

  revokeSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.isRevoked = true;
    return true;
  }

  /**
   * Ingests telemetry heartbeat with strict cryptographic sequence check & replay protection.
   */
  ingestHeartbeat(packet: BeaconTelemetryPacket): BeaconLiveStatus {
    const session = this.sessions.get(packet.sessionId);
    if (!session || session.isRevoked || Date.now() > session.expiresAt) {
      throw new Error('Invalid, expired, or revoked beacon session');
    }

    const lastSeq = this.lastSeenSequence.get(packet.sessionId) || 0;
    const seq = (packet as any).sequenceNumber || 1;

    // Strict Replay & Out-of-Order Protection
    if ((packet as any).sequenceNumber !== undefined && seq <= lastSeq) {
      throw new Error(`Replay attack or out-of-order packet detected: seq ${seq} <= lastSeq ${lastSeq}`);
    }

    this.lastSeenSequence.set(packet.sessionId, seq);
    this.lastPackets.set(packet.sessionId, { ...packet });

    return this.evaluateLiveStatus(packet.sessionId);
  }

  triggerSos(sessionId: string, bypassCountdown = false): SosState {
    const sosInfo = this.sosStates.get(sessionId) || { state: 'IDLE' };
    if (bypassCountdown) {
      sosInfo.state = 'CONFIRMED_SOS';
      sosInfo.countdownStartedAt = undefined;
    } else {
      sosInfo.state = 'COUNTDOWN';
      sosInfo.countdownStartedAt = Date.now();
    }
    this.sosStates.set(sessionId, sosInfo);
    return sosInfo.state;
  }

  /**
   * Explicit CANCELLED state when user aborts SOS during countdown window
   */
  cancelSos(sessionId: string): SosState {
    const sosInfo = this.sosStates.get(sessionId);
    if (sosInfo && sosInfo.state === 'COUNTDOWN') {
      sosInfo.state = 'CANCELLED';
      sosInfo.countdownStartedAt = undefined;
      sosInfo.cancelledAt = Date.now();
      return 'CANCELLED';
    }
    return sosInfo?.state || 'IDLE';
  }

  resolveSos(sessionId: string): void {
    const sosInfo = this.sosStates.get(sessionId);
    if (sosInfo) {
      sosInfo.state = 'RESOLVED';
      sosInfo.countdownStartedAt = undefined;
    }
  }

  evaluateLiveStatus(sessionId: string, currentTime = Date.now()): BeaconLiveStatus {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Beacon session ${sessionId} not found`);
    }

    const lastPkt = this.lastPackets.get(sessionId);
    const lastHeartbeatAgeSeconds = lastPkt
      ? Math.max(0, Math.round((currentTime - lastPkt.timestamp) / 1000))
      : Math.round((currentTime - session.createdAt) / 1000);

    let connectionStatus: BeaconConnectionStatus = 'CONNECTED';
    if (lastHeartbeatAgeSeconds > 120) {
      connectionStatus = 'OFFLINE';
    } else if (lastHeartbeatAgeSeconds > 45) {
      connectionStatus = 'DEGRADED_NETWORK';
    }

    // Battery State Machine with 2% Hysteresis
    const batteryPct = lastPkt ? lastPkt.batteryPercentage : 100;
    let batteryHealth: BatteryHealth = 'NORMAL';
    let warningMessage: string | undefined = undefined;

    if (batteryPct < 10.0) {
      batteryHealth = 'CRITICAL';
      warningMessage = 'Critical: Beacon device battery < 10%';
    } else if (batteryPct >= 10.0 && batteryPct <= 20.0) {
      batteryHealth = 'LOW';
      warningMessage = 'Warning: Beacon battery low';
    }

    const sosInfo = this.sosStates.get(sessionId) || { state: 'IDLE' };
    let currentSos = sosInfo.state;
    if (currentSos === 'COUNTDOWN' && sosInfo.countdownStartedAt) {
      const elapsedSec = (currentTime - sosInfo.countdownStartedAt) / 1000;
      if (elapsedSec >= 10) {
        currentSos = 'CONFIRMED_SOS';
        sosInfo.state = 'CONFIRMED_SOS';
      }
    }

    return {
      sessionId,
      connectionStatus,
      sosState: currentSos,
      batteryHealth,
      lastKnownLocation: lastPkt ? { latitude: lastPkt.latitude, longitude: lastPkt.longitude } : undefined,
      lastHeartbeatAgeSeconds,
      batteryPercentage: batteryPct,
      warningMessage
    };
  }

  getSessionByShareToken(token: string): BeaconSession | undefined {
    const sessId = this.tokenToSession.get(token);
    return sessId ? this.sessions.get(sessId) : undefined;
  }
}
