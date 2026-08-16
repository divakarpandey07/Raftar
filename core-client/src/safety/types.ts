export type BeaconConnectionStatus = 'CONNECTED' | 'DEGRADED_NETWORK' | 'OFFLINE';
export type SosState = 'IDLE' | 'COUNTDOWN' | 'CANCELLED' | 'CONFIRMED_SOS' | 'RESOLVED';
export type BatteryHealth = 'NORMAL' | 'LOW' | 'CRITICAL';

export interface BeaconSession {
  sessionId: string;
  athleteId: string;
  shareToken: string;
  expiresAt: number;
  isRevoked: boolean;
  emergencyContacts: string[];
  createdAt: number;
}

export interface BeaconTelemetryPacket {
  sessionId: string;
  sequenceNumber?: number; // Strict sequence for replay protection
  latitude: number;
  longitude: number;
  speedMps: number;
  heartRate?: number;
  batteryPercentage: number;
  timestamp: number;
}

export interface BeaconLiveStatus {
  sessionId: string;
  connectionStatus: BeaconConnectionStatus;
  sosState: SosState;
  batteryHealth: BatteryHealth;
  lastKnownLocation?: { latitude: number; longitude: number };
  lastHeartbeatAgeSeconds: number;
  batteryPercentage: number;
  warningMessage?: string;
}
