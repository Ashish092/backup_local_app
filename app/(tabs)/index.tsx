import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import NotificationCard from '@/components/Dashboard/NotificationCard';
import ActiveJobCard from '@/components/Dashboard/ActiveJobCard';
import ManualTimeClock from '@/components/Dashboard/ManualTimeClock';
import WeeklyHoursSummary from '@/components/Dashboard/WeeklyHoursSummary';

export default function DashboardScreen() {
  const { userProfile } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // Trigger refresh of child components by changing key
    setRefreshKey(prev => prev + 1);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setRefreshing(false);
  }, []);

  // Called when job status is updated from ActiveJobCard
  const handleJobUpdate = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  // Get greeting based on time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const firstName = userProfile?.first_name || userProfile?.display_name || 'there';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            tintColor="#0066cc"
            colors={['#0066cc']}
          />
        }
      >
        {/* Greeting Header */}
        <View style={styles.greetingHeader}>
          <Text style={styles.greetingText}>{getGreeting()},</Text>
          <Text style={styles.userName}>{firstName}!</Text>
        </View>

        {/* Weekly Hours Summary */}
        <View style={styles.section}>
          <WeeklyHoursSummary key={`weekly-${refreshKey}`} />
        </View>

        {/* Active Job Card - Shows when job is on_the_way or started with action buttons */}
        <View style={styles.section}>
          <ActiveJobCard key={`active-job-${refreshKey}`} onJobUpdate={handleJobUpdate} />
        </View>

        {/* Notifications */}
        <View style={styles.section}>
          <NotificationCard />
        </View>

        {/* Manual Time Clock */}
        <View style={styles.section}>
          <ManualTimeClock />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  greetingHeader: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
  },
  greetingText: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 4,
  },
  userName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
});
