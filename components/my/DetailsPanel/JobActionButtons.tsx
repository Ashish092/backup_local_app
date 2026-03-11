import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Modal, TextInput, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase, bookingSupabase } from '@/lib/supabase';
import * as Location from 'expo-location';

interface JobActionButtonsProps {
  jobId: string; // booking_status_on_app id
  currentStatus: string;
  onStatusUpdate: (newStatus: string) => void;
  customerPhone?: string; // Optional customer phone for SMS
  workerFirstName?: string; // Optional worker name for SMS
  isRecurring?: boolean; // true if this is an instance (from recurring_booking_status)
  instanceId?: string; // recurring_booking_status id (if instance)
}

// ==================== TIME CLOCK HELPER FUNCTIONS ====================

/**
 * Get current timestamp in ISO format (uses device time)
 */
const getTimestamp = (): string => {
  return new Date().toISOString();
};

/**
 * Get current location coordinates and address
 * Returns { location, permissionDenied } to allow caller to handle permission denial
 */
const getCurrentLocation = async (): Promise<{
  location: {
    latitude: number;
    longitude: number;
    address: string;
    timestamp: string;
  } | null;
  permissionDenied: boolean;
}> => {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      console.warn('Location permission not granted');
      return { location: null, permissionDenied: true };
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    // Get address from coordinates
    const [address] = await Location.reverseGeocodeAsync({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    });

    return {
      location: {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        address: address ? `${address.street || ''}, ${address.city || ''}, ${address.region || ''} ${address.postalCode || ''}`.trim() : 'Unknown',
        timestamp: getTimestamp(),
      },
      permissionDenied: false,
    };
  } catch (error) {
    console.error('Error getting location:', error);
    return { location: null, permissionDenied: false };
  }
};

/**
 * Calculate duration in minutes between two timestamps
 */
const calculateDuration = (startTime: string, endTime: string): number => {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  return Math.round((end - start) / (1000 * 60)); // Convert to minutes
};

/**
 * Calculate hours (decimal) between two timestamps
 */
const calculateHours = (startTime: string, endTime: string): number => {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  return parseFloat(((end - start) / (1000 * 60 * 60)).toFixed(2)); // Convert to hours
};

/**
 * Create a new time clock record when user starts "On the Way"
 * Returns the created record ID for potential rollback
 */
const createTimeClockRecord = async (
  bookingStatusOnAppId: string, 
  userId: string, 
  bookingId: string,
  instanceId?: string // Optional: recurring_booking_status id for recurring jobs
): Promise<{ id: string; permissionDenied: boolean }> => {
  console.log('⏱️ Creating time clock record:', { bookingStatusOnAppId, userId, bookingId, instanceId });
  
  const { location, permissionDenied } = await getCurrentLocation();
  const now = getTimestamp();

  // Use app database (supabase) for time_clock table
  const insertData: any = {
    user_id: userId,
    booking_id: bookingId,
    booking_status_on_app_id: bookingStatusOnAppId,
    on_the_way_status: 'started',
    on_the_way_time: now,
    on_the_way_location: location, // Will be null if permission denied
    is_active: true,
  };

  // Add instance_id if this is a recurring job
  if (instanceId) {
    insertData.instance_id = instanceId;
  }

  const { data, error } = await supabase
    .from('time_clock')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error('❌ Error creating time clock record:', error);
    throw error;
  }
  
  console.log('✅ Time clock record created:', data?.id);
  return { id: data.id, permissionDenied };
};

/**
 * Delete a time clock record (for rollback)
 */
const deleteTimeClockRecord = async (timeClockId: string): Promise<void> => {
  console.log('🔄 Rolling back time clock record:', timeClockId);
  const { error } = await supabase
    .from('time_clock')
    .delete()
    .eq('id', timeClockId);
  
  if (error) {
    console.error('❌ Error deleting time clock record:', error);
    // Don't throw - this is cleanup, log and continue
  } else {
    console.log('✅ Time clock record rolled back');
  }
};

/**
 * Update time clock record when job is started
 */
const updateTimeClockJobStart = async (bookingStatusOnAppId: string) => {
  console.log('⏱️ Looking for time clock record with booking_status_on_app_id:', bookingStatusOnAppId);
  
  const { location } = await getCurrentLocation();
  const now = getTimestamp();

  // Get the active time clock record from app database
  const { data: timeClockRecord, error: fetchError } = await supabase
    .from('time_clock')
    .select('*')
    .eq('booking_status_on_app_id', bookingStatusOnAppId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle(); // Use maybeSingle to handle missing record gracefully

  if (fetchError) {
    console.error('❌ Error fetching time clock record:', fetchError);
    throw fetchError;
  }
  
  if (!timeClockRecord) {
    console.warn('⚠️ No active time clock record found - job may have been started without "On the Way"');
    return null;
  }
  
  console.log('✅ Found time clock record:', timeClockRecord.id);

  // Calculate duration from on_the_way to job_start
  const duration = timeClockRecord.on_the_way_time 
    ? calculateDuration(timeClockRecord.on_the_way_time, now)
    : 0;

  // Update in app database
  const { data, error } = await supabase
    .from('time_clock')
    .update({
      on_the_way_status: 'job_started',
      job_start_time: now,
      job_start_location: location,
      on_the_way_duration: duration,
    })
    .eq('id', timeClockRecord.id)
    .select()
    .single();

  if (error) throw error;
  return data;
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

    // 1. Get booking details (for address, duration, date, booking_number)
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

    // 2. Get allocated duration from service details
    let allocatedDuration = 0;
    let allocatedTotal = 0;
    let hourlyRate = 0;
    
    if (serviceType === 'End of Lease Cleaning') {
      // For End of Lease, use pre-calculated amount from pricing
      const totalPrice = bookingData.pricing?.totalPrice || 0;
      const afterGST = totalPrice * 0.9;
      const staffAmount = afterGST * 0.6;
      allocatedDuration = Math.round(staffAmount / 30); // Calculate hours for reference
      allocatedTotal = Math.round(staffAmount); // Use staff amount directly
      hourlyRate = 0; // Not applicable for End of Lease
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
          // Parse "3 hours" or "3.5 hours" to number
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

    // 4. Get actual hours worked from time_clock (for reference)
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
        hourly_rate: serviceType === 'End of Lease Cleaning' ? 0 : hourlyRate,
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

/**
 * Update time clock record when job is completed
 */
const updateTimeClockJobComplete = async (bookingStatusOnAppId: string, notes?: string, takeawayAmount?: number) => {
  const { location } = await getCurrentLocation();
  const now = getTimestamp();

  // Get the active time clock record from app database
  const { data: timeClockRecord, error: fetchError } = await supabase
    .from('time_clock')
    .select('*')
    .eq('booking_status_on_app_id', bookingStatusOnAppId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError) {
    console.error('❌ Error fetching time clock record:', fetchError);
    throw fetchError;
  }

  if (!timeClockRecord) {
    console.warn('⚠️ No active time clock record found for completion');
    return null;
  }

  // Calculate worked hours from job_start to job_finished
  const workedHours = timeClockRecord.job_start_time 
    ? calculateHours(timeClockRecord.job_start_time, now)
    : 0;

  // Update in app database
  const { data, error } = await supabase
    .from('time_clock')
    .update({
      job_finished_time: now,
      job_finished_location: location,
      worked_hours: workedHours,
      actual_job_hours: workedHours, // Initially same, can be adjusted later
      notes: notes || null, // Store completion notes
      is_active: false, // Job is complete
      takeaway_amount: takeawayAmount || null, // Store takeaway amount
      admin_status: 'open', // Trigger admin review
    })
    .eq('id', timeClockRecord.id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

// ==================== SMS HELPER FUNCTION ====================

/**
 * Send "On the Way" SMS to customer
 */
const sendOnTheWaySMS = (phoneNumber: string, workerName: string) => {
  const message = `Hi, this is ${workerName} from Cleaning Professionals. I've just left and I'm on my way to your place for the cleaning. I'll be there soon. See you shortly!`;
  
  // Try iOS format first, then Android format
  const smsUrl = `sms:${phoneNumber}&body=${encodeURIComponent(message)}`;
  
  Linking.canOpenURL(smsUrl)
    .then((supported) => {
      if (supported) {
        Linking.openURL(smsUrl);
      } else {
        // Try alternative format for iOS
        const altSmsUrl = `sms:${phoneNumber}?body=${encodeURIComponent(message)}`;
        Linking.openURL(altSmsUrl).catch((err) => {
          console.log('SMS not available:', err);
        });
      }
    })
    .catch((err) => {
      console.error('Error opening SMS:', err);
    });
};

// ==================== MAIN COMPONENT ====================

export default function JobActionButtons({ 
  jobId, 
  currentStatus, 
  onStatusUpdate, 
  customerPhone, 
  workerFirstName,
  isRecurring = false,
  instanceId,
}: JobActionButtonsProps) {
  const [loading, setLoading] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [completionNotes, setCompletionNotes] = useState('');
  
  // Track if action was completed to disable button permanently until panel refreshes
  const [actionCompleted, setActionCompleted] = useState(false);
  
  // Ref to prevent double-tap race condition
  const isProcessingRef = React.useRef(false);
  
  // Reset actionCompleted when currentStatus changes (panel refreshed)
  React.useEffect(() => {
    setActionCompleted(false);
  }, [currentStatus]);

  /**
   * Update instance status in recurring_booking_status table
   */
  const updateInstanceStatus = async (newStatus: string) => {
    if (!isRecurring || !instanceId) return;

    const now = new Date().toISOString();
    const { error } = await bookingSupabase
      .from('recurring_booking_status')
      .update({
        job_status: newStatus,
        updated_at: now,
      })
      .eq('id', instanceId);

    if (error) {
      console.error('Error updating instance status:', error);
      throw error;
    }
    console.log(`✅ Instance ${instanceId} status updated to ${newStatus}`);
  };

  const handleStatusUpdate = async (newStatus: string, buttonLabel: string) => {
    // Prevent double-tap race condition - check BOTH ref and state
    if (isProcessingRef.current || loading || actionCompleted) {
      console.log('⚠️ Action already in progress, ignoring duplicate tap');
      return;
    }
    
    // If completing job, show notes modal first
    if (newStatus === 'completed') {
      setShowNotesModal(true);
      return;
    }

    // IMMEDIATELY disable button to prevent double-tap
    isProcessingRef.current = true;
    setActionCompleted(true);
    setLoading(true);
    
    // Track created time_clock record ID for potential rollback
    let createdTimeClockId: string | null = null;
    
    try {
      const now = getTimestamp();
      
      // Prepare update object for booking_status_on_app
      const updateData: any = {
        job_status: newStatus,
        updated_at: now,
      };

      // Get current user from app database
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user found');

      // Fetch booking_status_on_app to get booking_id and assigned_to
      const { data: statusData, error: statusError } = await bookingSupabase
        .from('booking_status_on_app')
        .select('booking_id, assigned_to')
        .eq('id', jobId)
        .single();

      if (statusError) throw statusError;

      // ==================== ACTIVE JOB CHECK FOR "ON THE WAY" ====================
      
      // When marking "On the Way" - First check if user has an active job
      if (newStatus === 'on_the_way') {
        // Check if user has any active jobs (is_active = true)
        const { data: activeJobs, error: activeJobError } = await supabase
          .from('time_clock')
          .select('id, booking_id, on_the_way_status')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('created_at', { ascending: false });

        if (activeJobError) throw activeJobError;

        // If user has an active job, block them from starting a new one
        if (activeJobs && activeJobs.length > 0) {
          setLoading(false);
          isProcessingRef.current = false;
          Alert.alert(
            'Active Job Found',
            'You are still clocked in to another job. Please complete your current job before starting a new one.\n\nGo to the Dashboard or My Jobs tab to complete your active job.',
            [
              {
                text: 'OK',
                style: 'default',
              },
            ]
          );
          return; // Exit - don't allow starting new job
        }

        // ==================== SOFT DATE CHECK FOR "ON THE WAY" ====================
        
        // Fetch booking details to check service type and get customer_id
        const { data: bookingDetails, error: bookingDetailsError } = await bookingSupabase
          .from('bookings')
          .select('selected_service, customer_id')
          .eq('id', statusData.booking_id)
          .single();

        if (bookingDetailsError) throw bookingDetailsError;

        const serviceType = bookingDetails?.selected_service;
        let jobDate: string | null = null;

        // If this is a recurring instance, get the instance_date from recurring_booking_status
        if (isRecurring && instanceId) {
          const { data: instanceData, error: instanceError } = await bookingSupabase
            .from('recurring_booking_status')
            .select('instance_date')
            .eq('id', instanceId)
            .single();

          if (!instanceError && instanceData) {
            jobDate = instanceData.instance_date;
          }
        } else {
          // For non-recurring jobs, get the schedule_date from customers table
          const { data: customerData, error: customerError } = await bookingSupabase
            .from('customers')
            .select('schedule_date')
            .eq('id', bookingDetails.customer_id)
            .single();

          if (!customerError && customerData) {
            jobDate = customerData.schedule_date;
          }
        }

        // Check for specific services that need date validation
        // For recurring jobs (Regular Cleaning, NDIS Cleaning with instances), we use instance_date
        // For one-time jobs (Once-Off, End of Lease, NDIS one-time), we use schedule_date
        const needsDateCheck = 
          serviceType === 'Once-Off Cleaning' ||
          serviceType === 'End of Lease Cleaning' ||
          serviceType === 'NDIS Cleaning' ||
          serviceType === 'Regular Cleaning';

        if (needsDateCheck && jobDate) {
          // Compare job date with today's date
          const today = new Date().toLocaleDateString('en-AU', { timeZone: 'Australia/Melbourne' });
          const scheduledDate = new Date(jobDate).toLocaleDateString('en-AU', { timeZone: 'Australia/Melbourne' });

          if (today !== scheduledDate) {
            // Show soft warning alert - but still allow user to proceed
            setLoading(false);
            isProcessingRef.current = false;
            Alert.alert(
              'Date Mismatch',
              `This job is scheduled for ${scheduledDate}, but today is ${today}.\n\nAre you sure you want to start this job now?`,
              [
                {
                  text: 'Cancel',
                  style: 'cancel',
                  onPress: () => {},
                },
                {
                  text: 'Continue Anyway',
                  style: 'default',
                  onPress: async () => {
                    // User confirmed - proceed with the action (with rollback support)
                    if (isProcessingRef.current || loading || actionCompleted) return; // Prevent double-tap
                    
                    // IMMEDIATELY disable button
                    isProcessingRef.current = true;
                    setActionCompleted(true);
                    setLoading(true);
                    
                    let timeClockIdForRollback: string | null = null;
                    
                    try {
                      // Step 1: Create time clock record
                      const { id: timeClockId, permissionDenied } = await createTimeClockRecord(
                        jobId, statusData.assigned_to, statusData.booking_id, instanceId
                      );
                      timeClockIdForRollback = timeClockId;
                      
                      // Warn user if location permission was denied
                      if (permissionDenied) {
                        Alert.alert(
                          'Location Not Available',
                          'Location tracking is disabled. Your trip will be recorded without location data.',
                          [{ text: 'OK' }]
                        );
                      }
                      
                      // Step 2: Update booking_status_on_app
                      const { error } = await bookingSupabase
                        .from('booking_status_on_app')
                        .update(updateData)
                        .eq('id', jobId);

                      if (error) {
                        // Rollback: Delete the time_clock record we just created
                        if (timeClockIdForRollback) {
                          await deleteTimeClockRecord(timeClockIdForRollback);
                        }
                        throw error;
                      }

                      // Step 3: Update instance status if recurring
                      try {
                        await updateInstanceStatus(newStatus);
                      } catch (instanceError) {
                        // Rollback: Revert job status and delete time_clock
                        console.error('Instance update failed, rolling back...');
                        await bookingSupabase
                          .from('booking_status_on_app')
                          .update({ job_status: currentStatus, updated_at: now })
                          .eq('id', jobId);
                        if (timeClockIdForRollback) {
                          await deleteTimeClockRecord(timeClockIdForRollback);
                        }
                        throw instanceError;
                      }

                      onStatusUpdate(newStatus);

                      // Send "On the Way" SMS after date mismatch confirmation (only for non-recurring)
                      if (customerPhone && !isRecurring) {
                        const name = workerFirstName || 'Your cleaner';
                        setTimeout(() => {
                          sendOnTheWaySMS(customerPhone, name);
                        }, 500);
                      }
                    } catch (error) {
                      console.error('Error in handleStatusUpdate:', error);
                      Alert.alert('Error', 'Failed to update status. Please try again.');
                      // Re-enable button on error
                      setActionCompleted(false);
                    } finally {
                      setLoading(false);
                      isProcessingRef.current = false;
                    }
                  },
                },
              ]
            );
            return; // Exit early - user needs to confirm
          }
        }

        // Date matches or no check needed - proceed normally with rollback support
        const { id: timeClockId, permissionDenied } = await createTimeClockRecord(
          jobId, statusData.assigned_to, statusData.booking_id, instanceId
        );
        createdTimeClockId = timeClockId;
        
        // Warn user if location permission was denied
        if (permissionDenied) {
          Alert.alert(
            'Location Not Available',
            'Location tracking is disabled. Your trip will be recorded without location data.',
            [{ text: 'OK' }]
          );
        }
      }

      // ==================== TIME CLOCK INTEGRATION ====================

      // When marking "Started" - Update time clock with job start info
      if (newStatus === 'started') {
        await updateTimeClockJobStart(jobId);
      }

      // ==================== UPDATE JOB STATUS ====================

      // Update booking_status_on_app
      const { error } = await bookingSupabase
        .from('booking_status_on_app')
        .update(updateData)
        .eq('id', jobId);

      if (error) {
        console.error('Error updating status:', error);
        // Rollback: If we created a time_clock record for "on_the_way", delete it
        if (createdTimeClockId) {
          await deleteTimeClockRecord(createdTimeClockId);
        }
        throw error;
      }

      // Update instance status if recurring
      try {
        await updateInstanceStatus(newStatus);
      } catch (instanceError) {
        // Rollback: Revert job status
        console.error('Instance update failed, rolling back job status...');
        const now = getTimestamp();
        await bookingSupabase
          .from('booking_status_on_app')
          .update({ job_status: currentStatus, updated_at: now })
          .eq('id', jobId);
        // Also rollback time_clock if created
        if (createdTimeClockId) {
          await deleteTimeClockRecord(createdTimeClockId);
        }
        throw instanceError;
      }

      // Button already disabled at start - call onStatusUpdate which closes panel
      onStatusUpdate(newStatus);

      // ==================== SEND "ON THE WAY" SMS ====================
      // After successful "On the Way" status update, open SMS app (only for non-recurring)
      // For recurring instances, the customer already knows the cleaner is coming weekly/fortnightly
      if (newStatus === 'on_the_way' && customerPhone && !isRecurring) {
        const name = workerFirstName || 'Your cleaner';
        // Small delay to let the alert show first
        setTimeout(() => {
          sendOnTheWaySMS(customerPhone, name);
        }, 500);
      }
    } catch (error) {
      console.error('Error in handleStatusUpdate:', error);
      Alert.alert('Error', 'Failed to update status. Please try again.');
      // Re-enable button on error so user can retry
      setActionCompleted(false);
    } finally {
      setLoading(false);
      isProcessingRef.current = false;
    }
  };

  const handleCompleteJob = async () => {
    // Prevent double-tap
    if (isProcessingRef.current || loading || actionCompleted) {
      console.log('⚠️ Complete action already in progress, ignoring duplicate tap');
      return;
    }
    
    // IMMEDIATELY disable button
    isProcessingRef.current = true;
    setActionCompleted(true);
    setShowNotesModal(false);
    setLoading(true);
    try {
      const now = getTimestamp();

      // First, fetch booking details to calculate takeaway amount
      const { data: statusData, error: statusError } = await bookingSupabase
        .from('booking_status_on_app')
        .select('booking_id')
        .eq('id', jobId)
        .single();

      if (statusError) throw statusError;

      // Fetch booking pricing details
      const { data: bookingData, error: bookingError } = await bookingSupabase
        .from('bookings')
        .select('pricing, selected_service')
        .eq('id', statusData.booking_id)
        .single();

      // Calculate takeaway amount
      let takeawayAmount = 0;
      if (bookingData?.pricing) {
        const pricing = typeof bookingData.pricing === 'string' 
          ? JSON.parse(bookingData.pricing) 
          : bookingData.pricing;
        
        const hourlyRate = pricing.hourlyRate || 0;
        const totalHours = pricing.totalHours || 0;
        
        if (bookingData.selected_service === 'End of Lease Cleaning') {
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

      // 1. Update time clock with completion info and takeaway amount
      console.log('⏱️ Updating time clock for job completion...');
      await updateTimeClockJobComplete(jobId, completionNotes, takeawayAmount);
      console.log('✅ Time clock updated with takeaway amount');

      // 2. Determine if this is an instance or main job
      if (isRecurring && instanceId) {
        // This is a recurring instance - update instance job_status
        console.log('📋 Updating recurring instance status to completed...');
        const { error: instanceError } = await bookingSupabase
          .from('recurring_booking_status')
          .update({
            job_status: 'completed',
            updated_at: now,
          })
          .eq('id', instanceId);

        if (instanceError) {
          console.error('Error updating instance status:', instanceError);
          throw instanceError;
        }
        console.log('✅ Instance status updated to completed');

        // Also update the main booking_status_on_app back to 'accepted' for next instance
        await bookingSupabase
          .from('booking_status_on_app')
          .update({
            job_status: 'accepted',
            updated_at: now,
          })
          .eq('id', jobId);
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
          .eq('id', jobId);

        if (error) {
          console.error('Error updating status:', error);
          throw error;
        }
        console.log('✅ Main job status updated to completed');

        // Also update the main bookings table status
        if (statusData?.booking_id) {
          await bookingSupabase
            .from('bookings')
            .update({ status: 'completed' })
            .eq('id', statusData.booking_id);
          console.log('✅ Main booking status updated to completed');
        }
      }

      // Button already disabled at start - call onStatusUpdate which closes panel
      onStatusUpdate('completed');
      setCompletionNotes(''); // Reset notes
    } catch (error) {
      console.error('Error completing job:', error);
      Alert.alert('Error', 'Failed to complete job. Please try again.');
      // Re-enable button on error
      setActionCompleted(false);
    } finally {
      setLoading(false);
      isProcessingRef.current = false;
    }
  };

  // Render different buttons based on current status
  const renderActionButton = () => {
    const isDisabled = loading || actionCompleted;
    
    switch (currentStatus) {
      case 'accepted':
        return (
          <TouchableOpacity
            style={[styles.actionButton, styles.onTheWayButton, isDisabled && styles.actionButtonLoading]}
            onPress={() => handleStatusUpdate('on_the_way', 'On the Way')}
            disabled={isDisabled}
          >
            {loading ? (
              <ActivityIndicator color="#F59E0B" size="small" />
            ) : (
              <>
                <Ionicons name="car" size={22} color={actionCompleted ? '#9CA3AF' : '#F59E0B'} />
                <Text style={[styles.actionButtonText, styles.onTheWayButtonText, actionCompleted && styles.disabledButtonText]}>
                  {actionCompleted ? 'Updating...' : 'On the Way'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        );

      case 'on_the_way':
        return (
          <TouchableOpacity
            style={[styles.actionButton, styles.startedButton, isDisabled && styles.actionButtonLoading]}
            onPress={() => handleStatusUpdate('started', 'Started')}
            disabled={isDisabled}
          >
            {loading ? (
              <ActivityIndicator color="#10B981" size="small" />
            ) : (
              <>
                <Ionicons name="play-circle" size={22} color={actionCompleted ? '#9CA3AF' : '#10B981'} />
                <Text style={[styles.actionButtonText, styles.startedButtonText, actionCompleted && styles.disabledButtonText]}>
                  {actionCompleted ? 'Updating...' : 'Start Job'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        );

      case 'started':
        return (
          <TouchableOpacity
            style={[styles.actionButton, styles.completedButton, isDisabled && styles.actionButtonLoading]}
            onPress={() => handleStatusUpdate('completed', 'Completed')}
            disabled={isDisabled}
          >
            {loading ? (
              <ActivityIndicator color="#059669" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={22} color={actionCompleted ? '#9CA3AF' : '#059669'} />
                <Text style={[styles.actionButtonText, styles.completedButtonText, actionCompleted && styles.disabledButtonText]}>
                  {actionCompleted ? 'Updating...' : 'Complete Job'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        );

      default:
        return null;
    }
  };

  if (currentStatus === 'assigned' || currentStatus === 'completed') {
    return null; // No action buttons for these statuses
  }

  return (
    <>
      <View style={styles.container} pointerEvents="box-none">
        {renderActionButton()}
      </View>

      {/* Notes Modal */}
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
              placeholder="e.g., Extra cleaning done, customer requests, issues encountered..."
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
                disabled={loading}
              >
                <Text style={styles.modalButtonTextSecondary}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonPrimary]}
                onPress={handleCompleteJob}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalButtonTextPrimary}>Complete Job</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 10,
    marginBottom: 12,
  },
  actionButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#fff',
    borderWidth: 2,
  },
  actionButtonLoading: {
    opacity: 0.6,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  onTheWayButton: {
    borderColor: '#F59E0B',
  },
  onTheWayButtonText: {
    color: '#F59E0B',
  },
  startedButton: {
    borderColor: '#10B981',
  },
  startedButtonText: {
    color: '#10B981',
  },
  completedButton: {
    borderColor: '#059669',
  },
  completedButtonText: {
    color: '#059669',
  },
  disabledButtonText: {
    color: '#9CA3AF',
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
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
