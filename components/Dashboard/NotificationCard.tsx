import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';

interface Notification {
  id: string;
  title: string;
  body: string;
  notification_type: string;
  category: string;
  priority: string;
  is_read: boolean;
  user_id: string | null; // NULL for global notifications
  action_url: string | null;
  action_label: string | null;
  data: any;
  created_at: string;
}

interface NotificationRead {
  notification_id: string;
  user_id: string;
}

interface NotificationCardProps {
  onNavigateToJob?: (bookingNumber: string) => void;
}

export default function NotificationCard({ onNavigateToJob }: NotificationCardProps) {
  const { userProfile } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (userProfile?.id) {
      fetchNotifications();
    }
  }, [userProfile?.id]);

  // Admin-only notification types that workers should not see
  const ADMIN_ONLY_NOTIFICATION_TYPES = [
    'user_cancelled_booking',
    'job_accepted_admin',
  ];

  const fetchNotifications = async () => {
    try {
      if (!userProfile?.id) return;

      // Fetch notifications (user-specific + global)
      const { data: notifData, error: notifError } = await supabase
        .from('notifications')
        .select('*')
        .or(`user_id.eq.${userProfile.id},user_id.is.null`)
        .order('created_at', { ascending: false })
        .limit(20); // Fetch more to account for filtering

      if (notifError) throw notifError;
      
      // Filter out admin-only notifications for workers
      // Admin-only notifications have user_id: null but are meant for admin dashboard only
      const filteredNotifData = (notifData || []).filter(notif => {
        // If it's a user-specific notification, always show it
        if (notif.user_id !== null) return true;
        // If it's a global notification, exclude admin-only types
        return !ADMIN_ONLY_NOTIFICATION_TYPES.includes(notif.notification_type);
      }).slice(0, 10); // Limit to 10 after filtering

      // Fetch read status for global notifications
      const { data: readsData } = await supabase
        .from('notification_reads')
        .select('notification_id')
        .eq('user_id', userProfile.id);

      const readNotificationIds = new Set(readsData?.map(r => r.notification_id) || []);

      // Merge read status
      const enrichedNotifications = filteredNotifData.map(notif => ({
        ...notif,
        is_read: notif.user_id ? notif.is_read : readNotificationIds.has(notif.id),
      }));

      setNotifications(enrichedNotifications);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  // Helper to extract booking number from old action_url format like /jobs/CH_0153
  const extractBookingNumber = (actionUrl: string | null): string | null => {
    if (!actionUrl) return null;
    const match = actionUrl.match(/\/jobs\/(CH_\d+)/);
    return match ? match[1] : null;
  };

  const handleNotificationPress = async (notification: Notification) => {
    try {
      if (!userProfile?.id) return;

      // Mark as read if unread
      if (!notification.is_read) {
        if (notification.user_id) {
          // User-specific notification - update is_read
          await supabase
            .from('notifications')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('id', notification.id);
        } else {
          // Global notification - insert into notification_reads
          await supabase
            .from('notification_reads')
            .insert({
              notification_id: notification.id,
              user_id: userProfile.id,
            });
        }
        
        setNotifications((prev) =>
          prev.map((notif) =>
            notif.id === notification.id ? { ...notif, is_read: true } : notif
          )
        );
      }

      // Handle navigation based on notification type and action_url
      try {
        // Get booking number from notification data
        const bookingNumber = notification.data?.booking_number || 
                              notification.data?.service_type && extractBookingNumber(notification.action_url);
        
        // For new_job notifications, go to Jobs tab with booking number to auto-open details
        if (
          notification.notification_type === 'new_job' ||
          (notification.notification_type === 'push' && notification.category === 'job')
        ) {
          console.log('📍 New job notification - navigating to Jobs with booking:', bookingNumber);
          if (bookingNumber) {
            router.push({ pathname: '/jobs', params: { bookingNumber } } as any);
          } else {
            router.push('/jobs' as any);
          }
        }
        // For bid_approved notifications, ALWAYS go to My Jobs tab with booking number
        // (even if old action_url points to /jobs/booking_number)
        else if (
          notification.notification_type === 'bid_approved' ||
          notification.category === 'bid_approval' ||
          notification.notification_type === 'job_accepted' ||
          (notification.data?.type === 'bid_approved')
        ) {
          console.log('📍 Bid approved notification - navigating to My Jobs with booking:', bookingNumber);
          // Navigate to My Jobs with booking number as query param
          if (bookingNumber) {
            router.push({ pathname: '/my', params: { bookingNumber } } as any);
          } else {
            router.push('/my' as any);
          }
        } else if (notification.action_url) {
          console.log('📍 Navigating to:', notification.action_url);
          
          // For tab navigation from within the app
          if (notification.action_url.includes('/(tabs)/my') || notification.action_url === '/my') {
            if (bookingNumber) {
              router.push({ pathname: '/my', params: { bookingNumber } } as any);
            } else {
              router.push('/my' as any);
            }
          } else if (notification.action_url.includes('/(tabs)/jobs') || notification.action_url === '/jobs') {
            router.push('/jobs' as any);
          } else if (notification.action_url.includes('/(tabs)/profile') || notification.action_url === '/profile') {
            router.push('/profile' as any);
          } else if (notification.action_url.startsWith('/jobs/')) {
            // Old format like /jobs/CH_0153 - these are bid approvals, go to My Jobs
            const oldBookingNumber = notification.action_url.split('/jobs/')[1];
            router.push({ pathname: '/my', params: { bookingNumber: oldBookingNumber } } as any);
          } else {
            // For other routes, try as-is
            router.push(notification.action_url as any);
          }
        }
        
        // If parent provided a callback to highlight the job, call it
        if (onNavigateToJob && bookingNumber) {
          // Delay to ensure navigation completes
          setTimeout(() => {
            onNavigateToJob(bookingNumber);
          }, 500);
        }
      } catch (navError) {
        console.error('Navigation error:', navError);
      }
    } catch (error) {
      console.error('Error handling notification press:', error);
    }
  };

  const getNotificationIcon = (category: string, priority: string) => {
    // Icon based on category
    if (category === 'job') {
      return { name: 'briefcase', color: '#0066cc' };
    } else if (category === 'timeclock') {
      return { name: 'time', color: '#F59E0B' };
    } else if (category === 'payment') {
      return { name: 'cash', color: '#10B981' };
    } else if (category === 'communication') {
      return { name: 'chatbubbles', color: '#8B5CF6' };
    }
    
    // Fallback based on priority
    if (priority === 'urgent' || priority === 'high') {
      return { name: 'alert-circle', color: '#EF4444' };
    }
    return { name: 'information-circle', color: '#0066cc' };
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  // Separate unread and read notifications
  const unreadNotifications = notifications.filter((n) => !n.is_read);
  const readNotifications = notifications.filter((n) => n.is_read);
  const unreadCount = unreadNotifications.length;
  
  // Sort unread by date (newest first), then read by date (newest first)
  const sortedUnread = [...unreadNotifications].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const sortedRead = [...readNotifications].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  
  // Combine: unread first, then fill with read to make top 5
  const top5Notifications = [...sortedUnread, ...sortedRead].slice(0, 5);
  
  // Display 2 by default (minimized), all 5 when expanded
  const displayNotifications = expanded ? top5Notifications : top5Notifications.slice(0, 2);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#0066cc" />
      </View>
    );
  }

  // Show empty state only if there are no notifications at all
  if (notifications.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="notifications-off-outline" size={32} color="#9CA3AF" />
        <Text style={styles.emptyText}>No notifications</Text>
        <Text style={styles.emptySubtext}>You're all set for now</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="notifications" size={24} color="#0066cc" />
          <Text style={styles.headerTitle}>Notifications</Text>
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity onPress={() => setExpanded(!expanded)}>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={20}
            color="#6B7280"
          />
        </TouchableOpacity>
      </View>

      <View style={styles.notificationsList}>
        {displayNotifications.map((notification) => {
          const icon = getNotificationIcon(notification.category, notification.priority);
          return (
            <TouchableOpacity
              key={notification.id}
              style={[
                styles.notificationItem,
                !notification.is_read && styles.notificationUnread,
                notification.is_read && styles.notificationRead,
              ]}
              onPress={() => handleNotificationPress(notification)}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.iconContainer,
                  { backgroundColor: `${icon.color}15` },
                ]}
              >
                <Ionicons
                  name={icon.name as any}
                  size={20}
                  color={icon.color}
                />
              </View>
              <View style={styles.notificationContent}>
                <View style={styles.notificationHeader}>
                  <Text
                    style={[
                      styles.notificationTitle,
                      !notification.is_read && styles.notificationTitleUnread,
                    ]}
                  >
                    {notification.title}
                  </Text>
                  {!notification.is_read && <View style={styles.unreadDot} />}
                </View>
                <Text style={styles.notificationMessage} numberOfLines={2}>
                  {notification.body}
                </Text>
                <View style={styles.notificationFooter}>
                  <Text style={styles.notificationTime}>
                    {formatTime(notification.created_at)}
                  </Text>
                  {notification.action_url && (
                    <View style={styles.actionIndicator}>
                      <Text style={styles.actionText}>
                        {notification.action_label || 'View'}
                      </Text>
                      <Ionicons name="chevron-forward" size={12} color="#0066cc" />
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {top5Notifications.length > 2 && (
        <TouchableOpacity
          style={styles.seeAllButton}
          onPress={() => setExpanded(!expanded)}
        >
          <Text style={styles.seeAllText}>
            {expanded ? 'Show Less' : `View More (${top5Notifications.length - 2})`}
          </Text>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color="#0066cc"
          />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  loadingContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  emptyContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginTop: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  badge: {
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  notificationsList: {
    gap: 12,
  },
  notificationItem: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  notificationUnread: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  notificationRead: {
    opacity: 0.7,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationContent: {
    flex: 1,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  notificationTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    flex: 1,
  },
  notificationTitleUnread: {
    color: '#111827',
    fontWeight: '700',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0066cc',
  },
  notificationMessage: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
    marginBottom: 4,
  },
  notificationFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  notificationTime: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  actionIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  actionText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0066cc',
  },
  seeAllButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    paddingTop: 12,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0066cc',
  },
});

