import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

// Configure how notifications are handled when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Register for push notifications and save token to database
 * @returns Push notification token or null if registration failed
 */
export async function registerForPushNotificationsAsync(userId: string): Promise<string | null> {
  let token: string | null = null;

  // Check if device supports push notifications
  if (!Device.isDevice) {
    console.log('Push notifications only work on physical devices');
    return null;
  }

  try {
    // Check existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request permissions if not granted
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Permission not granted for push notifications');
      return null;
    }

    // Get push notification token
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: 'eb85ebfd-c6d0-498e-bff9-46c8731fd335', // Your Expo project ID
    });
    token = tokenData.data;

    console.log('Push notification token:', token);

    // Save token to database
    if (token && userId) {
      await savePushTokenToDatabase(userId, token);
    }

    // Configure notification channel for Android
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#0066cc',
      });
    }

    return token;
  } catch (error) {
    console.error('Error registering for push notifications:', error);
    return null;
  }
}

/**
 * Save push notification token to user profile
 */
async function savePushTokenToDatabase(userId: string, token: string) {
  try {
    const { error } = await supabase
      .from('users')
      .update({ 
        push_token: token,
        push_token_updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      console.error('Error saving push token:', error);
    } else {
      console.log('Push token saved successfully');
    }
  } catch (error) {
    console.error('Error in savePushTokenToDatabase:', error);
  }
}

/**
 * Remove push notification token from database (on logout)
 */
export async function removePushToken(userId: string) {
  try {
    const { error } = await supabase
      .from('users')
      .update({ 
        push_token: null,
        push_token_updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      console.error('Error removing push token:', error);
    }
  } catch (error) {
    console.error('Error in removePushToken:', error);
  }
}

/**
 * Set up notification listeners
 * @returns Cleanup function to remove listeners
 */
export function setupNotificationListeners(
  onNotificationReceived?: (notification: Notifications.Notification) => void,
  onNotificationTapped?: (response: Notifications.NotificationResponse) => void
) {
  // Listener for notifications received while app is in foreground
  const notificationListener = Notifications.addNotificationReceivedListener((notification) => {
    console.log('Notification received:', notification);
    if (onNotificationReceived) {
      onNotificationReceived(notification);
    }
  });

  // Listener for when user taps on notification
  const responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
    console.log('Notification tapped:', response);
    if (onNotificationTapped) {
      onNotificationTapped(response);
    }
  });

  // Return cleanup function
  return () => {
    notificationListener.remove();
    responseListener.remove();
  };
}

/**
 * Send a local test notification (for testing purposes)
 */
export async function sendTestNotification() {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Test Notification 📬",
      body: 'This is a test notification from CleaningP!',
      data: { test: true },
    },
    trigger: { type: 'timeInterval', seconds: 1 } as any,
  });
}

/**
 * Get notification badge count
 */
export async function getBadgeCount(): Promise<number> {
  return await Notifications.getBadgeCountAsync();
}

/**
 * Set notification badge count
 */
export async function setBadgeCount(count: number) {
  await Notifications.setBadgeCountAsync(count);
}

/**
 * Clear all notifications
 */
export async function clearAllNotifications() {
  await Notifications.dismissAllNotificationsAsync();
  await setBadgeCount(0);
}
