import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ActivityIndicator, View, Text } from 'react-native';
import { setupNotificationListeners } from '@/services/pushNotifications';

function RootLayoutContent() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  // Set up push notification listeners
  useEffect(() => {
    const cleanup = setupNotificationListeners(
      // When notification is received (app in foreground)
      (notification) => {
        console.log('📬 Notification received in foreground:', notification);
      },
      // When notification is tapped
      (response) => {
        console.log('👆 Notification tapped:', response);
        // Navigate to the appropriate screen based on notification data
        const data = response.notification.request.content.data;
        if (data?.action_url) {
          router.push(data.action_url as any);
        }
      }
    );

    return cleanup;
  }, []);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === 'auth';

    if (!session && !inAuthGroup) {
      // User is not logged in, redirect to login
      router.replace('/auth/login');
    } else if (session && inAuthGroup) {
      // User is logged in but on auth pages, redirect to tabs
      router.replace('/(tabs)');
    }
  }, [session, loading, segments]);

  if (loading) {
    return (
      <View style={{ 
        flex: 1, 
        justifyContent: 'center', 
        alignItems: 'center',
        backgroundColor: '#f5f5f5' 
      }}>
        <Text style={{ 
          fontSize: 32, 
          fontWeight: '700', 
          color: '#0066cc',
          marginBottom: 20 
        }}>
          CleaningP
        </Text>
        <ActivityIndicator size="large" color="#0066cc" />
      </View>
    );
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        {session ? (
          <>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="time-clock" options={{ headerShown: false }} />
            <Stack.Screen name="+not-found" />
          </>
        ) : (
          <Stack.Screen name="auth" options={{ headerShown: false }} />
        )}
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}

export default function RootLayout() {
  useFrameworkReady();

  return (
    <AuthProvider>
      <RootLayoutContent />
    </AuthProvider>
  );
}
