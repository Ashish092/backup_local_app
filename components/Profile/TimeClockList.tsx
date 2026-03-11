import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, TouchableOpacity } from 'react-native';
import { supabase, bookingSupabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';

interface TimeClockRecord {
  id: string;
  user_id: string;
  booking_id: string;
  booking_status_on_app_id: string;
  instance_id: string | null;
  on_the_way_status: string;
  on_the_way_time: string | null;
  job_start_time: string | null;
  job_finished_time: string | null;
  on_the_way_duration: number | null;
  worked_hours: number | null;
  actual_job_hours: number | null;
  takeaway_amount: number | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

interface EnrichedTimeClockRecord extends TimeClockRecord {
  booking_number?: string;
  selected_service?: string;
  customer_name?: string;
  instance_number?: number;
  is_recurring?: boolean;
}

interface TimeClockStats {
  totalHours: number;
  totalJobs: number;
  activeJobs: number;
}

interface TimeClockListProps {
  userId: string;
  startDate: Date;
  endDate: Date;
  onStatsUpdate: (stats: TimeClockStats) => void;
}

export default function TimeClockList({ userId, startDate, endDate, onStatsUpdate }: TimeClockListProps) {
  const [records, setRecords] = useState<EnrichedTimeClockRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (userId && startDate && endDate) {
      fetchRecords();
    }
  }, [userId, startDate, endDate]);

  // Calculate and emit stats whenever records change
  useEffect(() => {
    const totalHours = records.reduce((sum, record) => sum + (record.worked_hours || 0), 0);
    const totalJobs = records.filter(r => !r.is_active).length;
    const activeJobs = records.filter(r => r.is_active).length;
    
    onStatsUpdate({ totalHours, totalJobs, activeJobs });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records]); // onStatsUpdate is stable (memoized in parent), safe to omit

  async function fetchRecords() {
    try {
      setLoading(true);

      const startDateStr = startDate.toISOString();
      const endDateStr = endDate.toISOString();

      // Fetch time clock records for this user only
      // Filter by job_finished_time (when job was completed)
      const { data: timeClockData, error: timeClockError } = await supabase
        .from('time_clock')
        .select('*')
        .eq('user_id', userId)
        .gte('job_finished_time', startDateStr)
        .lte('job_finished_time', endDateStr)
        .order('job_finished_time', { ascending: false });

      if (timeClockError) throw timeClockError;

      if (!timeClockData || timeClockData.length === 0) {
        setRecords([]);
        return;
      }

      // Get unique booking IDs
      const bookingIds = [...new Set(timeClockData.map(r => r.booking_id))];

      // Fetch booking details from booking database
      const { data: bookingsData } = await bookingSupabase
        .from('bookings')
        .select(`
          id,
          booking_number,
          selected_service,
          customer:customers!fk_bookings_customer_id (
            first_name,
            last_name
          )
        `)
        .in('id', bookingIds);

      const bookingsMap = new Map(bookingsData?.map((b: any) => [b.id, b]) || []);

      // Get instance IDs that are not null
      const instanceIds = timeClockData
        .filter(r => r.instance_id)
        .map(r => r.instance_id);

      // Fetch instance details if any
      let instancesMap = new Map();
      if (instanceIds.length > 0) {
        const { data: instancesData } = await bookingSupabase
          .from('recurring_booking_status')
          .select('id, instance_number')
          .in('id', instanceIds);

        instancesMap = new Map(instancesData?.map((i: any) => [i.id, i]) || []);
      }

      // Enrich records with booking and instance data
      const enriched = timeClockData.map(record => {
        const booking: any = bookingsMap.get(record.booking_id);
        const instance: any = record.instance_id ? instancesMap.get(record.instance_id) : null;

        return {
          ...record,
          booking_number: booking?.booking_number,
          selected_service: booking?.selected_service,
          customer_name: booking?.customer 
            ? `${booking.customer.first_name || ''} ${booking.customer.last_name || ''}`.trim()
            : undefined,
          instance_number: instance?.instance_number,
          is_recurring: !!record.instance_id,
        };
      });

      setRecords(enriched);
    } catch (error) {
      console.error('Error fetching time clock records:', error);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }

  function formatHours(hours: number | null): string {
    if (!hours) return '-';
    return `${hours.toFixed(2)}h`;
  }

  function formatTime(timestamp: string | null): string {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function formatDate(timestamp: string): string {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function getStatusColor(onTheWayStatus: string, isActive: boolean): string {
    if (!isActive) return '#10B981'; // Green - Completed
    
    switch (onTheWayStatus) {
      case 'started': return '#F59E0B'; // Orange - On the Way
      case 'job_started': return '#3B82F6'; // Blue - In Progress
      case 'cancelled': return '#EF4444'; // Red - Cancelled
      default: return '#6B7280'; // Gray
    }
  }

  function getStatusLabel(onTheWayStatus: string, isActive: boolean): string {
    if (!isActive) return 'Completed';
    
    switch (onTheWayStatus) {
      case 'started': return 'On the Way';
      case 'job_started': return 'In Progress';
      case 'cancelled': return 'Cancelled';
      default: return onTheWayStatus;
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0066cc" />
        <Text style={styles.loadingText}>Loading records...</Text>
      </View>
    );
  }

  if (records.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="time-outline" size={64} color="#ccc" />
        <Text style={styles.emptyText}>No time clock records found</Text>
        <Text style={styles.emptySubtext}>Complete jobs to see them here</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {records.map((record) => (
        <View key={record.id} style={styles.recordCard}>
          <View style={styles.recordHeader}>
            <View style={styles.headerLeft}>
              <View style={styles.dateRow}>
                <Text style={styles.jobDate}>
                  {record.job_finished_time ? formatDate(record.job_finished_time) : 'N/A'}
                </Text>
                {record.is_recurring && (
                  <View style={styles.recurringBadge}>
                    <Ionicons name="repeat" size={12} color="#7C3AED" />
                    <Text style={styles.recurringText}>Week {record.instance_number || '?'}</Text>
                  </View>
                )}
              </View>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(record.on_the_way_status, record.is_active) }]}>
                <Text style={styles.statusText}>
                  {getStatusLabel(record.on_the_way_status, record.is_active)}
                </Text>
              </View>
            </View>
            <View style={styles.headerRight}>
              <Text style={styles.workedHours}>{formatHours(record.worked_hours)}</Text>
              {record.takeaway_amount !== null && record.takeaway_amount > 0 && (
                <Text style={styles.takeawayAmount}>${record.takeaway_amount.toFixed(2)}</Text>
              )}
            </View>
          </View>

          <View style={styles.recordBody}>
            <View style={styles.infoRow}>
              <Ionicons name="briefcase-outline" size={16} color="#666" />
              <Text style={styles.infoText}>{record.selected_service || 'Service not available'}</Text>
            </View>

            {record.customer_name && (
              <View style={styles.infoRow}>
                <Ionicons name="person-outline" size={16} color="#666" />
                <Text style={styles.infoText}>{record.customer_name}</Text>
              </View>
            )}

            {record.booking_number && (
              <View style={styles.infoRow}>
                <Ionicons name="document-text-outline" size={16} color="#666" />
                <Text style={styles.infoText}>#{record.booking_number}</Text>
              </View>
            )}
          </View>

          <View style={styles.timelineContainer}>
            <View style={styles.timelineItem}>
              <View style={styles.timelineDot} />
              <View style={styles.timelineContent}>
                <Text style={styles.timelineLabel}>On the Way</Text>
                <Text style={styles.timelineTime}>{formatTime(record.on_the_way_time)}</Text>
              </View>
            </View>

            <View style={styles.timelineLine} />

            <View style={styles.timelineItem}>
              <View style={styles.timelineDot} />
              <View style={styles.timelineContent}>
                <Text style={styles.timelineLabel}>Job Started</Text>
                <Text style={styles.timelineTime}>{formatTime(record.job_start_time)}</Text>
              </View>
            </View>

            <View style={styles.timelineLine} />

            <View style={styles.timelineItem}>
              <View style={[styles.timelineDot, styles.timelineDotLast]} />
              <View style={styles.timelineContent}>
                <Text style={styles.timelineLabel}>Job Finished</Text>
                <Text style={styles.timelineTime}>{formatTime(record.job_finished_time)}</Text>
              </View>
            </View>
          </View>

          {record.notes && (
            <View style={styles.notesContainer}>
              <Text style={styles.notesLabel}>Notes:</Text>
              <Text style={styles.notesText}>{record.notes}</Text>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  recordCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  recordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerLeft: {
    flex: 1,
    gap: 8,
  },
  headerRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  jobDate: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
  },
  recurringBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  recurringText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7C3AED',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  workedHours: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0066cc',
  },
  takeawayAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10B981',
  },
  recordBody: {
    gap: 8,
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  timelineContainer: {
    paddingLeft: 8,
    marginTop: 8,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0066cc',
  },
  timelineDotLast: {
    backgroundColor: '#10B981',
  },
  timelineLine: {
    width: 2,
    height: 20,
    backgroundColor: '#E5E7EB',
    marginLeft: 4,
  },
  timelineContent: {
    flex: 1,
    paddingVertical: 4,
  },
  timelineLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  timelineTime: {
    fontSize: 13,
    color: '#000',
    marginTop: 2,
  },
  notesContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
  },
  notesLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400E',
    marginBottom: 4,
  },
  notesText: {
    fontSize: 13,
    color: '#78350f',
    lineHeight: 18,
  },
});

