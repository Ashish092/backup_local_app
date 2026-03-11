/**
 * Shared utility functions for job-related components
 * 
 * This file centralizes common helper functions used across:
 * - OpenJobsList.tsx
 * - JobsListView.tsx
 * - MyJobDetailsPanel.tsx
 * - RecurringInstanceCard.tsx
 * - RosterView.tsx
 * - JobDetailsPanel.tsx
 */

// ============================================================================
// CONSTANTS
// ============================================================================

export const SERVICE_COLORS: Record<string, string> = {
  'Once-Off Cleaning': '#3B82F6',
  'Regular Cleaning': '#10B981',
  'NDIS Cleaning': '#8B5CF6',
  'Airbnb Cleaning': '#F59E0B',
  'End of Lease Cleaning': '#EF4444',
  'Commercial Cleaning': '#6366F1',
};

// ============================================================================
// SERVICE HELPERS
// ============================================================================

/**
 * Get the color associated with a service type
 */
export const getServiceColor = (service: string): string => {
  return SERVICE_COLORS[service] || '#6B7280';
};

/**
 * Get hourly rate for a service type from environment variables
 */
export const getHourlyRate = (serviceType: string): string | null => {
  const rateMap: Record<string, string | undefined> = {
    'Once-Off Cleaning': process.env.EXPO_PUBLIC_RATE_ONCE_OFF,
    'Regular Cleaning': process.env.EXPO_PUBLIC_RATE_REGULAR,
    'NDIS Cleaning': process.env.EXPO_PUBLIC_RATE_NDIS,
    'Airbnb Cleaning': process.env.EXPO_PUBLIC_RATE_AIRBNB,
    'Commercial Cleaning': process.env.EXPO_PUBLIC_RATE_COMMERCIAL,
  };
  return rateMap[serviceType] || null;
};

// ============================================================================
// END OF LEASE CALCULATIONS
// ============================================================================

/**
 * Calculate End of Lease staff amount
 * Formula: (totalPrice - 10% GST) × 60%
 */
export const calculateEndOfLeaseStaffAmount = (pricing: any): number => {
  let totalPrice = 0;
  if (typeof pricing === 'object' && pricing !== null) {
    totalPrice = pricing.totalPrice || pricing.total || pricing.amount || 0;
  } else if (typeof pricing === 'number') {
    totalPrice = pricing;
  }
  if (totalPrice <= 0) return 0;
  
  const afterGST = totalPrice * 0.9;
  const staffAmount = afterGST * 0.6;
  return Math.round(staffAmount * 100) / 100;
};

/**
 * Calculate End of Lease estimated hours
 * Formula: staffAmount / 30, rounded to nearest 0.5
 */
export const calculateEndOfLeaseHours = (staffAmount: number): string => {
  if (staffAmount <= 0) return 'TBD';
  const hours = staffAmount / 30;
  const roundedHours = Math.round(hours * 2) / 2;
  return `${roundedHours} hours`;
};

// ============================================================================
// DATE FORMATTING
// ============================================================================

/**
 * Format date as "Day. Date Month" (e.g., "Mon. 15 Jan")
 * Uses T12:00:00 to avoid timezone issues
 */
export const formatDateShort = (dateString: string): string => {
  if (!dateString) return '';
  const date = new Date(dateString + 'T12:00:00');
  const day = date.toLocaleDateString('en-AU', { weekday: 'short' });
  const dateNum = date.getDate();
  const month = date.toLocaleDateString('en-AU', { month: 'short' });
  return `${day}. ${dateNum} ${month}`;
};

/**
 * Format date for section headers (e.g., "Today, Mon 15 Jan" or "Mon 15 Jan")
 */
export const formatSectionDate = (dateKey: string): string => {
  if (dateKey === 'unscheduled' || dateKey === 'no-date') return 'Unscheduled';
  
  const date = new Date(dateKey + 'T12:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const dateOnly = new Date(date);
  dateOnly.setHours(0, 0, 0, 0);
  
  const options: Intl.DateTimeFormatOptions = { 
    weekday: 'short', 
    day: 'numeric', 
    month: 'short' 
  };
  const formattedDate = date.toLocaleDateString('en-AU', options);
  
  if (dateOnly.getTime() === today.getTime()) {
    return `Today, ${formattedDate}`;
  } else if (dateOnly.getTime() === tomorrow.getTime()) {
    return `Tomorrow, ${formattedDate}`;
  }
  return formattedDate;
};

/**
 * Format date with full weekday for headers (e.g., "Today, Monday 15 Jan")
 */
export const formatDateHeader = (dateString: string): string => {
  if (dateString === 'no-date' || dateString === 'unscheduled') return 'Unscheduled';
  
  const date = new Date(dateString + 'T12:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const jobDate = new Date(date);
  jobDate.setHours(0, 0, 0, 0);
  
  const isToday = jobDate.getTime() === today.getTime();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = jobDate.getTime() === tomorrow.getTime();
  
  const options: Intl.DateTimeFormatOptions = { 
    weekday: 'long', 
    day: 'numeric', 
    month: 'short' 
  };
  const formattedDate = date.toLocaleDateString('en-AU', options);
  
  if (isToday) return `Today, ${formattedDate}`;
  if (isTomorrow) return `Tomorrow, ${formattedDate}`;
  return formattedDate;
};

// ============================================================================
// DATE HELPERS
// ============================================================================

/**
 * Check if a date string represents today
 */
export const isDateToday = (dateString: string): boolean => {
  if (!dateString || dateString === 'no-date' || dateString === 'unscheduled') return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const jobDate = new Date(dateString + 'T12:00:00');
  jobDate.setHours(0, 0, 0, 0);
  return jobDate.getTime() === today.getTime();
};

/**
 * Check if a date string is in the past
 */
export const isDatePast = (dateString: string): boolean => {
  if (!dateString || dateString === 'no-date' || dateString === 'unscheduled') return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const jobDate = new Date(dateString + 'T12:00:00');
  jobDate.setHours(0, 0, 0, 0);
  return jobDate < today;
};

/**
 * Get "X days left" text for countdown
 */
export const getDaysLeftText = (dateString: string): string => {
  if (!dateString) return '';
  const date = new Date(dateString + 'T12:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  const diffTime = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) return 'Overdue';
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  return `${diffDays} days left`;
};

// ============================================================================
// RECURRING SERVICE HELPERS
// ============================================================================

/**
 * Check if a service type is recurring based on service and frequency
 */
export const isRecurringService = (serviceType: string, frequency?: string): boolean => {
  if (serviceType === 'Regular Cleaning') return true;
  if (serviceType === 'NDIS Cleaning') {
    return frequency === 'Weekly' || frequency === 'Fortnightly';
  }
  return false;
};

// ============================================================================
// ONCE-OFF CLEANING HELPERS
// ============================================================================

/**
 * Get Once-Off Cleaning sub-service tag based on basePrice
 * 161 = blank (standard), 225 = Deep Cleaning, 188 = Move-in Cleaning
 */
export const getOnceOffTag = (pricing: any): string => {
  if (!pricing) return '';
  const basePrice = pricing.basePrice || pricing.base_price || 0;
  
  if (basePrice === 225) return 'Deep Cleaning';
  if (basePrice === 188) return 'Move-in Cleaning';
  return '';
};

// ============================================================================
// JOB STATUS HELPERS
// ============================================================================

/**
 * Get job status display label
 */
export const getJobStatusLabel = (status: string): string => {
  const statusMap: Record<string, string> = {
    'open': 'Open',
    'requested': 'Requested',
    'assigned': 'Assigned',
    'accepted': 'Accepted',
    'on_the_way': 'On the Way',
    'started': 'In Progress',
    'completed': 'Completed',
    'cancelled': 'Cancelled',
    'cancelled_by_cleaner': 'Cancelled',
    'cancelled_by_customer': 'Cancelled',
  };
  return statusMap[status] || status?.replace(/_/g, ' ') || 'Unknown';
};

/**
 * Get job status badge color
 */
export const getJobStatusColor = (status: string): string => {
  const colorMap: Record<string, string> = {
    'open': '#6B7280',
    'requested': '#F59E0B',
    'assigned': '#3B82F6',
    'accepted': '#8B5CF6',
    'on_the_way': '#F59E0B',
    'started': '#10B981',
    'completed': '#059669',
    'cancelled': '#EF4444',
    'cancelled_by_cleaner': '#EF4444',
    'cancelled_by_customer': '#EF4444',
  };
  return colorMap[status] || '#6B7280';
};

/**
 * Get job status tag for card display
 * Returns null for statuses that don't show a tag (accepted, completed)
 */
export const getJobStatusTag = (jobStatus: string): { label: string; color: string } | null => {
  switch (jobStatus) {
    case 'assigned':
      return { label: 'Accept Pending', color: '#F59E0B' };
    case 'on_the_way':
      return { label: 'On the Way', color: '#3B82F6' };
    case 'started':
      return { label: 'On Going', color: '#10B981' };
    case 'accepted':
    case 'completed':
    default:
      return null;
  }
};
