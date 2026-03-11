import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getServiceColor,
  getHourlyRate,
  formatDateShort,
  getJobStatusTag,
} from '@/lib/jobUtils';

// ============================================================================
// TYPES
// ============================================================================

export interface RecurringInstance {
  id: string;
  instance_number: number;
  instance_date: string;
  instance_booking_number: string;
  job_status: string;
  assigned_to: string | null;
}

export interface RecurringInstanceCardProps {
  // Job data from booking_status_on_app
  jobId: string; // booking_status_on_app id
  bookingId: string;
  bookingNumber: string;
  selectedService: 'Regular Cleaning' | 'NDIS Cleaning';
  // Customer info
  customerName: string;
  location: string;
  // Service details
  duration?: string;
  frequency?: string;
  // Recurring instance data
  instance: RecurringInstance;
  // Callbacks
  onPress?: () => void;
  // Disabled state for closed/completed jobs
  disabled?: boolean;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function RecurringInstanceCard({
  jobId,
  bookingId,
  bookingNumber,
  selectedService,
  customerName,
  location,
  duration,
  frequency,
  instance,
  onPress,
  disabled = false,
}: RecurringInstanceCardProps) {
  const serviceColor = disabled ? '#9CA3AF' : getServiceColor(selectedService);
  const hourlyRate = getHourlyRate(selectedService);
  const instanceDate = formatDateShort(instance.instance_date);
  const statusTag = getJobStatusTag(instance.job_status);

  return (
    <TouchableOpacity
      style={[styles.card, disabled && styles.cardDisabled]}
      onPress={disabled ? undefined : onPress}
      activeOpacity={disabled ? 1 : 0.7}
      disabled={disabled}
    >
      {/* Left colored border - same as default cards */}
      <View style={[styles.cardLeftBorder, { backgroundColor: serviceColor }]} />

      {/* Service badge - half hanging at top like default cards */}
      <View style={[styles.serviceBadge, { backgroundColor: serviceColor }]}>
        <Text style={styles.serviceBadgeText}>
          {selectedService.replace(' Cleaning', '')}
        </Text>
      </View>

      <View style={styles.cardContent}>
        {/* Row 1: Customer Name | Rate */}
        <View style={styles.cardRow}>
          <Text style={styles.cardCustomerName}>{customerName}</Text>
          <Text style={[styles.cardPriceText, disabled && styles.cardPriceTextDisabled]}>
            {hourlyRate ? `$${hourlyRate}/hr` : 'N/A'}
          </Text>
        </View>

        {/* Row 2: Location | Instance Date */}
        <View style={styles.cardRow}>
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={14} color="#6B7280" />
            <Text style={styles.cardDetailText}>{location}</Text>
          </View>
          <Text style={[styles.cardDateText, disabled && styles.cardDateTextDisabled]}>
            {instanceDate}
          </Text>
        </View>

        {/* Row 3: Duration & Frequency & Week Number | Status Tag */}
        <View style={styles.cardRow}>
          <View style={styles.locationRow}>
            <Ionicons name="time-outline" size={14} color="#6B7280" />
            <Text style={styles.cardDetailText}>
              {duration || 'TBD'}
              {frequency && ` • ${frequency}`}
              {` • Week ${instance.instance_number}`}
            </Text>
          </View>
          {statusTag && (
            <View style={[styles.jobStatusTag, { backgroundColor: disabled ? '#9CA3AF' : statusTag.color }]}>
              <Text style={styles.jobStatusTagText}>{statusTag.label}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ============================================================================
// STYLES - Matching default card styles from JobsListView
// ============================================================================

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    paddingTop: 18,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    marginTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    overflow: 'visible',
  },
  cardDisabled: {
    opacity: 0.5,
    backgroundColor: '#F9FAFB',
  },
  cardLeftBorder: {
    width: 4,
    height: '100%',
    borderRadius: 2,
    marginRight: 12,
    minHeight: 50,
  },
  serviceBadge: {
    position: 'absolute',
    top: -8,
    left: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  serviceBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  cardContent: {
    flex: 1,
    gap: 4,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardCustomerName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
    marginRight: 8,
  },
  cardPriceText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF6B35',
  },
  cardPriceTextDisabled: {
    color: '#9CA3AF',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  cardDetailText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  cardDateText: {
    fontSize: 12,
    color: '#3B82F6',
    fontWeight: '500',
  },
  cardDateTextDisabled: {
    color: '#9CA3AF',
  },
  jobStatusTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  jobStatusTagText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
});
