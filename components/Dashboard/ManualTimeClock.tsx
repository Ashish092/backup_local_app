import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import * as Location from 'expo-location';

interface ManualTimeClockEntry {
  id: string;
  user_id: string;
  job_start_time: string;
  job_start_location: any;
  is_active: boolean;
  pause_time_start_1?: string | null;
  pause_time_stop_1?: string | null;
  pause_duration_1?: number | null;
  pause_time_start_2?: string | null;
  pause_time_stop_2?: string | null;
  pause_duration_2?: number | null;
}

// ==================== HELPER FUNCTIONS ====================

const getMelbourneTimestamp = (): string => {
  const melbourneTime = new Date().toLocaleString('en-AU', {
    timeZone: 'Australia/Melbourne',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const [datePart, timePart] = melbourneTime.split(', ');
  const [day, month, year] = datePart.split('/');
  return `${year}-${month}-${day}T${timePart}+11:00`;
};

const getCurrentLocation = async () => {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return null;
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const [address] = await Location.reverseGeocodeAsync({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    });

    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      address: address 
        ? `${address.street || ''}, ${address.city || ''}, ${address.region || ''} ${address.postalCode || ''}`.trim() 
        : 'Unknown',
      timestamp: getMelbourneTimestamp(),
    };
  } catch (error) {
    console.error('Error getting location:', error);
    return null;
  }
};

const calculateHours = (startTime: string, endTime: string): number => {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  return parseFloat(((end - start) / (1000 * 60 * 60)).toFixed(2));
};

// ==================== MAIN COMPONENT ====================

export default function ManualTimeClock() {
  const { user } = useAuth();
  const [activeEntry, setActiveEntry] = useState<ManualTimeClockEntry | null>(null);
  const [elapsedTime, setElapsedTime] = useState<string>('00:00:00');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [clockOutNotes, setClockOutNotes] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [currentPauseStart, setCurrentPauseStart] = useState<string | null>(null);

  // Check for existing active entry on mount
  useEffect(() => {
    if (!user) return;

    const checkActiveEntry = async () => {
      try {
        const { data, error } = await supabase
          .from('time_clock')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .eq('on_the_way_status', 'manual_entry')
          .is('booking_id', null)
          .is('booking_status_on_app_id', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) throw error;

        if (data) {
          setActiveEntry(data);
          if (data.pause_time_start_1 && !data.pause_time_stop_1) {
            setIsPaused(true);
            setCurrentPauseStart(data.pause_time_start_1);
          } else if (data.pause_time_start_2 && !data.pause_time_stop_2) {
            setIsPaused(true);
            setCurrentPauseStart(data.pause_time_start_2);
          }
        }
      } catch (error) {
        console.error('Error checking active entry:', error);
      } finally {
        setInitialLoading(false);
      }
    };

    checkActiveEntry();
  }, [user]);

  // Calculate elapsed time
  useEffect(() => {
    if (!activeEntry?.job_start_time) return;

    const calculateElapsedTime = () => {
      const startTime = new Date(activeEntry.job_start_time).getTime();
      const now = new Date().getTime();
      let diff = now - startTime;

      // Subtract completed pause durations
      if (activeEntry.pause_duration_1) {
        diff -= activeEntry.pause_duration_1 * 60 * 60 * 1000;
      }
      if (activeEntry.pause_duration_2) {
        diff -= activeEntry.pause_duration_2 * 60 * 60 * 1000;
      }

      // Subtract current pause time if paused
      if (isPaused && currentPauseStart) {
        const pauseStart = new Date(currentPauseStart).getTime();
        diff -= (now - pauseStart);
      }

      if (diff < 0) diff = 0;

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setElapsedTime(
        `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      );
    };

    calculateElapsedTime();
    const interval = setInterval(calculateElapsedTime, 1000);
    return () => clearInterval(interval);
  }, [activeEntry, isPaused, currentPauseStart]);

  // Clock In
  const handleClockIn = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const location = await getCurrentLocation();
      const now = getMelbourneTimestamp();

      const { data, error } = await supabase
        .from('time_clock')
        .insert({
          user_id: user.id,
          on_the_way_status: 'manual_entry',
          job_start_time: now,
          job_start_location: location,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      setActiveEntry(data);
      Alert.alert('Clocked In', 'Timer started!');
    } catch (error) {
      console.error('Error clocking in:', error);
      Alert.alert('Error', 'Failed to clock in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Clock Out Press
  const handleClockOutPress = () => {
    if (isPaused) {
      Alert.alert('Pause Active', 'Please resume from pause before clocking out.');
      return;
    }
    setShowNotesModal(true);
  };

  // Pause
  const handlePause = async () => {
    if (!activeEntry || isPaused) return;

    const pause1Completed = !!(activeEntry.pause_time_start_1 && activeEntry.pause_time_stop_1);
    const pause2Completed = !!(activeEntry.pause_time_start_2 && activeEntry.pause_time_stop_2);
    
    if (pause1Completed && pause2Completed) {
      Alert.alert('Maximum Pauses', 'You have already used 2 breaks.');
      return;
    }

    setLoading(true);
    try {
      const now = getMelbourneTimestamp();
      const updateData: any = {};

      if (!activeEntry.pause_time_start_1) {
        updateData.pause_time_start_1 = now;
      } else if (pause1Completed && !activeEntry.pause_time_start_2) {
        updateData.pause_time_start_2 = now;
      }

      const { data, error } = await supabase
        .from('time_clock')
        .update(updateData)
        .eq('id', activeEntry.id)
        .select()
        .single();

      if (error) throw error;

      setActiveEntry(data);
      setIsPaused(true);
      setCurrentPauseStart(now);
    } catch (error) {
      console.error('Error pausing:', error);
      Alert.alert('Error', 'Failed to pause.');
    } finally {
      setLoading(false);
    }
  };

  // Resume
  const handleResume = async () => {
    if (!activeEntry || !currentPauseStart) return;

    setLoading(true);
    try {
      const now = getMelbourneTimestamp();
      const pauseDuration = calculateHours(currentPauseStart, now);
      const updateData: any = {};

      if (activeEntry.pause_time_start_1 && !activeEntry.pause_time_stop_1) {
        updateData.pause_time_stop_1 = now;
        updateData.pause_duration_1 = pauseDuration;
      } else if (activeEntry.pause_time_start_2 && !activeEntry.pause_time_stop_2) {
        updateData.pause_time_stop_2 = now;
        updateData.pause_duration_2 = pauseDuration;
      }

      const { data, error } = await supabase
        .from('time_clock')
        .update(updateData)
        .eq('id', activeEntry.id)
        .select()
        .single();

      if (error) throw error;

      setActiveEntry(data);
      setIsPaused(false);
      setCurrentPauseStart(null);
    } catch (error) {
      console.error('Error resuming:', error);
      Alert.alert('Error', 'Failed to resume.');
    } finally {
      setLoading(false);
    }
  };

  // Clock Out Confirm
  const handleClockOutConfirm = async () => {
    if (!activeEntry) return;

    setShowNotesModal(false);
    setLoading(true);
    try {
      const location = await getCurrentLocation();
      const now = getMelbourneTimestamp();

      let finalPauseDuration1 = activeEntry.pause_duration_1 || 0;
      let finalPauseDuration2 = activeEntry.pause_duration_2 || 0;
      let updateData: any = {};

      if (isPaused && currentPauseStart) {
        const pauseDuration = calculateHours(currentPauseStart, now);
        
        if (!activeEntry.pause_time_start_1 || activeEntry.pause_time_stop_1) {
          updateData.pause_time_stop_2 = now;
          updateData.pause_duration_2 = pauseDuration;
          finalPauseDuration2 = pauseDuration;
        } else {
          updateData.pause_time_stop_1 = now;
          updateData.pause_duration_1 = pauseDuration;
          finalPauseDuration1 = pauseDuration;
        }
      }

      const totalDuration = calculateHours(activeEntry.job_start_time, now);
      const workedHours = Math.max(0, totalDuration - finalPauseDuration1 - finalPauseDuration2);

      updateData.job_finished_time = now;
      updateData.job_finished_location = location;
      updateData.worked_hours = workedHours;
      updateData.actual_job_hours = workedHours;
      updateData.notes = clockOutNotes || null;
      updateData.is_active = false;

      const { error } = await supabase
        .from('time_clock')
        .update(updateData)
        .eq('id', activeEntry.id);

      if (error) throw error;

      setActiveEntry(null);
      setClockOutNotes('');
      setIsPaused(false);
      setCurrentPauseStart(null);
      
      Alert.alert('Clocked Out', `You worked for ${workedHours.toFixed(2)} hours.`);
    } catch (error) {
      console.error('Error clocking out:', error);
      Alert.alert('Error', 'Failed to clock out. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const isClockedIn = !!activeEntry;

  if (initialLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <ActivityIndicator size="small" color="#0066cc" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        {/* Timer Display */}
        <View style={styles.clockContainer}>
          <View style={[
            styles.circleOuter,
            isClockedIn && styles.circleOuterActive,
            isPaused && styles.circleOuterPaused,
          ]}>
            <View style={[
              styles.circleInner,
              isClockedIn && styles.circleInnerActive,
              isPaused && styles.circleInnerPaused,
            ]}>
              {isClockedIn ? (
                <View style={styles.timerDisplay}>
                  <Text style={[styles.timerText, isPaused && styles.timerTextPaused]}>
                    {elapsedTime}
                  </Text>
                  <Text style={[styles.statusLabel, isPaused && styles.statusLabelPaused]}>
                    {isPaused ? 'PAUSED' : 'Working'}
                  </Text>
                </View>
              ) : (
                <View style={styles.notClockedIn}>
                  <Ionicons name="time-outline" size={32} color="#9CA3AF" />
                  <Text style={styles.notClockedText}>Not Clocked In</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        {!isClockedIn ? (
          <TouchableOpacity
            style={[styles.clockInButton, loading && styles.buttonDisabled]}
            onPress={handleClockIn}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="play" size={20} color="#fff" />
                <Text style={styles.buttonText}>Clock In</Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.actionButtons}>
            {/* Pause/Resume Button */}
            <TouchableOpacity
              style={[
                styles.actionButton,
                isPaused ? styles.resumeButton : styles.pauseButton,
                loading && styles.buttonDisabled
              ]}
              onPress={isPaused ? handleResume : handlePause}
              disabled={loading}
            >
              <Ionicons 
                name={isPaused ? 'play' : 'pause'} 
                size={18} 
                color={isPaused ? '#fff' : '#F59E0B'} 
              />
              <Text style={[
                styles.actionButtonText,
                isPaused ? styles.resumeButtonText : styles.pauseButtonText
              ]}>
                {isPaused ? 'Resume' : 'Pause'}
              </Text>
            </TouchableOpacity>

            {/* Clock Out Button */}
            <TouchableOpacity
              style={[styles.actionButton, styles.clockOutButton, loading && styles.buttonDisabled]}
              onPress={handleClockOutPress}
              disabled={loading}
            >
              <Ionicons name="stop" size={18} color="#fff" />
              <Text style={styles.clockOutButtonText}>Clock Out</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Clock Out Notes Modal */}
      <Modal
        visible={showNotesModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowNotesModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Clock Out</Text>
            <Text style={styles.modalSubtitle}>Add any notes (optional)</Text>

            <TextInput
              style={styles.notesInput}
              placeholder="Notes about your shift..."
              placeholderTextColor="#999"
              value={clockOutNotes}
              onChangeText={setClockOutNotes}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => {
                  setShowNotesModal(false);
                  setClockOutNotes('');
                }}
              >
                <Text style={styles.modalButtonCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={handleClockOutConfirm}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalButtonConfirmText}>Clock Out</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  clockContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  circleOuter: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#E5E7EB',
  },
  circleOuterActive: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  circleOuterPaused: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
  },
  circleInner: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  circleInnerActive: {
    backgroundColor: '#fff',
  },
  circleInnerPaused: {
    backgroundColor: '#fff',
  },
  timerDisplay: {
    alignItems: 'center',
  },
  timerText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#10B981',
    fontVariant: ['tabular-nums'],
  },
  timerTextPaused: {
    color: '#F59E0B',
  },
  statusLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#10B981',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statusLabelPaused: {
    color: '#F59E0B',
  },
  notClockedIn: {
    alignItems: 'center',
  },
  notClockedText: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 4,
  },
  clockInButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  pauseButton: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  resumeButton: {
    backgroundColor: '#10B981',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  pauseButtonText: {
    color: '#92400E',
  },
  resumeButtonText: {
    color: '#fff',
  },
  clockOutButton: {
    backgroundColor: '#EF4444',
  },
  clockOutButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
    textAlign: 'center',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
  notesInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: '#000',
    minHeight: 80,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: '#F3F4F6',
  },
  modalButtonConfirm: {
    backgroundColor: '#EF4444',
  },
  modalButtonCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  modalButtonConfirmText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});
