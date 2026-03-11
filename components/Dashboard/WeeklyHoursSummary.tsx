import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

interface WeeklyStats {
  totalHours: number;
  totalJobs: number;
}

export default function WeeklyHoursSummary() {
  const { userProfile } = useAuth();
  const [stats, setStats] = useState<WeeklyStats>({ totalHours: 0, totalJobs: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userProfile?.id) {
      fetchWeeklyStats();
    }
  }, [userProfile?.id]);

  const fetchWeeklyStats = async () => {
    try {
      if (!userProfile?.id) return;

      // Get start of current week (Monday)
      const today = new Date();
      const dayOfWeek = today.getDay();
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Handle Sunday (0)
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() + diffToMonday);
      startOfWeek.setHours(0, 0, 0, 0);

      // Get end of current week (Sunday)
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);

      // Fetch time clock records for this week
      const { data: timeClockData, error } = await supabase
        .from('time_clock')
        .select('worked_hours, is_active')
        .eq('user_id', userProfile.id)
        .gte('job_finished_time', startOfWeek.toISOString())
        .lte('job_finished_time', endOfWeek.toISOString());

      if (error) throw error;

      // Calculate stats
      const totalHours = (timeClockData || []).reduce((sum, record) => {
        return sum + (record.worked_hours || 0);
      }, 0);

      const totalJobs = (timeClockData || []).filter(r => !r.is_active).length;

      setStats({ totalHours, totalJobs });
    } catch (error) {
      console.error('Error fetching weekly stats:', error);
      setStats({ totalHours: 0, totalJobs: 0 });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color="#0066cc" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="time-outline" size={20} color="#0066cc" />
        <Text style={styles.headerTitle}>This Week</Text>
      </View>
      
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stats.totalHours.toFixed(1)}h</Text>
          <Text style={styles.statLabel}>Hours Worked</Text>
        </View>
        
        <View style={styles.divider} />
        
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stats.totalJobs}</Text>
          <Text style={styles.statLabel}>Jobs Completed</Text>
        </View>
      </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0066cc',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  divider: {
    width: 1,
    height: 40,
    backgroundColor: '#E5E7EB',
  },
});
