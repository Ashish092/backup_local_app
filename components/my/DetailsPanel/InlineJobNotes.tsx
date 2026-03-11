import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase, bookingSupabase } from '@/lib/supabase';

// ============================================================================
// TYPES
// ============================================================================

interface InlineJobNotesProps {
  bookingId: string;
  bookingAppStatusId: string;
  userId: string;
  serviceType: string;
  onSave?: () => void;
}

interface JobNotes {
  id?: string;
  user_id: string;
  booking_id: string;
  booking_status_on_app_id: string;
  service_type: string;
  parking_type: string | null;
  parking_notes: string | null;
  access_type: string | null;
  access_code: string | null;
  access_notes: string | null;
  confirmed_time: string | null;
  power_water_on: boolean | null;
  guest_checkout_time: string | null;
  ndis_special_requests: string | null;
  female_only: boolean | null;
  ndis_fixed_schedule: boolean | null;
  regular_fixed_schedule: boolean | null;
  flexible_timing: boolean | null;
  two_cleaner_time: string | null;
  commercial_notes: string | null;
  general_notes: string | null;
  // Cancellation fields
  cancellation_reason: string | null;
  cancellation_note: string | null;
  cancellation_scope: string | null;
  cancelled_at: string | null;
  cancelled_by_user_id: string | null;
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const PARKING_OPTIONS = [
  { value: 'private', label: 'Private' },
  { value: 'street', label: 'Street' },
  { value: 'find_invoice', label: 'Paid' },
];

const ACCESS_OPTIONS = [
  { value: 'meet', label: 'Customer' },
  { value: 'lockbox', label: 'Keybox' },
  { value: 'pickup', label: 'Pickup key' },
];

// ============================================================================
// COMPONENT
// ============================================================================

export default function InlineJobNotes({
  bookingId,
  bookingAppStatusId,
  userId,
  serviceType,
  onSave,
}: InlineJobNotesProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasExistingNotes, setHasExistingNotes] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [timePickerField, setTimePickerField] = useState<'confirmed_time' | 'guest_checkout_time' | 'two_cleaner_time'>('confirmed_time');
  const [selectedHour, setSelectedHour] = useState(9);
  const [selectedMinute, setSelectedMinute] = useState(0);
  const [selectedPeriod, setSelectedPeriod] = useState<'AM' | 'PM'>('AM');
  
  // Saved notes (from DB)
  const [savedNotes, setSavedNotes] = useState<Partial<JobNotes>>({});
  
  // Draft notes (for editing in modal)
  const [draftNotes, setDraftNotes] = useState<Partial<JobNotes>>({
    parking_type: null,
    parking_notes: null,
    access_type: null,
    access_code: null,
    access_notes: null,
    confirmed_time: null,
    power_water_on: null,
    guest_checkout_time: null,
    ndis_special_requests: null,
    female_only: null,
    ndis_fixed_schedule: null,
    regular_fixed_schedule: null,
    flexible_timing: null,
    two_cleaner_time: null,
    commercial_notes: null,
    general_notes: null,
  });

  useEffect(() => {
    fetchExistingNotes();
  }, [bookingAppStatusId]);

  const fetchExistingNotes = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('job_notes')
        .select('*')
        .eq('booking_status_on_app_id', bookingAppStatusId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116' && error.code !== 'PGRST205') {
        console.error('Error fetching job notes:', error);
      }

      if (data) {
        setSavedNotes(data);
        setDraftNotes(data);
        setHasExistingNotes(true);
      } else {
        setHasExistingNotes(false);
      }
    } catch (error) {
      console.error('Error in fetchExistingNotes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    // Validate: Time is required
    if (!draftNotes.confirmed_time) {
      Alert.alert('Time Required', 'Please set a confirmed time before saving.');
      return;
    }

    try {
      setSaving(true);

      const noteData = {
        user_id: userId,
        booking_id: bookingId,
        booking_status_on_app_id: bookingAppStatusId,
        service_type: serviceType,
        ...draftNotes,
        updated_at: new Date().toISOString(),
      };

      const { data: existing, error: checkError } = await supabase
        .from('job_notes')
        .select('id')
        .eq('booking_status_on_app_id', bookingAppStatusId)
        .maybeSingle();

      if (checkError && checkError.code === 'PGRST205') {
        Alert.alert('Setup Required', 'Job notes table not found. Please contact administrator.');
        return;
      }

      if (existing) {
        const { error } = await supabase
          .from('job_notes')
          .update(noteData)
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('job_notes')
          .insert({ ...noteData, created_at: new Date().toISOString() });
        if (error) throw error;
      }

      // Update main booking status to 'confirmed' if not already confirmed or completed
      try {
        const { data: bookingData } = await bookingSupabase
          .from('bookings')
          .select('status')
          .eq('id', bookingId)
          .single();

        if (bookingData && bookingData.status !== 'confirmed' && bookingData.status !== 'completed') {
          const { error: bookingError } = await bookingSupabase
            .from('bookings')
            .update({ status: 'confirmed' })
            .eq('id', bookingId);

          if (bookingError) {
            console.error('Error updating booking status:', bookingError);
          }
        }
      } catch (bookingUpdateError) {
        console.error('Error checking/updating booking status:', bookingUpdateError);
      }

      // Update saved notes and close modal
      setSavedNotes(draftNotes);
      setHasExistingNotes(true);
      setShowEditModal(false);
      onSave?.();
    } catch (error: any) {
      console.error('Error saving job notes:', error);
      Alert.alert('Error', 'Failed to save notes.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    // Reset draft to saved notes
    setDraftNotes(savedNotes);
    setShowEditModal(false);
  };

  const openEditModal = () => {
    // Copy saved notes to draft for editing
    setDraftNotes({ ...savedNotes });
    setShowEditModal(true);
  };

  const updateDraftField = (field: keyof JobNotes, value: any) => {
    setDraftNotes(prev => ({ ...prev, [field]: value }));
  };

  // Time picker helpers
  const openTimePicker = (field: 'confirmed_time' | 'guest_checkout_time' | 'two_cleaner_time') => {
    setTimePickerField(field);
    const currentTime = draftNotes[field];
    if (currentTime) {
      const match = currentTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (match) {
        setSelectedHour(parseInt(match[1]));
        setSelectedMinute(parseInt(match[2]));
        setSelectedPeriod(match[3].toUpperCase() as 'AM' | 'PM');
      }
    } else {
      setSelectedHour(9);
      setSelectedMinute(0);
      setSelectedPeriod('AM');
    }
    setShowTimePicker(true);
  };

  const confirmTime = () => {
    const formattedTime = `${selectedHour}:${selectedMinute.toString().padStart(2, '0')} ${selectedPeriod}`;
    updateDraftField(timePickerField, formattedTime);
    setShowTimePicker(false);
  };

  // Helper to get parking label
  const getParkingLabel = (value: string | null) => {
    const opt = PARKING_OPTIONS.find(o => o.value === value);
    return opt?.label || 'Not set';
  };

  // Helper to get access label
  const getAccessLabel = (value: string | null) => {
    const opt = ACCESS_OPTIONS.find(o => o.value === value);
    return opt?.label || 'Not set';
  };

  // Check if notes have any content
  const hasAnyContent = () => {
    return savedNotes.confirmed_time || 
           savedNotes.parking_type || 
           savedNotes.access_type || 
           savedNotes.general_notes ||
           savedNotes.power_water_on !== null ||
           savedNotes.guest_checkout_time ||
           savedNotes.female_only !== null ||
           savedNotes.ndis_special_requests;
  };

  // ============================================================================
  // LOADING STATE
  // ============================================================================

  if (loading) {
    return (
      <View style={styles.container} pointerEvents="none">
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading notes...</Text>
        </View>
      </View>
    );
  }

  // ============================================================================
  // NO NOTES - SHOW ADD BUTTON
  // ============================================================================

  if (!hasExistingNotes || !hasAnyContent()) {
    return (
      <View style={styles.container} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.addNotesButton}
          onPress={openEditModal}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="add-circle-outline" size={20} color="#3B82F6" />
          <Text style={styles.addNotesButtonText}>Add Job Notes</Text>
        </TouchableOpacity>

        {/* Edit Modal */}
        {renderEditModal()}
      </View>
    );
  }

  // ============================================================================
  // HAS NOTES - SHOW READ-ONLY VIEW
  // ============================================================================

  function renderReadOnlyContent() {
    return (
      <View style={styles.notesContent}>
        {/* Confirmed Time */}
        {savedNotes.confirmed_time && (
          <View style={styles.readOnlyRow}>
            <View style={styles.readOnlyIconLabel}>
              <Ionicons name="time-outline" size={16} color="#3B82F6" />
              <Text style={styles.readOnlyLabel}>Time</Text>
            </View>
            <Text style={styles.readOnlyValue}>{savedNotes.confirmed_time}</Text>
          </View>
        )}

        {/* Parking */}
        {savedNotes.parking_type && (
          <View style={styles.readOnlyRow}>
            <View style={styles.readOnlyIconLabel}>
              <Ionicons name="car-outline" size={16} color="#F59E0B" />
              <Text style={styles.readOnlyLabel}>Parking</Text>
            </View>
            <Text style={styles.readOnlyValue}>{getParkingLabel(savedNotes.parking_type)}</Text>
          </View>
        )}

        {/* Access */}
        {savedNotes.access_type && (
          <View style={styles.readOnlyRow}>
            <View style={styles.readOnlyIconLabel}>
              <Ionicons name="key-outline" size={16} color="#10B981" />
              <Text style={styles.readOnlyLabel}>Access</Text>
            </View>
            <Text style={styles.readOnlyValue}>
              {getAccessLabel(savedNotes.access_type)}
              {savedNotes.access_type === 'lockbox' && savedNotes.access_code && ` (${savedNotes.access_code})`}
            </Text>
          </View>
        )}

        {/* Service-specific fields */}
        {serviceType === 'End of Lease Cleaning' && savedNotes.power_water_on !== null && (
          <View style={styles.readOnlyRow}>
            <View style={styles.readOnlyIconLabel}>
              <Ionicons name="flash-outline" size={16} color="#EF4444" />
              <Text style={styles.readOnlyLabel}>Power/Water</Text>
            </View>
            <View style={[styles.statusBadge, savedNotes.power_water_on ? styles.statusYes : styles.statusNo]}>
              <Text style={[styles.statusBadgeText, { color: savedNotes.power_water_on ? '#059669' : '#DC2626' }]}>
                {savedNotes.power_water_on ? 'Yes' : 'No'}
              </Text>
            </View>
          </View>
        )}

        {serviceType === 'Airbnb Cleaning' && savedNotes.guest_checkout_time && (
          <View style={styles.readOnlyRow}>
            <View style={styles.readOnlyIconLabel}>
              <Ionicons name="log-out-outline" size={16} color="#EC4899" />
              <Text style={styles.readOnlyLabel}>Checkout</Text>
            </View>
            <Text style={styles.readOnlyValue}>{savedNotes.guest_checkout_time}</Text>
          </View>
        )}

        {serviceType === 'NDIS Cleaning' && (
          <>
            {savedNotes.female_only !== null && (
              <View style={styles.readOnlyRow}>
                <View style={styles.readOnlyIconLabel}>
                  <Ionicons name="person-outline" size={16} color="#8B5CF6" />
                  <Text style={styles.readOnlyLabel}>Female only</Text>
                </View>
                <View style={[styles.statusBadge, savedNotes.female_only ? styles.statusYes : styles.statusNo]}>
                  <Text style={[styles.statusBadgeText, { color: savedNotes.female_only ? '#059669' : '#DC2626' }]}>
                    {savedNotes.female_only ? 'Yes' : 'No'}
                  </Text>
                </View>
              </View>
            )}
            {savedNotes.ndis_special_requests && (
              <View style={styles.readOnlyRow}>
                <View style={styles.readOnlyIconLabel}>
                  <Ionicons name="alert-circle-outline" size={16} color="#8B5CF6" />
                  <Text style={styles.readOnlyLabel}>Special</Text>
                </View>
                <Text style={[styles.readOnlyValue, styles.flexText]}>{savedNotes.ndis_special_requests}</Text>
              </View>
            )}
          </>
        )}

        {/* General Notes */}
        {savedNotes.general_notes && (
          <View style={styles.generalNotesContainer}>
            <View style={styles.readOnlyIconLabel}>
              <Ionicons name="create-outline" size={16} color="#6B7280" />
              <Text style={styles.readOnlyLabel}>Notes</Text>
            </View>
            <Text style={styles.generalNotesText}>{savedNotes.general_notes}</Text>
          </View>
        )}
      </View>
    );
  }

  // ============================================================================
  // EDIT MODAL
  // ============================================================================

  function renderEditModal() {
    return (
      <Modal
        visible={showEditModal}
        animationType="slide"
        transparent={true}
        onRequestClose={handleCancel}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <Pressable style={styles.modalBackdrop} onPress={handleCancel} />
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {hasExistingNotes ? 'Edit Job Notes' : 'Add Job Notes'}
              </Text>
              <TouchableOpacity onPress={handleCancel} style={styles.modalCloseButton}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {/* Modal Body - Scrollable */}
            <ScrollView 
              style={styles.modalBody}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
            >
              {/* Confirmed Time */}
              <View style={styles.fieldSection}>
                <Text style={styles.fieldLabel}>
                  <Ionicons name="time-outline" size={14} color="#3B82F6" /> Confirmed Time *
                </Text>
                <TouchableOpacity
                  style={styles.timeButton}
                  onPress={() => openTimePicker('confirmed_time')}
                >
                  <Text style={[styles.timeButtonText, draftNotes.confirmed_time && styles.timeButtonTextSet]}>
                    {draftNotes.confirmed_time || 'Tap to set time'}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
                </TouchableOpacity>
              </View>

              {/* Parking */}
              <View style={styles.fieldSection}>
                <Text style={styles.fieldLabel}>
                  <Ionicons name="car-outline" size={14} color="#F59E0B" /> Parking
                </Text>
                <View style={styles.optionButtons}>
                  {PARKING_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.optionButton, draftNotes.parking_type === opt.value && styles.optionButtonSelected]}
                      onPress={() => updateDraftField('parking_type', opt.value)}
                    >
                      <Text style={[styles.optionButtonText, draftNotes.parking_type === opt.value && styles.optionButtonTextSelected]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Access */}
              <View style={styles.fieldSection}>
                <Text style={styles.fieldLabel}>
                  <Ionicons name="key-outline" size={14} color="#10B981" /> Access
                </Text>
                <View style={styles.optionButtons}>
                  {ACCESS_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.optionButton, draftNotes.access_type === opt.value && styles.optionButtonSelected]}
                      onPress={() => updateDraftField('access_type', opt.value)}
                    >
                      <Text style={[styles.optionButtonText, draftNotes.access_type === opt.value && styles.optionButtonTextSelected]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Access Code (if lockbox) */}
              {draftNotes.access_type === 'lockbox' && (
                <View style={styles.fieldSection}>
                  <Text style={styles.fieldLabel}>Access Code</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Enter keybox code..."
                    placeholderTextColor="#9CA3AF"
                    value={draftNotes.access_code || ''}
                    onChangeText={(text) => updateDraftField('access_code', text)}
                  />
                </View>
              )}

              {/* Service-specific fields */}
              {serviceType === 'End of Lease Cleaning' && (
                <View style={styles.fieldSection}>
                  <Text style={styles.fieldLabel}>
                    <Ionicons name="flash-outline" size={14} color="#EF4444" /> Power/Water On?
                  </Text>
                  <View style={styles.yesNoButtons}>
                    <TouchableOpacity
                      style={[styles.yesNoButton, draftNotes.power_water_on === true && styles.yesButtonSelected]}
                      onPress={() => updateDraftField('power_water_on', true)}
                    >
                      <Ionicons name="checkmark-circle" size={18} color={draftNotes.power_water_on === true ? '#059669' : '#9CA3AF'} />
                      <Text style={[styles.yesNoText, draftNotes.power_water_on === true && styles.yesNoTextSelected]}>Yes</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.yesNoButton, draftNotes.power_water_on === false && styles.noButtonSelected]}
                      onPress={() => updateDraftField('power_water_on', false)}
                    >
                      <Ionicons name="close-circle" size={18} color={draftNotes.power_water_on === false ? '#DC2626' : '#9CA3AF'} />
                      <Text style={[styles.yesNoText, draftNotes.power_water_on === false && styles.yesNoTextSelectedNo]}>No</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {serviceType === 'Airbnb Cleaning' && (
                <View style={styles.fieldSection}>
                  <Text style={styles.fieldLabel}>
                    <Ionicons name="log-out-outline" size={14} color="#EC4899" /> Guest Checkout Time
                  </Text>
                  <TouchableOpacity
                    style={styles.timeButton}
                    onPress={() => openTimePicker('guest_checkout_time')}
                  >
                    <Text style={[styles.timeButtonText, draftNotes.guest_checkout_time && styles.timeButtonTextSet]}>
                      {draftNotes.guest_checkout_time || 'Tap to set time'}
                    </Text>
                    <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
                  </TouchableOpacity>
                </View>
              )}

              {serviceType === 'NDIS Cleaning' && (
                <>
                  <View style={styles.fieldSection}>
                    <Text style={styles.fieldLabel}>
                      <Ionicons name="person-outline" size={14} color="#8B5CF6" /> Female Cleaner Only?
                    </Text>
                    <View style={styles.yesNoButtons}>
                      <TouchableOpacity
                        style={[styles.yesNoButton, draftNotes.female_only === true && styles.yesButtonSelected]}
                        onPress={() => updateDraftField('female_only', true)}
                      >
                        <Ionicons name="checkmark-circle" size={18} color={draftNotes.female_only === true ? '#059669' : '#9CA3AF'} />
                        <Text style={[styles.yesNoText, draftNotes.female_only === true && styles.yesNoTextSelected]}>Yes</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.yesNoButton, draftNotes.female_only === false && styles.noButtonSelected]}
                        onPress={() => updateDraftField('female_only', false)}
                      >
                        <Ionicons name="close-circle" size={18} color={draftNotes.female_only === false ? '#DC2626' : '#9CA3AF'} />
                        <Text style={[styles.yesNoText, draftNotes.female_only === false && styles.yesNoTextSelectedNo]}>No</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={styles.fieldSection}>
                    <Text style={styles.fieldLabel}>NDIS Special Requests</Text>
                    <TextInput
                      style={styles.notesInput}
                      placeholder="Any special requirements..."
                      placeholderTextColor="#9CA3AF"
                      value={draftNotes.ndis_special_requests || ''}
                      onChangeText={(text) => updateDraftField('ndis_special_requests', text)}
                      multiline
                    />
                  </View>
                </>
              )}

              {/* General Notes */}
              <View style={styles.fieldSection}>
                <Text style={styles.fieldLabel}>
                  <Ionicons name="create-outline" size={14} color="#6B7280" /> General Notes
                </Text>
                <TextInput
                  style={styles.notesInput}
                  placeholder="Any additional notes..."
                  placeholderTextColor="#9CA3AF"
                  value={draftNotes.general_notes || ''}
                  onChangeText={(text) => updateDraftField('general_notes', text)}
                  multiline
                />
              </View>

              {/* Spacer for bottom buttons */}
              <View style={{ height: 20 }} />
            </ScrollView>

            {/* Modal Footer - Action Buttons */}
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={handleCancel}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={18} color="#fff" />
                    <Text style={styles.saveButtonText}>Save</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>

        {/* Time Picker Modal */}
        <Modal
          visible={showTimePicker}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowTimePicker(false)}
        >
          <View style={styles.timePickerOverlay}>
            <View style={styles.timePickerContainer}>
              <Text style={styles.timePickerTitle}>Select Time</Text>
              
              <View style={styles.timePickerContent}>
                {/* Hour */}
                <View style={styles.pickerColumn}>
                  <ScrollView style={styles.pickerScroll} showsVerticalScrollIndicator={false}>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((hour) => (
                      <TouchableOpacity
                        key={hour}
                        style={[styles.pickerItem, selectedHour === hour && styles.pickerItemSelected]}
                        onPress={() => setSelectedHour(hour)}
                      >
                        <Text style={[styles.pickerItemText, selectedHour === hour && styles.pickerItemTextSelected]}>
                          {hour}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                {/* Minute */}
                <View style={styles.pickerColumn}>
                  <ScrollView style={styles.pickerScroll} showsVerticalScrollIndicator={false}>
                    {[0, 15, 30, 45].map((minute) => (
                      <TouchableOpacity
                        key={minute}
                        style={[styles.pickerItem, selectedMinute === minute && styles.pickerItemSelected]}
                        onPress={() => setSelectedMinute(minute)}
                      >
                        <Text style={[styles.pickerItemText, selectedMinute === minute && styles.pickerItemTextSelected]}>
                          {minute.toString().padStart(2, '0')}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                {/* AM/PM */}
                <View style={styles.periodColumn}>
                  <TouchableOpacity
                    style={[styles.periodButton, selectedPeriod === 'AM' && styles.periodButtonSelected]}
                    onPress={() => setSelectedPeriod('AM')}
                  >
                    <Text style={[styles.periodText, selectedPeriod === 'AM' && styles.periodTextSelected]}>AM</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.periodButton, selectedPeriod === 'PM' && styles.periodButtonSelected]}
                    onPress={() => setSelectedPeriod('PM')}
                  >
                    <Text style={[styles.periodText, selectedPeriod === 'PM' && styles.periodTextSelected]}>PM</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Preview */}
              <Text style={styles.timePreview}>
                {selectedHour}:{selectedMinute.toString().padStart(2, '0')} {selectedPeriod}
              </Text>

              {/* Buttons */}
              <View style={styles.timePickerButtons}>
                <TouchableOpacity style={styles.timePickerCancelButton} onPress={() => setShowTimePicker(false)}>
                  <Text style={styles.timePickerCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.timePickerConfirmButton} onPress={confirmTime}>
                  <Text style={styles.timePickerConfirmText}>Confirm</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </Modal>
    );
  }

  // ============================================================================
  // MAIN RENDER - READ-ONLY VIEW WITH EDIT BUTTON
  // ============================================================================

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* Header with Edit Button */}
      <View style={styles.header} pointerEvents="box-none">
        <View style={styles.headerLeft} pointerEvents="none">
          <Ionicons name="document-text" size={18} color="#3B82F6" />
          <Text style={styles.headerTitle}>Job Notes</Text>
        </View>
        <TouchableOpacity 
          style={styles.editButton}
          onPress={openEditModal}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="pencil" size={14} color="#3B82F6" />
          <Text style={styles.editButtonText}>Edit</Text>
        </TouchableOpacity>
      </View>

      {/* Read-only Content - passes touches through to ScrollView */}
      <View pointerEvents="none">
        {renderReadOnlyContent()}
      </View>

      {/* Edit Modal */}
      {renderEditModal()}
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  loadingText: {
    fontSize: 14,
    color: '#6B7280',
  },
  // Add Notes Button
  addNotesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3B82F6',
    borderStyle: 'dashed',
  },
  addNotesButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#3B82F6',
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E40AF',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#fff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  editButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3B82F6',
  },
  // Notes Content (Read-only)
  notesContent: {
    gap: 4,
  },
  readOnlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#fff',
    borderRadius: 6,
  },
  readOnlyIconLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  readOnlyLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
  },
  readOnlyValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  flexText: {
    flex: 1,
    textAlign: 'right',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusYes: {
    backgroundColor: '#DCFCE7',
  },
  statusNo: {
    backgroundColor: '#FEE2E2',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  generalNotesContainer: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
    borderRadius: 8,
    gap: 4,
  },
  generalNotesText: {
    fontSize: 13,
    color: '#374151',
    lineHeight: 18,
    marginTop: 4,
  },
  // Modal Styles
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
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  modalCloseButton: {
    padding: 4,
  },
  modalBody: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#fff',
  },
  // Field Styles
  fieldSection: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  optionButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  optionButtonSelected: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  optionButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#4B5563',
  },
  optionButtonTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  timeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  timeButtonText: {
    fontSize: 15,
    color: '#9CA3AF',
  },
  timeButtonTextSet: {
    color: '#111827',
    fontWeight: '600',
  },
  textInput: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
  },
  yesNoButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  yesNoButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  yesButtonSelected: {
    backgroundColor: '#DCFCE7',
    borderColor: '#22C55E',
  },
  noButtonSelected: {
    backgroundColor: '#FEE2E2',
    borderColor: '#EF4444',
  },
  yesNoText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  yesNoTextSelected: {
    color: '#059669',
    fontWeight: '600',
  },
  yesNoTextSelectedNo: {
    color: '#DC2626',
    fontWeight: '600',
  },
  notesInput: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  // Action Buttons
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
  saveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#3B82F6',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  // Time Picker Modal
  timePickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  timePickerContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 320,
  },
  timePickerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 16,
  },
  timePickerContent: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 16,
  },
  pickerColumn: {
    alignItems: 'center',
  },
  pickerScroll: {
    height: 120,
    width: 60,
  },
  pickerItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginVertical: 2,
  },
  pickerItemSelected: {
    backgroundColor: '#EFF6FF',
  },
  pickerItemText: {
    fontSize: 18,
    color: '#6B7280',
    textAlign: 'center',
  },
  pickerItemTextSelected: {
    color: '#3B82F6',
    fontWeight: '700',
  },
  periodColumn: {
    justifyContent: 'center',
    gap: 8,
  },
  periodButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
  },
  periodButtonSelected: {
    backgroundColor: '#3B82F6',
  },
  periodText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  periodTextSelected: {
    color: '#fff',
  },
  timePreview: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 16,
  },
  timePickerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  timePickerCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  timePickerCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
    textAlign: 'center',
  },
  timePickerConfirmButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#3B82F6',
  },
  timePickerConfirmText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
});
