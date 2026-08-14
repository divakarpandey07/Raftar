import { DatabaseSync } from 'node:sqlite';
import {
  LocalActivity,
  RawGpsPoint,
  LocalActivityMetrics,
  LocalSplit,
  LocalSyncQueueItem
} from '../types';

export class SqliteStorage {
  private db: DatabaseSync;

  constructor(dbPath: string = ':memory:') {
    this.db = new DatabaseSync(dbPath);
    this.initializePragmasAndSchema();
  }

  private initializePragmasAndSchema(): void {
    this.db.exec('PRAGMA foreign_keys = ON;');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS local_activities (
        local_id TEXT PRIMARY KEY,
        server_id TEXT,
        sport_type TEXT NOT NULL,
        title TEXT NOT NULL,
        privacy TEXT DEFAULT 'PUBLIC',
        status TEXT NOT NULL,
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        sync_state TEXT DEFAULT 'PENDING'
      );

      CREATE TABLE IF NOT EXISTS local_raw_points (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        local_activity_id TEXT NOT NULL,
        point_index INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        altitude REAL,
        speed REAL,
        accuracy REAL NOT NULL,
        heart_rate INTEGER,
        cadence INTEGER,
        power INTEGER,
        is_estimated INTEGER DEFAULT 0,
        FOREIGN KEY(local_activity_id) REFERENCES local_activities(local_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS local_activity_metrics (
        local_activity_id TEXT PRIMARY KEY,
        elapsed_seconds INTEGER DEFAULT 0,
        moving_seconds INTEGER DEFAULT 0,
        distance_meters REAL DEFAULT 0,
        avg_speed_mps REAL DEFAULT 0,
        max_speed_mps REAL DEFAULT 0,
        avg_pace_sec_km INTEGER DEFAULT 0,
        current_pace_sec_km INTEGER DEFAULT 0,
        elevation_gain_meters REAL DEFAULT 0,
        elevation_loss_meters REAL DEFAULT 0,
        calories INTEGER DEFAULT 0,
        avg_hr INTEGER DEFAULT 0,
        max_hr INTEGER DEFAULT 0,
        tss_score INTEGER DEFAULT 0,
        hr_zone_1_seconds INTEGER DEFAULT 0,
        hr_zone_2_seconds INTEGER DEFAULT 0,
        hr_zone_3_seconds INTEGER DEFAULT 0,
        hr_zone_4_seconds INTEGER DEFAULT 0,
        hr_zone_5_seconds INTEGER DEFAULT 0,
        FOREIGN KEY(local_activity_id) REFERENCES local_activities(local_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS local_splits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        local_activity_id TEXT NOT NULL,
        split_number INTEGER NOT NULL,
        distance_meters REAL NOT NULL,
        duration_seconds INTEGER NOT NULL,
        avg_pace_sec_km INTEGER NOT NULL,
        elevation_diff REAL DEFAULT 0,
        avg_heart_rate INTEGER,
        FOREIGN KEY(local_activity_id) REFERENCES local_activities(local_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS local_sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        local_id TEXT NOT NULL UNIQUE,
        payload TEXT NOT NULL,
        uploaded_chunk_index INTEGER DEFAULT 0,
        total_chunks INTEGER DEFAULT 1,
        retry_count INTEGER DEFAULT 0,
        last_attempt INTEGER,
        status TEXT DEFAULT 'PENDING',
        error_message TEXT
      );

      CREATE TABLE IF NOT EXISTS local_offline_map_regions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        min_lat REAL NOT NULL,
        max_lat REAL NOT NULL,
        min_lon REAL NOT NULL,
        max_lon REAL NOT NULL,
        min_zoom INTEGER DEFAULT 10,
        max_zoom INTEGER DEFAULT 16,
        file_path TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        tile_count INTEGER NOT NULL,
        download_status TEXT NOT NULL,
        download_progress REAL DEFAULT 0,
        downloaded_at INTEGER NOT NULL,
        expires_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_raw_points_act ON local_raw_points(local_activity_id, point_index);
      CREATE INDEX IF NOT EXISTS idx_splits_act ON local_splits(local_activity_id, split_number);
    `);
  }

  // --- ACTIVITY OPERATIONS ---

  createActivity(activity: LocalActivity, metrics: LocalActivityMetrics): void {
    const insertAct = this.db.prepare(`
      INSERT INTO local_activities (local_id, server_id, sport_type, title, privacy, status, start_time, sync_state)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertAct.run(
      activity.localId,
      activity.serverId || null,
      activity.sportType,
      activity.title,
      activity.privacy,
      activity.status,
      activity.startTime,
      activity.syncState
    );

    const insertMet = this.db.prepare(`
      INSERT INTO local_activity_metrics (
        local_activity_id, elapsed_seconds, moving_seconds, distance_meters, avg_speed_mps,
        max_speed_mps, avg_pace_sec_km, current_pace_sec_km, elevation_gain_meters, elevation_loss_meters,
        calories, avg_hr, max_hr, tss_score
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertMet.run(
      metrics.localActivityId,
      metrics.elapsedSeconds,
      metrics.movingSeconds,
      metrics.distanceMeters,
      metrics.avgSpeedMps,
      metrics.maxSpeedMps,
      metrics.avgPaceSecKm,
      metrics.currentPaceSecKm,
      metrics.elevationGainMeters,
      metrics.elevationLossMeters,
      metrics.calories,
      metrics.avgHr,
      metrics.maxHr,
      metrics.tssScore
    );
  }

  insertRawPoint(point: RawGpsPoint): void {
    const stmt = this.db.prepare(`
      INSERT INTO local_raw_points (
        local_activity_id, point_index, timestamp, latitude, longitude,
        altitude, speed, accuracy, heart_rate, cadence, power, is_estimated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      point.localActivityId,
      point.pointIndex,
      point.timestamp,
      point.latitude,
      point.longitude,
      point.altitude ?? null,
      point.speed ?? null,
      point.accuracy,
      point.heartRate ?? null,
      point.cadence ?? null,
      point.power ?? null,
      point.isEstimated ? 1 : 0
    );
  }

  updateMetrics(metrics: LocalActivityMetrics): void {
    const stmt = this.db.prepare(`
      UPDATE local_activity_metrics
      SET elapsed_seconds = ?,
          moving_seconds = ?,
          distance_meters = ?,
          avg_speed_mps = ?,
          max_speed_mps = ?,
          avg_pace_sec_km = ?,
          current_pace_sec_km = ?,
          elevation_gain_meters = ?,
          elevation_loss_meters = ?,
          calories = ?,
          avg_hr = ?,
          max_hr = ?,
          tss_score = ?,
          hr_zone_1_seconds = ?,
          hr_zone_2_seconds = ?,
          hr_zone_3_seconds = ?,
          hr_zone_4_seconds = ?,
          hr_zone_5_seconds = ?
      WHERE local_activity_id = ?
    `);
    stmt.run(
      metrics.elapsedSeconds,
      metrics.movingSeconds,
      metrics.distanceMeters,
      metrics.avgSpeedMps,
      metrics.maxSpeedMps,
      metrics.avgPaceSecKm,
      metrics.currentPaceSecKm,
      metrics.elevationGainMeters,
      metrics.elevationLossMeters,
      metrics.calories,
      metrics.avgHr,
      metrics.maxHr,
      metrics.tssScore,
      metrics.hrZone1Seconds,
      metrics.hrZone2Seconds,
      metrics.hrZone3Seconds,
      metrics.hrZone4Seconds,
      metrics.hrZone5Seconds,
      metrics.localActivityId
    );
  }

  insertSplit(split: LocalSplit): void {
    const stmt = this.db.prepare(`
      INSERT INTO local_splits (
        local_activity_id, split_number, distance_meters, duration_seconds,
        avg_pace_sec_km, elevation_diff, avg_heart_rate
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      split.localActivityId,
      split.splitNumber,
      split.distanceMeters,
      split.durationSeconds,
      split.avgPaceSecKm,
      split.elevationDiff,
      split.avgHeartRate ?? null
    );
  }

  finalizeActivity(localId: string, endTime: number, finalMetrics: LocalActivityMetrics): void {
    const stmtAct = this.db.prepare(`
      UPDATE local_activities
      SET status = 'COMPLETED',
          end_time = ?
      WHERE local_id = ?
    `);
    stmtAct.run(endTime, localId);
    this.updateMetrics(finalMetrics);
  }

  updateActivityStatus(localId: string, status: 'RECORDING' | 'PAUSED' | 'COMPLETED'): void {
    const stmt = this.db.prepare('UPDATE local_activities SET status = ? WHERE local_id = ?');
    stmt.run(status, localId);
  }

  getUnfinishedActivity(): LocalActivity | null {
    const stmt = this.db.prepare(`
      SELECT local_id as localId, server_id as serverId, sport_type as sportType,
             title, privacy, status, start_time as startTime, end_time as endTime, sync_state as syncState
      FROM local_activities
      WHERE status IN ('RECORDING', 'PAUSED')
      ORDER BY start_time DESC
      LIMIT 1
    `);
    const row = stmt.get() as any;
    return row ? row : null;
  }

  getAllPointsForActivity(localActivityId: string): RawGpsPoint[] {
    const stmt = this.db.prepare(`
      SELECT local_activity_id as localActivityId, point_index as pointIndex, timestamp,
             latitude, longitude, altitude, speed, accuracy, heart_rate as heartRate,
             cadence, power, is_estimated
      FROM local_raw_points
      WHERE local_activity_id = ?
      ORDER BY point_index ASC
    `);
    const rows = stmt.all(localActivityId) as any[];
    return rows.map((r) => ({
      localActivityId: r.localActivityId,
      pointIndex: r.pointIndex,
      timestamp: r.timestamp,
      latitude: r.latitude,
      longitude: r.longitude,
      altitude: r.altitude,
      speed: r.speed,
      accuracy: r.accuracy,
      heartRate: r.heartRate,
      cadence: r.cadence,
      power: r.power,
      isEstimated: Boolean(r.is_estimated)
    }));
  }

  getMetricsForActivity(localActivityId: string): LocalActivityMetrics | null {
    const stmt = this.db.prepare(`
      SELECT local_activity_id as localActivityId, elapsed_seconds as elapsedSeconds,
             moving_seconds as movingSeconds, distance_meters as distanceMeters,
             avg_speed_mps as avgSpeedMps, max_speed_mps as maxSpeedMps,
             avg_pace_sec_km as avgPaceSecKm, current_pace_sec_km as currentPaceSecKm,
             elevation_gain_meters as elevationGainMeters, elevation_loss_meters as elevationLossMeters,
             calories, avg_hr as avgHr, max_hr as maxHr, tss_score as tssScore,
             hr_zone_1_seconds as hrZone1Seconds, hr_zone_2_seconds as hrZone2Seconds,
             hr_zone_3_seconds as hrZone3Seconds, hr_zone_4_seconds as hrZone4Seconds,
             hr_zone_5_seconds as hrZone5Seconds
      FROM local_activity_metrics
      WHERE local_activity_id = ?
    `);
    const row = stmt.get(localActivityId) as any;
    return row ? row : null;
  }

  getSplitsForActivity(localActivityId: string): LocalSplit[] {
    const stmt = this.db.prepare(`
      SELECT local_activity_id as localActivityId, split_number as splitNumber,
             distance_meters as distanceMeters, duration_seconds as durationSeconds,
             avg_pace_sec_km as avgPaceSecKm, elevation_diff as elevationDiff,
             avg_heart_rate as avgHeartRate
      FROM local_splits
      WHERE local_activity_id = ?
      ORDER BY split_number ASC
    `);
    return stmt.all(localActivityId) as any[];
  }

  enqueueSyncItem(item: Omit<LocalSyncQueueItem, 'id'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO local_sync_queue (entity_type, local_id, payload, total_chunks, status)
      VALUES (?, ?, ?, ?, 'PENDING')
      ON CONFLICT(local_id) DO UPDATE SET
        payload = excluded.payload,
        status = 'PENDING',
        retry_count = 0
    `);
    stmt.run(item.entityType, item.localId, item.payload, item.totalChunks);
  }

  getPendingSyncItems(): LocalSyncQueueItem[] {
    const stmt = this.db.prepare(`
      SELECT id, entity_type as entityType, local_id as localId, payload,
             uploaded_chunk_index as uploadedChunkIndex, total_chunks as totalChunks,
             retry_count as retryCount, last_attempt as lastAttempt, status, error_message as errorMessage
      FROM local_sync_queue
      WHERE status IN ('PENDING', 'FAILED')
      ORDER BY id ASC
    `);
    return stmt.all() as any[];
  }

  markSyncComplete(localId: string, serverId?: string): void {
    const stmtQueue = this.db.prepare('DELETE FROM local_sync_queue WHERE local_id = ?');
    stmtQueue.run(localId);

    const stmtAct = this.db.prepare(`
      UPDATE local_activities
      SET sync_state = 'SYNCED',
          server_id = COALESCE(?, server_id)
      WHERE local_id = ?
    `);
    stmtAct.run(serverId || null, localId);
  }

  close(): void {
    this.db.close();
  }
}
