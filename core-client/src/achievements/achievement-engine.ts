import { AchievementBadge, AchievementUnlockedEvent, AchievementRevokedEvent, EvidenceClass } from './types';
import { CANONICAL_ACHIEVEMENTS } from './achievement-registry';
import { ValidatedActivityRecord } from '../goals/goals-engine';

export class AchievementEngine {
  private badges: Map<string, AchievementBadge> = new Map();
  private unlockListeners: Set<(event: AchievementUnlockedEvent) => void> = new Set();
  private revokeListeners: Set<(event: AchievementRevokedEvent) => void> = new Set();

  constructor(initialBadges: AchievementBadge[] = []) {
    for (const b of initialBadges) {
      this.badges.set(b.id, { ...b, status: b.unlocked ? 'UNLOCKED' : 'LOCKED' });
    }
  }

  evaluateActivity(newActivity: ValidatedActivityRecord, allActivities: ValidatedActivityRecord[]): AchievementBadge[] {
    const newlyUnlocked: AchievementBadge[] = [];

    const validActivities = allActivities.filter(
      (a) => !a.isDeleted && a.status === 'COMPLETED' && a.validityStatus !== 'INVALID'
    );

    if (newActivity.isDeleted || newActivity.status !== 'COMPLETED' || newActivity.validityStatus === 'INVALID') {
      return [];
    }

    const evidence: EvidenceClass = newActivity.isManual
      ? 'MANUAL'
      : newActivity.validityStatus === 'VALID'
      ? 'GPS_VALIDATED'
      : 'INVALID';

    for (const badgeTemplate of CANONICAL_ACHIEVEMENTS) {
      const existing = this.badges.get(badgeTemplate.id);
      if (existing && existing.status === 'UNLOCKED') {
        continue;
      }

      if (badgeTemplate.minEvidenceRequired === 'GPS_VALIDATED' && evidence === 'MANUAL') {
        continue;
      }

      let isTriggered = false;

      switch (badgeTemplate.id) {
        case 'CENTURION_100K_RIDE':
          if (newActivity.sportType === 'CYCLING' && newActivity.distanceMeters >= 100000) {
            isTriggered = true;
          }
          break;

        case 'MARATHON_HERO':
          if (newActivity.sportType === 'RUNNING' && newActivity.distanceMeters >= 42195) {
            isTriggered = true;
          }
          break;

        case 'HALF_MARATHON_WARRIOR':
          if (newActivity.sportType === 'RUNNING' && newActivity.distanceMeters >= 21097.5) {
            isTriggered = true;
          }
          break;

        case 'SUB_20_5K':
          if (
            newActivity.sportType === 'RUNNING' &&
            newActivity.distanceMeters >= 5000 &&
            newActivity.durationSeconds <= 1200
          ) {
            isTriggered = true;
          }
          break;

        case 'SUB_45_10K':
          if (
            newActivity.sportType === 'RUNNING' &&
            newActivity.distanceMeters >= 10000 &&
            newActivity.durationSeconds <= 2700
          ) {
            isTriggered = true;
          }
          break;

        case 'EVERESTING_8848_SINGLE_ACTIVITY':
          if (newActivity.elevationGainMeters >= 8848) {
            isTriggered = true;
          }
          break;

        case 'ELEVATION_8848_LIFETIME': {
          const totalElev = validActivities.reduce((acc, a) => acc + (a.elevationGainMeters || 0), 0);
          if (totalElev >= 8848) {
            isTriggered = true;
          }
          break;
        }

        case 'DAWN_PATROL': {
          const hours = new Date(newActivity.startTime).getHours();
          if (hours < 6) isTriggered = true;
          break;
        }

        case 'MIDNIGHT_RUNNER': {
          const hours = new Date(newActivity.startTime).getHours();
          if (hours >= 22 || hours < 4) isTriggered = true;
          break;
        }

        case 'CENTURY_CLUB_100_ACTIVITIES':
          if (validActivities.length >= 100) isTriggered = true;
          break;

        case 'STREAK_7_DAYS': {
          const streak = this.calculateConsecutiveDayStreak(validActivities);
          if (streak >= 7) isTriggered = true;
          break;
        }

        case 'STREAK_30_DAYS': {
          const streak = this.calculateConsecutiveDayStreak(validActivities);
          if (streak >= 30) isTriggered = true;
          break;
        }
      }

      if (isTriggered) {
        const unlockedBadge: AchievementBadge = {
          ...badgeTemplate,
          status: 'UNLOCKED',
          unlocked: true,
          unlockedAt: newActivity.endTime || Date.now(),
          triggerActivityId: newActivity.id
        };

        this.badges.set(unlockedBadge.id, unlockedBadge);
        newlyUnlocked.push(unlockedBadge);

        for (const l of this.unlockListeners) {
          l({
            badge: unlockedBadge,
            activityId: newActivity.id,
            timestamp: unlockedBadge.unlockedAt!
          });
        }
      }
    }

    return newlyUnlocked;
  }

  revokeActivityAchievements(deletedActivityId: string, reason = 'Source activity was deleted'): AchievementBadge[] {
    const revoked: AchievementBadge[] = [];

    for (const badge of this.badges.values()) {
      if (badge.triggerActivityId === deletedActivityId && badge.status === 'UNLOCKED') {
        badge.status = 'REVOKED';
        badge.unlocked = false;
        badge.revokedAt = Date.now();
        badge.revocationReason = reason;

        revoked.push(badge);

        for (const l of this.revokeListeners) {
          l({
            badge,
            activityId: deletedActivityId,
            reason,
            timestamp: badge.revokedAt!
          });
        }
      }
    }

    return revoked;
  }

  private calculateConsecutiveDayStreak(activities: ValidatedActivityRecord[]): number {
    if (activities.length === 0) return 0;

    const daysSet = new Set<string>();
    for (const a of activities) {
      const d = new Date(a.startTime).toISOString().slice(0, 10);
      daysSet.add(d);
    }

    const sortedDays = Array.from(daysSet).sort().reverse();
    if (sortedDays.length === 0) return 0;

    let streak = 1;
    let curr = new Date(sortedDays[0]);

    for (let i = 1; i < sortedDays.length; i++) {
      const prevExpected = new Date(curr);
      prevExpected.setDate(prevExpected.getDate() - 1);
      const prevExpectedStr = prevExpected.toISOString().slice(0, 10);

      if (sortedDays[i] === prevExpectedStr) {
        streak++;
        curr = prevExpected;
      } else {
        break;
      }
    }

    return streak;
  }

  getAllUnlockedBadges(): AchievementBadge[] {
    return Array.from(this.badges.values()).filter((b) => b.status === 'UNLOCKED');
  }

  getAllBadges(): AchievementBadge[] {
    return Array.from(this.badges.values());
  }

  subscribe(listener: (event: AchievementUnlockedEvent) => void): () => void {
    return this.onUnlocked(listener);
  }

  onUnlocked(listener: (event: AchievementUnlockedEvent) => void): () => void {
    this.unlockListeners.add(listener);
    return () => this.unlockListeners.delete(listener);
  }

  onRevoked(listener: (event: AchievementRevokedEvent) => void): () => void {
    this.revokeListeners.add(listener);
    return () => this.revokeListeners.delete(listener);
  }
}
