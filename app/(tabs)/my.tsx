import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { MyRoster, JobsListView } from '@/components/my';
import { useLocalSearchParams, useRouter } from 'expo-router';

type ViewType = 'jobs' | 'roster';

export default function MyJobsScreen() {
  const { userProfile } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ bookingNumber?: string }>();
  const [viewType, setViewType] = useState<ViewType>('roster');
  const [pendingBookingNumber, setPendingBookingNumber] = useState<string | null>(null);
  
  // Refresh key to trigger data reload in child components
  const [refreshKey, setRefreshKey] = useState(0);
  
  // Function to trigger refresh from child components
  const triggerRefresh = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  // Handle booking number from navigation params (from notification tap)
  useEffect(() => {
    if (params.bookingNumber) {
      setPendingBookingNumber(params.bookingNumber);
      // Switch to jobs view if coming from notification
      setViewType('jobs');
      // Clear the param to prevent re-triggering
      router.setParams({ bookingNumber: undefined });
    }
  }, [params.bookingNumber]);

  // Handle shift press from roster - navigate to Jobs tab and open the job
  const handleShiftPress = (bookingNumber: string) => {
    setPendingBookingNumber(bookingNumber);
    setViewType('jobs');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Jobs</Text>
      </View>

      {/* View Type Toggle (Roster / Jobs) */}
      <View style={styles.viewToggleContainer}>
        <TouchableOpacity
          style={[styles.viewToggleButton, viewType === 'roster' && styles.viewToggleButtonActive]}
          onPress={() => setViewType('roster')}
          activeOpacity={0.8}
        >
          <Text style={[styles.viewToggleText, viewType === 'roster' && styles.viewToggleTextActive]}>
            Roster
          </Text>
        </TouchableOpacity>

          <TouchableOpacity
          style={[styles.viewToggleButton, viewType === 'jobs' && styles.viewToggleButtonActive]}
          onPress={() => setViewType('jobs')}
            activeOpacity={0.8}
          >
          <Text style={[styles.viewToggleText, viewType === 'jobs' && styles.viewToggleTextActive]}>
            Jobs
              </Text>
          </TouchableOpacity>
        </View>

      {/* Content based on view type */}
      {viewType === 'roster' ? (
        userProfile?.id && (
          <MyRoster 
            userId={userProfile.id}
            userFirstName={userProfile.first_name || undefined}
            userLastName={userProfile.last_name || undefined}
            onShiftPress={handleShiftPress}
            refreshKey={refreshKey}
            onJobStatusChange={triggerRefresh}
          />
        )
      ) : (
        userProfile?.id && (
          <JobsListView 
            userId={userProfile.id}
            userFirstName={userProfile.first_name || undefined}
            userLastName={userProfile.last_name || undefined}
            pendingBookingNumber={pendingBookingNumber}
            onPendingBookingHandled={() => setPendingBookingNumber(null)}
            refreshKey={refreshKey}
            onJobStatusChange={triggerRefresh}
          />
        )
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  viewToggleContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
  },
  viewToggleButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  viewToggleButtonActive: {
    borderBottomColor: '#0066cc',
  },
  viewToggleText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#6B7280',
  },
  viewToggleTextActive: {
    color: '#0066cc',
    fontWeight: '600',
  },
});
