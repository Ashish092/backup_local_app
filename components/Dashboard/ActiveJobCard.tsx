import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Modal, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase, bookingSupabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import * as Location from 'expo-location';

interface ActiveJob {
  id: string; // booking_status_on_app id
  booking_id: string;
  job_status: string;
  is_recurring: boolean;
  booking?: {
    selected_service: string;
    address: string;
    booking_number: string;
    scheduled_date: string;
    scheduled_time: string;
    pricing: any;
  };
  time_clock?: {
    id: string;
    on_the_way_time: string;
    job_start_time: string;
  };
  // Instance data (if recurring)
  recurring_instance?: {
    id: string;
    instance_number: number;
    instance_date: string;
    instance_booking_number: string;
    job_status: string;
  };
}

interface ActiveJobCardProps {
  onJobUpdate?: () => void;
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Get current timestamp in ISO format (uses device time)
 */
const getTimestamp = (): string => {
  return new Date().toISOString();
};

const getCurrentLocation = async () => {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    const [address] = await Location.reverseGeocodeAsync({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    });

    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      address: address ? `${address.street || ''}, ${address.city || ''}, ${address.region || ''} ${address.postalCode || ''}`.trim() : 'Unknown',
      timestamp: getTimestamp(),
    };
  } catch (error) {
    console.error('Error getting location:', error);
    return null;
  }
};

const calculateDuration = (startTime: string, endTime: string): number => {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  return Math.round((end - start) / (1000 * 60));
};

const calculateHours = (startTime: string, endTime: string): number => {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  return parseFloat(((end - start) / (1000 * 60 * 60)).toFixed(2));
};

/**
 * Create payment record after job completion
 */
const createPaymentRecord = async (
  userId: string,
  bookingId: string,
  timeClockId: string,
  serviceType: string
) => {
  try {
    console.log('💰 Creating payment record...');

    // 1. Get booking details
    const { data: bookingData, error: bookingError } = await bookingSupabase
      .from('bookings')
      .select(`
        booking_number,
        selected_service,
        service_details_id,
        pricing,
        customer_id
      `)
      .eq('id', bookingId)
      .single();

    if (bookingError) throw bookingError;

    // Get customer details separately
    const { data: customerData, error: customerError } = await bookingSupabase
      .from('customers')
      .select('address, suburb, postcode, schedule_date')
      .eq('id', bookingData.customer_id)
      .single();

    if (customerError) throw customerError;

    // 2. Get allocated duration and calculate payment
    let allocatedDuration = 0;
    let allocatedTotal = 0;
    let hourlyRate = 0;
    
    if (serviceType === 'End of Lease Cleaning') {
      const totalPrice = bookingData.pricing?.totalPrice || 0;
      const afterGST = totalPrice * 0.9;
      const staffAmount = afterGST * 0.6;
      allocatedDuration = Math.round(staffAmount / 30);
      allocatedTotal = Math.round(staffAmount);
      hourlyRate = 0;
    } else {
      // Fetch from service details table
      const tableMap: Record<string, string> = {
        'Once-Off Cleaning': 'once_off_cleaning_details',
        'Regular Cleaning': 'regular_cleaning_details',
        'NDIS Cleaning': 'ndis_cleaning_details',
        'Airbnb Cleaning': 'airbnb_cleaning_details',
        'Commercial Cleaning': 'commercial_cleaning_details',
      };

      const tableName = tableMap[serviceType];
      if (tableName && bookingData.service_details_id) {
        const columnName = serviceType === 'Commercial Cleaning' ? 'hours_per_visit' : 'duration';
        
        const { data: detailsData } = await bookingSupabase
          .from(tableName)
          .select(columnName)
          .eq('id', bookingData.service_details_id)
          .single();

        if (detailsData) {
          const durationValue = (detailsData as any)[columnName];
          if (typeof durationValue === 'string') {
            const match = durationValue.match(/(\d+(?:\.\d+)?)/);
            allocatedDuration = match ? parseFloat(match[1]) : 0;
          } else {
            allocatedDuration = parseFloat(durationValue) || 0;
          }
        }
      }
    }

    // 3. For non-End of Lease services, get hourly rate and calculate total
    if (serviceType !== 'End of Lease Cleaning') {
      const rateMap: Record<string, number> = {
        'Once-Off Cleaning': parseFloat(process.env.EXPO_PUBLIC_RATE_ONCE_OFF || '30'),
        'Regular Cleaning': parseFloat(process.env.EXPO_PUBLIC_RATE_REGULAR || '25'),
        'NDIS Cleaning': parseFloat(process.env.EXPO_PUBLIC_RATE_NDIS || '32'),
        'Airbnb Cleaning': parseFloat(process.env.EXPO_PUBLIC_RATE_AIRBNB || '28'),
        'Commercial Cleaning': parseFloat(process.env.EXPO_PUBLIC_RATE_COMMERCIAL || '25'),
      };

      hourlyRate = rateMap[serviceType] || 30;
      allocatedTotal = allocatedDuration * hourlyRate;
    }

    // 4. Get actual hours worked from time_clock
    const { data: timeClockData } = await supabase
      .from('time_clock')
      .select('worked_hours')
      .eq('id', timeClockId)
      .single();

    // 5. Create payment record
    const { error: paymentError } = await supabase
      .from('payment_records')
      .insert({
        user_id: userId,
        booking_id: bookingId,
        booking_number: bookingData.booking_number,
        time_clock_id: timeClockId,
        service_type: serviceType,
        service_address: customerData?.address || 'N/A',
        suburb: customerData?.suburb,
        postcode: customerData?.postcode,
        job_date: customerData?.schedule_date,
        allocated_duration: allocatedDuration,
        actual_hours_worked: timeClockData?.worked_hours || null,
        hourly_rate: serviceType === 'End of Lease Cleaning' ? null : hourlyRate,
        allocated_total: allocatedTotal,
        payment_status: 'pending',
      });

    if (paymentError) throw paymentError;

    console.log(`✅ Payment record created: $${allocatedTotal} (${allocatedDuration}h × $${hourlyRate}/hr)`);
  } catch (error) {
    console.error('❌ Error creating payment record:', error);
    throw error;
  }
};

// ==================== MAIN COMPONENT ====================

export default function ActiveJobCard({ onJobUpdate }: ActiveJobCardProps) {
  const { user, userProfile } = useAuth();
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionCompleted, setActionCompleted] = useState(false);
  const [elapsedTime, setElapsedTime] = useState<string>('00:00');
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [completionNotes, setCompletionNotes] = useState('');
  
  // Ref to prevent double-tap race condition
  const isProcessingRef = React.useRef(false);

  // Fetch active job (on_the_way or started status)
  const fetchActiveJob = useCallback(async () => {
    if (!user) return;

    try {
      // Get user profile to find assigned jobs
      const { data: profile } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single();

      if (!profile) return;

      // Find active job from booking_status_on_app where job_status is on_the_way or started
      const { data: activeJobs, error } = await bookingSupabase
        .from('booking_status_on_app')
        .select('id, booking_id, job_status, is_recurring, assigned_to')
        .eq('assigned_to', profile.id)
        .in('job_status', ['on_the_way', 'started'])
        .order('updated_at', { ascending: false })
        .limit(1);

      if (error) throw error;

      if (activeJobs && activeJobs.length > 0) {
        const job = activeJobs[0];

        // If recurring, fetch the current instance
        let recurringInstance = null;
        if (job.is_recurring) {
          const todayStr = new Date().toISOString().split('T')[0];
          const { data: instanceData } = await bookingSupabase
            .from('recurring_booking_status')
            .select('id, instance_number, instance_date, instance_booking_number, job_status')
            .eq('booking_status_on_app_id', job.id)
            .gte('instance_date', todayStr)
            .order('instance_date', { ascending: true })
            .limit(1)
            .maybeSingle();
          
          recurringInstance = instanceData;
        }

        // Fetch booking details (bookings table doesn't have address)
        const { data: bookingData, error: bookingError } = await bookingSupabase
          .from('bookings')
          .select('selected_service, booking_number, pricing, customer_id')
          .eq('id', job.booking_id)
          .single();

        if (bookingError) {
          console.error('❌ Error fetching booking data:', bookingError);
        }

        // Fetch customer details for address
        let customerAddress = 'Address not available';
        let scheduledDate = '';
        let scheduledTime = '';
        
        if (bookingData?.customer_id) {
          const { data: customerData, error: customerError } = await bookingSupabase
            .from('customers')
            .select('address, schedule_date')
            .eq('id', bookingData.customer_id)
            .single();

          if (customerError) {
            console.error('❌ Error fetching customer data:', customerError);
          } else if (customerData) {
            customerAddress = customerData.address;
            scheduledDate = customerData.schedule_date;
          }
        }

        console.log('📋 Fetched booking data:', {
          booking_id: job.booking_id,
          selected_service: bookingData?.selected_service,
          booking_number: bookingData?.booking_number,
          address: customerAddress,
          hasBookingData: !!bookingData
        });

        // Fetch time clock data
        const { data: timeClockData } = await supabase
          .from('time_clock')
          .select('id, on_the_way_time, job_start_time')
          .eq('booking_status_on_app_id', job.id)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(); // Use maybeSingle here since time_clock might not exist yet

        setActiveJob({
          ...job,
          booking: bookingData ? {
            selected_service: bookingData.selected_service,
            address: customerAddress,
            booking_number: bookingData.booking_number,
            scheduled_date: scheduledDate,
            scheduled_time: scheduledTime,
            pricing: bookingData.pricing,
          } : undefined,
          time_clock: timeClockData || undefined,
          recurring_instance: recurringInstance || undefined,
        });
      } else {
        setActiveJob(null);
      }
    } catch (error) {
      console.error('Error fetching active job:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchActiveJob();

    // Poll every 10 seconds to stay in sync
    const interval = setInterval(fetchActiveJob, 10000);
    return () => clearInterval(interval);
  }, [fetchActiveJob]);

  // Calculate elapsed time
  useEffect(() => {
    if (!activeJob?.time_clock) return;

    const startTime = activeJob.job_status === 'started' 
      ? activeJob.time_clock.job_start_time 
      : activeJob.time_clock.on_the_way_time;

    if (!startTime) return;

    const calculateElapsed = () => {
      const start = new Date(startTime).getTime();
      const now = new Date().getTime();
      const diff = now - start;

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      // Always show HH:MM:SS format for large timer
      setElapsedTime(
        `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      );
    };

    calculateElapsed();
    const interval = setInterval(calculateElapsed, 1000);
    return () => clearInterval(interval);
  }, [activeJob]);

  // Handle Start Job
  const handleStartJob = async () => {
    if (!activeJob) return;
    
    // Prevent double-tap
    if (isProcessingRef.current || actionLoading || actionCompleted) {
      console.log('⚠️ Action already in progress, ignoring duplicate tap');
      return;
    }

    isProcessingRef.current = true;
    setActionCompleted(true);
    setActionLoading(true);
    try {
      const location = await getCurrentLocation();
      const now = getTimestamp();

      // Get time clock record (must exist from "On the Way" step)
      const { data: timeClockRecord, error: timeClockError } = await supabase
        .from('time_clock')
        .select('*')
        .eq('booking_status_on_app_id', activeJob.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (timeClockError || !timeClockRecord) {
        throw new Error('No active time clock record found. Please click "On the Way" first.');
      }

      const duration = timeClockRecord.on_the_way_time 
        ? calculateDuration(timeClockRecord.on_the_way_time, now)
        : 0;

      // Update time clock
      await supabase
        .from('time_clock')
        .update({
          on_the_way_status: 'job_started',
          job_start_time: now,
          job_start_location: location,
          on_the_way_duration: duration,
        })
        .eq('id', timeClockRecord.id);

      // Update booking status
      await bookingSupabase
        .from('booking_status_on_app')
        .update({
          job_status: 'started',
          updated_at: now,
        })
        .eq('id', activeJob.id);

      // Update instance status if recurring
      if (activeJob.is_recurring && activeJob.recurring_instance) {
        await bookingSupabase
          .from('recurring_booking_status')
          .update({
            job_status: 'started',
            updated_at: now,
          })
          .eq('id', activeJob.recurring_instance.id);
      }

      // Refresh and notify parent
      fetchActiveJob();
      onJobUpdate?.();
    } catch (error) {
      console.error('Error starting job:', error);
      Alert.alert('Error', 'Failed to start job. Please try again.');
      setActionCompleted(false); // Re-enable on error
    } finally {
      setActionLoading(false);
      isProcessingRef.current = false;
    }
  };

  // Handle Complete Job
  const handleCompleteJob = async () => {
    if (!activeJob) return;
    
    // Prevent double-tap
    if (isProcessingRef.current || actionLoading || actionCompleted) {
      console.log('⚠️ Complete action already in progress, ignoring duplicate tap');
      return;
    }

    console.log('🏁 Starting job completion process...');
    console.log('Active job data:', {
      id: activeJob.id,
      booking_id: activeJob.booking_id,
      service: activeJob.booking?.selected_service,
      hasBooking: !!activeJob.booking,
      bookingKeys: activeJob.booking ? Object.keys(activeJob.booking) : [],
      fullBooking: activeJob.booking
    });

    isProcessingRef.current = true;
    setActionCompleted(true);
    setShowNotesModal(false);
    setActionLoading(true);

    try {
      const location = await getCurrentLocation();
      const now = getTimestamp();

      // Calculate takeaway amount from booking pricing
      let takeawayAmount = 0;
      if (activeJob.booking?.pricing) {
        const pricing = typeof activeJob.booking.pricing === 'string' 
          ? JSON.parse(activeJob.booking.pricing) 
          : activeJob.booking.pricing;
        
        const hourlyRate = pricing.hourlyRate || 0;
        const totalHours = pricing.totalHours || 0;
        
        if (activeJob.booking.selected_service === 'End of Lease Cleaning') {
          // End of Lease: (totalPrice - 10% GST) × 60%
          const totalPrice = pricing.totalPrice || 0;
          const afterGST = totalPrice * 0.9;
          takeawayAmount = Math.round(afterGST * 0.6);
        } else {
          // All other services: hourlyRate × totalHours
          takeawayAmount = Math.round(hourlyRate * totalHours);
        }
      }
      console.log('💰 Calculated takeaway amount:', takeawayAmount);

      // 1. Update time clock (regardless of instance or main booking)
      console.log('⏱️ Updating time clock for job completion...');
      const { data: timeClockRecord, error: timeClockError } = await supabase
        .from('time_clock')
        .select('*')
        .eq('booking_status_on_app_id', activeJob.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (timeClockRecord) {
        const workedHours = timeClockRecord.job_start_time 
          ? calculateHours(timeClockRecord.job_start_time, now)
          : 0;

        await supabase
          .from('time_clock')
          .update({
            job_finished_time: now,
            job_finished_location: location,
            worked_hours: workedHours,
            actual_job_hours: workedHours,
            notes: completionNotes || null,
            is_active: false,
            takeaway_amount: takeawayAmount || null,
            admin_status: 'open', // Trigger admin review
          })
          .eq('id', timeClockRecord.id);
        console.log('✅ Time clock updated with takeaway amount and admin_status: open');
      } else {
        console.warn('⚠️ No active time clock record found');
      }

      // 2. Determine if this is an instance or main job
      if (activeJob.is_recurring && activeJob.recurring_instance) {
        // This is a recurring instance - update instance job_status
        console.log('📋 Updating recurring instance status to completed...');
        const { error: instanceError } = await bookingSupabase
          .from('recurring_booking_status')
          .update({
            job_status: 'completed',
            updated_at: now,
          })
          .eq('id', activeJob.recurring_instance.id);

        if (instanceError) {
          console.error('Error updating instance status:', instanceError);
          throw instanceError;
        }
        console.log('✅ Instance status updated to completed');

        // Reset main booking_status_on_app back to 'accepted' for next instance
        await bookingSupabase
          .from('booking_status_on_app')
          .update({
            job_status: 'accepted',
            updated_at: now,
          })
          .eq('id', activeJob.id);
        console.log('✅ Main booking status reset to accepted for next instance');
      } else {
        // This is a non-recurring main job - update booking_status_on_app.job_status
        console.log('📋 Updating main job status to completed...');
        const { error } = await bookingSupabase
          .from('booking_status_on_app')
          .update({
            job_status: 'completed',
            updated_at: now,
          })
          .eq('id', activeJob.id);

        if (error) {
          console.error('Error updating status:', error);
          throw error;
        }
        console.log('✅ Main job status updated to completed');

        // Also update the main bookings table status
        if (activeJob.booking_id) {
          await bookingSupabase
            .from('bookings')
            .update({ status: 'completed' })
            .eq('id', activeJob.booking_id);
          console.log('✅ Main booking status updated to completed');
        }
      }

      // Refresh and notify parent
      setCompletionNotes('');
      setActiveJob(null); // Remove from dashboard
      onJobUpdate?.();
    } catch (error) {
      console.error('Error completing job:', error);
      Alert.alert('Error', 'Failed to complete job. Please try again.');
      setActionCompleted(false); // Re-enable on error
    } finally {
      setActionLoading(false);
      isProcessingRef.current = false;
    }
  };

  if (loading) {
    return null; // Don't show loading state, just hide if loading
  }

  if (!activeJob) {
    return null; // No active job
  }

  const isOnTheWay = activeJob.job_status === 'on_the_way';
  const isStarted = activeJob.job_status === 'started';

  return (
    <View style={styles.container}>
      <View style={[styles.card, isStarted && styles.cardStarted]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.statusBadge, isStarted ? styles.statusBadgeStarted : styles.statusBadgeOnTheWay]}>
            <Ionicons 
              name={isStarted ? 'play-circle' : 'car'} 
              size={16} 
              color="#fff" 
            />
            <Text style={styles.statusText}>
              {isStarted ? 'In Progress' : 'On The Way'}
            </Text>
          </View>
        </View>

        {/* Service Info */}
        <Text style={styles.serviceName}>
          {activeJob.booking?.selected_service || 'Cleaning Service'}
        </Text>
        
        {activeJob.booking?.address && (
          <View style={styles.addressRow}>
            <Ionicons name="location-outline" size={14} color="#666" />
            <Text style={styles.addressText} numberOfLines={1}>
              {activeJob.booking.address}
            </Text>
          </View>
        )}

        {/* Large Timer Display - Only for started jobs */}
        {isStarted && (
          <View style={styles.timerContainer}>
            <Text style={styles.timerLabel}>Time Elapsed</Text>
            <Text style={styles.largeTimer}>{elapsedTime}</Text>
            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          </View>
        )}

        {/* Small timer for On The Way */}
        {isOnTheWay && (
          <View style={styles.smallTimerRow}>
            <Ionicons name="time-outline" size={16} color="#F59E0B" />
            <Text style={styles.smallTimerText}>Travel time: {elapsedTime}</Text>
          </View>
        )}

        {/* Action Button */}
        <TouchableOpacity
          style={[
            styles.actionButton, 
            isStarted ? styles.completeButton : styles.startButton,
            (actionLoading || actionCompleted) && styles.actionButtonLoading
          ]}
          onPress={isStarted ? () => setShowNotesModal(true) : handleStartJob}
          disabled={actionLoading || actionCompleted}
        >
          {actionLoading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons 
                name={isStarted ? 'checkmark-circle' : 'play-circle'} 
                size={20} 
                color="#fff" 
              />
              <Text style={styles.actionButtonText}>
                {isStarted ? 'Complete Job' : 'Start Job'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Completion Notes Modal */}
      <Modal
        visible={showNotesModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowNotesModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Ionicons name="document-text" size={32} color="#059669" />
              <Text style={styles.modalTitle}>Job Completion Notes</Text>
              <Text style={styles.modalSubtitle}>
                Add any notes about this job (optional)
              </Text>
            </View>

            <TextInput
              style={styles.notesInput}
              placeholder="e.g., Extra cleaning done, issues encountered..."
              placeholderTextColor="#999"
              value={completionNotes}
              onChangeText={setCompletionNotes}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={() => {
                  setShowNotesModal(false);
                  setCompletionNotes('');
                }}
                disabled={actionLoading}
              >
                <Text style={styles.modalButtonTextSecondary}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonPrimary]}
                onPress={handleCompleteJob}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalButtonTextPrimary}>Complete Job</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 2,
    borderColor: '#F59E0B',
  },
  cardStarted: {
    borderColor: '#10B981',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusBadgeOnTheWay: {
    backgroundColor: '#F59E0B',
  },
  statusBadgeStarted: {
    backgroundColor: '#10B981',
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  serviceName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 14,
  },
  addressText: {
    fontSize: 13,
    color: '#6B7280',
    flex: 1,
  },
  // Large Timer Container (for started jobs)
  timerContainer: {
    alignItems: 'center',
    paddingVertical: 20,
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    marginBottom: 16,
  },
  timerLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  largeTimer: {
    fontSize: 44,
    fontWeight: '700',
    color: '#10B981',
    fontVariant: ['tabular-nums'],
    marginBottom: 8,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  liveText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#EF4444',
    letterSpacing: 1,
  },
  // Small timer row (for on_the_way)
  smallTimerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
  },
  smallTimerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#92400E',
    fontVariant: ['tabular-nums'],
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  startButton: {
    backgroundColor: '#10B981',
  },
  completeButton: {
    backgroundColor: '#059669',
  },
  actionButtonLoading: {
    opacity: 0.7,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
    marginTop: 12,
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  notesInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    color: '#000',
    minHeight: 100,
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonSecondary: {
    backgroundColor: '#F3F4F6',
  },
  modalButtonPrimary: {
    backgroundColor: '#059669',
  },
  modalButtonTextSecondary: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  modalButtonTextPrimary: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
