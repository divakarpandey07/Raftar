import { Club, ClubChallenge, ChallengeContribution, LeaderboardEntry } from './types';
import { ValidatedActivityRecord } from '../goals/goals-engine';

export class ClubChallengeEngine {
  private contributions: Map<string, ChallengeContribution> = new Map(); // key: challengeId_activityId_athleteId

  /**
   * Aggregates valid completed activities of club members into a competitive leaderboard.
   */
  static generateClubLeaderboard(
    club: Club,
    activities: ValidatedActivityRecord[],
    startDateIso: string,
    endDateIso: string
  ): LeaderboardEntry[] {
    const startTime = new Date(startDateIso + 'T00:00:00Z').getTime();
    const endTime = new Date(endDateIso + 'T23:59:59.999Z').getTime();
    const memberMap = new Map<string, string>();
    for (const m of club.members) {
      memberMap.set(m.athleteId, m.athleteName);
    }

    const memberStats = new Map<
      string,
      { distance: number; elevation: number; duration: number; count: number }
    >();

    for (const m of club.members) {
      memberStats.set(m.athleteId, { distance: 0, elevation: 0, duration: 0, count: 0 });
    }

    for (const act of activities) {
      if (act.isDeleted || act.status !== 'COMPLETED' || act.validityStatus === 'INVALID') {
        continue;
      }
      if (act.startTime < startTime || act.startTime > endTime) {
        continue;
      }

      const athleteId = (act as any).athleteId || club.members[0]?.athleteId;
      if (!memberStats.has(athleteId)) continue;

      const stats = memberStats.get(athleteId)!;
      stats.distance += act.distanceMeters;
      stats.elevation += act.elevationGainMeters;
      stats.duration += act.durationSeconds;
      stats.count += 1;
    }

    const leaderboard: LeaderboardEntry[] = [];
    for (const [athId, stats] of memberStats.entries()) {
      leaderboard.push({
        athleteId: athId,
        athleteName: memberMap.get(athId) || 'Athlete',
        rank: 0,
        totalDistanceMeters: Number(stats.distance.toFixed(1)),
        totalElevationMeters: Number(stats.elevation.toFixed(1)),
        totalDurationSeconds: stats.duration,
        activityCount: stats.count
      });
    }

    leaderboard.sort((a, b) => {
      if (b.totalDistanceMeters !== a.totalDistanceMeters) {
        return b.totalDistanceMeters - a.totalDistanceMeters;
      }
      return b.activityCount - a.activityCount;
    });

    for (let i = 0; i < leaderboard.length; i++) {
      leaderboard[i].rank = i + 1;
    }

    return leaderboard;
  }

  /**
   * Idempotently ingests activity contributions to a club challenge, preventing double-counting.
   */
  ingestActivityContribution(
    challenge: ClubChallenge,
    activity: ValidatedActivityRecord & { athleteId: string }
  ): { challenge: ClubChallenge; isNewContribution: boolean } {
    if (activity.isDeleted || activity.status !== 'COMPLETED' || activity.validityStatus === 'INVALID') {
      return { challenge, isNewContribution: false };
    }

    const startTime = new Date(challenge.startDate + 'T00:00:00Z').getTime();
    const endTime = new Date(challenge.endDate + 'T23:59:59.999Z').getTime();

    if (activity.startTime < startTime || activity.startTime > endTime) {
      return { challenge, isNewContribution: false };
    }

    const uniqueKey = `${challenge.id}_${activity.id}_${activity.athleteId}`;
    if (this.contributions.has(uniqueKey)) {
      return { challenge, isNewContribution: false }; // Idempotent: already contributed!
    }

    let metricDelta = 0;
    switch (challenge.challengeType) {
      case 'TOTAL_DISTANCE':
        metricDelta = activity.distanceMeters;
        break;
      case 'TOTAL_ELEVATION':
        metricDelta = activity.elevationGainMeters;
        break;
      case 'MOST_ACTIVITIES':
        metricDelta = 1;
        break;
    }

    this.contributions.set(uniqueKey, {
      challengeId: challenge.id,
      activityId: activity.id,
      athleteId: activity.athleteId,
      metricValue: metricDelta,
      contributedAt: Date.now()
    });

    const newCurrentVal = Number((challenge.currentValue + metricDelta).toFixed(1));
    const isCompleted = newCurrentVal >= challenge.targetValue;

    const uniqueAthletes = new Set(
      Array.from(this.contributions.values())
        .filter((c) => c.challengeId === challenge.id)
        .map((c) => c.athleteId)
    );

    const updatedChallenge: ClubChallenge = {
      ...challenge,
      currentValue: newCurrentVal,
      isCompleted,
      status: isCompleted ? 'COMPLETED' : challenge.status,
      participantCount: uniqueAthletes.size
    };

    return { challenge: updatedChallenge, isNewContribution: true };
  }
}
