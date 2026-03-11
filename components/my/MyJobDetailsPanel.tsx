import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  ScrollView,
  Linking,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { JobActionButtons, CancelBookingButton, AcceptJobButton } from './DetailsPanel';
import InlineJobNotes from './DetailsPanel/InlineJobNotes';
import { bookingSupabase } from '@/lib/supabase';
import {
  getServiceColor,
  getHourlyRate,
  calculateEndOfLeaseStaffAmount,
  calculateEndOfLeaseHours,
  getOnceOffTag,
  getDaysLeftText,
  formatDateShort,
} from '@/lib/jobUtils';

// ============================================================================
// TYPES
// ============================================================================

// Service Details Types
interface OnceOffDetails {
  duration: string;
  two_cleaners: boolean;
  special_requests: string | null;
}

interface RegularCleaningDetails {
  duration: string;
  frequency: string;
  special_requests: string | null;
}

interface NDISCleaningDetails {
  duration: string;
  frequency?: string;
  special_requests: string | null;
}

interface AirbnbDetails {
  duration: string;
  linen_change: boolean;
  restock_amenities: boolean;
  special_requests: string | null;
}

interface EndOfLeaseDetails {
  home_size: string;
  base_bathrooms: number;
  base_toilets: number;
  extra_bathrooms: number;
  extra_toilets: number;
  furnished: boolean;
  study_room: boolean;
  pets: boolean;
  steam_carpet: boolean;
  steam_bedrooms: number;
  steam_living_rooms: number;
  steam_hallway: boolean;
  steam_stairs: boolean;
  balcony: boolean;
  garage: boolean;
  special_requests: string | null;
}

type ServiceDetails = OnceOffDetails | RegularCleaningDetails | NDISCleaningDetails | AirbnbDetails | EndOfLeaseDetails | null;

export interface MyJobData {
  id: string; // booking_status_on_app id
  booking_id: string;
  booking_number: string;
  selected_service: string;
  status: string;
  job_status: string; // from booking_status_on_app
  is_recurring: boolean;
  pricing?: any;
  duration?: string;
  frequency?: string;
  assigned_to?: string;
  assigned_at?: string;
  service_details_id?: string;
  customer: {
    first_name: string;
    last_name: string;
    suburb: string;
    postcode: string;
    schedule_date?: string;
    address?: string;
    phone?: string;
  } | null;
  // Instance data (if recurring)
  recurring_instance?: {
    id: string;
    instance_number: number;
    instance_date: string;
    instance_booking_number: string;
    job_status: string;
    assigned_to: string | null;
  };
}

interface MyJobDetailsPanelProps {
  job: MyJobData | null;
  visible: boolean;
  onClose: () => void;
  userId?: string;
  userFirstName?: string;
  onStatusUpdate?: (jobId: string, newStatus: string) => void;
  onJobCancelled?: () => void;
}


const getJobStatusLabel = (status: string): string => {
  const statusMap: Record<string, string> = {
    'open': 'Open',
    'requested': 'Requested',
    'assigned': 'Assigned',
    'accepted': 'Accepted',
    'on_the_way': 'On the Way',
    'started': 'In Progress',
    'completed': 'Completed',
  };
  return statusMap[status] || status;
};

const getJobStatusColor = (status: string): string => {
  const colorMap: Record<string, string> = {
    'open': '#6B7280',
    'requested': '#F59E0B',
    'assigned': '#3B82F6',
    'accepted': '#8B5CF6',
    'on_the_way': '#F59E0B',
    'started': '#10B981',
    'completed': '#059669',
  };
  return colorMap[status] || '#6B7280';
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function MyJobDetailsPanel({
  job,
  visible,
  onClose,
  userId,
  userFirstName,
  onStatusUpdate,
  onJobCancelled,
}: MyJobDetailsPanelProps) {
  // Local state to track if job was just accepted (to reveal contact info)
  const [justAccepted, setJustAccepted] = useState(false);
  const [revealedCustomerData, setRevealedCustomerData] = useState<{
    phone?: string;
    address?: string;
    firstName?: string;
    lastName?: string;
  } | null>(null);

  // Service details state
  const [serviceDetails, setServiceDetails] = useState<ServiceDetails>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  
  // Customer notes state (from customers table)
  const [customerNotes, setCustomerNotes] = useState<string | null>(null);
  
  // Cancel button reveal state - only visible after scroll up or drag
  const [cancelButtonRevealed, setCancelButtonRevealed] = useState(false);
  const scrollOffsetRef = React.useRef(0);
  
  // Local state for current job status (updates immediately on action)
  const getInitialStatus = () => {
    if (!job) return 'accepted';
    // For recurring instances, use instance status; otherwise use main job status
    return job.recurring_instance?.job_status || job.job_status;
  };
  const [currentJobStatus, setCurrentJobStatus] = useState(getInitialStatus);
  
  // Sync local status with prop when job changes
  useEffect(() => {
    if (job) {
      const status = job.recurring_instance?.job_status || job.job_status;
      setCurrentJobStatus(status);
    }
  }, [job?.job_status, job?.recurring_instance?.job_status]);

  // Fetch service details when modal opens
  useEffect(() => {
    const fetchServiceDetails = async () => {
      if (!job || !job.service_details_id || !visible) return;

      setLoadingDetails(true);
      try {
        const serviceType = job.selected_service;
        let tableName = '';

        switch (serviceType) {
          case 'Once-Off Cleaning':
            tableName = 'once_off_cleaning_details';
            break;
          case 'Regular Cleaning':
            tableName = 'regular_cleaning_details';
            break;
          case 'NDIS Cleaning':
            tableName = 'ndis_cleaning_details';
            break;
          case 'Airbnb Cleaning':
            tableName = 'airbnb_cleaning_details';
            break;
          case 'End of Lease Cleaning':
            tableName = 'end_of_lease_cleaning_details';
            break;
          default:
            setServiceDetails(null);
            setLoadingDetails(false);
            return;
        }

        const { data, error } = await bookingSupabase
          .from(tableName)
          .select('*')
          .eq('id', job.service_details_id)
          .single();

        if (error) {
          console.error('Error fetching service details:', error);
          setServiceDetails(null);
        } else {
          setServiceDetails(data);
        }
      } catch (err) {
        console.error('Error in fetchServiceDetails:', err);
        setServiceDetails(null);
      } finally {
        setLoadingDetails(false);
      }
    };

    fetchServiceDetails();
  }, [job?.service_details_id, job?.selected_service, visible]);

  // Fetch customer notes when modal opens
  useEffect(() => {
    const fetchCustomerNotes = async () => {
      if (!job || !job.booking_id || !visible) {
        setCustomerNotes(null);
        return;
      }

      try {
        // First get customer_id from booking
        const { data: bookingData, error: bookingError } = await bookingSupabase
          .from('bookings')
          .select('customer_id')
          .eq('id', job.booking_id)
          .single();

        if (bookingError || !bookingData?.customer_id) {
          setCustomerNotes(null);
          return;
        }

        // Then get notes from customers table
        const { data: customerData, error: customerError } = await bookingSupabase
          .from('customers')
          .select('notes')
          .eq('id', bookingData.customer_id)
          .single();

        if (customerError) {
          console.error('Error fetching customer notes:', customerError);
          setCustomerNotes(null);
        } else {
          setCustomerNotes(customerData?.notes || null);
        }
      } catch (err) {
        console.error('Error in fetchCustomerNotes:', err);
        setCustomerNotes(null);
      }
    };

    fetchCustomerNotes();
  }, [job?.booking_id, visible]);

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      setJustAccepted(false);
      setRevealedCustomerData(null);
      setCancelButtonRevealed(false);
      scrollOffsetRef.current = 0;
      setCustomerNotes(null);
    }
  }, [visible]);
  
  // Handle scroll to reveal cancel button
  const handleScroll = (event: any) => {
    const currentOffset = event.nativeEvent.contentOffset.y;
    const previousOffset = scrollOffsetRef.current;
    
    // Reveal cancel button if user scrolls up (negative direction) or reaches bottom
    const isScrollingUp = currentOffset < previousOffset - 5;
    const contentHeight = event.nativeEvent.contentSize.height;
    const layoutHeight = event.nativeEvent.layoutMeasurement.height;
    const isNearBottom = currentOffset + layoutHeight >= contentHeight - 50;
    
    if (isScrollingUp || isNearBottom) {
      setCancelButtonRevealed(true);
    }
    
    scrollOffsetRef.current = currentOffset;
  };

  if (!job) return null;

  // Determine if this is an instance or main booking
  const isInstance = !!job.recurring_instance;
  
  // Get effective job status - use local state for immediate UI updates
  const effectiveJobStatus = currentJobStatus;

  // Check if status is 'assigned' (show limited data + Accept button)
  const isAssigned = effectiveJobStatus === 'assigned' && !justAccepted;

  const serviceType = job.selected_service;
  const serviceColor = getServiceColor(serviceType);
  const customerName = job.customer 
    ? `${job.customer.first_name} ${job.customer.last_name}` 
    : 'Customer';
  const location = job.customer?.suburb 
    ? `${job.customer.suburb}, ${job.customer.postcode}` 
    : 'N/A';

  // Get effective schedule date (from instance if recurring)
  const scheduleDate = isInstance 
    ? job.recurring_instance!.instance_date 
    : job.customer?.schedule_date;

  // Get Once-Off sub-service tag
  const onceOffTag = serviceType === 'Once-Off Cleaning' ? getOnceOffTag(job.pricing) : '';

  // Handle accept callback
  const handleAccepted = (customerData: {
    phone?: string;
    address?: string;
    firstName?: string;
    lastName?: string;
  }) => {
    setJustAccepted(true);
    setRevealedCustomerData(customerData);
    onStatusUpdate?.(job.id, 'accepted');
  };

  // Handle call customer
  const handleCallCustomer = (phoneNumber: string) => {
    const phoneUrl = `tel:${phoneNumber}`;
    Linking.canOpenURL(phoneUrl)
      .then((supported) => {
        if (supported) {
          Linking.openURL(phoneUrl);
        } else {
          Alert.alert('Error', 'Phone dialer is not available on this device');
        }
      })
      .catch((err) => {
        console.error('Error opening phone dialer:', err);
        Alert.alert('Error', 'Failed to open phone dialer');
      });
  };

  // Handle message customer with prefilled text
  const handleMessageCustomer = (phoneNumber: string) => {
    let formattedDate = 'your scheduled date';
    if (scheduleDate) {
      const date = new Date(scheduleDate);
      formattedDate = date.toLocaleDateString('en-AU', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
    }

    const workerName = userFirstName || 'Your cleaner';
    const message = `Hello, this is ${workerName} from Cleaning Professionals. I have accepted your cleaning appointment scheduled for ${formattedDate}. I wanted to confirm the preferred arrival time and check if you have any special requests I need to consider before coming to the cleaning. Please let me know what time works best for you. Thank you!`;

    const smsUrl = `sms:${phoneNumber}&body=${encodeURIComponent(message)}`;
    
    Linking.canOpenURL(smsUrl)
      .then((supported) => {
        if (supported) {
          Linking.openURL(smsUrl);
        } else {
          const altSmsUrl = `sms:${phoneNumber}?body=${encodeURIComponent(message)}`;
          Linking.openURL(altSmsUrl).catch(() => {
            Alert.alert('Error', 'SMS is not available on this device');
          });
        }
      })
      .catch((err) => {
        console.error('Error opening SMS:', err);
        Alert.alert('Error', 'Failed to open SMS app');
      });
  };

  // Handle open maps with location
  const handleOpenMaps = (address: string) => {
    const encodedAddress = encodeURIComponent(address);
    const appleMapsUrl = `maps://maps.apple.com/?saddr=Current+Location&daddr=${encodedAddress}&dirflg=d`;
    const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}&travelmode=driving`;
    
    Linking.canOpenURL(appleMapsUrl)
      .then((supported) => {
        if (supported) {
          Linking.openURL(appleMapsUrl);
        } else {
          Linking.openURL(googleMapsUrl);
        }
      })
      .catch((err) => {
        console.error('Error opening maps:', err);
        Linking.openURL(googleMapsUrl).catch(() => {
          Alert.alert('Error', 'Could not open maps application');
        });
      });
  };

  // ============================================================================
  // CALCULATE TAKE-AWAY AMOUNT
  // ============================================================================

  const calculateTakeAwayAmount = (duration?: string): string => {
    const isEndOfLease = serviceType === 'End of Lease Cleaning';
    
    if (isEndOfLease) {
      const staffAmount = calculateEndOfLeaseStaffAmount(job.pricing);
      return staffAmount > 0 ? `$${staffAmount}` : 'N/A';
    }

    const durationToUse = duration || job.duration;
    if (!durationToUse) return 'N/A';

    const hourlyRateStr = getHourlyRate(serviceType);
    if (!hourlyRateStr) return 'N/A';

    const hourlyRate = parseFloat(hourlyRateStr);
    const durationMatch = durationToUse.match(/(\d+(?:\.\d+)?)/);
    if (!durationMatch) return 'N/A';

    const hours = parseFloat(durationMatch[1]);
    const totalAmount = hourlyRate * hours;

    return `$${Math.round(totalAmount)}`;
  };

  // Get Once-Off sub-service type from base price
  const getOnceOffSubService = (): string => {
    if (!job.pricing) return 'Once-Off';
    const basePrice = job.pricing.basePrice || job.pricing.base_price || 0;
    if (basePrice === 225) return 'Deep Cleaning';
    if (basePrice === 161) return 'Once-Off';
    if (basePrice === 188) return 'Move-In Cleaning';
    return 'Once-Off';
  };

  // ============================================================================
  // COMMON HEADER CONTENT (Location + Date) - Same for all services
  // ============================================================================

  const renderAddressDateFooter = (isAcceptedView: boolean = false) => {
    // For accepted view: show full address, for assigned view: show suburb/postcode
    const displayLocation = isAcceptedView && job.customer?.address 
      ? job.customer.address 
      : location;

    return (
      <View style={styles.addressDateContainer} pointerEvents="none">
        {/* Location */}
        <Text style={styles.locationText}>{displayLocation}</Text>

        {/* Date Row - date on left, days remaining on right */}
        {scheduleDate && (
          <View style={styles.dateRow}>
            <Text style={styles.dateText}>{formatDateShort(scheduleDate)}</Text>
            <Text style={styles.daysLeftText}>{getDaysLeftText(scheduleDate)}</Text>
          </View>
        )}
      </View>
    );
  };

  // ============================================================================
  // CUSTOMER NOTES SECTION (from customers table)
  // ============================================================================

  const renderCustomerNotes = () => {
    if (!customerNotes || customerNotes.trim() === '') return null;

    return (
      <View style={styles.customerNotesContainer} pointerEvents="none">
        <View style={styles.customerNotesHeader}>
          <Ionicons name="document-text-outline" size={16} color="#6B7280" />
          <Text style={styles.customerNotesTitle}>Booking Notes</Text>
        </View>
        <Text style={styles.customerNotesText}>{customerNotes}</Text>
      </View>
    );
  };

  // ============================================================================
  // SERVICE-SPECIFIC CONTENT RENDERERS
  // ============================================================================

  // Regular Cleaning (Recurring/Instance)
  const renderRegularCleaningContent = (isAcceptedView: boolean = false) => {
    const hourlyRate = getHourlyRate(serviceType);
    const details = serviceDetails as RegularCleaningDetails | null;
    const duration = details?.duration || job.duration || '';
    const frequency = details?.frequency || job.frequency || '';

    return (
      <View style={styles.detailsContainer} pointerEvents="none">
        {/* Hourly Rate */}
        <View style={styles.serviceDetailRow}>
          <Text style={styles.serviceDetailLabel}>Hourly Rate</Text>
          <Text style={styles.serviceDetailValue}>{hourlyRate ? `$${hourlyRate}/hr` : 'N/A'}</Text>
        </View>

        {/* Duration & Frequency */}
        <View style={styles.serviceDetailRow}>
          <Text style={styles.serviceDetailLabel}>Duration</Text>
          <Text style={styles.serviceDetailValue}>{duration}</Text>
        </View>
        <View style={styles.serviceDetailRow}>
          <Text style={styles.serviceDetailLabel}>Frequency</Text>
          <Text style={styles.serviceDetailValue}>{frequency}</Text>
        </View>

        {/* Customer Notes - from customers table */}
        {renderCustomerNotes()}

        {/* Take-away Amount - Only in accepted view */}
        {isAcceptedView && (
          <View style={styles.takeAwayRow}>
            <Ionicons name="wallet-outline" size={16} color="#059669" />
            <Text style={styles.takeAwayLabel}>Take-away</Text>
            <Text style={styles.takeAwayAmount}>{calculateTakeAwayAmount(duration)}</Text>
          </View>
        )}

        {/* Address and Date - at the bottom */}
        {renderAddressDateFooter(isAcceptedView)}
      </View>
    );
  };

  // NDIS Cleaning (Recurring/Instance)
  const renderNDISCleaningRecurringContent = (isAcceptedView: boolean = false) => {
    const hourlyRate = getHourlyRate(serviceType);
    const details = serviceDetails as NDISCleaningDetails | null;
    const duration = details?.duration || job.duration || '';
    const frequency = details?.frequency || job.frequency || '';

    return (
      <View style={styles.detailsContainer} pointerEvents="none">
        {/* Hourly Rate */}
        <View style={styles.serviceDetailRow}>
          <Text style={styles.serviceDetailLabel}>Hourly Rate</Text>
          <Text style={styles.serviceDetailValue}>{hourlyRate ? `$${hourlyRate}/hr` : 'N/A'}</Text>
        </View>

        {/* Duration & Frequency */}
        <View style={styles.serviceDetailRow}>
          <Text style={styles.serviceDetailLabel}>Duration</Text>
          <Text style={styles.serviceDetailValue}>{duration}</Text>
        </View>
        <View style={styles.serviceDetailRow}>
          <Text style={styles.serviceDetailLabel}>Frequency</Text>
          <Text style={styles.serviceDetailValue}>{frequency}</Text>
        </View>

        {/* Customer Notes - from customers table */}
        {renderCustomerNotes()}

        {/* Take-away Amount - Only in accepted view */}
        {isAcceptedView && (
          <View style={styles.takeAwayRow}>
            <Ionicons name="wallet-outline" size={16} color="#059669" />
            <Text style={styles.takeAwayLabel}>Take-away</Text>
            <Text style={styles.takeAwayAmount}>{calculateTakeAwayAmount(duration)}</Text>
          </View>
        )}

        {/* Address and Date - at the bottom */}
        {renderAddressDateFooter(isAcceptedView)}
      </View>
    );
  };

  // NDIS Cleaning (One-Time / Main Booking)
  const renderNDISCleaningOneTimeContent = (isAcceptedView: boolean = false) => {
    const hourlyRate = getHourlyRate(serviceType);
    const details = serviceDetails as NDISCleaningDetails | null;
    const duration = details?.duration || job.duration || '';

    return (
      <View style={styles.detailsContainer} pointerEvents="none">
        {/* Hourly Rate */}
        <View style={styles.serviceDetailRow}>
          <Text style={styles.serviceDetailLabel}>Hourly Rate</Text>
          <Text style={styles.serviceDetailValue}>{hourlyRate ? `$${hourlyRate}/hr` : 'N/A'}</Text>
        </View>

        {/* Duration only - no frequency */}
        <View style={styles.serviceDetailRow}>
          <Text style={styles.serviceDetailLabel}>Duration</Text>
          <Text style={styles.serviceDetailValue}>{duration}</Text>
        </View>

        {/* Customer Notes - from customers table */}
        {renderCustomerNotes()}

        {/* Take-away Amount - Only in accepted view */}
        {isAcceptedView && (
          <View style={styles.takeAwayRow}>
            <Ionicons name="wallet-outline" size={16} color="#059669" />
            <Text style={styles.takeAwayLabel}>Take-away</Text>
            <Text style={styles.takeAwayAmount}>{calculateTakeAwayAmount(duration)}</Text>
          </View>
        )}

        {/* Address and Date - at the bottom */}
        {renderAddressDateFooter(isAcceptedView)}
      </View>
    );
  };

  // Once-Off Cleaning
  const renderOnceOffCleaningContent = (isAcceptedView: boolean = false) => {
    const hourlyRate = getHourlyRate(serviceType);
    const details = serviceDetails as OnceOffDetails | null;
    const duration = details?.duration || job.duration || '';
    const twoCleaners = details?.two_cleaners || false;
    const specialRequests = details?.special_requests || null;
    const subServiceType = getOnceOffSubService();

    return (
      <View style={styles.detailsContainer} pointerEvents="none">
        {/* Sub-Service Type */}
        <View style={styles.serviceDetailRow}>
          <Text style={styles.serviceDetailLabel}>Service Type</Text>
          <Text style={styles.serviceDetailValue}>{subServiceType}</Text>
        </View>

        {/* Hourly Rate */}
        <View style={styles.serviceDetailRow}>
          <Text style={styles.serviceDetailLabel}>Hourly Rate</Text>
          <Text style={styles.serviceDetailValue}>{hourlyRate ? `$${hourlyRate}/hr` : 'N/A'}</Text>
        </View>

        {/* Duration only - no frequency */}
        <View style={styles.serviceDetailRow}>
          <Text style={styles.serviceDetailLabel}>Duration</Text>
          <Text style={styles.serviceDetailValue}>{duration}</Text>
        </View>

        {/* Two Cleaners */}
        {twoCleaners && (
          <View style={styles.serviceDetailRow}>
            <Text style={styles.serviceDetailLabel}>Cleaners</Text>
            <View style={styles.tagContainer}>
              <Ionicons name="people" size={14} color="#3B82F6" />
              <Text style={styles.tagText}>2 Cleaners Required</Text>
            </View>
          </View>
        )}

        {/* Special Requests */}
        {specialRequests && isAcceptedView && (
          <View style={styles.specialRequestsContainer}>
            <Text style={styles.specialRequestsLabel}>Special Requests</Text>
            <Text style={styles.specialRequestsText}>{specialRequests}</Text>
          </View>
        )}

        {/* Customer Notes - from customers table */}
        {renderCustomerNotes()}

        {/* Take-away Amount - Only in accepted view */}
        {isAcceptedView && (
          <View style={styles.takeAwayRow}>
            <Ionicons name="wallet-outline" size={16} color="#059669" />
            <Text style={styles.takeAwayLabel}>Take-away</Text>
            <Text style={styles.takeAwayAmount}>{calculateTakeAwayAmount(duration)}</Text>
          </View>
        )}

        {/* Address and Date - at the bottom */}
        {renderAddressDateFooter(isAcceptedView)}
      </View>
    );
  };

  // Airbnb Cleaning
  const renderAirbnbCleaningContent = (isAcceptedView: boolean = false) => {
    const hourlyRate = getHourlyRate(serviceType);
    const details = serviceDetails as AirbnbDetails | null;
    const duration = details?.duration || job.duration || '';
    const linenChange = details?.linen_change || false;
    const restockAmenities = details?.restock_amenities || false;
    const specialRequests = details?.special_requests || null;

    return (
      <View style={styles.detailsContainer} pointerEvents="none">
        {/* Hourly Rate */}
        <View style={styles.serviceDetailRow}>
          <Text style={styles.serviceDetailLabel}>Hourly Rate</Text>
          <Text style={styles.serviceDetailValue}>{hourlyRate ? `$${hourlyRate}/hr` : 'N/A'}</Text>
        </View>

        {/* Duration only - no frequency */}
        <View style={styles.serviceDetailRow}>
          <Text style={styles.serviceDetailLabel}>Duration</Text>
          <Text style={styles.serviceDetailValue}>{duration}</Text>
        </View>

        {/* Linen Change */}
        <View style={styles.serviceDetailRow}>
          <Text style={styles.serviceDetailLabel}>Linen Change</Text>
          <View style={[styles.statusTag, linenChange ? styles.statusTagYes : styles.statusTagNo]}>
            <Ionicons name={linenChange ? 'checkmark-circle' : 'close-circle'} size={14} color={linenChange ? '#10B981' : '#EF4444'} />
            <Text style={[styles.statusTagText, { color: linenChange ? '#10B981' : '#EF4444' }]}>
              {linenChange ? 'Yes' : 'No'}
            </Text>
          </View>
        </View>

        {/* Restock Amenities */}
        <View style={styles.serviceDetailRow}>
          <Text style={styles.serviceDetailLabel}>Restock Amenities</Text>
          <View style={[styles.statusTag, restockAmenities ? styles.statusTagYes : styles.statusTagNo]}>
            <Ionicons name={restockAmenities ? 'checkmark-circle' : 'close-circle'} size={14} color={restockAmenities ? '#10B981' : '#EF4444'} />
            <Text style={[styles.statusTagText, { color: restockAmenities ? '#10B981' : '#EF4444' }]}>
              {restockAmenities ? 'Yes' : 'No'}
            </Text>
          </View>
        </View>

        {/* Special Requests */}
        {specialRequests && isAcceptedView && (
          <View style={styles.specialRequestsContainer}>
            <Text style={styles.specialRequestsLabel}>Special Requests</Text>
            <Text style={styles.specialRequestsText}>{specialRequests}</Text>
          </View>
        )}

        {/* Customer Notes - from customers table */}
        {renderCustomerNotes()}

        {/* Take-away Amount - Only in accepted view */}
        {isAcceptedView && (
          <View style={styles.takeAwayRow}>
            <Ionicons name="wallet-outline" size={16} color="#059669" />
            <Text style={styles.takeAwayLabel}>Take-away</Text>
            <Text style={styles.takeAwayAmount}>{calculateTakeAwayAmount(duration)}</Text>
          </View>
        )}

        {/* Address and Date - at the bottom */}
        {renderAddressDateFooter(isAcceptedView)}
      </View>
    );
  };

  // End of Lease Cleaning
  const renderEndOfLeaseContent = (isAcceptedView: boolean = false) => {
    const details = serviceDetails as EndOfLeaseDetails | null;
    const staffAmount = calculateEndOfLeaseStaffAmount(job.pricing);
    const estimatedHours = calculateEndOfLeaseHours(staffAmount);

    return (
      <View style={styles.detailsContainer} pointerEvents="none">

        {/* Take-away Amount & Duration */}
        <View style={styles.serviceDetailRow}>
          <Text style={styles.serviceDetailLabel}>Take-away Amount</Text>
          <Text style={[styles.serviceDetailValue, styles.takeAwayValue]}>
            {staffAmount > 0 ? `$${staffAmount}` : 'N/A'}
          </Text>
        </View>
        <View style={styles.serviceDetailRow}>
          <Text style={styles.serviceDetailLabel}>Expected Duration</Text>
          <Text style={styles.serviceDetailValue}>{estimatedHours} <Text style={styles.estimatedText}>estimated</Text></Text>
        </View>

        {/* Property Details - Only show when we have details */}
        {details && (
          <>
            {/* Home Size */}
            <View style={styles.eolSectionHeader}>
              <Ionicons name="home-outline" size={16} color="#6B7280" />
              <Text style={styles.eolSectionTitle}>Property Details</Text>
            </View>

            <View style={styles.serviceDetailRow}>
              <Text style={styles.serviceDetailLabel}>Home Size</Text>
              <Text style={styles.serviceDetailValue}>{details.home_size}</Text>
            </View>

            {/* Bathrooms & Toilets */}
            <View style={styles.serviceDetailRow}>
              <Text style={styles.serviceDetailLabel}>Bathrooms</Text>
              <Text style={styles.serviceDetailValue}>
                {details.base_bathrooms} base + {details.extra_bathrooms} extra
              </Text>
            </View>
            <View style={styles.serviceDetailRow}>
              <Text style={styles.serviceDetailLabel}>Toilets</Text>
              <Text style={styles.serviceDetailValue}>
                {details.base_toilets} base + {details.extra_toilets} extra
              </Text>
            </View>

            {/* Property Features */}
            <View style={styles.eolSectionHeader}>
              <Ionicons name="list-outline" size={16} color="#6B7280" />
              <Text style={styles.eolSectionTitle}>Property Features</Text>
            </View>

            <View style={styles.eolFeaturesGrid}>
              <View style={styles.eolFeatureItem}>
                <Ionicons 
                  name={details.furnished ? 'checkmark-circle' : 'close-circle'} 
                  size={16} 
                  color={details.furnished ? '#10B981' : '#9CA3AF'} 
                />
                <Text style={[styles.eolFeatureText, !details.furnished && styles.eolFeatureInactive]}>
                  Furnished
                </Text>
              </View>
              <View style={styles.eolFeatureItem}>
                <Ionicons 
                  name={details.study_room ? 'checkmark-circle' : 'close-circle'} 
                  size={16} 
                  color={details.study_room ? '#10B981' : '#9CA3AF'} 
                />
                <Text style={[styles.eolFeatureText, !details.study_room && styles.eolFeatureInactive]}>
                  Study Room
                </Text>
              </View>
              <View style={styles.eolFeatureItem}>
                <Ionicons 
                  name={details.pets ? 'checkmark-circle' : 'close-circle'} 
                  size={16} 
                  color={details.pets ? '#10B981' : '#9CA3AF'} 
                />
                <Text style={[styles.eolFeatureText, !details.pets && styles.eolFeatureInactive]}>
                  Pets
                </Text>
              </View>
              <View style={styles.eolFeatureItem}>
                <Ionicons 
                  name={details.balcony ? 'checkmark-circle' : 'close-circle'} 
                  size={16} 
                  color={details.balcony ? '#10B981' : '#9CA3AF'} 
                />
                <Text style={[styles.eolFeatureText, !details.balcony && styles.eolFeatureInactive]}>
                  Balcony
                </Text>
              </View>
              <View style={styles.eolFeatureItem}>
                <Ionicons 
                  name={details.garage ? 'checkmark-circle' : 'close-circle'} 
                  size={16} 
                  color={details.garage ? '#10B981' : '#9CA3AF'} 
                />
                <Text style={[styles.eolFeatureText, !details.garage && styles.eolFeatureInactive]}>
                  Garage
                </Text>
              </View>
            </View>

            {/* Steam Carpet Cleaning */}
            {details.steam_carpet && (
              <>
                <View style={styles.eolSectionHeader}>
                  <Ionicons name="water-outline" size={16} color="#6B7280" />
                  <Text style={styles.eolSectionTitle}>Steam Carpet Cleaning</Text>
                </View>

                <View style={styles.eolSteamGrid}>
                  {details.steam_bedrooms > 0 && (
                    <View style={styles.eolSteamItem}>
                      <Text style={styles.eolSteamValue}>{details.steam_bedrooms}</Text>
                      <Text style={styles.eolSteamLabel}>Bedrooms</Text>
                    </View>
                  )}
                  {details.steam_living_rooms > 0 && (
                    <View style={styles.eolSteamItem}>
                      <Text style={styles.eolSteamValue}>{details.steam_living_rooms}</Text>
                      <Text style={styles.eolSteamLabel}>Living Rooms</Text>
                    </View>
                  )}
                  {details.steam_hallway && (
                    <View style={styles.eolSteamItem}>
                      <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                      <Text style={styles.eolSteamLabel}>Hallway</Text>
                    </View>
                  )}
                  {details.steam_stairs && (
                    <View style={styles.eolSteamItem}>
                      <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                      <Text style={styles.eolSteamLabel}>Stairs</Text>
                    </View>
                  )}
                </View>
              </>
            )}

            {/* Special Requests */}
            {details.special_requests && isAcceptedView && (
              <View style={styles.specialRequestsContainer}>
                <Text style={styles.specialRequestsLabel}>Special Requests</Text>
                <Text style={styles.specialRequestsText}>{details.special_requests}</Text>
              </View>
            )}
          </>
        )}

        {/* Loading indicator while fetching details */}
        {loadingDetails && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#6B7280" />
            <Text style={styles.loadingText}>Loading property details...</Text>
          </View>
        )}

        {/* Customer Notes - from customers table */}
        {renderCustomerNotes()}

        {/* Address and Date - at the bottom */}
        {renderAddressDateFooter(isAcceptedView)}
      </View>
    );
  };

  // ============================================================================
  // MAIN SERVICE CONTENT ROUTER
  // ============================================================================

  const renderServiceContent = (isAcceptedView: boolean = false) => {
    switch (serviceType) {
      case 'Regular Cleaning':
        return renderRegularCleaningContent(isAcceptedView);
      
      case 'NDIS Cleaning':
        // Check if recurring (instance) or one-time (main booking)
        if (isInstance || job.is_recurring) {
          return renderNDISCleaningRecurringContent(isAcceptedView);
        }
        return renderNDISCleaningOneTimeContent(isAcceptedView);
      
      case 'Once-Off Cleaning':
        return renderOnceOffCleaningContent(isAcceptedView);
      
      case 'Airbnb Cleaning':
        return renderAirbnbCleaningContent(isAcceptedView);
      
      case 'End of Lease Cleaning':
        return renderEndOfLeaseContent(isAcceptedView);
      
      default:
        // Fallback for unknown service types
        return (
          <View style={styles.detailsContainer} pointerEvents="none">
            {renderAddressDateFooter(isAcceptedView)}
          </View>
        );
    }
  };

  // ============================================================================
  // RENDER ASSIGNED VIEW (Limited data - like JobDetailsPanel)
  // ============================================================================

  const renderAssignedView = () => (
    <ScrollView 
      showsVerticalScrollIndicator={true}
      contentContainerStyle={styles.modalScrollContent}
      bounces={true}
      keyboardShouldPersistTaps="handled"
    >
      {/* Title - Customer Name */}
      <Text style={styles.modalTitle}>{customerName}</Text>

      {/* Service Type Tag Row */}
      <View style={styles.serviceBadgeRow} pointerEvents="none">
        <View style={styles.serviceTagsLeft}>
          <View style={[styles.serviceBadge, { backgroundColor: serviceColor }]}>
            <Text style={styles.serviceBadgeText}>{serviceType}</Text>
          </View>
          {onceOffTag ? (
            <View style={styles.subServiceTag}>
              <Text style={styles.subServiceTagText}>{onceOffTag}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Service-Specific Content */}
      {renderServiceContent(false)}

      {/* Booking Details */}
      <View style={styles.bookingDetails} pointerEvents="none">
        <View style={styles.bookingDetailRow}>
          <Text style={styles.bookingDetailLabel}>Booking ID</Text>
          <Text style={styles.bookingDetailValue}>
            #{isInstance ? job.recurring_instance!.instance_booking_number : job.booking_number}
          </Text>
        </View>
        {isInstance && (
          <View style={styles.bookingDetailRow}>
            <Text style={styles.bookingDetailLabel}>Week</Text>
            <Text style={styles.bookingDetailValue}>{job.recurring_instance!.instance_number}</Text>
          </View>
        )}
        <View style={styles.bookingDetailRow}>
          <Text style={styles.bookingDetailLabel}>Status</Text>
          <Text style={[
            styles.statusText,
            { color: job.status === 'confirmed' ? '#10B981' : '#F59E0B' }
          ]}>
            {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
          </Text>
        </View>
      </View>

      {/* Important Notice */}
      <View style={styles.modalNotice}>
        <Ionicons name="information-circle" size={18} color="#6B7280" />
        <Text style={styles.modalNoticeText}>
          Please choose jobs carefully, ensuring they fit your schedule and travel distance. 
          Accepting and cancelling multiple jobs could lead to your access being blocked.
        </Text>
      </View>

      {/* Accept Job Button */}
      <AcceptJobButton
        jobId={job.id}
        bookingId={job.booking_id}
        bookingNumber={isInstance ? job.recurring_instance!.instance_booking_number : job.booking_number}
        selectedService={serviceType}
        currentStatus={effectiveJobStatus}
        userId={userId || ''}
        userFirstName={userFirstName}
        isInstance={isInstance}
        instanceId={isInstance ? job.recurring_instance!.id : undefined}
        instanceNumber={isInstance ? job.recurring_instance!.instance_number : undefined}
        onAccepted={handleAccepted}
      />
    </ScrollView>
  );

  // ============================================================================
  // RENDER ACCEPTED VIEW (Full data + Action buttons)
  // ============================================================================

  const renderAcceptedView = () => {
    // Use revealed data if just accepted, otherwise use job data
    const displayPhone = justAccepted && revealedCustomerData?.phone 
      ? revealedCustomerData.phone 
      : job.customer?.phone;

    return (
      <ScrollView 
        showsVerticalScrollIndicator={true}
        contentContainerStyle={styles.modalScrollContent}
        bounces={true}
        keyboardShouldPersistTaps="handled"
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {/* Title - Customer Name */}
        <Text style={styles.modalTitle}>{customerName}</Text>

        {/* Service Type Tag Row with Quick Action Icons on the right */}
        <View style={styles.serviceBadgeRow} pointerEvents="box-none">
          {/* Left side - Service tags */}
          <View style={styles.serviceTagsLeft} pointerEvents="none">
            <View style={[styles.serviceBadge, { backgroundColor: serviceColor }]}>
              <Text style={styles.serviceBadgeText}>{serviceType}</Text>
            </View>
            {onceOffTag ? (
              <View style={styles.subServiceTag}>
                <Text style={styles.subServiceTagText}>{onceOffTag}</Text>
              </View>
            ) : null}
            {/* One-Time Indicator - only show for non-recurring jobs */}
            {!job.is_recurring && (
              <View style={[styles.recurringTag, { backgroundColor: '#F3F4F6' }]}>
                <Ionicons name="calendar-outline" size={12} color="#6B7280" />
                <Text style={[styles.recurringTagText, { color: '#6B7280' }]}>
                  One-Time
                </Text>
              </View>
            )}
          </View>

          {/* Right side - Quick action icons (these need to be touchable) */}
          <View style={styles.contactButtonsRow}>
            {displayPhone && (
              <>
                <TouchableOpacity
                  style={styles.callButton}
                  onPress={() => handleCallCustomer(displayPhone)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="call" size={16} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.messageButton}
                  onPress={() => handleMessageCustomer(displayPhone)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="chatbubble" size={16} color="#fff" />
                </TouchableOpacity>
              </>
            )}
            {job.customer?.address && (
              <TouchableOpacity
                style={styles.locationButton}
                onPress={() => handleOpenMaps(job.customer!.address!)}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="location" size={16} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Service-Specific Content - with clickable location */}
        {renderServiceContent(true)}

        {/* Inline Job Notes */}
        {userId && (
          <InlineJobNotes
            bookingId={job.booking_id}
            bookingAppStatusId={job.id}
            userId={userId}
            serviceType={serviceType}
            onSave={() => {}}
          />
        )}

        {/* Booking Details - moved under Job Notes */}
        <View style={styles.bookingDetails} pointerEvents="none">
          <View style={styles.bookingDetailRow}>
            <Text style={styles.bookingDetailLabel}>Booking ID</Text>
            <Text style={styles.bookingDetailValue}>
              #{isInstance ? job.recurring_instance!.instance_booking_number : job.booking_number}
            </Text>
          </View>
          {isInstance && (
            <View style={styles.bookingDetailRow}>
              <Text style={styles.bookingDetailLabel}>Week</Text>
              <Text style={styles.bookingDetailValue}>{job.recurring_instance!.instance_number}</Text>
            </View>
          )}
          {/* Job Status and Booking Status - only for non-recurring jobs */}
          {!job.is_recurring && (
            <>
              <View style={styles.bookingDetailRow}>
                <Text style={styles.bookingDetailLabel}>Job Status</Text>
                <Text style={[
                  styles.statusText,
                  { color: getJobStatusColor(justAccepted ? 'accepted' : effectiveJobStatus) }
                ]}>
                  {getJobStatusLabel(justAccepted ? 'accepted' : effectiveJobStatus)}
                </Text>
              </View>
              <View style={styles.bookingDetailRow}>
                <Text style={styles.bookingDetailLabel}>Booking Status</Text>
                <Text style={[
                  styles.statusText,
                  { color: job.status === 'confirmed' ? '#10B981' : '#F59E0B' }
                ]}>
                  {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                </Text>
              </View>
            </>
          )}
        </View>

        {/* Job Action Buttons */}
        <JobActionButtons
          jobId={job.id}
          currentStatus={justAccepted ? 'accepted' : effectiveJobStatus}
          customerPhone={displayPhone}
          workerFirstName={userFirstName}
          isRecurring={isInstance}
          instanceId={isInstance ? job.recurring_instance!.id : undefined}
          onStatusUpdate={(newStatus) => {
            // Close panel to refresh, then notify parent
            onClose();
            onStatusUpdate?.(job.id, newStatus);
          }}
        />

        <CancelBookingButton
          jobId={job.id}
          currentStatus={justAccepted ? 'accepted' : effectiveJobStatus}
          isRecurring={isInstance}
          instanceId={isInstance ? job.recurring_instance!.id : undefined}
          onCancelled={() => {
            onClose();
            onJobCancelled?.();
          }}
          isRevealed={cancelButtonRevealed}
        />

        {/* Bottom spacer to ensure content is scrollable past the cancel button */}
        <View style={styles.bottomSpacer} />
      </ScrollView>
    );
  };

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        {/* Backdrop - tap to close */}
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        
        {/* Modal Content */}
        <View style={styles.modalContent}>
          <TouchableOpacity style={styles.modalCloseButton} onPress={onClose}>
            <Ionicons name="close" size={24} color="#6B7280" />
          </TouchableOpacity>

          {/* Conditional Render based on status */}
          {isAssigned ? renderAssignedView() : renderAcceptedView()}
        </View>
      </View>
    </Modal>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingHorizontal: 20,
    maxHeight: '92%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },
  modalScrollContent: {
    paddingBottom: 40,
  },
  modalCloseButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  serviceBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  serviceTagsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    flex: 1,
  },
  serviceBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  serviceBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  subServiceTag: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
  },
  subServiceTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3B82F6',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  recurringTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
  },
  recurringTagText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  contactButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  callButton: {
    backgroundColor: '#10B981',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageButton: {
    backgroundColor: '#3B82F6',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  locationButton: {
    backgroundColor: '#F59E0B',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailsContainer: {
    marginBottom: 20,
    gap: 4,
  },
  addressDateContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  locationText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
    marginBottom: 8,
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  daysLeftText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  rateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  detailText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#111827',
  },
  estimatedText: {
    fontSize: 15,
    color: '#9CA3AF',
    fontWeight: '400',
    fontStyle: 'italic',
  },
  takeAwayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
  },
  takeAwayLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  takeAwayAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginLeft: 'auto',
  },
  // Customer Notes (from customers table)
  customerNotesContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  customerNotesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  customerNotesTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#92400E',
  },
  customerNotesText: {
    fontSize: 13,
    color: '#78350F',
    lineHeight: 18,
  },
  bookingDetails: {
    paddingTop: 8,
    marginBottom: 16,
    gap: 8,
  },
  bookingDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bookingDetailLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  bookingDetailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  modalNotice: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    padding: 12,
    borderRadius: 8,
    gap: 10,
    marginBottom: 16,
  },
  modalNoticeText: {
    flex: 1,
    fontSize: 11,
    color: '#6B7280',
    lineHeight: 16,
  },
  // Service-specific styles
  serviceSeparator: {
    height: 0,
    marginVertical: 4,
  },
  serviceDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  serviceDetailLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  serviceDetailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  takeAwayValue: {
    color: '#059669',
    fontWeight: '700',
  },
  tagContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3B82F6',
  },
  statusTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusTagYes: {
    backgroundColor: '#ECFDF5',
  },
  statusTagNo: {
    backgroundColor: '#FEF2F2',
  },
  statusTagText: {
    fontSize: 12,
    fontWeight: '600',
  },
  specialRequestsContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
  },
  specialRequestsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400E',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  specialRequestsText: {
    fontSize: 13,
    color: '#78350F',
    lineHeight: 18,
  },
  // End of Lease specific styles
  eolSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  eolSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  eolFeaturesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  eolFeatureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    minWidth: '45%',
  },
  eolFeatureText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#111827',
  },
  eolFeatureInactive: {
    color: '#9CA3AF',
  },
  eolSteamGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 8,
  },
  eolSteamItem: {
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 80,
  },
  eolSteamValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#3B82F6',
  },
  eolSteamLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 2,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  loadingText: {
    fontSize: 13,
    color: '#6B7280',
  },
  bottomSpacer: {
    height: 20,
  },
});
