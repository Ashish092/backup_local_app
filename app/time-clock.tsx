import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import DateRangeFilter from '@/components/Profile/DateRangeFilter';
import TimeClockList from '@/components/Profile/TimeClockList';

interface TimeClockStats {
  totalHours: number;
  totalJobs: number;
  activeJobs: number;
}

export default function TimeClockScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [stats, setStats] = useState<TimeClockStats>({
    totalHours: 0,
    totalJobs: 0,
    activeJobs: 0,
  });

  const handleDateChange = React.useCallback((newStartDate: Date, newEndDate: Date) => {
    setStartDate(newStartDate);
    setEndDate(newEndDate);
  }, []);

  const handleStatsUpdate = React.useCallback((newStats: TimeClockStats) => {
    setStats(newStats);
  }, []);

  if (!user) {
    return null;
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.title}>My Time Clock</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Stats Cards - Fixed at top */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Ionicons name="time" size={24} color="#3B82F6" />
          <Text style={styles.statValue}>{stats.totalHours.toFixed(1)}h</Text>
          <Text style={styles.statLabel}>Total Hours</Text>
        </View>

        <View style={styles.statCard}>
          <Ionicons name="checkmark-circle" size={24} color="#10B981" />
          <Text style={styles.statValue}>{stats.totalJobs}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>

        <View style={styles.statCard}>
          <Ionicons name="sync-circle" size={24} color="#F59E0B" />
          <Text style={styles.statValue}>{stats.activeJobs}</Text>
          <Text style={styles.statLabel}>In Progress</Text>
        </View>
      </View>

      {/* Date Range Filter Component */}
      <DateRangeFilter onDateChange={handleDateChange} />

      {/* Scrollable Records List */}
      <ScrollView showsVerticalScrollIndicator={false} style={styles.scrollContainer}>
        {startDate && endDate ? (
          <TimeClockList
            userId={user.id}
            startDate={startDate}
            endDate={endDate}
            onStatsUpdate={handleStatsUpdate}
          />
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>Initializing...</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 12,
    backgroundColor: '#fff',
  },
  statCard: {
    flex: 1,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 11,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  scrollContainer: {
    flex: 1,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#999',
    marginTop: 16,
  },
});

