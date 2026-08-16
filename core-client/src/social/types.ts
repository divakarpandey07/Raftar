import { SportType } from '../types';
import { AchievementBadge } from '../achievements/types';

export type FeedItemType = 'ACTIVITY' | 'ACHIEVEMENT' | 'GOAL_MILESTONE' | 'CLUB_EVENT';
export type ReactionType = 'KUDOS' | 'FIRE' | 'MUSCLE' | 'HEART';
export type VisibilityLevel = 'PUBLIC' | 'FOLLOWERS_ONLY' | 'PRIVATE';

export interface ReactionRecord {
  athleteId: string;
  reactionType: ReactionType;
  createdAt: number;
}

export interface ReactionSummary {
  kudosCount: number;
  fireCount: number;
  muscleCount: number;
  heartCount: number;
  totalReactions: number;
  currentUserReaction?: ReactionType; // Strict: Exactly one active reaction per athlete per activity
}

export interface ThreadedComment {
  id: string;
  feedItemId: string;
  athleteId: string;
  athleteName: string;
  athleteAvatarUrl?: string;
  content: string;
  parentCommentId?: string; // Strictly depth <= 2
  isDeleted: boolean;
  createdAt: number;
  updatedAt?: number;
}

export interface FeedItem {
  id: string;
  athleteId: string;
  athleteName: string;
  athleteAvatarUrl?: string;
  type: FeedItemType;
  title: string;
  description?: string;
  sportType?: SportType;
  distanceMeters?: number;
  durationSeconds?: number;
  elevationGainMeters?: number;
  averagePaceSecKm?: number;
  averageSpeedKmh?: number;
  averageHeartRate?: number;
  svgPolylineString?: string;
  mediaUrls?: string[];
  achievement?: AchievementBadge;
  visibility: VisibilityLevel;
  reactions: ReactionSummary;
  commentsCount: number;
  createdAt: number;
}

export interface FollowRelationship {
  followerId: string;
  followingId: string;
  status: 'PENDING' | 'ACCEPTED' | 'BLOCKED';
  createdAt: number;
}

export interface FeedCursor {
  createdAt: number;
  id: string;
}
