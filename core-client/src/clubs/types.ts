import { SportType } from '../types';

export type ClubPrivacy = 'PUBLIC' | 'REQUEST_TO_JOIN' | 'INVITE_ONLY';
export type ChallengeType = 'TOTAL_DISTANCE' | 'TOTAL_ELEVATION' | 'MOST_ACTIVITIES';
export type ChallengeStatus = 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';

export interface ClubMember {
  athleteId: string;
  athleteName: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  joinedAt: number;
}

export interface Club {
  id: string;
  name: string;
  description: string;
  sportType: SportType;
  coverImageUrl?: string;
  privacy: ClubPrivacy;
  memberCount: number;
  members: ClubMember[];
  createdAt: number;
}

export interface ChallengeContribution {
  challengeId: string;
  activityId: string;
  athleteId: string;
  metricValue: number;
  contributedAt: number;
}

export interface ClubChallenge {
  id: string;
  clubId: string;
  title: string;
  description: string;
  challengeType: ChallengeType;
  targetValue: number;
  currentValue: number;
  startDate: string; // ISO YYYY-MM-DD
  endDate: string;   // ISO YYYY-MM-DD
  timezone?: string;
  status: ChallengeStatus;
  isCompleted: boolean;
  participantCount: number;
  createdAt: number;
}

export interface LeaderboardEntry {
  athleteId: string;
  athleteName: string;
  rank: number;
  totalDistanceMeters: number;
  totalElevationMeters: number;
  totalDurationSeconds: number;
  activityCount: number;
}
