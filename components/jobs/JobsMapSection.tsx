import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Modal, 
  ScrollView, 
  Pressable, 
  Platform 
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, PROVIDER_DEFAULT } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { getSuburbCoordinates } from '@/lib/regions';

// Melbourne region center for map
const MELBOURNE_REGION = {
  latitude: -37.8136,
  longitude: 144.9631,
  latitudeDelta: 0.5,
  longitudeDelta: 0.5,
};

/**
 * Get coordinates for a postcode (fallback when suburb not found)
 * Only handles Victorian postcodes (3000-3999)
 */
const getPostcodeCoordinates = (postcode: string): { latitude: number; longitude: number } | null => {
  const postcodeNum = parseInt(postcode);
  
  if (isNaN(postcodeNum) || postcodeNum < 3000 || postcodeNum > 3999) {
    return null;
  }

  // Rough coordinate mapping based on postcode ranges
  if (postcodeNum >= 3000 && postcodeNum <= 3099) {
    // Inner city / CBD area
    return { 
      latitude: -37.8136 + (postcodeNum % 10) * 0.008, 
      longitude: 144.9631 + (postcodeNum % 10) * 0.008 
    };
  }
  if (postcodeNum >= 3100 && postcodeNum <= 3199) {
    // Northern/Eastern inner suburbs
    return { 
      latitude: -37.75 + (postcodeNum % 10) * 0.01, 
      longitude: 145.0 + (postcodeNum % 10) * 0.01 
    };
  }
  if (postcodeNum >= 3200 && postcodeNum <= 3299) {
    // South-eastern suburbs
    return { 
      latitude: -37.95 + (postcodeNum % 10) * 0.01, 
      longitude: 145.1 + (postcodeNum % 10) * 0.01 
    };
  }
  if (postcodeNum >= 3000 && postcodeNum <= 3099) {
    // Western suburbs
    return { 
      latitude: -37.8 + (postcodeNum % 10) * 0.01, 
      longitude: 144.7 + (postcodeNum % 10) * 0.01 
    };
  }

  // Default: approximate based on postcode
  return { 
    latitude: -37.8 + ((postcodeNum - 3000) % 100) * 0.003, 
    longitude: 144.9 + ((postcodeNum - 3000) % 100) * 0.003 
  };
};

// ============================================================================
// TYPES
// ============================================================================

interface JobsMapSectionProps {
  jobs: any[];
  onJobPress: (job: any) => void;
}

interface JobWithCoords {
  id: string;
  booking_number: string;
  selected_service: string;
  status: string;
  pricing?: any;
  duration?: string;
  customer: {
    first_name: string;
    last_name: string;
    suburb: string;
    postcode: string;
    schedule_date?: string;
    address?: string;
  } | null;
  coordinate: { latitude: number; longitude: number };
}

interface MarkerCluster {
  id: string;
  coordinate: { latitude: number; longitude: number };
  jobs: any[];
  count: number;
  primaryService: string;
  suburbs: string[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SERVICE_COLORS: Record<string, string> = {
  'Once-Off Cleaning': '#3B82F6',
  'Regular Cleaning': '#10B981',
  'NDIS Cleaning': '#8B5CF6',
  'Airbnb Cleaning': '#F59E0B',
  'End of Lease Cleaning': '#EF4444',
  'Commercial Cleaning': '#6366F1',
};


// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const getServiceColor = (service: string): string => {
  return SERVICE_COLORS[service] || '#6B7280';
};

const getHourlyRate = (serviceType: string): string | null => {
  const rateMap: Record<string, string | undefined> = {
    'Once-Off Cleaning': process.env.EXPO_PUBLIC_RATE_ONCE_OFF,
    'Regular Cleaning': process.env.EXPO_PUBLIC_RATE_REGULAR,
    'NDIS Cleaning': process.env.EXPO_PUBLIC_RATE_NDIS,
    'Airbnb Cleaning': process.env.EXPO_PUBLIC_RATE_AIRBNB,
    'Commercial Cleaning': process.env.EXPO_PUBLIC_RATE_COMMERCIAL,
  };
  return rateMap[serviceType] || null;
};

const calculateEndOfLeaseStaffAmount = (pricing: any): number => {
  let totalPrice = 0;
  if (typeof pricing === 'object' && pricing !== null) {
    totalPrice = pricing.totalPrice || pricing.total || pricing.amount || 0;
  } else if (typeof pricing === 'number') {
    totalPrice = pricing;
  }
  if (totalPrice <= 0) return 0;
  const afterGST = totalPrice * 0.9;
  const staffAmount = afterGST * 0.6;
  return Math.round(staffAmount);
};

const calculateEndOfLeaseHours = (staffAmount: number): string => {
  if (staffAmount <= 0) return 'TBD';
  const hours = staffAmount / 30;
  // Round to nearest 0.5
  const roundedHours = Math.round(hours * 2) / 2;
  return `${roundedHours} hours`;
};

const getJobPrice = (job: any): string => {
  if (job.selected_service === 'End of Lease Cleaning') {
    if (job.pricing) {
      const staffAmount = calculateEndOfLeaseStaffAmount(job.pricing);
      if (staffAmount > 0) return `$${staffAmount}`;
    }
    return 'N/A';
  }
  const hourlyRate = getHourlyRate(job.selected_service);
  return hourlyRate ? `$${hourlyRate}/hr` : 'N/A';
};

const formatDateShort = (dateString: string): string => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const options: Intl.DateTimeFormatOptions = { 
    weekday: 'short', 
    day: 'numeric', 
    month: 'short' 
  };
  return date.toLocaleDateString('en-AU', options);
};

const formatDate = (dateString: string): string => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const options: Intl.DateTimeFormatOptions = { 
    weekday: 'short', 
    day: 'numeric', 
    month: 'short' 
  };
  return date.toLocaleDateString('en-AU', options);
};

/**
 * Get Once-Off Cleaning tag based on basePrice
 * 161 = blank, 225 = Deep Cleaning, 188 = Move-in Cleaning
 */
const getOnceOffTag = (pricing: any): string => {
  if (!pricing) return '';
  const basePrice = pricing.basePrice || pricing.base_price || 0;
  
  if (basePrice === 225) return 'Deep Cleaning';
  if (basePrice === 188) return 'Move-in Cleaning';
  // 161 or any other value = blank
  return '';
};


const getMostCommonService = (services: string[]): string => {
  if (services.length === 0) return 'Regular Cleaning';
  
  const counts: { [key: string]: number } = {};
  services.forEach(service => {
    counts[service] = (counts[service] || 0) + 1;
  });
  
  return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function JobsMapSection({ jobs, onJobPress }: JobsMapSectionProps) {
  const [selectedCluster, setSelectedCluster] = useState<MarkerCluster | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [locationPermission, setLocationPermission] = useState<boolean>(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [currentRegion, setCurrentRegion] = useState(MELBOURNE_REGION);
  const [geocodedJobs, setGeocodedJobs] = useState<{ [jobId: string]: { latitude: number; longitude: number } }>({});
  
  const mapRef = useRef<MapView>(null);
  const permissionChecked = useRef(false);
  const geocodeCache = useRef<{ [key: string]: { latitude: number; longitude: number } }>({});

  // Empty state
  if (jobs.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="map-outline" size={64} color="#0066cc" />
        <Text style={styles.emptyText}>No jobs on map</Text>
        <Text style={styles.emptySubtext}>Jobs will appear here when available</Text>
      </View>
    );
  }

  // Request location permission once on mount
  useEffect(() => {
    if (permissionChecked.current) return;
    permissionChecked.current = true;

    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === 'granted') {
          setLocationPermission(true);
          const location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          setUserLocation({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          });
        } else {
          const { status: newStatus } = await Location.requestForegroundPermissionsAsync();
          if (newStatus === 'granted') {
            setLocationPermission(true);
            const location = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            setUserLocation({
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            });
          }
        }
      } catch (error) {
        console.log('Location permission error:', error);
      }
    })();
  }, []);

  // Geocode addresses when jobs change
  useEffect(() => {
    const geocodeJobs = async () => {
      const newGeocodedJobs: { [jobId: string]: { latitude: number; longitude: number } } = {};
      
      for (const job of jobs) {
        if (!job.customer) continue;
        
        // Use address field directly (already contains full address)
        const address = job.customer.address;
        
        if (!address) {
          // No address - use fallback
          newGeocodedJobs[job.id] = getFallbackCoordinates(job);
          continue;
        }
        
        // Check cache first
        if (geocodeCache.current[address]) {
          newGeocodedJobs[job.id] = geocodeCache.current[address];
          continue;
        }
        
        try {
          // Try geocoding the address
          const results = await Location.geocodeAsync(address);
          if (results && results.length > 0) {
            const coords = {
              latitude: results[0].latitude,
              longitude: results[0].longitude,
            };
            geocodeCache.current[address] = coords;
            newGeocodedJobs[job.id] = coords;
          } else {
            // Geocoding returned empty - use fallback
            newGeocodedJobs[job.id] = getFallbackCoordinates(job);
          }
        } catch (error) {
          // Geocoding failed - use fallback
          newGeocodedJobs[job.id] = getFallbackCoordinates(job);
        }
      }
      
      setGeocodedJobs(newGeocodedJobs);
    };
    
    if (jobs.length > 0) {
      geocodeJobs();
    }
  }, [jobs]);

  /**
   * Fallback coordinates when geocoding fails
   * Priority: 1. Suburb lookup from regions.ts, 2. Postcode-based calculation
   */
  const getFallbackCoordinates = (job: any): { latitude: number; longitude: number } => {
    const suburb = job.customer?.suburb;
    const postcode = job.customer?.postcode;
    
    // First: Try suburb lookup from regions.ts
    if (suburb) {
      const suburbCoords = getSuburbCoordinates(suburb);
      if (suburbCoords) {
        return {
          latitude: suburbCoords.lat,
          longitude: suburbCoords.lng,
        };
      }
    }
    
    // Second: Use postcode-based coordinates
    if (postcode) {
      const postcodeCoords = getPostcodeCoordinates(postcode);
      if (postcodeCoords) {
        return postcodeCoords;
      }
    }
    
    // Last resort: Melbourne center (should rarely happen)
    return {
      latitude: MELBOURNE_REGION.latitude,
      longitude: MELBOURNE_REGION.longitude,
    };
  };

  const getJobCoordinates = (job: any): { latitude: number; longitude: number } => {
    if (geocodedJobs[job.id]) {
      return geocodedJobs[job.id];
    }
    return getFallbackCoordinates(job);
  };

  const getDistance = (
    coord1: { latitude: number; longitude: number },
    coord2: { latitude: number; longitude: number }
  ): number => {
    const latDiff = coord1.latitude - coord2.latitude;
    const lngDiff = coord1.longitude - coord2.longitude;
    return Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
  };

  const clusterJobs = (): MarkerCluster[] => {
    const clusterRadius = currentRegion.latitudeDelta * 0.06;
    
    const jobsWithCoords: JobWithCoords[] = jobs.map(job => ({
      ...job,
      coordinate: getJobCoordinates(job),
    }));

    const clusters: MarkerCluster[] = [];
    const clustered = new Set<string>();

    jobsWithCoords.forEach((job) => {
      if (clustered.has(job.id)) return;

      const nearbyJobs = jobsWithCoords.filter((otherJob) => {
        if (clustered.has(otherJob.id)) return false;
        const distance = getDistance(job.coordinate, otherJob.coordinate);
        return distance <= clusterRadius;
      });

      nearbyJobs.forEach((j) => clustered.add(j.id));

      const centerLat = nearbyJobs.reduce((sum, j) => sum + j.coordinate.latitude, 0) / nearbyJobs.length;
      const centerLng = nearbyJobs.reduce((sum, j) => sum + j.coordinate.longitude, 0) / nearbyJobs.length;

      const suburbs = [...new Set(nearbyJobs.map(j => j.customer?.suburb || 'Unknown'))];
      const serviceTypes = nearbyJobs.map(j => j.selected_service);
      const primaryService = getMostCommonService(serviceTypes);

      clusters.push({
        id: `cluster-${job.id}`,
        coordinate: { latitude: centerLat, longitude: centerLng },
        jobs: nearbyJobs,
        count: nearbyJobs.length,
        primaryService,
        suburbs,
      });
    });

    return clusters;
  };

  const markers = clusterJobs();

  const handleMarkerPress = (cluster: MarkerCluster) => {
    if (cluster.count === 1) {
      onJobPress(cluster.jobs[0]);
    } else {
      setSelectedCluster(cluster);
      setModalVisible(true);
    }
  };

  const handleRegionChange = (region: typeof MELBOURNE_REGION) => {
    setCurrentRegion(region);
  };

  const closeModal = () => {
    setModalVisible(false);
    setSelectedCluster(null);
  };

  const getMarkerSize = (count: number): number => {
    if (count >= 7) return 65;
    if (count >= 5) return 55;
    if (count >= 3) return 48;
    if (count >= 2) return 42;
    return 38;
  };

  const goToMyLocation = async () => {
    try {
      if (userLocation) {
        mapRef.current?.animateToRegion({
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }, 500);
      } else if (locationPermission) {
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setUserLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
        mapRef.current?.animateToRegion({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }, 500);
      }
    } catch (error) {
      console.log('Error getting location:', error);
    }
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={Platform.OS === 'ios' ? PROVIDER_DEFAULT : PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={MELBOURNE_REGION}
        showsUserLocation={locationPermission}
        showsMyLocationButton={false}
        mapType="standard"
        showsPointsOfInterest={false}
        showsBuildings={false}
        showsTraffic={false}
        showsIndoors={false}
        showsCompass={false}
        pitchEnabled={false}
        rotateEnabled={false}
        onRegionChangeComplete={handleRegionChange}
      >
        {markers.map((marker) => {
          const size = getMarkerSize(marker.count);
          const color = getServiceColor(marker.primaryService);
          const isSingleJob = marker.count === 1;

          return (
            <Marker
              key={marker.id}
              coordinate={marker.coordinate}
              onPress={() => handleMarkerPress(marker)}
              anchor={{ x: 0.5, y: isSingleJob ? 1 : 0.5 }}
              centerOffset={{ x: 0, y: 0 }}
              tracksViewChanges={false}
            >
              {isSingleJob ? (
                <View style={styles.pinMarker}>
                  <Ionicons 
                    name="location" 
                    size={40} 
                    color={color} 
                    style={styles.pinIcon}
                  />
                </View>
              ) : (
                <View
                  style={[
                    styles.customMarker,
                    {
                      width: size,
                      height: size,
                      backgroundColor: color,
                    },
                  ]}
                >
                  <View style={styles.markerTextContainer}>
                    <Text style={styles.markerText}>{marker.count}</Text>
                  </View>
                </View>
              )}
            </Marker>
          );
        })}
      </MapView>

      {/* Custom My Location Button */}
      {locationPermission && (
        <TouchableOpacity
          style={styles.myLocationButton}
          onPress={goToMyLocation}
          activeOpacity={0.8}
        >
          <Ionicons name="locate" size={22} color="#0066cc" />
        </TouchableOpacity>
      )}

      {/* Cluster Jobs Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={closeModal}
      >
        <Pressable style={styles.modalOverlay} onPress={closeModal}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <TouchableOpacity style={styles.modalCloseButton} onPress={closeModal}>
              <Ionicons name="close" size={24} color="#6B7280" />
            </TouchableOpacity>

            {selectedCluster && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.modalHeader}>
                  <Ionicons name="location" size={28} color="#FF6B35" />
                  <View style={styles.modalHeaderText}>
                    <Text style={styles.modalTitle}>
                      {selectedCluster.suburbs.length === 1 
                        ? selectedCluster.suburbs[0] 
                        : `${selectedCluster.suburbs.length} Areas`}
                    </Text>
                    <Text style={styles.modalSubtitle}>
                      {selectedCluster.count}{' '}
                      {selectedCluster.count === 1 ? 'job' : 'jobs'} available
                    </Text>
                    {selectedCluster.suburbs.length > 1 && (
                      <Text style={styles.modalSuburbsList}>
                        {selectedCluster.suburbs.slice(0, 3).join(', ')}
                        {selectedCluster.suburbs.length > 3 && ` +${selectedCluster.suburbs.length - 3} more`}
                      </Text>
                    )}
                  </View>
                </View>

                <View style={styles.jobsList}>
                  {selectedCluster.jobs.map((job) => {
                    const serviceColor = getServiceColor(job.selected_service);
                    const customerName = job.customer 
                      ? `${job.customer.first_name} ${job.customer.last_name}` 
                      : 'Customer';
                    const location = job.customer?.suburb 
                      ? `${job.customer.suburb}, ${job.customer.postcode}` 
                      : 'N/A';
                    const scheduleDate = job.customer?.schedule_date 
                      ? formatDateShort(job.customer.schedule_date) 
                      : '';
                    const hourlyRate = getHourlyRate(job.selected_service);
                    const priceDisplay = hourlyRate ? `$${hourlyRate}/hr` : 'N/A';
                    
                    // Service-specific content renderer
                    const renderCardContent = () => {
                      switch (job.selected_service) {
                        // ==================== REGULAR CLEANING ====================
                        case 'Regular Cleaning':
                          return (
                            <>
                              <View style={styles.cardRow}>
                                <Text style={styles.customerName}>{customerName}</Text>
                                <Text style={styles.priceText}>{priceDisplay}</Text>
                              </View>
                              <View style={styles.cardRow}>
                                <View style={styles.locationRow}>
                                  <Ionicons name="location-outline" size={14} color="#6B7280" />
                                  <Text style={styles.cardInfoText}>{location}</Text>
                                </View>
                                <Text style={styles.dateText}>{scheduleDate}</Text>
                              </View>
                              <View style={styles.cardRow}>
                                <View style={styles.locationRow}>
                                  <Ionicons name="time-outline" size={14} color="#6B7280" />
                                  <Text style={styles.cardInfoText}>
                                    {job.duration || 'TBD'}
                                    {job.frequency && ` • ${job.frequency}`}
                                  </Text>
                                </View>
                              </View>
                            </>
                          );

                        // ==================== NDIS CLEANING ====================
                        case 'NDIS Cleaning': {
                          return (
                            <>
                              <View style={styles.cardRow}>
                                <Text style={styles.customerName}>{customerName}</Text>
                                <Text style={styles.priceText}>{priceDisplay}</Text>
                              </View>
                              <View style={styles.cardRow}>
                                <View style={styles.locationRow}>
                                  <Ionicons name="location-outline" size={14} color="#6B7280" />
                                  <Text style={styles.cardInfoText}>{location}</Text>
                                </View>
                                <Text style={styles.dateText}>{scheduleDate}</Text>
                              </View>
                              <View style={styles.cardRow}>
                                <View style={styles.locationRow}>
                                  <Ionicons name="time-outline" size={14} color="#6B7280" />
                                  <Text style={styles.cardInfoText}>
                                    {job.duration || 'TBD'}
                                    {job.is_recurring && job.frequency && ` • ${job.frequency}`}
                                  </Text>
                                </View>
                              </View>
                            </>
                          );
                        }

                        // ==================== ONCE-OFF CLEANING ====================
                        case 'Once-Off Cleaning':
                          return (
                            <>
                              <View style={styles.cardRow}>
                                <Text style={styles.customerName}>{customerName}</Text>
                                <Text style={styles.priceText}>{priceDisplay}</Text>
                              </View>
                              <View style={styles.cardRow}>
                                <View style={styles.locationRow}>
                                  <Ionicons name="location-outline" size={14} color="#6B7280" />
                                  <Text style={styles.cardInfoText}>{location}</Text>
                                </View>
                                <Text style={styles.dateText}>{scheduleDate}</Text>
                              </View>
                              <View style={styles.cardRow}>
                                <View style={styles.locationRow}>
                                  <Ionicons name="time-outline" size={14} color="#6B7280" />
                                  <Text style={styles.cardInfoText}>{job.duration || 'TBD'}</Text>
                                </View>
                              </View>
                            </>
                          );

                        // ==================== AIRBNB CLEANING ====================
                        case 'Airbnb Cleaning':
                          return (
                            <>
                              <View style={styles.cardRow}>
                                <Text style={styles.customerName}>{customerName}</Text>
                                <Text style={styles.priceText}>{priceDisplay}</Text>
                              </View>
                              <View style={styles.cardRow}>
                                <View style={styles.locationRow}>
                                  <Ionicons name="location-outline" size={14} color="#6B7280" />
                                  <Text style={styles.cardInfoText}>{location}</Text>
                                </View>
                                <Text style={styles.dateText}>{scheduleDate}</Text>
                              </View>
                              <View style={styles.cardRow}>
                                <View style={styles.locationRow}>
                                  <Ionicons name="time-outline" size={14} color="#6B7280" />
                                  <Text style={styles.cardInfoText}>{job.duration || 'TBD'}</Text>
                                </View>
                              </View>
                            </>
                          );

                        // ==================== END OF LEASE CLEANING ====================
                        case 'End of Lease Cleaning': {
                          const staffAmount = calculateEndOfLeaseStaffAmount(job.pricing);
                          const estimatedHours = calculateEndOfLeaseHours(staffAmount);
                          return (
                            <>
                              <View style={styles.cardRow}>
                                <Text style={styles.customerName}>{customerName}</Text>
                                <Text style={styles.priceText}>${staffAmount}</Text>
                              </View>
                              <View style={styles.cardRow}>
                                <View style={styles.locationRow}>
                                  <Ionicons name="location-outline" size={14} color="#6B7280" />
                                  <Text style={styles.cardInfoText}>{location}</Text>
                                </View>
                                <Text style={styles.dateText}>{scheduleDate}</Text>
                              </View>
                              <View style={styles.cardRow}>
                                <View style={styles.locationRow}>
                                  <Ionicons name="time-outline" size={14} color="#6B7280" />
                                  <Text style={styles.cardInfoText}>{estimatedHours} • <Text style={styles.estimatedText}>estimated</Text></Text>
                                </View>
                              </View>
                            </>
                          );
                        }

                        // ==================== COMMERCIAL CLEANING ====================
                        case 'Commercial Cleaning':
                          return (
                            <>
                              <View style={styles.cardRow}>
                                <Text style={styles.customerName}>{customerName}</Text>
                                <Text style={styles.priceText}>{priceDisplay}</Text>
                              </View>
                              <View style={styles.cardRow}>
                                <View style={styles.locationRow}>
                                  <Ionicons name="location-outline" size={14} color="#6B7280" />
                                  <Text style={styles.cardInfoText}>{location}</Text>
                                </View>
                              </View>
                              {job.duration && (
                                <View style={styles.cardRow}>
                                  <View style={styles.locationRow}>
                                    <Ionicons name="time-outline" size={14} color="#6B7280" />
                                    <Text style={styles.cardInfoText}>
                                      {job.duration}
                                      {job.frequency && ` • ${job.frequency}`}
                                    </Text>
                                  </View>
                                </View>
                              )}
                            </>
                          );

                        // ==================== DEFAULT ====================
                        default:
                          return (
                            <>
                              <View style={styles.cardRow}>
                                <Text style={styles.customerName}>{customerName}</Text>
                                <Text style={styles.priceText}>{priceDisplay}</Text>
                              </View>
                              <View style={styles.cardRow}>
                                <View style={styles.locationRow}>
                                  <Ionicons name="location-outline" size={14} color="#6B7280" />
                                  <Text style={styles.cardInfoText}>{location}</Text>
                                </View>
                              </View>
                            </>
                          );
                      }
                    };

                    return (
                      <TouchableOpacity
                        key={job.id}
                        style={styles.jobCard}
                        onPress={() => {
                          closeModal();
                          onJobPress(job);
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.cardLeftBorder, { backgroundColor: serviceColor }]} />

                        <View style={[styles.serviceBadge, { backgroundColor: serviceColor }]}>
                          <Text style={styles.serviceBadgeText}>
                            {job.selected_service.replace(' Cleaning', '')}
                          </Text>
                        </View>

                        <View style={styles.cardContent}>
                          {renderCardContent()}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
  },
  map: {
    flex: 1,
    width: '100%',
    height: '100%',
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
  myLocationButton: {
    position: 'absolute',
    bottom: 20,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  customMarker: {
    borderRadius: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
    borderWidth: 3,
    borderColor: '#fff',
    overflow: 'hidden',
  },
  markerTextContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  markerText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    includeFontPadding: false,
  },
  pinMarker: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  pinIcon: {
    opacity: 0.85,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
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
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
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
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 20,
    borderBottomWidth: 2,
    borderBottomColor: '#E5E7EB',
    marginBottom: 16,
  },
  modalHeaderText: {
    flex: 1,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '600',
  },
  modalSuburbsList: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
    marginTop: 4,
  },
  jobsList: {
    gap: 12,
  },
  jobCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 12,
    paddingTop: 20,
    position: 'relative',
    overflow: 'visible',
  },
  cardLeftBorder: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },
  serviceBadge: {
    position: 'absolute',
    top: -8,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 4,
  },
  serviceBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  cardContent: {
    gap: 6,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  customerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    marginRight: 8,
  },
  priceText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF6B35',
  },
  dateText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  cardInfoText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  estimatedText: {
    fontStyle: 'italic',
    color: '#9CA3AF',
  },
});
