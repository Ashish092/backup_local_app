import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase, bookingSupabase } from '@/lib/supabase';
import { requestJob } from '@/lib/bidActions';
import {
  getServiceColor,
  getHourlyRate,
  calculateEndOfLeaseStaffAmount,
  calculateEndOfLeaseHours,
  getOnceOffTag,
  formatDateShort,
  getDaysLeftText,
} from '@/lib/jobUtils';

// ============================================================================
// TYPES
// ============================================================================

export interface JobData {
  id: string;
  booking_number: string;
  selected_service: string;
  status: string;
  pricing?: any;
  duration?: string;
  frequency?: string;
  is_recurring: boolean;
  service_type?: string;
  instance_ids?: string[]; // NEW: Instance IDs for recurring jobs
  customer: {
    first_name: string;
    last_name: string;
    suburb: string;
    postcode: string;
    schedule_date?: string;
    address?: string;
  } | null;
}

interface JobDetailsPanelProps {
  job: JobData | null;
  visible: boolean;
  onClose: () => void;
  userId?: string;
  onRequestSuccess?: () => void;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function JobDetailsPanel({
  job,
  visible,
  onClose,
  userId,
  onRequestSuccess,
}: JobDetailsPanelProps) {
  const [isRequested, setIsRequested] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [checkingBid, setCheckingBid] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

  // Check if user has already bid on this job when modal opens
  useEffect(() => {
    if (visible && job && userId) {
      checkExistingBid();
      setShowSuccessMessage(false); // Reset success message when modal opens
    }
  }, [visible, job?.id, userId]);

  const checkExistingBid = async () => {
    if (!job || !userId) return;
    
    setCheckingBid(true);
    try {
      // Check bids table for existing bid by this user
      const { data: existingBid } = await supabase
        .from('bids')
        .select('id, status')
        .eq('booking_id', job.id)
        .eq('user_id', userId)
        .in('status', ['pending', 'approved'])
        .maybeSingle();

      setIsRequested(!!existingBid);
    } catch (error) {
      console.error('Error checking bid:', error);
    } finally {
      setCheckingBid(false);
    }
  };

  const handleRequestJob = async () => {
    if (!job || !userId) {
      Alert.alert('Error', 'Please login to request jobs');
      return;
    }

    setIsLoading(true);
    try {
      // Use shared bidActions function
      // Pass instance_ids for recurring jobs
      const result = await requestJob(job.id, userId, job.is_recurring, job.instance_ids);

      if (!result.success) {
        throw new Error(result.error || 'Failed to request job');
      }

      // Show success message
      setShowSuccessMessage(true);
      setIsRequested(true);
      onRequestSuccess?.();
    } catch (error) {
      console.error('Error requesting job:', error);
      Alert.alert('Error', 'Failed to submit request. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseSuccessMessage = () => {
    setShowSuccessMessage(false);
    onClose();
  };

  if (!job) return null;

  const serviceType = job.selected_service;
  const serviceColor = getServiceColor(serviceType);
  const customerName = job.customer 
    ? `${job.customer.first_name} ${job.customer.last_name}` 
    : 'Customer';
  const location = job.customer?.suburb 
    ? `${job.customer.suburb}, ${job.customer.postcode}` 
    : 'N/A';

  // ============================================================================
  // SERVICE-SPECIFIC CONTENT RENDERER
  // ============================================================================

  // Get Once-Off sub-service tag
  const onceOffTag = serviceType === 'Once-Off Cleaning' ? getOnceOffTag(job.pricing) : '';

  const renderServiceContent = () => {
    const hourlyRate = getHourlyRate(serviceType);
    const isEndOfLease = serviceType === 'End of Lease Cleaning';
    const isOnceOff = serviceType === 'Once-Off Cleaning';
    
    // End of Lease specific calculations
    const staffAmount = isEndOfLease ? calculateEndOfLeaseStaffAmount(job.pricing) : 0;
    const estimatedHours = isEndOfLease ? calculateEndOfLeaseHours(staffAmount) : '';

    return (
      <View style={styles.detailsContainer}>
        {/* Location - Just Suburb, Postcode */}
        <Text style={styles.locationText}>{location}</Text>

        {/* Date Row - Day, Date Month | Days Left */}
        {job.customer?.schedule_date && (
          <View style={styles.dateRow}>
            <Text style={styles.dateText}>{formatDateShort(job.customer.schedule_date || '')}</Text>
            <Text style={styles.daysLeftText}>{getDaysLeftText(job.customer.schedule_date)}</Text>
          </View>
        )}

        {/* Rate & Duration Row */}
        {isEndOfLease ? (
          // End of Lease - Staff Amount & Estimated Hours
          <View style={styles.rateRow}>
            <Text style={styles.detailText}>${staffAmount > 0 ? staffAmount : 'N/A'}</Text>
            <Text style={styles.detailText}>{estimatedHours} • <Text style={styles.estimatedText}>estimated</Text></Text>
          </View>
        ) : (
          // All other services - Hourly Rate & Duration & Frequency
          <View style={styles.rateRow}>
            <Text style={styles.detailText}>{hourlyRate ? `$${hourlyRate}/hr` : 'N/A'}</Text>
            <Text style={styles.detailText}>
              {job.duration || ''}
              {job.frequency && !isOnceOff && serviceType !== 'Airbnb Cleaning' ? ` • ${job.frequency}` : ''}
            </Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
          <TouchableOpacity style={styles.modalCloseButton} onPress={onClose}>
            <Ionicons name="close" size={24} color="#6B7280" />
          </TouchableOpacity>

          {showSuccessMessage ? (
            // Success Message View
            <ScrollView 
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.successContainer}
              bounces={true}
            >
              <View style={styles.successIconContainer}>
                <Ionicons name="checkmark-circle" size={64} color="#0066cc" />
              </View>
              
              <Text style={styles.successTitle}>Job Requested</Text>
              
              <Text style={styles.successSubtitle}>What's Next?</Text>
              
              <Text style={styles.successMessage}>
                Our team will review your request. If selected, you'll receive a notification with further details. Keep an eye on your notifications!
              </Text>
              
              <TouchableOpacity
                style={styles.successOkButton}
                onPress={handleCloseSuccessMessage}
              >
                <Text style={styles.successOkButtonText}>OK</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : (
            // Normal Job Details View
            <ScrollView 
              showsVerticalScrollIndicator={true}
              contentContainerStyle={styles.modalScrollContent}
              bounces={true}
            >
              {/* Title - Claim Job (smaller, bold) */}
              <Text style={styles.modalTitle}>Claim Job</Text>

              {/* Service Type Tag Row - with Once-Off sub-tag next to it if applicable */}
              <View style={styles.serviceBadgeRow}>
                <View style={[styles.serviceBadge, { backgroundColor: serviceColor }]}>
                  <Text style={styles.serviceBadgeText}>{serviceType}</Text>
                </View>
                {onceOffTag ? (
                  <View style={styles.subServiceTag}>
                    <Text style={styles.subServiceTagText}>{onceOffTag}</Text>
                  </View>
                ) : null}
              </View>

              {/* Customer Name - Smaller, consistent */}
              <Text style={styles.customerName}>{customerName}</Text>

              {/* Service-Specific Content */}
              {renderServiceContent()}

              {/* Booking Details */}
              <View style={styles.bookingDetails}>
                <View style={styles.bookingDetailRow}>
                  <Text style={styles.bookingDetailLabel}>Booking ID</Text>
                  <Text style={styles.bookingDetailValue}>#{job.booking_number}</Text>
                </View>
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

              {/* Request Button */}
              {checkingBid ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator color="#0066cc" size="small" />
                </View>
              ) : !isRequested ? (
                <TouchableOpacity
                  style={[styles.modalRequestButton, isLoading && styles.modalRequestButtonLoading]}
                  onPress={handleRequestJob}
                  disabled={isLoading || !userId}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.modalRequestButtonText}>Request Job</Text>
                  )}
                </TouchableOpacity>
              ) : (
                <View style={styles.modalRequestedBadge}>
                  <Ionicons name="checkmark-circle" size={20} color="#0066cc" />
                  <Text style={styles.modalRequestedText}>Requested</Text>
                </View>
              )}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingHorizontal: 20,
    maxHeight: '85%',
    minHeight: 300,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },
  modalScrollContent: {
    paddingBottom: 40,
    flexGrow: 1,
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
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  serviceBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
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
  customerName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  detailsContainer: {
    marginBottom: 20,
    gap: 8,
  },
  locationText: {
    fontSize: 15,
    color: '#6B7280',
    fontWeight: '500',
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateText: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '500',
  },
  daysLeftText: {
    fontSize: 15,
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
  bookingDetails: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 16,
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
  loadingContainer: {
    padding: 16,
    alignItems: 'center',
  },
  modalRequestButton: {
    backgroundColor: '#0066cc',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalRequestButtonLoading: {
    opacity: 0.6,
  },
  modalRequestButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  modalRequestedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#EBF5FF',
    padding: 14,
    borderRadius: 10,
  },
  modalRequestedText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0066cc',
  },
  // Success Message Styles
  successContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 40,
    paddingBottom: 60,
    paddingHorizontal: 20,
  },
  successIconContainer: {
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 12,
    textAlign: 'center',
  },
  successMessage: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 30,
  },
  successOkButton: {
    backgroundColor: '#0066cc',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successOkButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
