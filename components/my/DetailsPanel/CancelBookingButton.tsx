import React, { useState, useRef, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Modal, 
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Animated,
  PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase, bookingSupabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

interface CancelBookingButtonProps {
  jobId: string; // booking_status_on_app id
  currentStatus: string;
  isRecurring?: boolean; // true if this is an instance (from recurring_booking_status)
  instanceId?: string; // recurring_booking_status id (if instance)
  onCancelled: () => void;
  isRevealed?: boolean; // Whether the button should be visible (controlled by parent scroll)
}

export default function CancelBookingButton({ 
  jobId, 
  currentStatus, 
  isRecurring = false,
  instanceId,
  onCancelled,
  isRevealed = false,
}: CancelBookingButtonProps) {
  const { userProfile } = useAuth();
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedReason, setSelectedReason] = useState<'cleaner' | 'customer' | null>(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  
  // Animation for reveal
  const revealAnim = useRef(new Animated.Value(0)).current;
  
  useEffect(() => {
    Animated.timing(revealAnim, {
      toValue: isRevealed ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [isRevealed]);

  // Only show cancel button for accepted, on_the_way, or started statuses
  if (!['accepted', 'on_the_way', 'started'].includes(currentStatus)) {
    return null;
  }

  const handleOpenModal = () => {
    setModalVisible(true);
    setSelectedReason(null);
    setNote('');
  };

  const handleCloseModal = () => {
    Keyboard.dismiss();
    setModalVisible(false);
    setSelectedReason(null);
    setNote('');
  };

  const handleInputFocus = () => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  // Handle cancellation confirmation
  const handleConfirmCancel = async () => {
    // Validation
    if (!selectedReason) {
      Alert.alert('Error', 'Please select a cancellation reason');
      return;
    }
    if (!note.trim()) {
      Alert.alert('Error', 'Please provide a cancellation note');
      return;
    }

    setLoading(true);
    const now = new Date().toISOString();
    const cancelStatus = selectedReason === 'cleaner' ? 'cancelled_by_cleaner' : 'cancelled_by_customer';

    try {
      // First fetch booking details (needed for job_notes and notifications)
      const { data: statusData } = await bookingSupabase
        .from('booking_status_on_app')
        .select('booking_id')
        .eq('id', jobId)
        .single();

      if (!statusData?.booking_id) {
        throw new Error('Could not find booking details');
      }

      const { data: bookingData } = await bookingSupabase
        .from('bookings')
        .select('booking_number, selected_service')
        .eq('id', statusData.booking_id)
        .single();

      // ========================================
      // UPDATE JOB STATUS
      // ========================================
      
      // Always update the parent booking_status_on_app
      const { error: parentError } = await bookingSupabase
        .from('booking_status_on_app')
        .update({
          job_status: cancelStatus,
          assigned_to: null,
          assigned_at: null,
          updated_at: now,
        })
        .eq('id', jobId);

      if (parentError) {
        console.error('Error cancelling booking_status_on_app:', parentError);
        throw parentError;
      }

      // If this is a recurring instance, also update this instance and all future instances
      if (isRecurring && instanceId) {
        // Get the current instance date
        const { data: currentInstance, error: fetchError } = await bookingSupabase
          .from('recurring_booking_status')
          .select('instance_date')
          .eq('id', instanceId)
          .single();

        if (fetchError) {
          console.error('Error fetching instance:', fetchError);
          throw fetchError;
        }

        const instanceDate = currentInstance?.instance_date || new Date().toISOString().split('T')[0];

        // Update this instance and all future instances
        const { error: instancesError } = await bookingSupabase
          .from('recurring_booking_status')
          .update({
            job_status: cancelStatus,
            assigned_to: null,
            assigned_at: null,
            updated_at: now,
          })
          .eq('booking_status_on_app_id', jobId)
          .gte('instance_date', instanceDate);

        if (instancesError) {
          console.error('Error cancelling recurring instances:', instancesError);
          throw instancesError;
        }
      }

      // ========================================
      // SAVE CANCELLATION NOTE TO JOB_NOTES
      // ========================================
      
      if (userProfile?.id) {
        // Check if job_notes record exists
        const { data: existingNotes, error: notesCheckError } = await supabase
          .from('job_notes')
          .select('id')
          .eq('booking_status_on_app_id', jobId)
          .maybeSingle();

        if (notesCheckError && notesCheckError.code !== 'PGRST116') {
          console.error('Error checking job_notes:', notesCheckError);
        }

        const cancellationData = {
          cancellation_reason: selectedReason,
          cancellation_note: note.trim(),
          cancellation_scope: isRecurring ? 'all_following' : 'single',
          cancelled_at: now,
          cancelled_by_user_id: userProfile.id,
          updated_at: now,
        };

        if (existingNotes) {
          // Update existing record
          const { error: updateError } = await supabase
            .from('job_notes')
            .update(cancellationData)
            .eq('id', existingNotes.id);

          if (updateError) {
            console.error('Error updating job_notes with cancellation:', updateError);
          }
        } else {
          // Create new record with cancellation data
          const { error: insertError } = await supabase
            .from('job_notes')
            .insert({
              user_id: userProfile.id,
              booking_id: statusData.booking_id,
              booking_status_on_app_id: jobId,
              service_type: bookingData?.selected_service || 'Unknown',
              ...cancellationData,
              created_at: now,
            });

          if (insertError) {
            console.error('Error inserting job_notes with cancellation:', insertError);
          }
        }
      }

      // ========================================
      // CREATE NOTIFICATIONS
      // ========================================
      
      if (bookingData && userProfile?.id) {
        const service = bookingData.selected_service || 'Service';
        const bookingNumber = bookingData.booking_number || 'N/A';
        const userName = `${userProfile.first_name || ''} ${userProfile.last_name || ''}`.trim() || 'User';
        const reasonText = selectedReason === 'cleaner' ? 'by cleaner' : 'by customer request';
        const recurringText = isRecurring ? ' (recurring - all future instances)' : '';

        // Create notification for user
        await supabase
          .from('notifications')
          .insert({
            user_id: userProfile.id,
            title: 'You Have Been Removed from Booking 🚫',
            body: `You cancelled ${service} (Booking #${bookingNumber})${recurringText}. You are no longer assigned to this job.`,
            notification_type: 'booking_cancelled',
            category: 'job_update',
            priority: 'high',
            booking_id: statusData.booking_id,
            data: {
              booking_number: bookingNumber,
              service: service,
              cancellation_reason: selectedReason,
              cancellation_note: note.trim(),
              is_recurring: isRecurring,
            },
            action_url: '/(tabs)/my',
            action_label: 'View My Jobs',
          });

        // Create activity log for user
        await supabase
          .from('activity_logs')
          .insert({
            user_id: userProfile.id,
            activity_type: 'booking_cancelled',
            title: `You have canceled the ${service} booking${recurringText}`,
            booking_id: statusData.booking_id,
            data: {
              booking_number: bookingNumber,
              service: service,
              cancellation_reason: selectedReason,
              cancellation_note: note.trim(),
              is_recurring: isRecurring,
            },
          });

        // Create notification for admin (global)
        await supabase
          .from('notifications')
          .insert({
            user_id: null,
            title: 'User Cancelled Booking ⚠️',
            body: `${userName} cancelled ${service} (Booking #${bookingNumber})${recurringText} - Reason: ${reasonText}`,
            notification_type: 'user_cancelled_booking',
            category: 'job_update',
            priority: 'high',
            booking_id: statusData.booking_id,
            data: {
              booking_number: bookingNumber,
              service: service,
              user_name: userName,
              user_id: userProfile.id,
              cancellation_reason: selectedReason,
              cancellation_note: note.trim(),
              is_recurring: isRecurring,
            },
            action_url: '/dashboard/jobs',
            action_label: 'View Jobs',
          });
      }

      // ========================================
      // SUCCESS
      // ========================================
      
      handleCloseModal();
      onCancelled();
      
      let successMessage = selectedReason === 'cleaner' 
        ? 'You have cancelled this booking.' 
        : 'This booking has been cancelled on behalf of the customer.';
      
      if (isRecurring) {
        successMessage += ' All future instances have also been cancelled.';
      }

      Alert.alert('Booking Cancelled', successMessage);
    } catch (error) {
      console.error('Error in handleConfirmCancel:', error);
      Alert.alert('Error', 'Failed to cancel booking. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Animated.View
        style={[
          styles.cancelButtonWrapper,
          {
            opacity: revealAnim,
            transform: [{
              translateY: revealAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [20, 0],
              }),
            }],
          },
        ]}
        pointerEvents={isRevealed ? 'auto' : 'none'}
      >
        <TouchableOpacity
          style={styles.cancelIconButton}
          onPress={handleOpenModal}
          activeOpacity={0.7}
        >
          <Ionicons name="close-circle" size={20} color="#6B7280" />
          <Text style={styles.cancelButtonText}>Cancel Booking</Text>
        </TouchableOpacity>
      </Animated.View>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={handleCloseModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardAvoidingView}
        >
          <Pressable style={styles.modalOverlay} onPress={handleCloseModal}>
            <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
              <ScrollView 
                ref={scrollViewRef}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.scrollContent}
              >
                {/* Header */}
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Cancel Booking</Text>
                  <TouchableOpacity onPress={handleCloseModal}>
                    <Ionicons name="close" size={24} color="#6B7280" />
                  </TouchableOpacity>
                </View>

                {/* Warning Notice */}
                <View style={styles.warningNotice}>
                  <Ionicons name="warning" size={20} color="#F59E0B" />
                  <Text style={styles.warningText}>
                    {isRecurring 
                      ? 'This action will cancel this booking and all future instances. Please select a reason and provide details.'
                      : 'This action will cancel the booking. Please select a reason and provide details.'}
                  </Text>
                </View>

                {/* Recurring Info */}
                {isRecurring && (
                  <View style={styles.infoNotice}>
                    <Ionicons name="repeat" size={18} color="#3B82F6" />
                    <Text style={styles.infoText}>
                      This is a recurring job. Cancelling will affect this week and all future scheduled instances.
                    </Text>
                  </View>
                )}

                {/* Reason Selection */}
                <Text style={styles.sectionLabel}>Cancellation Reason</Text>
                
                <TouchableOpacity
                  style={[
                    styles.reasonOption,
                    selectedReason === 'cleaner' && styles.reasonOptionSelected
                  ]}
                  onPress={() => setSelectedReason('cleaner')}
                >
                  <View style={styles.radioButton}>
                    {selectedReason === 'cleaner' && <View style={styles.radioButtonInner} />}
                  </View>
                  <View style={styles.reasonTextContainer}>
                    <Text style={styles.reasonTitle}>Cancelled by Cleaner (Me)</Text>
                    <Text style={styles.reasonSubtext}>I need to cancel this booking</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.reasonOption,
                    selectedReason === 'customer' && styles.reasonOptionSelected
                  ]}
                  onPress={() => setSelectedReason('customer')}
                >
                  <View style={styles.radioButton}>
                    {selectedReason === 'customer' && <View style={styles.radioButtonInner} />}
                  </View>
                  <View style={styles.reasonTextContainer}>
                    <Text style={styles.reasonTitle}>Cancelled by Customer</Text>
                    <Text style={styles.reasonSubtext}>Customer requested cancellation</Text>
                  </View>
                </TouchableOpacity>

                {/* Note Input */}
                <Text style={styles.sectionLabel}>Cancellation Note *</Text>
                <TextInput
                  style={styles.noteInput}
                  placeholder="Please provide details about the cancellation..."
                  placeholderTextColor="#9CA3AF"
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  value={note}
                  onChangeText={setNote}
                  onFocus={handleInputFocus}
                  maxLength={500}
                />
                <Text style={styles.characterCount}>{note.length}/500</Text>

                {/* Action Buttons */}
                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    style={styles.backButton}
                    onPress={handleCloseModal}
                  >
                    <Text style={styles.backButtonText}>Go Back</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.confirmButton,
                      (!selectedReason || !note.trim() || loading) && styles.confirmButtonDisabled
                    ]}
                    onPress={handleConfirmCancel}
                    disabled={!selectedReason || !note.trim() || loading}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.confirmButtonText}>Confirm Cancellation</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  cancelButtonWrapper: {
    alignItems: 'center',
    marginTop: 8,
  },
  cancelIconButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
  },
  scrollContent: {
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  warningNotice: {
    flexDirection: 'row',
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: 8,
    gap: 10,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: '#92400E',
    lineHeight: 18,
  },
  infoNotice: {
    flexDirection: 'row',
    backgroundColor: '#EFF6FF',
    padding: 12,
    borderRadius: 8,
    gap: 10,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#3B82F6',
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#1E40AF',
    lineHeight: 18,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  reasonOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  reasonOptionSelected: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  radioButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  radioButtonInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#EF4444',
  },
  reasonTextContainer: {
    flex: 1,
  },
  reasonTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  reasonSubtext: {
    fontSize: 13,
    color: '#6B7280',
  },
  noteInput: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    minHeight: 120,
  },
  characterCount: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'right',
    marginTop: 4,
    marginBottom: 20,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  backButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#EF4444',
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
