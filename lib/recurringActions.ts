import { bookingSupabase } from './supabase';

// ============================================================================
// TYPES
// ============================================================================

export interface RecurringInstanceResult {
  success: boolean;
  error?: string;
  instancesCreated?: number;
  instancesUpdated?: number;
}

export interface FetchFrequencyResult {
  success: boolean;
  error?: string;
  frequency?: 'Weekly' | 'Fortnightly';
  scheduleDate?: string;
}

// ============================================================================
// RECURRING INSTANCE OPERATIONS
// ============================================================================

/**
 * Fetch frequency from service details table based on service type
 */
export async function fetchFrequency(
  bookingId: string,
  serviceType: string
): Promise<FetchFrequencyResult> {
  try {
    // Get service_details_id from booking
    const { data: booking, error: bookingError } = await bookingSupabase
      .from('bookings')
      .select('service_details_id, customer:customers!fk_bookings_customer_id(schedule_date)')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      return { success: false, error: 'Failed to fetch booking details' };
    }

    // Get schedule date
    const customerInfo = booking.customer as { schedule_date?: string }[] | { schedule_date?: string } | null;
    const scheduleDate = Array.isArray(customerInfo) 
      ? customerInfo[0]?.schedule_date 
      : customerInfo?.schedule_date;

    let frequency: string | null = null;

    // Fetch frequency based on service type
    if (serviceType === 'Regular Cleaning') {
      const { data: serviceDetails, error } = await bookingSupabase
        .from('regular_cleaning_details')
        .select('frequency')
        .eq('id', booking.service_details_id)
        .single();

      if (error) {
        return { success: false, error: 'Failed to fetch regular cleaning details' };
      }
      frequency = serviceDetails?.frequency || null;
    } else if (serviceType === 'NDIS Cleaning') {
      const { data: serviceDetails, error } = await bookingSupabase
        .from('ndis_cleaning_details')
        .select('frequency')
        .eq('id', booking.service_details_id)
        .single();

      if (error) {
        return { success: false, error: 'Failed to fetch NDIS cleaning details' };
      }
      frequency = serviceDetails?.frequency || null;
    } else {
      return { success: false, error: `Service type ${serviceType} is not recurring` };
    }

    if (!frequency || (frequency !== 'Weekly' && frequency !== 'Fortnightly')) {
      return { success: false, error: `Invalid frequency: ${frequency}` };
    }

    return { 
      success: true, 
      frequency: frequency as 'Weekly' | 'Fortnightly',
      scheduleDate: scheduleDate || undefined
    };
  } catch (error: any) {
    console.error('Error in fetchFrequency:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Check if recurring instances exist for a booking
 */
export async function checkRecurringInstances(
  bookingStatusId: string
): Promise<{ exists: boolean; count: number }> {
  try {
    const { data, error } = await bookingSupabase
      .from('recurring_booking_status')
      .select('id')
      .eq('booking_status_on_app_id', bookingStatusId);

    if (error) {
      console.error('Error checking recurring instances:', error);
      return { exists: false, count: 0 };
    }

    return { 
      exists: data && data.length > 0,
      count: data?.length || 0
    };
  } catch (error) {
    console.error('Error in checkRecurringInstances:', error);
    return { exists: false, count: 0 };
  }
}

/**
 * Update existing recurring instances from today onwards
 */
export async function updateRecurringInstances(
  bookingStatusId: string,
  assignedTo: string
): Promise<RecurringInstanceResult> {
  try {
    const now = new Date().toISOString();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    const { data, error } = await bookingSupabase
      .from('recurring_booking_status')
      .update({
        job_status: 'assigned',
        assigned_to: assignedTo,
        assigned_at: now,
        updated_at: now,
      })
      .eq('booking_status_on_app_id', bookingStatusId)
      .gte('instance_date', todayStr)
      .select('id');

    if (error) {
      console.error('Error updating recurring instances:', error);
      return { success: false, error: error.message };
    }

    const updatedCount = data?.length || 0;
    console.log(`✅ Updated ${updatedCount} future recurring instances`);

    return { success: true, instancesUpdated: updatedCount };
  } catch (error: any) {
    console.error('Error in updateRecurringInstances:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Generate 50 new recurring instances
 */
export async function generateRecurringInstances(
  bookingId: string,
  bookingStatusId: string,
  bookingNumber: string,
  startDate: string,
  frequency: 'Weekly' | 'Fortnightly',
  assignedTo: string
): Promise<RecurringInstanceResult> {
  try {
    console.log(`📝 Generating 50 recurring instances for ${bookingNumber}...`);

    const instances = [];
    const now = new Date().toISOString();
    const intervalDays = frequency === 'Weekly' ? 7 : 14;
    
    // Parse start date
    let currentDate = new Date(startDate + 'T12:00:00');

    // Generate 50 instances
    for (let i = 1; i <= 50; i++) {
      const instanceNumber = i.toString().padStart(3, '0');
      const instanceBookingNumber = `${bookingNumber}_R${instanceNumber}`;
      const instanceDateStr = currentDate.toISOString().split('T')[0];

      instances.push({
        master_booking_id: bookingId,
        booking_status_on_app_id: bookingStatusId,
        instance_number: i,
        instance_booking_number: instanceBookingNumber,
        instance_date: instanceDateStr,
        job_status: 'assigned',
        assigned_to: assignedTo,
        assigned_at: now,
        created_at: now,
        updated_at: now,
      });

      // Move to next date
      currentDate.setDate(currentDate.getDate() + intervalDays);
    }

    // Bulk insert all instances
    const { error: insertError } = await bookingSupabase
      .from('recurring_booking_status')
      .insert(instances);

    if (insertError) {
      console.error('Error inserting recurring instances:', insertError);
      return { success: false, error: insertError.message };
    }

    console.log('✅ Successfully created 50 recurring instances!');
    return { success: true, instancesCreated: 50 };
  } catch (error: any) {
    console.error('Error in generateRecurringInstances:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle recurring instances (check if exist, update or create)
 * This is the main function to call from bidActions
 */
export async function handleRecurringInstances(
  bookingId: string,
  bookingStatusId: string,
  bookingNumber: string,
  serviceType: string,
  assignedTo: string
): Promise<RecurringInstanceResult> {
  try {
    console.log('📅 Processing recurring instances for booking:', bookingNumber);

    // Step 1: Check if instances already exist
    const { exists } = await checkRecurringInstances(bookingStatusId);

    if (exists) {
      // Update existing instances from today onwards
      console.log('📋 Instances exist. Updating future instances...');
      return await updateRecurringInstances(bookingStatusId, assignedTo);
    } else {
      // Generate new instances
      console.log('📝 No instances found. Creating new instances...');
      
      // Fetch frequency and schedule date
      const frequencyResult = await fetchFrequency(bookingId, serviceType);
      
      if (!frequencyResult.success || !frequencyResult.frequency || !frequencyResult.scheduleDate) {
        return { 
          success: false, 
          error: frequencyResult.error || 'Missing frequency or schedule date' 
        };
      }

      // Generate instances
      return await generateRecurringInstances(
        bookingId,
        bookingStatusId,
        bookingNumber,
        frequencyResult.scheduleDate,
        frequencyResult.frequency,
        assignedTo
      );
    }
  } catch (error: any) {
    console.error('Error in handleRecurringInstances:', error);
    return { success: false, error: error.message };
  }
}
