import { supabase, bookingSupabase } from './supabase';
import { handleRecurringInstances } from './recurringActions';

// ============================================================================
// TYPES
// ============================================================================

export interface BidResult {
  success: boolean;
  error?: string;
  bidId?: string;
}

export interface BookingStatusResult {
  success: boolean;
  error?: string;
}

export interface RejectBidResult {
  success: boolean;
  error?: string;
  shouldReopenJob: boolean;
}

export interface ApproveBidResult {
  success: boolean;
  error?: string;
  instancesCreated?: number;
  instancesUpdated?: number;
}

// ============================================================================
// BID OPERATIONS
// ============================================================================

/**
 * Create or update a bid for a booking
 * If bid exists for this user + booking: UPDATE to pending
 * If not: INSERT new bid
 */
export async function upsertBid(
  bookingId: string,
  userId: string,
  isInstance: boolean = false,
  instanceIds?: string[] // NEW: Store specific instance IDs for recurring jobs
): Promise<BidResult> {
  try {
    // Check if bid exists
    const { data: existingBid, error: checkError } = await supabase
      .from('bids')
      .select('id, status')
      .eq('booking_id', bookingId)
      .eq('user_id', userId)
      .maybeSingle();

    if (checkError) {
      console.error('Error checking existing bid:', checkError);
      return { success: false, error: checkError.message };
    }

    const now = new Date().toISOString();

    if (existingBid) {
      // Update existing bid to pending
      const { error: updateError } = await supabase
        .from('bids')
        .update({
          status: 'pending',
          is_instance: isInstance,
          instance_ids: instanceIds || null,
          updated_at: now,
        })
        .eq('id', existingBid.id);

      if (updateError) {
        console.error('Error updating bid:', updateError);
        return { success: false, error: updateError.message };
      }

      return { success: true, bidId: existingBid.id };
    } else {
      // Insert new bid
      const { data: newBid, error: insertError } = await supabase
        .from('bids')
        .insert({
          booking_id: bookingId,
          user_id: userId,
          status: 'pending',
          is_instance: isInstance,
          instance_ids: instanceIds || null,
        })
        .select('id')
        .single();

      if (insertError) {
        console.error('Error inserting bid:', insertError);
        return { success: false, error: insertError.message };
      }

      return { success: true, bidId: newBid.id };
    }
  } catch (error: any) {
    console.error('Error in upsertBid:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Upsert booking_status_on_app
 * For non-recurring: Set job_status to 'requested'
 * For recurring: Do NOT update job_status or assigned_to (managed at instance level)
 */
export async function upsertBookingStatus(
  bookingId: string,
  isRecurring: boolean,
  jobStatus: string = 'requested'
): Promise<BookingStatusResult> {
  try {
    // Check if record exists
    const { data: existingStatus, error: checkError } = await bookingSupabase
      .from('booking_status_on_app')
      .select('id')
      .eq('booking_id', bookingId)
      .maybeSingle();

    if (checkError) {
      console.error('Error checking booking status:', checkError);
      return { success: false, error: checkError.message };
    }

    const now = new Date().toISOString();

    if (existingStatus) {
      // Record exists
      if (isRecurring) {
        // For recurring bookings, do NOT update job_status
        // Only update the timestamp
        const { error: updateError } = await bookingSupabase
          .from('booking_status_on_app')
          .update({
            updated_at: now,
          })
          .eq('booking_id', bookingId);

        if (updateError) {
          console.error('Error updating booking status:', updateError);
          return { success: false, error: updateError.message };
        }
      } else {
        // For non-recurring, update job_status normally
        const { error: updateError } = await bookingSupabase
          .from('booking_status_on_app')
          .update({
            job_status: jobStatus,
            updated_at: now,
          })
          .eq('booking_id', bookingId);

        if (updateError) {
          console.error('Error updating booking status:', updateError);
          return { success: false, error: updateError.message };
        }
      }
    } else {
      // Insert new record
      // For recurring, leave job_status and assigned_to as null
      // For non-recurring, set job_status
      const { error: insertError } = await bookingSupabase
        .from('booking_status_on_app')
        .insert({
          booking_id: bookingId,
          job_status: isRecurring ? null : jobStatus,
          assigned_to: null, // Always null initially
          is_recurring: isRecurring,
        });

      if (insertError) {
        console.error('Error inserting booking status:', insertError);
        return { success: false, error: insertError.message };
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error in upsertBookingStatus:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Request a job (combines upsertBid + upsertBookingStatus)
 */
export async function requestJob(
  bookingId: string,
  userId: string,
  isRecurring: boolean,
  instanceIds?: string[] // NEW: Pass instance IDs for recurring jobs
): Promise<BidResult> {
  try {
    // Step 1: Upsert bid (pass isRecurring as is_instance, and instanceIds)
    const bidResult = await upsertBid(bookingId, userId, isRecurring, instanceIds);
    if (!bidResult.success) {
      return bidResult;
    }

    // Step 2: Upsert booking status (for recurring, this doesn't update job_status)
    const statusResult = await upsertBookingStatus(bookingId, isRecurring, 'requested');
    if (!statusResult.success) {
      return { success: false, error: statusResult.error };
    }

    return { success: true, bidId: bidResult.bidId };
  } catch (error: any) {
    console.error('Error in requestJob:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// ADMIN BID OPERATIONS
// ============================================================================

/**
 * Reject a bid
 * Check if any pending bids remain, if not -> reopen job
 */
export async function rejectBid(
  bidId: string,
  bookingId: string
): Promise<RejectBidResult> {
  try {
    const now = new Date().toISOString();

    // Step 1: Update bid to rejected
    const { error: updateError } = await supabase
      .from('bids')
      .update({
        status: 'rejected',
        updated_at: now,
      })
      .eq('id', bidId);

    if (updateError) {
      console.error('Error rejecting bid:', updateError);
      return { success: false, error: updateError.message, shouldReopenJob: false };
    }

    // Step 2: Count remaining pending bids
    const { count, error: countError } = await supabase
      .from('bids')
      .select('id', { count: 'exact', head: true })
      .eq('booking_id', bookingId)
      .eq('status', 'pending');

    if (countError) {
      console.error('Error counting pending bids:', countError);
      return { success: false, error: countError.message, shouldReopenJob: false };
    }

    const shouldReopenJob = (count || 0) === 0;

    // Step 3: If no pending bids remain, reopen job
    if (shouldReopenJob) {
      const { error: statusError } = await bookingSupabase
        .from('booking_status_on_app')
        .update({
          job_status: 'open',
          updated_at: now,
        })
        .eq('booking_id', bookingId);

      if (statusError) {
        console.error('Error reopening job:', statusError);
        return { success: false, error: statusError.message, shouldReopenJob: false };
      }
    }

    return { success: true, shouldReopenJob };
  } catch (error: any) {
    console.error('Error in rejectBid:', error);
    return { success: false, error: error.message, shouldReopenJob: false };
  }
}

/**
 * Approve a bid and assign job to cleaner
 * Handles both recurring and non-recurring bookings
 */
export async function approveBid(
  bidId: string,
  bookingId: string,
  userId: string,
  isRecurring: boolean,
  bookingNumber?: string,
  serviceType?: string
): Promise<ApproveBidResult> {
  try {
    const now = new Date().toISOString();

    // Step 1: Reject all other pending bids for this booking
    const { error: rejectOthersError } = await supabase
      .from('bids')
      .update({
        status: 'rejected',
        updated_at: now,
      })
      .eq('booking_id', bookingId)
      .neq('id', bidId)
      .eq('status', 'pending');

    if (rejectOthersError) {
      console.error('Error rejecting other bids:', rejectOthersError);
      return { success: false, error: rejectOthersError.message };
    }

    // Step 2: Approve selected bid (is_admin_assigned = false because cleaner requested it)
    const { error: approveError } = await supabase
      .from('bids')
      .update({
        status: 'approved',
        is_admin_assigned: false,
        updated_at: now,
      })
      .eq('id', bidId);

    if (approveError) {
      console.error('Error approving bid:', approveError);
      return { success: false, error: approveError.message };
    }

    // Step 3: Handle based on recurring or non-recurring
    if (!isRecurring) {
      // NON-RECURRING: Simple update
      const { error: statusError } = await bookingSupabase
        .from('booking_status_on_app')
        .update({
          job_status: 'assigned',
          assigned_to: userId,
          assigned_at: now,
          updated_at: now,
        })
        .eq('booking_id', bookingId);

      if (statusError) {
        console.error('Error updating booking status:', statusError);
        return { success: false, error: statusError.message };
      }

      return { success: true };
    } else {
      // RECURRING: More complex logic
      // Step 3a: Update booking_status_on_app (no assigned_to/assigned_at)
      const { error: statusError } = await bookingSupabase
        .from('booking_status_on_app')
        .update({
          job_status: 'assigned',
          updated_at: now,
        })
        .eq('booking_id', bookingId);

      if (statusError) {
        console.error('Error updating booking status:', statusError);
        return { success: false, error: statusError.message };
      }

      // Step 3b: Get booking_status_on_app id
      const { data: statusData, error: statusFetchError } = await bookingSupabase
        .from('booking_status_on_app')
        .select('id')
        .eq('booking_id', bookingId)
        .single();

      if (statusFetchError || !statusData) {
        console.error('Error fetching booking status id:', statusFetchError);
        return { success: false, error: statusFetchError?.message || 'Status not found' };
      }

      const bookingStatusId = statusData.id;

      // Step 3c: Handle recurring instances (check, update, or create)
      if (!bookingNumber || !serviceType) {
        return { 
          success: false, 
          error: 'Missing bookingNumber or serviceType for recurring instances' 
        };
      }

      const recurringResult = await handleRecurringInstances(
        bookingId,
        bookingStatusId,
        bookingNumber,
        serviceType,
        userId
      );

      if (!recurringResult.success) {
        return { success: false, error: recurringResult.error };
      }

      return { 
        success: true, 
        instancesCreated: recurringResult.instancesCreated,
        instancesUpdated: recurringResult.instancesUpdated
      };
    }
  } catch (error: any) {
    console.error('Error in approveBid:', error);
    return { success: false, error: error.message };
  }
}
