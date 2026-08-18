import {
  AppNotification,
  NotificationCategory,
  NotificationPriority,
  NotificationChannel
} from './types';

export class NotificationEngine {
  private notifications: Map<string, AppNotification> = new Map();
  private processedIdempotencyKeys: Set<string> = new Set();
  private userInAppBoxes: Map<string, AppNotification[]> = new Map();

  /**
   * Idempotently dispatches a notification across specified delivery channels.
   */
  dispatch(params: {
    recipientId: string;
    category: NotificationCategory;
    priority?: NotificationPriority;
    title: string;
    body: string;
    dataPayload?: Record<string, any>;
    channels?: NotificationChannel[];
    idempotencyKey: string;
  }): { dispatched: boolean; notification?: AppNotification; reason?: string } {
    const priority = params.priority || 'NORMAL';
    const channels = params.channels || ['IN_APP'];

    // 1. Idempotency Guard: Drop exact duplicate notifications
    if (this.processedIdempotencyKeys.has(params.idempotencyKey)) {
      return {
        dispatched: false,
        reason: 'DUPLICATE_IDEMPOTENCY_KEY'
      };
    }

    const notificationId = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const notification: AppNotification = {
      id: notificationId,
      recipientId: params.recipientId,
      category: params.category,
      priority,
      title: params.title,
      body: params.body,
      dataPayload: params.dataPayload,
      channels,
      idempotencyKey: params.idempotencyKey,
      isRead: false,
      createdAt: Date.now()
    };

    this.notifications.set(notificationId, notification);
    this.processedIdempotencyKeys.add(params.idempotencyKey);

    // Add to user's in-app inbox
    const userBox = this.userInAppBoxes.get(params.recipientId) || [];
    userBox.unshift(notification);
    this.userInAppBoxes.set(params.recipientId, userBox);

    return {
      dispatched: true,
      notification
    };
  }

  getInAppNotifications(recipientId: string): AppNotification[] {
    return this.userInAppBoxes.get(recipientId) || [];
  }

  markAsRead(notificationId: string): boolean {
    const notif = this.notifications.get(notificationId);
    if (!notif) return false;
    notif.isRead = true;
    return true;
  }

  getUnreadCount(recipientId: string): number {
    const userBox = this.userInAppBoxes.get(recipientId) || [];
    return userBox.filter((n) => !n.isRead).length;
  }
}
