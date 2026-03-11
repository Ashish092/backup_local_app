import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ActivityIndicator, 
  Alert,
  Animated,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase, bookingSupabase } from '@/lib/supabase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface AcceptJobButtonProps {
  // Main booking data
  jobId: string; // booking_status_on_app id
  bookingId: string;
  bookingNumber: string;
  selectedService: string;
  currentStatus: string;
  // User info
  userId: string;
  userFirstName?: string;
  // Instance data (if recurring)
  isInstance: boolean;
  instanceId?: string; // recurring_booking_status id
  instanceNumber?: number;
  // Callbacks
  onAccepted: (customerData: {
    phone?: string;
    address?: string;
    firstName?: string;
    lastName?: string;
  }) => void;
}

// Toast Notification Component
const ToastNotification = ({ 
  visible, 
  message, 
  onHide 
}: { 
  visible: boolean; 
  message: string; 
  onHide: () => void;
}) => {
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Slide down and fade in
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 50,
          friction: 8,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto hide after 3 seconds
      const timer = setTimeout(() => {
        hideToast();
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [visible]);

  const hideToast = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -100,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onHide();
    });
  };

  if (!visible) return null;

  return (
    <Animated.View 
      style={[
        styles.toastContainer,
        {
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <View style={styles.toastContent}>
        <View style={styles.toastIconContainer}>
          <Ionicons name="checkmark-circle" size={24} color="#fff" />
        </View>
        <Text style={styles.toastText}>{message}</Text>
      </View>
    </Animated.View>
  );
};

export default function AcceptJobButton({
  jobId,
  bookingId,
  bookingNumber,
  selectedService,
  currentStatus,
  userId,
  userFirstName,
  isInstance,
  instanceId,
  instanceNumber,
  onAccepted,
}: AcceptJobButtonProps) {
  const [loading, setLoading] = useState(false);
  const [showToast, setShowToast] = useState(false);

  // Only show for 'assigned' status
  if (currentStatus !== 'assigned') {
    return null;
  }

  const handleAcceptJob = async () => {
    setLoading(true);
    try {
      const now = new Date().toISOString();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];

      // ==================== STEP 1: Update booking_status_on_app ====================
      // Update job_status, assigned_to, and assigned_at
      const { error: statusError } = await bookingSupabase
        .from('booking_status_on_app')
        .update({
          job_status: 'accepted',
          assigned_to: userId,
          assigned_at: now,
          updated_at: now,
        })
        .eq('id', jobId);

      if (statusError) {
        console.error('Error updating booking_status_on_app:', statusError);
        throw statusError;
      }

      // ==================== STEP 2: For Recurring - Update current and future instances ====================
      if (isInstance) {
        // Update all instances where instance_date >= today
        // This includes the current instance and all future ones
        // Update job_status, assigned_to, and assigned_at for all
        const { error: instancesError } = await bookingSupabase
          .from('recurring_booking_status')
          .update({
            job_status: 'accepted',
            assigned_to: userId,
            assigned_at: now,
            updated_at: now,
          })
          .eq('booking_status_on_app_id', jobId)
          .gte('instance_date', todayStr); // Only today and future dates

        if (instancesError) {
          console.error('Error updating recurring instances:', instancesError);
          // Don't throw - continue with the rest
        } else {
          console.log(`✅ Updated all instances from ${todayStr} onwards to 'accepted' with assigned_to: ${userId}`);
        }
      }

      // ==================== STEP 3: Fetch customer details ====================
      const { data: bookingData, error: bookingError } = await bookingSupabase
        .from('bookings')
        .select('customer_id')
        .eq('id', bookingId)
        .single();

      if (bookingError) {
        console.error('Error fetching booking:', bookingError);
        throw bookingError;
      }

      let customerData = {
        phone: undefined as string | undefined,
        address: undefined as string | undefined,
        firstName: undefined as string | undefined,
        lastName: undefined as string | undefined,
      };

      if (bookingData?.customer_id) {
        const { data: customer, error: customerError } = await bookingSupabase
          .from('customers')
          .select('first_name, last_name, phone, address, suburb, postcode')
          .eq('id', bookingData.customer_id)
          .single();

        if (!customerError && customer) {
          customerData = {
            phone: customer.phone,
            address: customer.address,
            firstName: customer.first_name,
            lastName: customer.last_name,
          };
        }
      }

      // ==================== STEP 4: Create Notifications ====================
      const customerName = customerData.firstName && customerData.lastName
        ? `${customerData.firstName} ${customerData.lastName}`.trim()
        : 'Customer';
      const customerPhone = customerData.phone || 'Not available';

      // Notification for worker - contact details revealed
      await supabase
        .from('notifications')
        .insert({
          user_id: userId,
          title: 'Client Contact Details Available 📞',
          body: `Call ${customerName} to confirm timing for ${selectedService}`,
          notification_type: 'job_accepted',
          category: 'communication',
          priority: 'high',
          booking_id: bookingId,
          data: {
            booking_number: bookingNumber,
            service: selectedService,
            customer_name: customerName,
            customer_phone: customerPhone,
            is_instance: isInstance,
            instance_number: instanceNumber,
          },
          action_url: '/(tabs)/my',
          action_label: 'View My Jobs',
        });

      // Activity log for worker
      await supabase
        .from('activity_logs')
        .insert({
          user_id: userId,
          activity_type: 'job_accepted',
          title: `You accepted ${selectedService} job - Call client to confirm`,
          booking_id: bookingId,
          data: {
            booking_number: bookingNumber,
            service: selectedService,
            customer_name: customerName,
            is_instance: isInstance,
            instance_number: instanceNumber,
          },
        });

      // Notification for admin
      const { data: userProfile } = await supabase
        .from('users')
        .select('first_name, last_name')
        .eq('id', userId)
        .single();

      const workerName = userProfile
        ? `${userProfile.first_name || ''} ${userProfile.last_name || ''}`.trim()
        : 'Worker';

      await supabase
        .from('notifications')
        .insert({
          user_id: null, // Global notification for admins
          title: 'Job Accepted by Worker ✅',
          body: `${workerName} accepted ${selectedService} (Booking #${bookingNumber})`,
          notification_type: 'job_accepted_admin',
          category: 'job_update',
          priority: 'medium',
          booking_id: bookingId,
          data: {
            booking_number: bookingNumber,
            service: selectedService,
            worker_name: workerName,
            worker_id: userId,
            is_instance: isInstance,
            instance_number: instanceNumber,
          },
          action_url: '/dashboard/jobs',
          action_label: 'View Jobs',
        });

      // ==================== STEP 5: Success - Show Toast ====================
      setShowToast(true);
      onAccepted(customerData);

    } catch (error) {
      console.error('Error accepting job:', error);
      Alert.alert('Error', 'Failed to accept job. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Toast Notification */}
      <ToastNotification
        visible={showToast}
        message="Job Accepted"
        onHide={() => setShowToast(false)}
      />

      {/* Accept Button */}
      <TouchableOpacity
        style={[styles.acceptButton, loading && styles.acceptButtonLoading]}
        onPress={handleAcceptJob}
        disabled={loading}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <Ionicons name="checkmark-circle" size={24} color="#fff" />
            <Text style={styles.acceptButtonText}>Accept Job</Text>
          </>
        )}
      </TouchableOpacity>
    </>
  );
}

const styles = StyleSheet.create({
  acceptButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  acceptButtonLoading: {
    opacity: 0.7,
  },
  acceptButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  // Toast Styles
  toastContainer: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    zIndex: 9999,
    alignItems: 'center',
  },
  toastContent: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
    gap: 12,
    minWidth: 200,
  },
  toastIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  toastText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
