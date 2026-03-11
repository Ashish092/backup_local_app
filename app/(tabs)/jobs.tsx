import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { useLocalSearchParams, useRouter } from 'expo-router';

// Components
import { OpenJobsList, JobsMapSection, RequestedJobsList, JobDetailsPanel, BookingJob, ServiceFilterType } from '@/components/jobs';

// ============================================================================
// CONSTANTS
// ============================================================================

type JobTabType = 'open' | 'requested' | 'map';

const SERVICE_TYPES: { value: ServiceFilterType; label: string }[] = [
  { value: 'all', label: 'All Services' },
  { value: 'Once-Off Cleaning', label: 'Once-Off' },
  { value: 'Regular Cleaning', label: 'Regular' },
  { value: 'NDIS Cleaning', label: 'NDIS' },
  { value: 'Airbnb Cleaning', label: 'Airbnb' },
  { value: 'End of Lease Cleaning', label: 'End of Lease' },
  { value: 'Commercial Cleaning', label: 'Commercial' },
];

const SERVICE_COLORS: Record<string, string> = {
  'Once-Off Cleaning': '#3B82F6',
  'Regular Cleaning': '#10B981',
  'NDIS Cleaning': '#8B5CF6',
  'Airbnb Cleaning': '#F59E0B',
  'End of Lease Cleaning': '#EF4444',
  'Commercial Cleaning': '#6366F1',
};

const getServiceColor = (service: string): string => {
  return SERVICE_COLORS[service] || '#6B7280';
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function JobsScreen() {
  const { userProfile } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ bookingNumber?: string }>();
  
  // Tab state
  const [activeJobTab, setActiveJobTab] = useState<JobTabType>('open');
  const [serviceFilter, setServiceFilter] = useState<ServiceFilterType>('all');
  const [showFilterModal, setShowFilterModal] = useState(false);
  
  // Job details modal state
  const [selectedJob, setSelectedJob] = useState<BookingJob | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  
  // Jobs data for map view
  const [allJobs, setAllJobs] = useState<BookingJob[]>([]);
  
  // Pending booking number from notification navigation
  const [pendingBookingNumber, setPendingBookingNumber] = useState<string | null>(null);

  // ============================================================================
  // EFFECTS
  // ============================================================================

  // Handle booking number from navigation params (from notification tap)
  useEffect(() => {
    if (params.bookingNumber) {
      console.log('📍 Jobs tab received bookingNumber:', params.bookingNumber);
      setPendingBookingNumber(params.bookingNumber);
      // Ensure we're on the 'open' tab to see available jobs
      setActiveJobTab('open');
      // Clear the param to prevent re-triggering
      router.setParams({ bookingNumber: undefined });
    }
  }, [params.bookingNumber]);

  // Auto-open job details when pending booking number is set and jobs are loaded
  useEffect(() => {
    if (pendingBookingNumber && allJobs.length > 0) {
      const job = allJobs.find(j => j.booking_number === pendingBookingNumber);
      if (job) {
        console.log('📍 Auto-opening job details for:', pendingBookingNumber);
        openJobDetails(job);
        setPendingBookingNumber(null);
      }
    }
  }, [pendingBookingNumber, allJobs]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const openJobDetails = (job: BookingJob) => {
    setSelectedJob(job);
    setModalVisible(true);
  };

  const closeJobDetails = () => {
    setModalVisible(false);
    setSelectedJob(null);
  };

  const handleDataLoaded = (jobs: BookingJob[]) => {
    setAllJobs(jobs);
  };

  const handleRequestSuccess = () => {
    // Optionally refresh data after successful request
    // The list components will handle their own refresh
  };

  // Filter jobs for map view
  const filteredJobsForMap = allJobs.filter(job => {
    if (serviceFilter === 'all') return true;
    return job.selected_service === serviceFilter;
  });

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header with Filter */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>New Jobs</Text>
        <TouchableOpacity 
          style={[styles.filterButton, serviceFilter !== 'all' && styles.filterButtonActive]}
          onPress={() => setShowFilterModal(true)}
        >
          <Ionicons name="filter" size={16} color={serviceFilter !== 'all' ? '#fff' : '#6B7280'} />
          <Text style={[styles.filterButtonText, serviceFilter !== 'all' && styles.filterButtonTextActive]}>
            {serviceFilter === 'all' ? 'Filter' : SERVICE_TYPES.find(s => s.value === serviceFilter)?.label}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Job Tabs */}
      <View style={styles.jobTabsContainer}>
        <TouchableOpacity
          style={[styles.jobTab, activeJobTab === 'open' && styles.jobTabActive]}
          onPress={() => setActiveJobTab('open')}
        >
          <Text style={[styles.jobTabText, activeJobTab === 'open' && styles.jobTabTextActive]}>
            List
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.jobTab, activeJobTab === 'map' && styles.jobTabActive]}
          onPress={() => setActiveJobTab('map')}
        >
          <Text style={[styles.jobTabText, activeJobTab === 'map' && styles.jobTabTextActive]}>
            Map
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.jobTab, activeJobTab === 'requested' && styles.jobTabActive]}
          onPress={() => setActiveJobTab('requested')}
        >
          <Text style={[styles.jobTabText, activeJobTab === 'requested' && styles.jobTabTextActive]}>
            Requested
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tab Content */}
      {activeJobTab === 'open' && (
        <OpenJobsList
          serviceFilter={serviceFilter}
          onJobPress={openJobDetails}
          onDataLoaded={handleDataLoaded}
        />
      )}

      {activeJobTab === 'map' && (
        <JobsMapSection
          jobs={filteredJobsForMap}
          onJobPress={openJobDetails}
        />
      )}

      {activeJobTab === 'requested' && (
        userProfile?.id ? (
          <RequestedJobsList 
            userId={userProfile.id} 
          />
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="person-outline" size={64} color="#0066cc" />
            <Text style={styles.emptyText}>Please login</Text>
            <Text style={styles.emptySubtext}>Login to see your requested jobs</Text>
          </View>
        )
      )}

      {/* Job Details Modal - handles its own bid logic */}
      <JobDetailsPanel
        job={selectedJob}
        visible={modalVisible}
        onClose={closeJobDetails}
        userId={userProfile?.id}
        onRequestSuccess={handleRequestSuccess}
      />

      {/* Service Filter Modal */}
      <Modal
        visible={showFilterModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowFilterModal(false)}
      >
        <Pressable 
          style={styles.filterModalOverlay}
          onPress={() => setShowFilterModal(false)}
        >
          <View style={styles.filterModalContent}>
            <View style={styles.filterModalHeader}>
              <Text style={styles.filterModalTitle}>Filter by Service</Text>
              <TouchableOpacity onPress={() => setShowFilterModal(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <View style={styles.filterOptions}>
              {SERVICE_TYPES.map((service) => (
                <TouchableOpacity
                  key={service.value}
                  style={[
                    styles.filterOption,
                    serviceFilter === service.value && styles.filterOptionActive,
                  ]}
                  onPress={() => {
                    setServiceFilter(service.value);
                    setShowFilterModal(false);
                  }}
                >
                  {service.value !== 'all' && (
                    <View style={[styles.filterDot, { backgroundColor: getServiceColor(service.value) }]} />
                  )}
                  <Text style={[
                    styles.filterOptionText,
                    serviceFilter === service.value && styles.filterOptionTextActive,
                  ]}>
                    {service.label}
                  </Text>
                  {serviceFilter === service.value && (
                    <Ionicons name="checkmark" size={20} color="#0066cc" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
  },
  filterButtonActive: {
    backgroundColor: '#0066cc',
  },
  filterButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  filterButtonTextActive: {
    color: '#fff',
  },
  jobTabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 16,
    gap: 8,
  },
  jobTab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  jobTabActive: {
    backgroundColor: '#0066cc',
  },
  jobTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  jobTabTextActive: {
    color: '#fff',
  },
  emptyState: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 60,
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  // Filter Modal Styles
  filterModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterModalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '85%',
    maxWidth: 340,
    overflow: 'hidden',
  },
  filterModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  filterModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  filterOptions: {
    padding: 8,
  },
  filterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 10,
  },
  filterOptionActive: {
    backgroundColor: '#EFF6FF',
  },
  filterDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  filterOptionText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  filterOptionTextActive: {
    color: '#0066cc',
    fontWeight: '600',
  },
});
