/**
 * Booking Sync Utility
 * 
 * This module handles syncing bookings from your main booking database
 * to the app's job system for workers to bid on.
 */

import { bookingSupabase, supabase } from './supabase';

export interface BookingData {
  id: string;
  booking_number: string;
  status: string;
  selected_service: string;
  customer_id: string;
  service_details_id: string;
  pricing: any;
  created_at: string;
  customer?: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    address: string;
    suburb: string;
    postcode: string;
    schedule_date: string;
  };
}

export interface ServiceDetails {
  duration?: string;
  frequency?: string;
  special_requests?: string;
  [key: string]: any;
}

/**
 * Fetch pending bookings from the booking database
 */
export async function fetchPendingBookings(): Promise<BookingData[]> {
  try {
    const { data, error } = await bookingSupabase
      .from('bookings')
      .select(`
        *,
        customer:customers(*)
      `)
      .in('status', ['pending', 'confirmed'])
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching bookings:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in fetchPendingBookings:', error);
    return [];
  }
}

/**
 * Fetch service details based on service type and ID
 */
export async function fetchServiceDetails(
  serviceType: string,
  serviceDetailsId: string
): Promise<ServiceDetails | null> {
  try {
    const tableMap: Record<string, string> = {
      'Regular Cleaning': 'regular_cleaning_details',
      'Once-Off Cleaning': 'once_off_cleaning_details',
      'NDIS Cleaning': 'ndis_cleaning_details',
      'Airbnb Cleaning': 'airbnb_cleaning_details',
      'End of Lease Cleaning': 'end_of_lease_cleaning_details',
      'Commercial Cleaning': 'commercial_cleaning_details',
    };

    const tableName = tableMap[serviceType];
    if (!tableName) {
      console.warn(`Unknown service type: ${serviceType}`);
      return null;
    }

    const { data, error } = await bookingSupabase
      .from(tableName)
      .select('*')
      .eq('id', serviceDetailsId)
      .single();

    if (error) {
      console.error(`Error fetching service details from ${tableName}:`, error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in fetchServiceDetails:', error);
    return null;
  }
}

/**
 * Calculate reward points based on service type and pricing
 */
function calculateRewardPoints(booking: BookingData): number {
  const pricing = booking.pricing;
  const totalPrice = pricing?.totalPrice || 0;
  
  // 1 point per $10 spent, minimum 10 points
  const points = Math.max(10, Math.floor(totalPrice / 10));
  
  return points;
}

/**
 * Determine job priority based on schedule date
 */
function determinePriority(scheduleDate: string | null | undefined): 'low' | 'medium' | 'high' {
  if (!scheduleDate) return 'medium';
  
  const scheduledTime = new Date(scheduleDate).getTime();
  const now = new Date().getTime();
  const daysUntil = (scheduledTime - now) / (1000 * 60 * 60 * 24);
  
  if (daysUntil <= 2) return 'high';
  if (daysUntil <= 5) return 'medium';
  return 'low';
}

/**
 * Sync a booking to the app's job system
 */
export async function syncBookingToJob(booking: BookingData): Promise<string | null> {
  try {
    // Check if already synced
    const { data: existingSync } = await supabase
      .from('service_bookings')
      .select('id, app_job_id, converted_to_job')
      .eq('external_booking_id', booking.booking_number)
      .single();

    if (existingSync?.converted_to_job) {
      console.log(`Booking ${booking.booking_number} already synced`);
      return existingSync.app_job_id;
    }

    // Fetch service details
    const serviceDetails = await fetchServiceDetails(
      booking.selected_service,
      booking.service_details_id
    );

    const customer = booking.customer;
    if (!customer) {
      console.error('No customer data for booking:', booking.booking_number);
      return null;
    }

    // Build job title and description
    const jobTitle = `${booking.selected_service} - ${customer.suburb || 'Melbourne'}`;
    
    let jobDescription = `Booking #${booking.booking_number}\n\n`;
    jobDescription += `Service: ${booking.selected_service}\n`;
    
    if (serviceDetails) {
      if (serviceDetails.duration) {
        jobDescription += `Duration: ${serviceDetails.duration}\n`;
      }
      if (serviceDetails.frequency) {
        jobDescription += `Frequency: ${serviceDetails.frequency}\n`;
      }
      if (serviceDetails.special_requests) {
        jobDescription += `\nSpecial Requests:\n${serviceDetails.special_requests}\n`;
      }
    }

    jobDescription += `\nCustomer: ${customer.first_name} ${customer.last_name}`;
    jobDescription += `\nPhone: ${customer.phone}`;
    
    const pricing = booking.pricing || {};
    if (pricing.totalPrice) {
      jobDescription += `\nQuoted Price: $${pricing.totalPrice}`;
    }

    // Calculate reward points and priority
    const rewardPoints = calculateRewardPoints(booking);
    const priority = determinePriority(customer.schedule_date);

    // Create or update service_booking record
    if (existingSync) {
      // Update existing
      const { error: updateError } = await supabase
        .from('service_bookings')
        .update({
          customer_name: `${customer.first_name} ${customer.last_name}`,
          customer_email: customer.email,
          customer_phone: customer.phone,
          service_address: customer.address,
          city: customer.suburb,
          postal_code: customer.postcode,
          scheduled_date: customer.schedule_date,
          quoted_price: pricing.totalPrice,
          booking_title: jobTitle,
          booking_description: jobDescription,
          sync_status: 'synced',
          synced_at: new Date().toISOString(),
        })
        .eq('id', existingSync.id);

      if (updateError) throw updateError;

      // Convert to job
      const { data: jobData, error: jobError } = await supabase
        .rpc('convert_booking_to_job', {
          p_booking_id: existingSync.id,
          p_reward_points: rewardPoints,
          p_priority: priority,
        });

      if (jobError) throw jobError;

      return jobData;
    } else {
      // Create new service_booking and convert to job
      const { data: syncData, error: syncError } = await supabase
        .rpc('sync_booking_to_app', {
          p_external_booking_id: booking.booking_number,
          p_customer_name: `${customer.first_name} ${customer.last_name}`,
          p_customer_email: customer.email,
          p_customer_phone: customer.phone,
          p_service_type: booking.selected_service,
          p_booking_title: jobTitle,
          p_booking_description: jobDescription,
          p_service_address: customer.address,
          p_scheduled_date: customer.schedule_date,
          p_quoted_price: pricing.totalPrice,
          p_additional_data: JSON.stringify({
            service_details: serviceDetails,
            pricing: pricing,
          }),
        });

      if (syncError) throw syncError;

      // Convert to job
      const { data: jobData, error: jobError } = await supabase
        .rpc('convert_booking_to_job', {
          p_booking_id: syncData,
          p_reward_points: rewardPoints,
          p_priority: priority,
        });

      if (jobError) throw jobError;

      return jobData;
    }
  } catch (error) {
    console.error('Error syncing booking to job:', error);
    return null;
  }
}

/**
 * Sync all pending bookings to app jobs
 */
export async function syncAllPendingBookings(): Promise<{
  synced: number;
  failed: number;
  total: number;
}> {
  const bookings = await fetchPendingBookings();
  const total = bookings.length;
  let synced = 0;
  let failed = 0;

  for (const booking of bookings) {
    const result = await syncBookingToJob(booking);
    if (result) {
      synced++;
    } else {
      failed++;
    }
  }

  return { synced, failed, total };
}

/**
 * Check if booking sync is configured
 */
export function isBookingSyncConfigured(): boolean {
  const bookingUrl = process.env.EXPO_PUBLIC_BOOKING_SUPABASE_URL;
  const bookingKey = process.env.EXPO_PUBLIC_BOOKING_SUPABASE_ANON_KEY;
  
  return !!(bookingUrl && bookingKey && bookingUrl !== process.env.EXPO_PUBLIC_SUPABASE_URL);
}

