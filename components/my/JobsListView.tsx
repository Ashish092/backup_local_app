import React, { useEffect, useState } from 'react';
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
import { RecurringInstanceCard } from './DetailsPanel';
import MyJobDetailsPanel from './MyJobDetailsPanel';
import {
  getServiceColor,
  getHourlyRate,
  calculateEndOfLeaseStaffAmount,
  calculateEndOfLeaseHours,
  formatDateShort,
  formatDateHeader,
  isDateToday,
  isDatePast,
  getJobStatusTag,
} from '@/lib/jobUtils';

// ============================================================================
// TYPES
// ============================================================================

export interface MyJob {
  id: string; // booking_status_on_app id (used for DB queries)
  display_id?: string; // Unique ID for React keys (for completed instances)
  booking_id: string;
  job_status: string; // from booking_status_on_app (assigned, accepted, on_the_way, started, completed)
  is_recurring: boolean; // from booking_status_on_app
  assigned_to?: string;
  assigned_at: string;
  booking_number: string;
  selected_service: string;
  status: string; // booking status (pending, confirmed, etc.)
  pricing?: any;
  service_details_id?: string;
  duration?: string;
  frequency?: string; // for recurring jobs
  customer: {
    first_name: string;
    last_name: string;
    suburb: string;
    postcode: string;
    schedule_date: string;
    phone?: string;
    address?: string;
  } | null;
  // Recurring instance data (for is_recurring = true jobs)
  recurring_instance?: {
    id: string;
    instance_number: number;
    instance_date: string;
    instance_booking_number: string;
    job_status: string;
    assigned_to: string | null;
  } | null;
}

type JobFilterType = 'open' | 'closed';

interface JobsListViewProps {
  userId: string;
  userFirstName?: string;
  userLastName?: string;
  pendingBookingNumber?: string | null;
  onPendingBookingHandled?: () => void;
  refreshKey?: number;
  onJobStatusChange?: () => void;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function JobsListView({ 
  userId, 
  userFirstName, 
  userLastName,
  pendingBookingNumber,
  onPendingBookingHandled,
  refreshKey,
  onJobStatusChange,
}: JobsListViewProps) {
  const [jobFilter, setJobFilter] = useState<JobFilterType>('open');
  const [myJobs, setMyJobs] = useState<MyJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedJob, setSelectedJob] = useState<MyJob | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    if (userId) {
      fetchMyJobs();
    }
  }, [userId, refreshKey]);

  // Pull-to-refresh handler - triggers full tab refresh
  const onRefresh = async () => {
    setRefreshing(true);
    onJobStatusChange?.(); // Trigger parent refresh
    setRefreshing(false);
  };

  // Handle pending booking number from notification
  useEffect(() => {
    if (pendingBookingNumber && myJobs.length > 0 && !loading) {
      const jobToOpen = myJobs.find(job => job.booking_number === pendingBookingNumber);
      if (jobToOpen) {
        openJobDetails(jobToOpen);
        onPendingBookingHandled?.();
      }
    }
  }, [pendingBookingNumber, myJobs, loading]);

  const calculateEndOfLeaseDuration = (pricing: any): string => {
    let totalPrice = 0;
    
    if (typeof pricing === 'object' && pricing !== null) {
      totalPrice = pricing.totalPrice || pricing.total || pricing.amount || 0;
    } else if (typeof pricing === 'number') {
      totalPrice = pricing;
    }
    
    if (totalPrice <= 0) return 'TBD';
    
    const afterGST = totalPrice * 0.9;
    const staffAmount = afterGST * 0.6;
    const hourlyRate = 30;
    const hours = Math.round(staffAmount / hourlyRate);
    
    return hours > 0 ? `${hours} hours` : 'TBD';
  };

  const fetchMyJobs = async () => {
    try {
      setLoading(true);

      if (!userId) {
        setMyJobs([]);
        return;
      }

      // ===== PART 1: Fetch NON-RECURRING jobs from booking_status_on_app =====
      const { data: nonRecurringStatusData, error: nonRecurringError } = await bookingSupabase
        .from('booking_status_on_app')
        .select('id, booking_id, job_status, is_recurring, assigned_to, assigned_at')
        .eq('assigned_to', userId)
        .eq('is_recurring', false)
        .in('job_status', ['assigned', 'accepted', 'on_the_way', 'started', 'completed'])
        .order('assigned_at', { ascending: false });

      if (nonRecurringError) {
        console.error('Error fetching non-recurring jobs:', nonRecurringError);
        throw nonRecurringError;
      }

      // ===== PART 2: Fetch RECURRING instances directly from recurring_booking_status =====
      const { data: recurringInstancesData, error: recurringError } = await bookingSupabase
        .from('recurring_booking_status')
        .select('id, booking_status_on_app_id, master_booking_id, instance_number, instance_date, instance_booking_number, job_status, assigned_to, assigned_at')
        .eq('assigned_to', userId)
        .in('job_status', ['assigned', 'accepted', 'on_the_way', 'started', 'completed'])
        .order('instance_date', { ascending: true });

      if (recurringError) {
        console.error('Error fetching recurring instances:', recurringError);
        throw recurringError;
      }

      // If no jobs at all, return empty
      if ((!nonRecurringStatusData || nonRecurringStatusData.length === 0) && 
          (!recurringInstancesData || recurringInstancesData.length === 0)) {
        setMyJobs([]);
        return;
      }

      // Collect all booking IDs
      const bookingIds: string[] = [];
      if (nonRecurringStatusData) {
        bookingIds.push(...nonRecurringStatusData.map(s => s.booking_id));
      }
      if (recurringInstancesData) {
        bookingIds.push(...recurringInstancesData.map(i => i.master_booking_id));
      }

      // Fetch bookings data
      const { data: bookingsData, error: bookingsError } = await bookingSupabase
        .from('bookings')
        .select(`
          id, 
          booking_number,
          selected_service,
          status, 
          pricing,
          service_details_id,
          customer:customers!fk_bookings_customer_id (
            first_name,
            last_name,
            suburb,
            postcode,
            schedule_date,
            phone,
            address
          )
        `)
        .in('id', bookingIds);

      if (bookingsError) {
        console.error('Error fetching bookings:', bookingsError);
        throw bookingsError;
      }

      if (!bookingsData) {
        setMyJobs([]);
        return;
      }

      const bookingsMap = new Map(bookingsData.map((b: any) => [b.id, b]));
      const jobs: MyJob[] = [];

      // ===== PROCESS NON-RECURRING JOBS =====
      if (nonRecurringStatusData && nonRecurringStatusData.length > 0) {
        for (const status of nonRecurringStatusData) {
          const booking: any = bookingsMap.get(status.booking_id);
          if (!booking) continue;

          // Fetch duration and frequency from service-specific tables
          const { duration, frequency } = await fetchServiceDetails(
            booking.selected_service,
            booking.service_details_id,
            booking.pricing
          );

          jobs.push({
            id: status.id,
            booking_id: status.booking_id,
            job_status: status.job_status,
            is_recurring: false,
            assigned_to: status.assigned_to,
            assigned_at: status.assigned_at,
            booking_number: booking.booking_number,
            selected_service: booking.selected_service,
            status: booking.status,
            pricing: booking.pricing,
            service_details_id: booking.service_details_id,
            duration,
            frequency,
            customer: booking.customer,
            recurring_instance: null,
          });
        }
      }

      // ===== PROCESS RECURRING INSTANCES =====
      if (recurringInstancesData && recurringInstancesData.length > 0) {
        // Group instances by master_booking_id to fetch booking details once per booking
        const instancesByBooking = new Map<string, typeof recurringInstancesData>();
        recurringInstancesData.forEach((instance: any) => {
          if (!instancesByBooking.has(instance.master_booking_id)) {
            instancesByBooking.set(instance.master_booking_id, []);
          }
          instancesByBooking.get(instance.master_booking_id)!.push(instance);
        });

        for (const [bookingId, instances] of instancesByBooking) {
          const booking: any = bookingsMap.get(bookingId);
          if (!booking) continue;

          // Fetch service details once per booking
          const { duration, frequency } = await fetchServiceDetails(
            booking.selected_service,
            booking.service_details_id,
            booking.pricing
          );

          // Create a job entry for each instance
          for (const instance of instances) {
            jobs.push({
              id: instance.booking_status_on_app_id, // Reference to booking_status_on_app
              display_id: `instance-${instance.id}`, // Unique ID for React keys
              booking_id: bookingId,
              job_status: 'assigned', // From booking_status_on_app (not used for recurring)
              is_recurring: true,
              assigned_to: instance.assigned_to,
              assigned_at: instance.assigned_at,
              booking_number: booking.booking_number,
              selected_service: booking.selected_service,
              status: booking.status,
              pricing: booking.pricing,
              service_details_id: booking.service_details_id,
              duration,
              frequency,
              customer: booking.customer,
              recurring_instance: {
                id: instance.id,
                instance_number: instance.instance_number,
                instance_date: instance.instance_date,
                instance_booking_number: instance.instance_booking_number,
                job_status: instance.job_status,
                assigned_to: instance.assigned_to,
              },
            });
          }
        }
      }

      setMyJobs(jobs);
    } catch (error) {
      console.error('Error in fetchMyJobs:', error);
      setMyJobs([]);
    } finally {
      setLoading(false);
    }
  };

  // Fetch duration and frequency from service-specific tables
  const fetchServiceDetails = async (
    serviceType: string, 
    serviceDetailsId: string, 
    pricing?: any
  ): Promise<{ duration?: string; frequency?: string }> => {
    // End of Lease - calculate duration from pricing
    if (serviceType === 'End of Lease Cleaning') {
      if (pricing) {
        return { duration: calculateEndOfLeaseDuration(pricing), frequency: undefined };
      }
      return { duration: undefined, frequency: undefined };
    }

    if (!serviceDetailsId) {
      return { duration: undefined, frequency: undefined };
    }

    try {
      const tableMap: Record<string, string> = {
        'Once-Off Cleaning': 'once_off_cleaning_details',
        'Regular Cleaning': 'regular_cleaning_details',
        'NDIS Cleaning': 'ndis_cleaning_details',
        'Airbnb Cleaning': 'airbnb_cleaning_details',
        'Commercial Cleaning': 'commercial_cleaning_details',
      };

      const tableName = tableMap[serviceType];
      if (!tableName) return { duration: undefined, frequency: undefined };

      // Different columns for different service types
      let selectColumns = 'duration';
      if (serviceType === 'Regular Cleaning' || serviceType === 'NDIS Cleaning') {
        selectColumns = 'duration, frequency';
      } else if (serviceType === 'Commercial Cleaning') {
        selectColumns = 'hours_per_visit';
      }

      const { data, error } = await bookingSupabase
        .from(tableName)
        .select(selectColumns)
        .eq('id', serviceDetailsId)
        .single();

      if (error) {
        console.error(`Error fetching details from ${tableName}:`, error);
        return { duration: undefined, frequency: undefined };
      }

      if (!data) return { duration: undefined, frequency: undefined };

      // Handle Commercial Cleaning separately
      if (serviceType === 'Commercial Cleaning') {
        const hours = (data as any).hours_per_visit;
        return { duration: hours ? `${hours} hours` : undefined, frequency: undefined };
      }

      return {
        duration: (data as any).duration,
        frequency: (data as any).frequency,
      };
    } catch (error) {
      console.error('Error in fetchServiceDetails:', error);
      return { duration: undefined, frequency: undefined };
    }
  };

  const fetchFullCustomerDetails = async (customerId: string): Promise<any> => {
    try {
      const { data, error } = await bookingSupabase
        .from('customers')
        .select('first_name, last_name, phone, address, suburb, postcode, schedule_date')
        .eq('id', customerId)
        .single();

      if (error) {
        console.error('Error fetching full customer details:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error in fetchFullCustomerDetails:', error);
      return null;
    }
  };

  const openJobDetails = async (job: MyJob) => {
    setSelectedJob(job);
    setModalVisible(true);

    // Fetch full customer details if job is not just assigned
    if (job.job_status !== 'assigned' && job.customer) {
      const { data: bookingData, error: bookingError } = await bookingSupabase
        .from('bookings')
        .select('customer_id')
        .eq('id', job.booking_id)
        .single();

      if (bookingError) {
        console.error('Error fetching booking for customer_id:', bookingError);
        return;
      }

      if (bookingData?.customer_id) {
        const fullCustomerData = await fetchFullCustomerDetails(bookingData.customer_id);
        if (fullCustomerData) {
          setSelectedJob({
            ...job,
            customer: {
              ...job.customer,
              phone: fullCustomerData.phone,
              address: fullCustomerData.address,
            },
          });
        }
      }
    }
  };

  const closeJobDetails = () => {
    setModalVisible(false);
    setSelectedJob(null);
  };

  // ============================================================================
  // FILTER & SORT LOGIC
  // ============================================================================

  // Open toggle = active jobs: assigned, accepted, on_the_way, started
  // Closed toggle = completed and cancelled jobs
  const OPEN_STATUSES = ['assigned', 'accepted', 'on_the_way', 'started'];
  const CLOSED_STATUSES = ['completed', 'cancelled_by_cleaner', 'cancelled_by_customer'];
  
  // Helper to check if job has recurring instance data
  const hasRecurringInstance = (job: MyJob): boolean => {
    return job.recurring_instance !== null && job.recurring_instance !== undefined;
  };

  // Helper to get effective job status
  const getEffectiveJobStatus = (job: MyJob): string => {
    if (hasRecurringInstance(job)) {
      return job.recurring_instance!.job_status;
    }
    return job.job_status;
  };

  // Helper to get effective date
  const getEffectiveDate = (job: MyJob): string | null => {
    if (hasRecurringInstance(job)) {
      return job.recurring_instance!.instance_date;
    }
    return job.customer?.schedule_date || null;
  };

  // Helper to check if job is assigned to current user
  const isAssignedToCurrentUser = (job: MyJob): boolean => {
    if (hasRecurringInstance(job)) {
      return job.recurring_instance!.assigned_to === userId;
    }
    return job.assigned_to === userId;
  };
  
  const filteredJobs = myJobs
    .filter((job) => {
      // For recurring jobs with instance data, check if instance is assigned to current user
      if (hasRecurringInstance(job)) {
        if (!isAssignedToCurrentUser(job)) {
          return false;
        }
      }

      // Get effective status (from instance for recurring, from main for others)
      const effectiveStatus = getEffectiveJobStatus(job);

      if (jobFilter === 'open') {
        return OPEN_STATUSES.includes(effectiveStatus);
      } else {
        return CLOSED_STATUSES.includes(effectiveStatus);
      }
    })
    .sort((a, b) => {
      const dateA = getEffectiveDate(a) ? new Date(getEffectiveDate(a)!).getTime() : 0;
      const dateB = getEffectiveDate(b) ? new Date(getEffectiveDate(b)!).getTime() : 0;
      // For open jobs, sort by nearest date first (ascending)
      // For closed jobs, sort by most recent first (descending)
      return jobFilter === 'open' ? dateA - dateB : dateB - dateA;
    });

  // Group jobs by date (using effective date)
  const groupedJobs: { [key: string]: MyJob[] } = {};
  filteredJobs.forEach((job) => {
    const dateKey = getEffectiveDate(job) || 'no-date';
    if (!groupedJobs[dateKey]) {
      groupedJobs[dateKey] = [];
    }
    groupedJobs[dateKey].push(job);
  });

  // Get sorted date keys (excluding 'no-date' which goes last)
  const sortedDateKeys = Object.keys(groupedJobs)
    .filter(key => key !== 'no-date')
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  
  // Add 'no-date' at the end if it exists
  if (groupedJobs['no-date']) {
    sortedDateKeys.push('no-date');
  }


  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <View style={styles.container}>
      {/* Open/Closed Filter Toggle - Modern Segmented Control */}
      <View style={styles.filterContainer}>
        <View style={styles.segmentedControl}>
          <TouchableOpacity
            style={[styles.segmentButton, jobFilter === 'open' && styles.segmentButtonActive]}
            onPress={() => setJobFilter('open')}
            activeOpacity={0.7}
          >
            <Text style={[styles.segmentText, jobFilter === 'open' && styles.segmentTextActive]}>
              Open
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentButton, jobFilter === 'closed' && styles.segmentButtonActive]}
            onPress={() => setJobFilter('closed')}
            activeOpacity={0.7}
          >
            <Text style={[styles.segmentText, jobFilter === 'closed' && styles.segmentTextActive]}>
              Closed
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Jobs List */}
      <ScrollView 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#0066cc']}
            tintColor="#0066cc"
          />
        }
      >
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#0066cc" />
          </View>
        ) : filteredJobs.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons 
              name={jobFilter === 'open' ? 'briefcase-outline' : 'checkmark-done-outline'} 
              size={64} 
              color="#0066cc" 
            />
            <Text style={styles.emptyText}>
              {jobFilter === 'open' ? 'No Active Jobs' : 'No Closed Jobs'}
            </Text>
            <Text style={styles.emptySubtext}>
              {jobFilter === 'open' 
                ? 'Assigned jobs will appear here' 
                : 'Completed or cancelled jobs will appear here'}
            </Text>
          </View>
        ) : (
          <View style={styles.jobsList}>
            {sortedDateKeys.map((dateKey) => {
              const jobsOnDate = groupedJobs[dateKey];
              const isPast = isDatePast(dateKey);
              const isToday = isDateToday(dateKey);

              return (
                <View key={dateKey} style={styles.dateSection}>
                  {/* Date Header */}
                  <View style={styles.dateHeader}>
                    <Text style={[styles.dateHeaderText, isToday && styles.dateHeaderTextToday]}>
                      {formatDateHeader(dateKey)}
                    </Text>
                    <Text style={styles.jobCount}>
                      {jobsOnDate.length} {jobsOnDate.length === 1 ? 'Job' : 'Jobs'}
                    </Text>
                  </View>

                  {/* Jobs on this date */}
                  {jobsOnDate.map((job) => {
                    const serviceColor = getServiceColor(job.selected_service);
                    const customerName = job.customer 
                      ? `${job.customer.first_name} ${job.customer.last_name}` 
                      : 'Customer';
                    const location = job.customer?.suburb 
                      ? `${job.customer.suburb}, ${job.customer.postcode}` 
                      : 'N/A';
                    const scheduleDate = job.customer?.schedule_date 
                      ? formatDateShort(job.customer.schedule_date) 
                      : '';
                    
                    // Check if this is a closed/completed job
                    const effectiveStatus = getEffectiveJobStatus(job);
                    const isClosed = CLOSED_STATUSES.includes(effectiveStatus);
                    const displayServiceColor = isClosed ? '#9CA3AF' : serviceColor;
                    
                    // Use display_id for React key if available, otherwise use id
                    const reactKey = job.display_id || job.id;
                    
                    // If job has recurring instance data, render RecurringInstanceCard
                    if (hasRecurringInstance(job) && job.recurring_instance) {
                      return (
                        <RecurringInstanceCard
                          key={reactKey}
                          jobId={job.id}
                          bookingId={job.booking_id}
                          bookingNumber={job.booking_number}
                          selectedService={job.selected_service as 'Regular Cleaning' | 'NDIS Cleaning'}
                          customerName={customerName}
                          location={location}
                          duration={job.duration}
                          frequency={job.frequency}
                          instance={job.recurring_instance}
                          onPress={isClosed ? undefined : () => openJobDetails(job)}
                          disabled={isClosed}
                        />
                      );
                    }

                    // Get price display based on service type
                    const getPriceDisplay = (): string => {
                      if (job.selected_service === 'End of Lease Cleaning') {
                        const staffAmount = calculateEndOfLeaseStaffAmount(job.pricing);
                        return staffAmount > 0 ? `$${staffAmount}` : 'N/A';
                      }
                      const hourlyRate = getHourlyRate(job.selected_service);
                      return hourlyRate ? `$${hourlyRate}/hr` : 'N/A';
                    };

                    // For standard cards, use job_status and schedule_date directly
                    const cardJobStatus = job.job_status;
                    const cardScheduleDate = scheduleDate;

                    const statusTag = getJobStatusTag(cardJobStatus);

                    // Render service-specific content
                    const renderServiceContent = () => {
                      const isEndOfLease = job.selected_service === 'End of Lease Cleaning';
                      const staffAmount = isEndOfLease ? calculateEndOfLeaseStaffAmount(job.pricing) : 0;
                      const estimatedHours = isEndOfLease ? calculateEndOfLeaseHours(staffAmount) : '';
                      const showFrequency = job.frequency && 
                        (job.selected_service === 'Regular Cleaning' || 
                         job.selected_service === 'NDIS Cleaning' ||
                         job.selected_service === 'Commercial Cleaning');

                      return (
                        <>
                          <View style={styles.cardRow}>
                            <Text style={styles.cardCustomerName}>{customerName}</Text>
                            <Text style={[styles.cardPriceText, isClosed && styles.cardPriceTextClosed]}>
                              {getPriceDisplay()}
                            </Text>
                          </View>
                          <View style={styles.cardRow}>
                            <View style={styles.locationRow}>
                              <Ionicons name="location-outline" size={14} color="#6B7280" />
                              <Text style={styles.cardDetailText}>{location}</Text>
                            </View>
                            <Text style={[styles.cardDateText, isClosed && styles.cardDateTextClosed]}>
                              {cardScheduleDate}
                            </Text>
                          </View>
                          <View style={styles.cardRow}>
                            <View style={styles.locationRow}>
                              <Ionicons name="time-outline" size={14} color="#6B7280" />
                              <Text style={styles.cardDetailText}>
                                {isEndOfLease ? (
                                  <>{estimatedHours} • <Text style={styles.cardEstimatedText}>estimated</Text></>
                                ) : (
                                  <>
                                    {job.duration || 'TBD'}
                                    {showFrequency && ` • ${job.frequency}`}
                                  </>
                                )}
                              </Text>
                            </View>
                            {statusTag && (
                              <View style={[styles.jobStatusTag, { backgroundColor: isClosed ? '#9CA3AF' : statusTag.color }]}>
                                <Text style={styles.jobStatusTagText}>{statusTag.label}</Text>
                              </View>
                            )}
                          </View>
                        </>
                      );
                    };

                    return (
                      <TouchableOpacity
                        key={reactKey}
                        style={[
                          styles.jobCard,
                          isPast && styles.jobCardPast,
                          isClosed && styles.jobCardClosed,
                        ]}
                        onPress={isClosed ? undefined : () => openJobDetails(job)}
                        activeOpacity={isClosed ? 1 : 0.7}
                        disabled={isClosed}
                      >
                        <View style={[styles.cardLeftBorder, { backgroundColor: displayServiceColor }]} />

                        {/* Service badge */}
                        <View style={[styles.serviceBadge, { backgroundColor: displayServiceColor }]}>
                          <Text style={styles.serviceBadgeText}>
                            {job.selected_service.replace(' Cleaning', '')}
                          </Text>
                        </View>

                        <View style={styles.cardContent}>
                          {renderServiceContent()}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Job Details Modal - Using MyJobDetailsPanel */}
      <MyJobDetailsPanel
        job={selectedJob ? {
          id: selectedJob.id,
          booking_id: selectedJob.booking_id,
          booking_number: selectedJob.booking_number,
          selected_service: selectedJob.selected_service,
          status: selectedJob.status,
          job_status: selectedJob.job_status,
          is_recurring: selectedJob.is_recurring,
          pricing: selectedJob.pricing,
          duration: selectedJob.duration,
          frequency: selectedJob.frequency,
          assigned_to: selectedJob.assigned_to,
          assigned_at: selectedJob.assigned_at,
          service_details_id: selectedJob.service_details_id,
          customer: selectedJob.customer,
          recurring_instance: selectedJob.recurring_instance || undefined,
        } : null}
        visible={modalVisible}
        onClose={closeJobDetails}
        userId={userId}
        userFirstName={userFirstName}
        onStatusUpdate={(jobId, newStatus) => {
          // Trigger full refresh of My tab
          onJobStatusChange?.();
        }}
        onJobCancelled={() => {
          closeJobDetails();
          onJobStatusChange?.();
        }}
      />
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  filterContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'flex-end',
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#E5E7EB',
    borderRadius: 8,
    padding: 3,
  },
  segmentButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 6,
  },
  segmentButtonActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
  },
  segmentTextActive: {
    color: '#111827',
    fontWeight: '600',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 300,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
    textAlign: 'center',
  },
  jobsList: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 8,
  },
  dateSection: {
    marginBottom: 12,
  },
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    marginBottom: 2,
  },
  dateHeaderText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#9CA3AF',
  },
  dateHeaderTextToday: {
    color: '#6B9FD6',
    fontWeight: '600',
  },
  jobCount: {
    fontSize: 11,
    fontWeight: '500',
    color: '#D1D5DB',
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
  jobCardPast: {
    opacity: 0.6,
  },
  jobCardClosed: {
    opacity: 0.5,
    backgroundColor: '#F9FAFB',
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
  cardContent: {
    flex: 1,
    gap: 4,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardCustomerName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
    marginRight: 8,
  },
  cardPriceText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF6B35',
  },
  cardPriceTextClosed: {
    color: '#9CA3AF',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  cardDateText: {
    fontSize: 12,
    color: '#3B82F6',
    fontWeight: '500',
  },
  cardDateTextClosed: {
    color: '#9CA3AF',
  },
  cardDetailText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  cardEstimatedText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '400',
    fontStyle: 'italic',
  },
  jobStatusTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  jobStatusTagText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
});
