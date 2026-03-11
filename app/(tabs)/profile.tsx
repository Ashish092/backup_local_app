import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import PaymentRecordsList from '@/components/Profile/PaymentRecordsList';

export default function ProfileScreen() {
  const router = useRouter();
  const { userProfile, signOut, refreshProfile } = useAuth();
  const [showEditModal, setShowEditModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
  });

  const handleLogout = async () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Logout',
        onPress: async () => {
          try {
            await signOut();
            await new Promise(resolve => setTimeout(resolve, 200));
            router.replace('/auth/login');
          } catch (error) {
            console.error('Logout error:', error);
            router.replace('/auth/login');
          }
        },
        style: 'destructive',
      },
    ]);
  };

  const openEditModal = () => {
    setFormData({
      first_name: userProfile?.first_name || '',
      last_name: userProfile?.last_name || '',
    });
    setShowEditModal(true);
  };

  const handleUpdateProfile = async () => {
    if (!formData.first_name.trim()) {
      Alert.alert('Error', 'First name is required');
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase
        .from('users')
        .update({
          first_name: formData.first_name.trim(),
          last_name: formData.last_name.trim() || null,
        })
        .eq('id', userProfile?.id);

      if (error) throw error;

      await refreshProfile();
      
      Alert.alert('Success', 'Profile updated successfully!');
      setShowEditModal(false);
    } catch (error) {
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'Failed to update profile'
      );
    } finally {
      setLoading(false);
    }
  };

  const displayPin = userProfile?.pin ? (showPin ? userProfile.pin : '••••') : 'Not set';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
            <Text style={styles.avatarText}>
              {userProfile?.first_name?.charAt(0).toUpperCase() || userProfile?.email?.charAt(0).toUpperCase() || 'U'}
            </Text>
          </View>

          <Text style={styles.name}>
            {userProfile?.first_name || userProfile?.last_name 
              ? `${userProfile?.first_name || ''} ${userProfile?.last_name || ''}`.trim()
              : 'User'}
          </Text>
          <Text style={styles.email}>{userProfile?.email || ''}</Text>

          <TouchableOpacity style={styles.editProfileButton} onPress={openEditModal}>
            <Text style={styles.editProfileButtonText}>Edit profile</Text>
          </TouchableOpacity>
        </View>

        {/* Contact Information */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Contact</Text>
          <View style={styles.card}>
            <View style={styles.infoRow}>
              <Text style={styles.infoText}>
                {userProfile?.email || 'Email not set'}
              </Text>
            </View>
            <View style={styles.cardDivider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoText}>
                {userProfile?.phone || 'Phone not set'}
              </Text>
            </View>
          </View>
        </View>

        {/* Quick Actions Section */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Quick Actions</Text>
          <View style={styles.card}>
            <TouchableOpacity 
              style={styles.menuItem} 
              onPress={() => router.push('/time-clock')}
            >
              <View style={styles.menuItemLeft}>
                <View style={styles.iconContainer}>
                  <Ionicons name="time-outline" size={20} color="#666" />
                </View>
                <Text style={styles.menuItemText}>My Time Clock</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#666" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Preferences Section */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Preferences</Text>
          <View style={styles.card}>
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => setShowPin(!showPin)}
            >
              <View style={styles.menuItemLeft}>
                <View style={styles.iconContainer}>
                  <Ionicons name="lock-closed-outline" size={20} color="#666" />
                </View>
                <Text style={styles.menuItemText}>PIN Code</Text>
              </View>
              <View style={styles.menuItemRight}>
                <Text style={styles.pinText}>{displayPin}</Text>
                <TouchableOpacity onPress={() => setShowPin(!showPin)}>
                  <Ionicons 
                    name={showPin ? "eye-off-outline" : "eye-outline"} 
                    size={20} 
                    color="#666" 
                  />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>

            <View style={styles.cardDivider} />

            <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
              <View style={styles.menuItemLeft}>
                <View style={styles.iconContainer}>
                  <Ionicons name="log-out-outline" size={20} color="#EF4444" />
                </View>
                <Text style={[styles.menuItemText, { color: '#EF4444' }]}>Logout</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Payment Records */}
        <View style={styles.paymentSection}>
          <PaymentRecordsList />
        </View>

        {/* Edit Profile Modal */}
        <Modal
          visible={showEditModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowEditModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Edit Profile</Text>
                <TouchableOpacity
                  onPress={() => setShowEditModal(false)}
                  style={styles.closeButton}
                >
                  <Text style={styles.closeButtonText}>×</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.modalBody}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>First Name *</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.first_name}
                    onChangeText={(text) =>
                      setFormData({ ...formData, first_name: text })
                    }
                    placeholder="Enter your first name"
                    editable={!loading}
                    placeholderTextColor="#9CA3AF"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Last Name</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.last_name}
                    onChangeText={(text) =>
                      setFormData({ ...formData, last_name: text })
                    }
                    placeholder="Enter your last name"
                    editable={!loading}
                    placeholderTextColor="#9CA3AF"
                  />
                </View>

                <View style={styles.modalNote}>
                  <Text style={styles.modalNoteText}>
                    Email and phone number cannot be changed from this screen.
                  </Text>
                </View>
              </View>

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setShowEditModal(false)}
                  disabled={loading}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.saveButton, loading && styles.saveButtonDisabled]}
                  onPress={handleUpdateProfile}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.saveButtonText}>Save Changes</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  profileHeader: {
    backgroundColor: '#fff',
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#A8E6CF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    color: '#000',
    fontSize: 32,
    fontWeight: '600',
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  editProfileButton: {
    backgroundColor: '#000',
    paddingHorizontal: 32,
    paddingVertical: 10,
    borderRadius: 20,
  },
  editProfileButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#999',
    marginBottom: 8,
    paddingLeft: 4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  infoRow: {
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  infoText: {
    fontSize: 15,
    color: '#000',
    fontWeight: '400',
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginLeft: 16,
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuItemText: {
    fontSize: 15,
    color: '#000',
    fontWeight: '400',
  },
  menuItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pinText: {
    fontSize: 15,
    color: '#666',
    fontWeight: '500',
    letterSpacing: 2,
  },
  paymentSection: {
    paddingHorizontal: 20,
    marginBottom: 32,
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
    paddingBottom: 40,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 28,
    color: '#6B7280',
    fontWeight: '300',
    marginTop: -2,
  },
  modalBody: {
    padding: 24,
    gap: 20,
  },
  inputGroup: {
    gap: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    backgroundColor: '#F9FAFB',
    color: '#111827',
  },
  modalNote: {
    backgroundColor: '#F9FAFB',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  modalNoteText: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#111827',
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
