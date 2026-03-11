import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase, bookingSupabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

interface TimeClockPayment {
  id: string;
  booking_id: string;
  booking_status_on_app_id: string;
  instance_id: string | null;
  job_finished_time: string | null;
  worked_hours: number | null;
  actual_job_hours: number | null;
  takeaway_amount: number | null;
  is_active: boolean;
  // Enriched fields
  booking_number?: string;
  selected_service?: string;
  suburb?: string;
  postcode?: string;
  instance_number?: number;
  is_recurring?: boolean;
}

export default function PaymentRecordsList() {
  const { userProfile } = useAuth();
  const [records, setRecords] = useState<TimeClockPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showList, setShowList] = useState(false);
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);

  useEffect(() => {
    if (userProfile?.id) {
      fetchPaymentRecords();
    }
  }, [userProfile?.id]);

  const fetchPaymentRecords = async () => {
    try {
      if (!userProfile?.id) return;

      // Fetch completed time clock records for this user
      const { data: timeClockData, error: timeClockError } = await supabase
        .from('time_clock')
        .select('*')
        .eq('user_id', userProfile.id)
        .eq('is_active', false) // Only completed jobs
        .not('job_finished_time', 'is', null) // Must have finished time
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
            suburb,
            postcode
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
      const enriched: TimeClockPayment[] = timeClockData.map(record => {
        const booking: any = bookingsMap.get(record.booking_id);
        const instance: any = record.instance_id ? instancesMap.get(record.instance_id) : null;

        return {
          ...record,
          booking_number: booking?.booking_number,
          selected_service: booking?.selected_service,
          suburb: booking?.customer?.suburb,
          postcode: booking?.customer?.postcode,
          instance_number: instance?.instance_number,
          is_recurring: !!record.instance_id,
        };
      });

      setRecords(enriched);
    } catch (error) {
      console.error('Error fetching payment records:', error);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatHours = (hours: number | null): string => {
    if (!hours) return '-';
    return `${hours.toFixed(2)}h`;
  };

  // Calculate total pending (takeaway amounts)
  const totalPending = records.reduce((sum, r) => sum + (r.takeaway_amount || 0), 0);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#0066cc" />
      </View>
    );
  }

  if (records.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="wallet-outline" size={32} color="#9CA3AF" />
        <Text style={styles.emptyText}>No payment records yet</Text>
        <Text style={styles.emptySubtext}>Complete jobs to see payment records</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Summary Header - Always Visible */}
      <TouchableOpacity 
        style={styles.summaryHeader}
        onPress={() => setShowList(!showList)}
        activeOpacity={0.7}
      >
        <View style={styles.summaryLeft}>
          <View style={styles.iconContainer}>
            <Ionicons name="wallet" size={24} color="#F59E0B" />
          </View>
          <View style={styles.summaryTextContainer}>
            <Text style={styles.summaryLabel}>Total Earnings</Text>
            <Text style={styles.summaryAmount}>${totalPending.toFixed(2)}</Text>
          </View>
        </View>
        <View style={styles.summaryRight}>
          <Text style={styles.jobCount}>{records.length} jobs</Text>
          <Ionicons
            name={showList ? 'chevron-up' : 'chevron-down'}
            size={24}
            color="#6B7280"
          />
        </View>
      </TouchableOpacity>

      {/* Expanded List */}
      {showList && (
        <View style={styles.recordsList}>
          {records.map((record) => {
            const isExpanded = expandedRecordId === record.id;
            
            return (
              <View key={record.id} style={styles.recordItem}>
                {/* Record Summary - Date and Amount */}
                <TouchableOpacity
                  style={styles.recordSummary}
                  onPress={() => setExpandedRecordId(isExpanded ? null : record.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.recordSummaryLeft}>
                    <View style={styles.recordDateContainer}>
                      <Ionicons name="calendar-outline" size={16} color="#6B7280" />
                      <Text style={styles.recordDate}>{formatDate(record.job_finished_time)}</Text>
                    </View>
                    {record.is_recurring && (
                      <View style={styles.recurringBadge}>
                        <Ionicons name="repeat" size={12} color="#7C3AED" />
                        <Text style={styles.recurringText}>Week {record.instance_number || '?'}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.recordSummaryRight}>
                    <Text style={styles.recordAmount}>
                      ${(record.takeaway_amount || 0).toFixed(2)}
                    </Text>
                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={20}
                      color="#9CA3AF"
                    />
                  </View>
                </TouchableOpacity>

                {/* Record Details - Expanded */}
                {isExpanded && (
                  <View style={styles.recordDetails}>
                    <View style={styles.detailsDivider} />
                    
                    {/* Service Type and Booking Number */}
                    <View style={styles.detailRow}>
                      <View style={styles.detailItem}>
                        <Text style={styles.detailLabel}>Service</Text>
                        <Text style={styles.detailValue}>{record.selected_service || 'N/A'}</Text>
                      </View>
                      <View style={styles.detailItem}>
                        <Text style={styles.detailLabel}>Booking #</Text>
                        <Text style={styles.detailValue}>{record.booking_number || 'N/A'}</Text>
                      </View>
                    </View>

                    {/* Location */}
                    <View style={styles.detailRow}>
                      <View style={styles.detailItemFull}>
                        <Text style={styles.detailLabel}>Location</Text>
                        <View style={styles.locationRow}>
                          <Ionicons name="location-outline" size={14} color="#6B7280" />
                          <Text style={styles.detailValue} numberOfLines={2}>
                            {record.suburb || 'N/A'}
                            {record.postcode ? `, ${record.postcode}` : ''}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Hours Worked */}
                    <View style={styles.detailRow}>
                      <View style={styles.detailItem}>
                        <Text style={styles.detailLabel}>Hours Worked</Text>
                        <Text style={styles.detailValue}>{formatHours(record.worked_hours)}</Text>
                      </View>
                      <View style={styles.detailItem}>
                        <Text style={styles.detailLabel}>Take-away</Text>
                        <Text style={[styles.detailValue, styles.takeawayValue]}>
                          ${(record.takeaway_amount || 0).toFixed(2)}
                        </Text>
                      </View>
                    </View>

                    {/* Type Badge */}
                    <View style={styles.detailRow}>
                      <View style={styles.detailItemFull}>
                        <Text style={styles.detailLabel}>Type</Text>
                        <View
                          style={[
                            styles.typeBadge,
                            { backgroundColor: record.is_recurring ? '#7C3AED' : '#10B981' },
                          ]}
                        >
                          <Text style={styles.typeText}>
                            {record.is_recurring ? 'RECURRING' : 'ONE-TIME'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 16,
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
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FEF3C7',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  summaryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  summaryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  jobCount: {
    fontSize: 12,
    color: '#92400E',
    fontWeight: '500',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryTextContainer: {
    gap: 2,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#92400E',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryAmount: {
    fontSize: 24,
    fontWeight: '700',
    color: '#92400E',
  },
  recordsList: {
    padding: 16,
    gap: 8,
  },
  recordItem: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  recordSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
  },
  recordSummaryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  recordDateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  recordDate: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
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
  recordSummaryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recordAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#10B981',
  },
  recordDetails: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  detailsDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  detailItem: {
    flex: 1,
  },
  detailItemFull: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  detailValue: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '600',
  },
  takeawayValue: {
    color: '#10B981',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  typeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
