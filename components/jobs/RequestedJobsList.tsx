import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase, bookingSupabase } from '@/lib/supabase';

// ============================================================================
// TYPES
// ============================================================================

export interface RequestedJob {
  id: string;
  booking_number: string;
  selected_service: string;
  status: string;
  pricing?: any;
  service_details_id?: string;
  is_recurring: boolean;
  duration?: string;
  frequency?: string;
  service_type?: string;
  requested_at?: string;
  customer: {
    first_name: string;
    last_name: string;
    suburb: string;
    postcode: string;
    schedule_date: string;
    address?: string;
  } | null;
}

interface RequestedJobsListProps {
  userId: string;
  onJobPress?: (job: RequestedJob) => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SERVICE_COLORS: Record<string, string> = {
  'Once-Off Cleaning': '#3B82F6',
  'Regular Cleaning': '#10B981',
  'NDIS Cleaning': '#8B5CF6',
  'Airbnb Cleaning': '#F59E0B',
  'End of Lease Cleaning': '#EF4444',
  'Commercial Cleaning': '#6366F1',
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const getServiceColor = (service: string): string => {
  return SERVICE_COLORS[service] || '#6B7280';
};

const getHourlyRate = (serviceType: string): string | null => {
  const rateMap: Record<string, string | undefined> = {
    'Once-Off Cleaning': process.env.EXPO_PUBLIC_RATE_ONCE_OFF,
    'Regular Cleaning': process.env.EXPO_PUBLIC_RATE_REGULAR,
    'NDIS Cleaning': process.env.EXPO_PUBLIC_RATE_NDIS,
    'Airbnb Cleaning': process.env.EXPO_PUBLIC_RATE_AIRBNB,
    'Commercial Cleaning': process.env.EXPO_PUBLIC_RATE_COMMERCIAL,
  };
  return rateMap[serviceType] || null;
};

/**
 * Calculate End of Lease staff amount
 * Formula: (totalPrice - 10% GST) × 60%
 */
const calculateEndOfLeaseStaffAmount = (pricing: any): number => {
  let totalPrice = 0;
  if (typeof pricing === 'object' && pricing !== null) {
    totalPrice = pricing.totalPrice || pricing.total || pricing.amount || 0;
  } else if (typeof pricing === 'number') {
    totalPrice = pricing;
  }
  if (totalPrice <= 0) return 0;
  const afterGST = totalPrice * 0.9;
  const staffAmount = afterGST * 0.6;
  return Math.round(staffAmount);
};

/**
 * Calculate estimated hours for End of Lease
 * Formula: staffAmount / 30 (rounded to 0.5)
 */
const calculateEndOfLeaseHours = (staffAmount: number): string => {
  if (staffAmount <= 0) return 'TBD';
  const rawHours = staffAmount / 30;
  const roundedHours = Math.round(rawHours * 2) / 2; // Round to nearest 0.5
  return `${roundedHours} hours`;
};

/**
 * Get Once-Off Cleaning tag based on base_rate
 */
/**
 * Get Once-Off Cleaning tag based on basePrice
 * 161 = blank, 225 = Deep Cleaning, 188 = Move-in Cleaning
 */
const getOnceOffTag = (pricing: any): string => {
  if (!pricing) return '';
  const basePrice = pricing.basePrice || pricing.base_price || 0;
  
  if (basePrice === 225) return 'Deep Cleaning';
  if (basePrice === 188) return 'Move-in Cleaning';
  // 161 or any other value = blank
  return '';
};

/**
 * Format date as "Day. Date. Month"
 */
const formatDateShort = (dateString: string): string => {
  if (!dateString) return '';
  const date = new Date(dateString + 'T12:00:00');
  const day = date.toLocaleDateString('en-AU', { weekday: 'short' });
  const dayNum = date.getDate();
  const month = date.toLocaleDateString('en-AU', { month: 'short' });
  return `${day}. ${dayNum} ${month}`;
};

// ============================================================================
// SERVICE DETAILS FETCHING
// ============================================================================

interface ServiceDetails {
  duration?: string;
  frequency?: string;
  service_type?: string;
}

async function fetchServiceDetails(
  serviceType: string, 
  serviceDetailsId: string, 
  pricing?: any
): Promise<ServiceDetails> {
  const result: ServiceDetails = {};

  if (serviceType === 'End of Lease Cleaning') {
    if (pricing) {
      const staffAmount = calculateEndOfLeaseStaffAmount(pricing);
      result.duration = calculateEndOfLeaseHours(staffAmount);
    }
    return result;
  }

  if (!serviceDetailsId) return result;

  try {
    const tableMap: Record<string, { table: string; columns: string }> = {
      'Once-Off Cleaning': { 
        table: 'once_off_cleaning_details', 
        columns: 'duration, service_type' 
      },
      'Regular Cleaning': { 
        table: 'regular_cleaning_details', 
        columns: 'duration, frequency' 
      },
      'NDIS Cleaning': { 
        table: 'ndis_cleaning_details', 
        columns: 'duration, frequency' 
      },
      'Airbnb Cleaning': { 
        table: 'airbnb_cleaning_details', 
        columns: 'duration, service_type, bedrooms' 
      },
      'Commercial Cleaning': { 
        table: 'commercial_cleaning_details', 
        columns: 'hours_per_visit, frequency' 
      },
    };

    const config = tableMap[serviceType];
    if (!config) return result;

    const { data, error } = await bookingSupabase
      .from(config.table)
      .select(config.columns)
      .eq('id', serviceDetailsId)
      .single();

    if (error || !data) return result;

    if (serviceType === 'Commercial Cleaning') {
      result.duration = (data as any).hours_per_visit 
        ? `${(data as any).hours_per_visit} hours` 
        : undefined;
    } else {
      result.duration = (data as any).duration;
    }
    result.frequency = (data as any).frequency;
    result.service_type = (data as any).service_type;

    return result;
  } catch {
    return result;
  }
}

// ============================================================================
// DATA FETCHING
// ============================================================================

async function fetchRequestedJobs(userId: string): Promise<RequestedJob[]> {
  const { data: bidsData, error: bidsError } = await supabase
    .from('bids')
    .select('booking_id, created_at')
    .eq('user_id', userId)
    .eq('status', 'pending');

  if (bidsError) {
    console.error('Error fetching bids:', bidsError);
    return [];
  }

  if (!bidsData || bidsData.length === 0) {
    return [];
  }

  const bookingIds = bidsData.map((bid: any) => bid.booking_id);

  const { data: bookingsData, error: bookingsError } = await bookingSupabase
    .from('bookings')
    .select(`
      id,
      booking_number,
      selected_service,
      status,
      pricing,
      service_details_id,
      is_recurring,
      customer:customers!fk_bookings_customer_id (
        first_name,
        last_name,
        suburb,
        postcode,
        schedule_date,
        address
      )
    `)
    .in('id', bookingIds);

  if (bookingsError) {
    console.error('Error fetching bookings:', bookingsError);
    return [];
  }

  if (!bookingsData) return [];

  const jobsWithDetails = await Promise.all(
    bookingsData.map(async (booking: any) => {
      const serviceDetails = await fetchServiceDetails(
        booking.selected_service, 
        booking.service_details_id, 
        booking.pricing
      );
      
      const bid = bidsData.find((b: any) => b.booking_id === booking.id);
      
      return { 
        ...booking, 
        duration: serviceDetails.duration,
        frequency: serviceDetails.frequency,
        service_type: serviceDetails.service_type,
        requested_at: bid?.created_at,
      };
    })
  );

  return jobsWithDetails as RequestedJob[];
}

// ============================================================================
// JOB CARD COMPONENT
// ============================================================================

interface JobCardProps {
  job: RequestedJob;
  onPress: () => void;
}

function JobCard({ job, onPress }: JobCardProps) {
  const serviceColor = getServiceColor(job.selected_service);
  const serviceType = job.selected_service;

  // Get customer info
  const customerName = job.customer 
    ? `${job.customer.first_name} ${job.customer.last_name}` 
    : 'Customer';
  const location = job.customer?.suburb 
    ? `${job.customer.suburb}, ${job.customer.postcode}` 
    : 'N/A';
  const scheduleDate = formatDateShort(job.customer?.schedule_date || '');

  // Get price/rate display
  const getPriceDisplay = (): string => {
    if (serviceType === 'End of Lease Cleaning') {
      if (job.pricing) {
        const staffAmount = calculateEndOfLeaseStaffAmount(job.pricing);
        if (staffAmount > 0) return `$${staffAmount}`;
      }
      return 'N/A';
    }
    const hourlyRate = getHourlyRate(serviceType);
    return hourlyRate ? `$${hourlyRate}/hr` : 'N/A';
  };

  // Render service-specific content (exactly same as OpenJobsList)
  const renderServiceContent = () => {
    switch (serviceType) {
      // ==================== REGULAR CLEANING ====================
      case 'Regular Cleaning': {
        return (
          <>
            <View style={styles.cardRow}>
              <Text style={styles.customerName}>{customerName}</Text>
              <Text style={styles.priceText}>{getPriceDisplay()}</Text>
            </View>
            <View style={styles.cardRow}>
              <View style={styles.locationRow}>
                <Ionicons name="location-outline" size={14} color="#6B7280" />
                <Text style={styles.detailText}>{location}</Text>
              </View>
              <Text style={styles.dateText}>{scheduleDate}</Text>
            </View>
            <View style={styles.cardRow}>
              <View style={styles.locationRow}>
                <Ionicons name="time-outline" size={14} color="#6B7280" />
                <Text style={styles.detailText}>
                  {job.duration || 'TBD'}
                  {job.frequency && ` • ${job.frequency}`}
                </Text>
              </View>
            </View>
          </>
        );
      }

      // ==================== NDIS CLEANING ====================
      case 'NDIS Cleaning': {
        if (job.is_recurring) {
          return (
            <>
              <View style={styles.cardRow}>
                <Text style={styles.customerName}>{customerName}</Text>
                <Text style={styles.priceText}>{getPriceDisplay()}</Text>
              </View>
              <View style={styles.cardRow}>
                <View style={styles.locationRow}>
                  <Ionicons name="location-outline" size={14} color="#6B7280" />
                  <Text style={styles.detailText}>{location}</Text>
                </View>
                <Text style={styles.dateText}>{scheduleDate}</Text>
              </View>
              <View style={styles.cardRow}>
                <View style={styles.locationRow}>
                  <Ionicons name="time-outline" size={14} color="#6B7280" />
                  <Text style={styles.detailText}>
                    {job.duration || 'TBD'}
                    {job.frequency && ` • ${job.frequency}`}
                  </Text>
                </View>
              </View>
            </>
          );
        } else {
          return (
            <>
              <View style={styles.cardRow}>
                <Text style={styles.customerName}>{customerName}</Text>
                <Text style={styles.priceText}>{getPriceDisplay()}</Text>
              </View>
              <View style={styles.cardRow}>
                <View style={styles.locationRow}>
                  <Ionicons name="location-outline" size={14} color="#6B7280" />
                  <Text style={styles.detailText}>{location}</Text>
                </View>
                <Text style={styles.dateText}>{scheduleDate}</Text>
              </View>
              <View style={styles.cardRow}>
                <View style={styles.locationRow}>
                  <Ionicons name="time-outline" size={14} color="#6B7280" />
                  <Text style={styles.detailText}>{job.duration || 'TBD'}</Text>
                </View>
              </View>
            </>
          );
        }
      }

      // ==================== ONCE-OFF CLEANING ====================
      case 'Once-Off Cleaning': {
        return (
          <>
            <View style={styles.cardRow}>
              <Text style={styles.customerName}>{customerName}</Text>
              <Text style={styles.priceText}>{getPriceDisplay()}</Text>
            </View>
            <View style={styles.cardRow}>
              <View style={styles.locationRow}>
                <Ionicons name="location-outline" size={14} color="#6B7280" />
                <Text style={styles.detailText}>{location}</Text>
              </View>
              <Text style={styles.dateText}>{scheduleDate}</Text>
            </View>
            <View style={styles.cardRow}>
              <View style={styles.locationRow}>
                <Ionicons name="time-outline" size={14} color="#6B7280" />
                <Text style={styles.detailText}>{job.duration || 'TBD'}</Text>
              </View>
            </View>
          </>
        );
      }

      // ==================== AIRBNB CLEANING ====================
      case 'Airbnb Cleaning': {
        return (
          <>
            <View style={styles.cardRow}>
              <Text style={styles.customerName}>{customerName}</Text>
              <Text style={styles.priceText}>{getPriceDisplay()}</Text>
            </View>
            <View style={styles.cardRow}>
              <View style={styles.locationRow}>
                <Ionicons name="location-outline" size={14} color="#6B7280" />
                <Text style={styles.detailText}>{location}</Text>
              </View>
              <Text style={styles.dateText}>{scheduleDate}</Text>
            </View>
            <View style={styles.cardRow}>
              <View style={styles.locationRow}>
                <Ionicons name="time-outline" size={14} color="#6B7280" />
                <Text style={styles.detailText}>{job.duration || 'TBD'}</Text>
              </View>
            </View>
          </>
        );
      }

      // ==================== END OF LEASE CLEANING ====================
      case 'End of Lease Cleaning': {
        const staffAmount = calculateEndOfLeaseStaffAmount(job.pricing);
        const estimatedHours = calculateEndOfLeaseHours(staffAmount);
        
        return (
          <>
            <View style={styles.cardRow}>
              <Text style={styles.customerName}>{customerName}</Text>
              <Text style={styles.priceText}>${staffAmount}</Text>
            </View>
            <View style={styles.cardRow}>
              <View style={styles.locationRow}>
                <Ionicons name="location-outline" size={14} color="#6B7280" />
                <Text style={styles.detailText}>{location}</Text>
              </View>
              <Text style={styles.dateText}>{scheduleDate}</Text>
            </View>
            <View style={styles.cardRow}>
              <View style={styles.locationRow}>
                <Ionicons name="time-outline" size={14} color="#6B7280" />
                <Text style={styles.detailText}>{estimatedHours} • <Text style={styles.estimatedText}>estimated</Text></Text>
              </View>
            </View>
          </>
        );
      }

      // ==================== COMMERCIAL CLEANING ====================
      case 'Commercial Cleaning': {
        return (
          <>
            <View style={styles.cardRow}>
              <Text style={styles.customerName}>{customerName}</Text>
              <Text style={styles.priceText}>{getPriceDisplay()}</Text>
            </View>
            <View style={styles.cardRow}>
              <View style={styles.locationRow}>
                <Ionicons name="location-outline" size={14} color="#6B7280" />
                <Text style={styles.detailText}>{location}</Text>
              </View>
            </View>
            {job.duration && (
              <View style={styles.cardRow}>
                <View style={styles.locationRow}>
                  <Ionicons name="time-outline" size={14} color="#6B7280" />
                  <Text style={styles.detailText}>
                    {job.duration}
                    {job.frequency && ` • ${job.frequency}`}
                  </Text>
                </View>
              </View>
            )}
          </>
        );
      }

      // ==================== DEFAULT ====================
      default: {
        return (
          <>
            <View style={styles.cardRow}>
              <Text style={styles.customerName}>{customerName}</Text>
              <Text style={styles.priceText}>{getPriceDisplay()}</Text>
            </View>
            <View style={styles.cardRow}>
              <View style={styles.locationRow}>
                <Ionicons name="location-outline" size={14} color="#6B7280" />
                <Text style={styles.detailText}>{location}</Text>
              </View>
            </View>
          </>
        );
      }
    }
  };

  return (
    <TouchableOpacity 
      style={styles.jobCard}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.cardLeftBorder, { backgroundColor: serviceColor }]} />
      
      {/* Service badge */}
      <View style={[styles.serviceBadge, { backgroundColor: serviceColor }]}>
        <Text style={styles.serviceBadgeText}>
          {serviceType.replace(' Cleaning', '')}
        </Text>
      </View>
      
      <View style={styles.cardContent}>
        {renderServiceContent()}
        
        {/* Status indicator - unique to Requested tab */}
        <View style={styles.statusRow}>
          <Ionicons name="time" size={12} color="#F59E0B" />
          <Text style={styles.statusText}>Pending Approval</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function RequestedJobsList({ userId, onJobPress }: RequestedJobsListProps) {
  const [jobs, setJobs] = useState<RequestedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadJobs = useCallback(async () => {
    try {
      const data = await fetchRequestedJobs(userId);
      setJobs(data);
    } catch (error) {
      console.error('Error loading requested jobs:', error);
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadJobs();
    setRefreshing(false);
  }, [loadJobs]);

  // Loading state
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0066cc" />
      </View>
    );
  }

  // Empty state
  if (jobs.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={styles.emptyContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.emptyState}>
          <Ionicons name="hand-left-outline" size={64} color="#0066cc" />
          <Text style={styles.emptyText}>No Requested Jobs</Text>
          <Text style={styles.emptySubtext}>Jobs you request will appear here</Text>
        </View>
      </ScrollView>
    );
  }

  // Jobs list
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.listContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {jobs.map((job) => (
        <JobCard
          key={job.id}
          job={job}
          onPress={() => onJobPress?.(job)}
        />
      ))}
    </ScrollView>
  );
}

// ============================================================================
// STYLES (exactly same as OpenJobsList)
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 300,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  emptyState: {
    paddingHorizontal: 20,
    paddingVertical: 60,
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  // Job Card (same as OpenJobsList)
  jobCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    paddingTop: 18,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    marginTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    overflow: 'visible',
  },
  cardLeftBorder: {
    width: 4,
    height: '100%',
    borderRadius: 2,
    marginRight: 12,
    minHeight: 50,
  },
  serviceBadge: {
    position: 'absolute',
    top: -8,
    left: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 4,
  },
  serviceBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  cardContent: {
    flex: 1,
    gap: 4,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  customerName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
    marginRight: 8,
  },
  priceText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF6B35',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  detailText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  dateText: {
    fontSize: 12,
    color: '#3B82F6',
    fontWeight: '500',
  },
  estimatedText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '400',
    fontStyle: 'italic',
  },
  // Tags
  tag: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#3B82F6',
  },
  // Status indicator (unique to Requested)
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  statusText: {
    fontSize: 11,
    color: '#F59E0B',
    fontWeight: '600',
  },
});
