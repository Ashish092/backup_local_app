import React, { useEffect, useState, useRef, useCallback } from 'react';
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
import { bookingSupabase } from '@/lib/supabase';
import {
  getServiceColor,
  getHourlyRate,
  calculateEndOfLeaseStaffAmount,
  calculateEndOfLeaseHours,
  getOnceOffTag,
  formatDateShort,
  formatSectionDate,
} from '@/lib/jobUtils';

// ============================================================================
// TYPES
// ============================================================================

export interface BookingJob {
  id: string;
  booking_number: string;
  selected_service: string;
  status: string;
  pricing?: any;
  service_details_id?: string;
  is_recurring: boolean;
  // Service-specific details
  duration?: string;
  frequency?: string;
  preferred_day?: string;
  service_type?: string;
  // Recurring instance IDs (for bidding)
  instance_ids?: string[];
  // App status
  booking_status_on_app?: {
    booking_id: string;
    job_status: string;
    requested_by: string | null;
    is_recurring: boolean;
  } | null;
  customer: {
    first_name: string;
    last_name: string;
    suburb: string;
    postcode: string;
    schedule_date: string;
    address?: string;
  } | null;
}

export type ServiceFilterType = 
  | 'all' 
  | 'Once-Off Cleaning' 
  | 'Regular Cleaning' 
  | 'NDIS Cleaning' 
  | 'Airbnb Cleaning' 
  | 'End of Lease Cleaning' 
  | 'Commercial Cleaning';

interface OpenJobsListProps {
  serviceFilter: ServiceFilterType;
  onJobPress: (job: BookingJob) => void;
  onDataLoaded?: (jobs: BookingJob[]) => void;
}


// ============================================================================
// DATA FETCHING
// ============================================================================

interface ServiceDetails {
  duration?: string;
  frequency?: string;
  preferred_day?: string;
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
        columns: 'duration, frequency, special_requests' 
      },
      'Airbnb Cleaning': { 
        table: 'airbnb_cleaning_details', 
        columns: 'duration, service_type, bedrooms' 
      },
      'Commercial Cleaning': { 
        table: 'commercial_cleaning_details', 
        columns: 'hours_per_visit, frequency, preferred_day' 
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
    result.preferred_day = (data as any).preferred_day;
    result.service_type = (data as any).service_type;

    return result;
  } catch {
    return result;
  }
}

async function fetchOpenJobs(): Promise<BookingJob[]> {
  // Step 1: Fetch all bookings with status 'pending' or 'confirmed'
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
    .in('status', ['pending', 'confirmed'])
    .order('created_at', { ascending: false });

  if (bookingsError) {
    console.error('Error fetching bookings:', bookingsError);
    throw bookingsError;
  }

  // Step 2: Fetch all booking_status_on_app records
  const { data: appStatusData } = await bookingSupabase
    .from('booking_status_on_app')
    .select('booking_id, job_status, is_recurring');

  const statusMap = new Map<string, { 
    booking_id: string; 
    job_status: string; 
    is_recurring: boolean;
  }>();
  
  if (appStatusData) {
    appStatusData.forEach((status: any) => {
      statusMap.set(status.booking_id, status);
    });
  }

  // Step 3: Get all recurring booking IDs that need instance checking
  const recurringBookingIds = (bookingsData || [])
    .filter((booking: any) => {
      const appStatus = statusMap.get(booking.id);
      return appStatus?.is_recurring === true;
    })
    .map((booking: any) => booking.id);

  // Step 4: Fetch next 3 instances for recurring bookings
  const today = new Date().toISOString().split('T')[0];
  let recurringInstancesMap = new Map<string, boolean>(); // booking_id -> has open instance
  let recurringInstanceIdsMap = new Map<string, string[]>(); // booking_id -> array of instance IDs

  if (recurringBookingIds.length > 0) {
    const { data: instancesData } = await bookingSupabase
      .from('recurring_booking_status')
      .select('id, master_booking_id, job_status, instance_date')
      .in('master_booking_id', recurringBookingIds)
      .gte('instance_date', today)
      .order('instance_date', { ascending: true });

    if (instancesData) {
      // Group instances by master_booking_id and check first 3
      const groupedInstances = new Map<string, any[]>();
      instancesData.forEach((inst: any) => {
        if (!groupedInstances.has(inst.master_booking_id)) {
          groupedInstances.set(inst.master_booking_id, []);
        }
        const instances = groupedInstances.get(inst.master_booking_id)!;
        if (instances.length < 3) {
          instances.push(inst);
        }
      });

      // Check if any of the first 3 instances are 'open' AND store instance IDs
      groupedInstances.forEach((instances, bookingId) => {
        const hasOpenInstance = instances.some((inst: any) => inst.job_status === 'open');
        recurringInstancesMap.set(bookingId, hasOpenInstance);
        
        // Store the instance IDs (all 3, or however many are available)
        const instanceIds = instances.map((inst: any) => inst.id);
        recurringInstanceIdsMap.set(bookingId, instanceIds);
      });
    }
  }

  // Step 5: Filter bookings based on the logic
  const availableBookings = (bookingsData || []).filter((booking: any) => {
    const appStatus = statusMap.get(booking.id);
    
    // SCENARIO A: No record in booking_status_on_app - show it
    if (!appStatus) {
      return true;
    }

    // SCENARIO B: Record exists - check if recurring or not
    if (appStatus.is_recurring === false) {
      // NON-RECURRING: Only show if job_status is 'open'
      return appStatus.job_status === 'open';
    } else {
      // RECURRING: Check if any of next 3 instances are 'open'
      return recurringInstancesMap.get(booking.id) === true;
    }
  });

  // Step 6: Fetch service details for available bookings
  const bookingsWithDetails = await Promise.all(
    availableBookings.map(async (booking: any) => {
      const serviceDetails = await fetchServiceDetails(
        booking.selected_service, 
        booking.service_details_id, 
        booking.pricing
      );
      
      const appStatus = statusMap.get(booking.id);
      
      // Get instance IDs for recurring bookings
      const instanceIds = appStatus?.is_recurring ? recurringInstanceIdsMap.get(booking.id) : undefined;
      
      return { 
        ...booking, 
        duration: serviceDetails.duration,
        frequency: serviceDetails.frequency,
        preferred_day: serviceDetails.preferred_day,
        service_type: serviceDetails.service_type,
        booking_status_on_app: appStatus || null,
        instance_ids: instanceIds // NEW: Include instance IDs for recurring jobs
      };
    })
  );

  return bookingsWithDetails as BookingJob[];
}

// ============================================================================
// JOB CARD COMPONENT
// ============================================================================

interface JobCardProps {
  job: BookingJob;
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

  // Render service-specific content
  const renderServiceContent = () => {
    switch (serviceType) {
      // ==================== REGULAR CLEANING ====================
      // Layout: Name | Rate
      //         Location | Date
      //         Duration • Frequency • Fill-in Only (if recurring with open instances)
      case 'Regular Cleaning': {
        const isRecurringWithOpenInstances = job.booking_status_on_app?.is_recurring === true;
        return (
          <>
            {/* Row 1: Name | Rate */}
            <View style={styles.cardRow}>
              <Text style={styles.customerName}>{customerName}</Text>
              <Text style={styles.priceText}>{getPriceDisplay()}</Text>
            </View>
            {/* Row 2: Location | Date */}
            <View style={styles.cardRow}>
              <View style={styles.locationRow}>
                <Ionicons name="location-outline" size={14} color="#6B7280" />
                <Text style={styles.detailText}>{location}</Text>
              </View>
              <Text style={styles.dateText}>{scheduleDate}</Text>
            </View>
            {/* Row 3: Duration • Frequency • Fill-in Only */}
            <View style={styles.cardRow}>
              <View style={styles.locationRow}>
                <Ionicons name="time-outline" size={14} color="#6B7280" />
                <Text style={styles.detailText}>
                  {job.duration || 'TBD'}
                  {job.frequency && ` • ${job.frequency}`}
                  {isRecurringWithOpenInstances && (
                    <Text style={styles.fillInOnlyText}> • Fill-in Only</Text>
                  )}
                </Text>
              </View>
            </View>
          </>
        );
      }

      // ==================== NDIS CLEANING ====================
      case 'NDIS Cleaning': {
        const isRecurringWithOpenInstances = job.booking_status_on_app?.is_recurring === true;
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
                    {isRecurringWithOpenInstances && (
                      <Text style={styles.fillInOnlyText}> • Fill-in Only</Text>
                    )}
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
      </View>
    </TouchableOpacity>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function OpenJobsList({ 
  serviceFilter, 
  onJobPress,
  onDataLoaded 
}: OpenJobsListProps) {
  const [jobs, setJobs] = useState<BookingJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [datePositions, setDatePositions] = useState<Record<string, number>>({});
  
  const scrollViewRef = useRef<ScrollView>(null);
  const hasScrolledToToday = useRef(false);

  const loadData = useCallback(async () => {
    try {
      const data = await fetchOpenJobs();
      setJobs(data);
      onDataLoaded?.(data);
    } catch (error) {
      console.error('Error loading jobs:', error);
    } finally {
      setLoading(false);
    }
  }, [onDataLoaded]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Scroll to today on initial load
  useEffect(() => {
    if (!loading && !hasScrolledToToday.current && Object.keys(datePositions).length > 0) {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const sortedDates = Object.keys(datePositions).filter(d => d !== 'unscheduled').sort();
      const targetDate = sortedDates.find(d => d >= todayStr) || sortedDates[0];
      
      if (targetDate && datePositions[targetDate] !== undefined) {
        hasScrolledToToday.current = true;
        setTimeout(() => {
          scrollViewRef.current?.scrollTo({ 
            y: Math.max(0, datePositions[targetDate] - 10), 
            animated: false 
          });
        }, 100);
      }
    }
  }, [loading, datePositions]);

  const onRefresh = async () => {
    setRefreshing(true);
    hasScrolledToToday.current = false;
    setDatePositions({});
    await loadData();
    setRefreshing(false);
  };

  const handleDateLayout = (dateKey: string, yPosition: number) => {
    setDatePositions(prev => ({ ...prev, [dateKey]: yPosition }));
  };

  // Filter by service type
  const filteredJobs = jobs.filter(job => {
    if (serviceFilter === 'all') return true;
    return job.selected_service === serviceFilter;
  });

  // Sort by schedule_date
  const sortedJobs = [...filteredJobs].sort((a, b) => {
    const dateA = a.customer?.schedule_date || '';
    const dateB = b.customer?.schedule_date || '';
    return dateA.localeCompare(dateB);
  });

  // Group by date
  const jobsByDate = sortedJobs.reduce((acc, job) => {
    const dateKey = job.customer?.schedule_date || 'unscheduled';
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(job);
    return acc;
  }, {} as Record<string, BookingJob[]>);

  // Get sorted date keys
  const sortedDateKeys = Object.keys(jobsByDate)
    .filter(key => key !== 'unscheduled')
    .sort();
  if (jobsByDate['unscheduled']) {
    sortedDateKeys.push('unscheduled');
  }

  // Loading state
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0066cc" />
      </View>
    );
  }

  // Empty state
  if (sortedJobs.length === 0) {
    return (
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.emptyState}>
          <Ionicons name="briefcase-outline" size={64} color="#0066cc" />
          <Text style={styles.emptyText}>No open jobs available</Text>
          <Text style={styles.emptySubtext}>Check back later for new opportunities</Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      ref={scrollViewRef}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.jobsList}>
        {sortedDateKeys.map((dateKey) => {
          const jobsOnDate = jobsByDate[dateKey] || [];
          if (jobsOnDate.length === 0) return null;
          
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const dateObj = dateKey !== 'unscheduled' ? new Date(dateKey + 'T12:00:00') : null;
          const isToday = dateObj && dateObj.toDateString() === today.toDateString();
          
          return (
            <View 
              key={dateKey} 
              style={styles.dateSection}
              onLayout={(event) => {
                const { y } = event.nativeEvent.layout;
                handleDateLayout(dateKey, y);
              }}
            >
              {/* Date Header */}
              <View style={styles.dateSectionHeader}>
                <Text style={[styles.dateSectionText, isToday && styles.dateSectionTextToday]}>
                  {formatSectionDate(dateKey)}
                </Text>
                <Text style={styles.jobCountText}>
                  {jobsOnDate.length} {jobsOnDate.length === 1 ? 'Job' : 'Jobs'}
                </Text>
              </View>
              
              {/* Jobs for this date */}
              {jobsOnDate.map((job) => (
                <JobCard 
                  key={job.id} 
                  job={job} 
                  onPress={() => onJobPress(job)} 
                />
              ))}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 300,
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
  jobsList: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    paddingTop: 8,
  },
  dateSection: {
    marginBottom: 12,
  },
  dateSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    marginBottom: 2,
  },
  dateSectionText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#9CA3AF',
  },
  dateSectionTextToday: {
    color: '#6B9FD6',
    fontWeight: '600',
  },
  jobCountText: {
    fontSize: 11,
    color: '#D1D5DB',
    fontWeight: '500',
  },
  // Job Card Styles
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
    flexDirection: 'row',
    alignItems: 'center',
  },
  serviceBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  recurringIndicator: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  cardContent: {
    flex: 1,
    gap: 4,
  },
  // Card Row Layout
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
  dateText: {
    fontSize: 12,
    color: '#3B82F6',
    fontWeight: '500',
  },
  detailText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  fillInOnlyText: {
    fontSize: 11,
    color: '#F59E0B',
    fontStyle: 'italic',
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
});
