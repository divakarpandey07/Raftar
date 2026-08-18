export type NotificationChannel = 'IN_APP' | 'PUSH' | 'EMERGENCY_SMS' | 'EMAIL';

export type NotificationPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL_EMERGENCY';

export type NotificationCategory =
  | 'ACHIEVEMENT_UNLOCKED'
  | 'GOAL_MILESTONE'
  | 'CLUB_CHALLENGE_UPDATE'
  | 'SAFETY_BEACON_SOS'
  | 'SAFETY_BEACON_HEARTBEAT_LOST'
  | 'SOCIAL_KUDOS'
  | 'SOCIAL_COMMENT'
  | 'AI_COACHING_INSIGHT';

export interface AppNotification {
  id: string;
  recipientId: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  body: string;
  dataPayload?: Record<string, any>;
  channels: NotificationChannel[];
  idempotencyKey: string;
  isRead: boolean;
  createdAt: number;
}
