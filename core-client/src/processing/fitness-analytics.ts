import { DatabaseSync } from 'node:sqlite';
import { SqliteStorage } from '../database/sqlite-storage';

export class LocalFitnessAnalytics {
  private db: DatabaseSync;

  constructor(storageOrDb: SqliteStorage | DatabaseSync) {
    if (storageOrDb instanceof SqliteStorage) {
      this.db = (storageOrDb as any).db;
    } else {
      this.db = storageOrDb;
    }
  }

  getWeeklyTss(): { totalTss: number; dailyTss: number[]; status: string } {
    const sevenDaysAgo = Date.now() - (7 * 86400 * 1000);
    const stmt = this.db.prepare(`
      SELECT a.start_time, COALESCE(m.tss_score, 0) as tss
      FROM local_activities a
      LEFT JOIN local_activity_metrics m ON a.local_id = m.local_activity_id
      WHERE a.start_time >= ?
      ORDER BY a.start_time ASC
    `);
    const rows = stmt.all(sevenDaysAgo) as any[];

    const daily = [0, 0, 0, 0, 0, 0, 0];
    let total = 0;

    for (const r of rows) {
      const dayIndex = new Date(r.start_time).getDay();
      const adjustedIndex = (dayIndex + 6) % 7;
      daily[adjustedIndex] += r.tss;
      total += r.tss;
    }

    let status = 'RECOVERY';
    if (total > 600) status = 'OVERREACHING';
    else if (total >= 350) status = 'OPTIMAL';
    else if (total >= 150) status = 'PRODUCTIVE';

    return { totalTss: total, dailyTss: daily, status };
  }

  getLifetimeTotals(): { distanceKm: number; totalHours: number; elevationGainM: number; activityCount: number } {
    const stmt = this.db.prepare(`
      SELECT 
        COUNT(*) as activityCount,
        COALESCE(SUM(m.distance_meters), 0) as totalDistanceM,
        COALESCE(SUM(m.moving_seconds), 0) as totalMovingSec,
        COALESCE(SUM(m.elevation_gain_meters), 0) as totalElevationM
      FROM local_activities a
      JOIN local_activity_metrics m ON a.local_id = m.local_activity_id
      WHERE a.status = 'COMPLETED'
    `);
    const r = stmt.get() as any;
    return {
      distanceKm: Math.round(((r?.totalDistanceM || 0) / 1000) * 10) / 10,
      totalHours: Math.round(((r?.totalMovingSec || 0) / 3600) * 10) / 10,
      elevationGainM: Math.round(r?.totalElevationM || 0),
      activityCount: r?.activityCount || 0
    };
  }

  getPersonalRecords(): { pr10k?: number; longestRideM?: number; fastest5k?: number } {
    const stmt = this.db.prepare(`
      SELECT distance_meters, moving_seconds, sport_type
      FROM local_activities a
      JOIN local_activity_metrics m ON a.local_id = m.local_activity_id
      WHERE a.status = 'COMPLETED'
    `);
    const rows = stmt.all() as any[];

    let longestRide = 0;
    let fastest5kSec = 0;
    let fastest10kSec = 0;

    for (const r of rows) {
      if (r.sport_type === 'CYCLING' && r.distance_meters > longestRide) {
        longestRide = r.distance_meters;
      }
      if (r.sport_type === 'RUNNING') {
        if (r.distance_meters >= 5000) {
          const pace = r.moving_seconds / (r.distance_meters / 1000);
          const est5k = pace * 5;
          if (fastest5kSec === 0 || est5k < fastest5kSec) fastest5kSec = est5k;
        }
        if (r.distance_meters >= 10000) {
          const pace = r.moving_seconds / (r.distance_meters / 1000);
          const est10k = pace * 10;
          if (fastest10kSec === 0 || est10k < fastest10kSec) fastest10kSec = est10k;
        }
      }
    }

    return {
      longestRideM: longestRide > 0 ? longestRide : undefined,
      fastest5k: fastest5kSec > 0 ? Math.round(fastest5kSec) : undefined,
      pr10k: fastest10kSec > 0 ? Math.round(fastest10kSec) : undefined
    };
  }
}
