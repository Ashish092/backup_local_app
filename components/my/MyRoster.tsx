import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  Dimensions,
  Animated,
  PanResponder,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase, bookingSupabase } from '@/lib/supabase';
import { RecurringInstanceCard } from './DetailsPanel';
import MyJobDetailsPanel from './MyJobDetailsPanel';
import {
  getServiceColor,
  getHourlyRate,
  calculateEndOfLeaseStaffAmount,
  calculateEndOfLeaseHours,
  formatDateShort,
  getJobStatusTag,
} from '@/lib/jobUtils';

const SCREEN_WIDTH = Dimensions.get('window').width;

// ============================================================================
// TYPES
// ============================================================================

export interface MyJob {
  id: string;
  display_id?: string;
  booking_id: string;
  job_status: string;
  is_recurring: boolean;
  assigned_to?: string;
  assigned_at: string;
  booking_number: string;
  selected_service: string;
  status: string;
  pricing?: any;
  service_details_id?: string;
  duration?: string;
  frequency?: string;
  customer: {
    first_name: string;
    last_name: string;
    suburb: string;
    postcode: string;
    schedule_date: string;
    phone?: string;
    address?: string;
  } | null;
  recurring_instance?: {
    id: string;
    instance_number: number;
    instance_date: string;
    instance_booking_number: string;
    job_status: string;
    assigned_to: string | null;
  } | null;
}

interface DayInfo {
  date: Date;
  dateString: string;
  dayName: string;
  dayNumber: number;
  isToday: boolean;
  isCurrentMonth?: boolean;
}

interface MyRosterProps {
  userId: string;
  userFirstName?: string;
  userLastName?: string;
  onShiftPress?: (bookingNumber: string) => void;
  refreshKey?: number;
  onJobStatusChange?: () => void;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function MyRoster({ 
  userId, 
  userFirstName, 
  userLastName,
  onShiftPress,
  refreshKey,
  onJobStatusChange,
}: MyRosterProps) {
  // Data state
  const [myJobs, setMyJobs] = useState<MyJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedJob, setSelectedJob] = useState<MyJob | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Calendar state
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [currentWeekDays, setCurrentWeekDays] = useState<DayInfo[]>([]);
  const [showMonthlyView, setShowMonthlyView] = useState(false);
  const [monthlyViewDate, setMonthlyViewDate] = useState<Date>(new Date());

  // Scroll state
  const scrollViewRef = useRef<ScrollView>(null);
  const [datePositions, setDatePositions] = useState<{ [key: string]: number }>({});
  const lastScrollUpdate = useRef<number>(0);
  const pendingDateUpdate = useRef<string | null>(null);

  // Pull down animation for monthly view
  const pullDownAnim = useRef(new Animated.Value(0)).current;
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dy > 8 && Math.abs(gestureState.dx) < 20;
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          pullDownAnim.setValue(Math.min(gestureState.dy * 0.5, 60));
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 50) {
          setShowMonthlyView(true);
        }
        Animated.spring(pullDownAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 100,
          friction: 10,
        }).start();
      },
    })
  ).current;

  // ============================================================================
  // DATE HELPERS
  // ============================================================================

  const formatDateToString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getMondayOfWeek = (date: Date): Date => {
    const d = new Date(date);
    const dayOfWeek = d.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const getTodayString = (): string => {
    return formatDateToString(new Date());
  };

  const getWeekDays = (monday: Date): DayInfo[] => {
    const days: DayInfo[] = [];
    const todayStr = getTodayString();
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    for (let i = 0; i < 7; i++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      const dateString = formatDateToString(date);

      days.push({
        date,
        dateString,
        dayName: dayNames[i],
        dayNumber: date.getDate(),
        isToday: dateString === todayStr,
      });
    }
    return days;
  };

  // Get roster dates: current week + next 2 weeks (21 days from Monday)
  const getRosterDates = (): string[] => {
    const dates: string[] = [];
    const today = new Date();
    const monday = getMondayOfWeek(today);
    
    // 21 days: this week (Mon-Sun) + next 2 weeks
    for (let i = 0; i < 21; i++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      dates.push(formatDateToString(date));
    }
    return dates;
  };

  const getMonthDays = (year: number, month: number): DayInfo[] => {
    const days: DayInfo[] = [];
    const todayStr = getTodayString();
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    const firstDay = new Date(year, month, 1);
    const startDate = new Date(firstDay);
    const dayOfWeek = startDate.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    startDate.setDate(startDate.getDate() + diff);

    for (let i = 0; i < 42; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      const dateString = formatDateToString(date);
      const dayIndex = date.getDay() === 0 ? 6 : date.getDay() - 1;

      days.push({
        date,
        dateString,
        dayName: dayNames[dayIndex],
        dayNumber: date.getDate(),
        isToday: dateString === todayStr,
        isCurrentMonth: date.getMonth() === month,
      });
    }
    return days;
  };

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  useEffect(() => {
    // Initialize to today
    const today = new Date();
    const monday = getMondayOfWeek(today);
    setCurrentWeekDays(getWeekDays(monday));
    setSelectedDate(formatDateToString(today));
  }, []);

  useEffect(() => {
    if (userId) {
      fetchMyJobs();
    }
  }, [userId, refreshKey]);

  // Pull-to-refresh handler - triggers full tab refresh
  const onRefresh = async () => {
    setRefreshing(true);
    onJobStatusChange?.(); // Trigger parent refresh
    setRefreshing(false);
  };

  // Scroll to selected date when positions are ready
  useEffect(() => {
    if (Object.keys(datePositions).length > 0 && !loading && selectedDate) {
      scrollToDate(selectedDate);
    }
  }, [datePositions, loading]);

  // ============================================================================
  // CALENDAR HANDLERS
  // ============================================================================

  const handleCalendarDateSelect = (dateString: string) => {
    setSelectedDate(dateString);
    scrollToDate(dateString);
  };

  const handleMonthlyDateSelect = (day: DayInfo) => {
    // Allow selecting any date
    setSelectedDate(day.dateString);
    setShowMonthlyView(false);
    
    // Update weekly bar to show the selected date's week
    const selectedMonday = getMondayOfWeek(day.date);
    setCurrentWeekDays(getWeekDays(selectedMonday));
    
    // Only scroll if date is in roster range
    const rosterDates = getRosterDates();
    if (rosterDates.includes(day.dateString)) {
      scrollToDate(day.dateString);
    }
  };

  const goToToday = () => {
    const todayStr = getTodayString();
    setSelectedDate(todayStr);
    setMonthlyViewDate(new Date());
    setShowMonthlyView(false);
    scrollToDate(todayStr);
  };

  const changeMonth = (direction: number) => {
    const newDate = new Date(monthlyViewDate);
    newDate.setMonth(newDate.getMonth() + direction);
    setMonthlyViewDate(newDate);
  };

  const scrollToDate = (dateString: string) => {
    const yPosition = datePositions[dateString];
    if (yPosition !== undefined && scrollViewRef.current) {
      scrollViewRef.current.scrollTo({ y: Math.max(0, yPosition - 10), animated: true });
    }
  };

  const handleDateLayout = (dateKey: string, yPosition: number) => {
    setDatePositions(prev => ({ ...prev, [dateKey]: yPosition }));
  };

  // Sync selected date with scroll position and update weekly bar (with debounce)
  const handleScroll = (event: any) => {
    const scrollY = event.nativeEvent.contentOffset.y;
    const sortedDates = Object.keys(datePositions).sort();
    
    if (sortedDates.length === 0) return;
    
    // Find the visible date based on scroll position
    let visibleDate = sortedDates[0];
    const lastDateKey = sortedDates[sortedDates.length - 1];
    const lastDatePosition = datePositions[lastDateKey];
    
    // If we're at or past the last date, stick to it (prevents flickering at end)
    if (lastDatePosition !== undefined && scrollY >= lastDatePosition - 100) {
      visibleDate = lastDateKey;
    } else {
      for (let i = 0; i < sortedDates.length; i++) {
        const dateKey = sortedDates[i];
        const position = datePositions[dateKey];
        if (position !== undefined && position <= scrollY + 50) {
          visibleDate = dateKey;
        } else {
          break;
        }
      }
    }
    
    // Debounce: only update if enough time has passed (150ms)
    const now = Date.now();
    if (visibleDate !== selectedDate) {
      if (now - lastScrollUpdate.current > 150) {
        lastScrollUpdate.current = now;
        setSelectedDate(visibleDate);
        
        // Update weekly bar to show the visible date's week
        const visibleDateObj = new Date(visibleDate + 'T00:00:00');
        const visibleMonday = getMondayOfWeek(visibleDateObj);
        const currentMonday = currentWeekDays.length > 0 ? currentWeekDays[0].date : null;
        
        // Only update if we're in a different week
        if (!currentMonday || formatDateToString(visibleMonday) !== formatDateToString(currentMonday)) {
          setCurrentWeekDays(getWeekDays(visibleMonday));
        }
      }
    }
  };

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  const calculateEndOfLeaseDuration = (pricing: any): string => {
    let totalPrice = 0;
    if (typeof pricing === 'object' && pricing !== null) {
      totalPrice = pricing.totalPrice || pricing.total || pricing.amount || 0;
    } else if (typeof pricing === 'number') {
      totalPrice = pricing;
    }
    if (totalPrice <= 0) return 'TBD';
    const afterGST = totalPrice * 0.9;
    const staffAmount = afterGST * 0.6;
    const hourlyRate = 30;
    const hours = Math.round(staffAmount / hourlyRate);
    return hours > 0 ? `${hours} hours` : 'TBD';
  };

  const fetchMyJobs = async () => {
    try {
      setLoading(true);

      if (!userId) {
        setMyJobs([]);
        return;
      }

      // ===== PART 1: Fetch NON-RECURRING jobs from booking_status_on_app =====
      const { data: nonRecurringStatusData, error: nonRecurringError } = await bookingSupabase
        .from('booking_status_on_app')
        .select('id, booking_id, job_status, is_recurring, assigned_to, assigned_at')
        .eq('assigned_to', userId)
        .eq('is_recurring', false)
        .in('job_status', ['assigned', 'accepted', 'on_the_way', 'started'])
        .order('assigned_at', { ascending: false });

      if (nonRecurringError) {
        console.error('Error fetching non-recurring jobs:', nonRecurringError);
        throw nonRecurringError;
      }

      // ===== PART 2: Fetch RECURRING instances directly from recurring_booking_status =====
      // For MyRoster: only fetch next 2 upcoming instances per recurring booking
      const today = new Date().toISOString().split('T')[0];
      const { data: allRecurringInstancesData, error: recurringError } = await bookingSupabase
        .from('recurring_booking_status')
        .select('id, booking_status_on_app_id, master_booking_id, instance_number, instance_date, instance_booking_number, job_status, assigned_to, assigned_at')
        .eq('assigned_to', userId)
        .gte('instance_date', today)
        .not('job_status', 'in', '("completed","cancelled_by_cleaner","cancelled_by_customer")')
        .order('instance_date', { ascending: true });

      if (recurringError) {
        console.error('Error fetching recurring instances:', recurringError);
        throw recurringError;
      }

      // Keep only first 2 instances per booking
      const recurringInstancesMap = new Map<string, any[]>();
      if (allRecurringInstancesData) {
        allRecurringInstancesData.forEach((instance: any) => {
          if (!recurringInstancesMap.has(instance.master_booking_id)) {
            recurringInstancesMap.set(instance.master_booking_id, []);
          }
          const instances = recurringInstancesMap.get(instance.master_booking_id)!;
          if (instances.length < 2) {
            instances.push(instance);
          }
        });
      }

      // Flatten the map to array for processing
      const recurringInstancesData: any[] = [];
      recurringInstancesMap.forEach(instances => {
        recurringInstancesData.push(...instances);
      });

      // If no jobs at all, return empty
      if ((!nonRecurringStatusData || nonRecurringStatusData.length === 0) && 
          recurringInstancesData.length === 0) {
        setMyJobs([]);
        return;
      }

      // Collect all booking IDs
      const bookingIds: string[] = [];
      if (nonRecurringStatusData) {
        bookingIds.push(...nonRecurringStatusData.map(s => s.booking_id));
      }
      if (recurringInstancesData.length > 0) {
        bookingIds.push(...recurringInstancesData.map(i => i.master_booking_id));
      }

      // Fetch bookings data
      const { data: bookingsData, error: bookingsError } = await bookingSupabase
        .from('bookings')
        .select(`
          id, 
          booking_number,
          selected_service,
          status,
          pricing,
          service_details_id,
          customer:customers!fk_bookings_customer_id (
            first_name,
            last_name,
            suburb,
            postcode,
            schedule_date,
            phone,
            address
          )
        `)
        .in('id', bookingIds);

      if (bookingsError) throw bookingsError;

      if (!bookingsData) {
        setMyJobs([]);
        return;
      }

      const bookingsMap = new Map(bookingsData.map((b: any) => [b.id, b]));

      // Fetch service details for all bookings
      const serviceDetailsIds = bookingsData
        .filter((b: any) => b.service_details_id)
        .map((b: any) => ({ id: b.service_details_id, service: b.selected_service }));

      let serviceDetailsMap: Record<string, { duration?: string; frequency?: string }> = {};
      
      const regularIds = serviceDetailsIds.filter(s => s.service === 'Regular Cleaning').map(s => s.id);
      const ndisIds = serviceDetailsIds.filter(s => s.service === 'NDIS Cleaning').map(s => s.id);
      const onceOffIds = serviceDetailsIds.filter(s => s.service === 'Once-Off Cleaning').map(s => s.id);
      const airbnbIds = serviceDetailsIds.filter(s => s.service === 'Airbnb Cleaning').map(s => s.id);
      const commercialIds = serviceDetailsIds.filter(s => s.service === 'Commercial Cleaning').map(s => s.id);

      if (regularIds.length > 0) {
        const { data } = await bookingSupabase.from('regular_cleaning_details').select('id, duration, frequency').in('id', regularIds);
        if (data) data.forEach((d: any) => { serviceDetailsMap[d.id] = { duration: d.duration, frequency: d.frequency }; });
      }
      if (ndisIds.length > 0) {
        const { data } = await bookingSupabase.from('ndis_cleaning_details').select('id, duration, frequency').in('id', ndisIds);
        if (data) data.forEach((d: any) => { serviceDetailsMap[d.id] = { duration: d.duration, frequency: d.frequency }; });
      }
      if (onceOffIds.length > 0) {
        const { data } = await bookingSupabase.from('once_off_cleaning_details').select('id, duration').in('id', onceOffIds);
        if (data) data.forEach((d: any) => { serviceDetailsMap[d.id] = { duration: d.duration }; });
      }
      if (airbnbIds.length > 0) {
        const { data } = await bookingSupabase.from('airbnb_cleaning_details').select('id, duration').in('id', airbnbIds);
        if (data) data.forEach((d: any) => { serviceDetailsMap[d.id] = { duration: d.duration }; });
      }
      if (commercialIds.length > 0) {
        const { data } = await bookingSupabase.from('commercial_cleaning_details').select('id, duration, frequency').in('id', commercialIds);
        if (data) data.forEach((d: any) => { serviceDetailsMap[d.id] = { duration: d.duration, frequency: d.frequency }; });
      }

      const jobs: MyJob[] = [];

      // ===== PROCESS NON-RECURRING JOBS =====
      if (nonRecurringStatusData && nonRecurringStatusData.length > 0) {
        for (const status of nonRecurringStatusData) {
          const booking: any = bookingsMap.get(status.booking_id);
          if (!booking) continue;

          const serviceDetails = booking.service_details_id ? serviceDetailsMap[booking.service_details_id] : null;
          let duration = serviceDetails?.duration;
          if (booking.selected_service === 'End of Lease Cleaning') {
            duration = calculateEndOfLeaseDuration(booking.pricing);
          }

          jobs.push({
            id: status.id,
            booking_id: status.booking_id,
            job_status: status.job_status,
            is_recurring: false,
            assigned_to: status.assigned_to,
            assigned_at: status.assigned_at,
            booking_number: booking.booking_number,
            selected_service: booking.selected_service,
            status: booking.status,
            pricing: booking.pricing,
            service_details_id: booking.service_details_id,
            duration: duration,
            frequency: serviceDetails?.frequency,
            customer: booking.customer,
            recurring_instance: undefined,
          });
        }
      }

      // ===== PROCESS RECURRING INSTANCES =====
      if (recurringInstancesData && recurringInstancesData.length > 0) {
        for (const instance of recurringInstancesData) {
          const booking: any = bookingsMap.get(instance.master_booking_id);
          if (!booking) continue;

          const serviceDetails = booking.service_details_id ? serviceDetailsMap[booking.service_details_id] : null;
          let duration = serviceDetails?.duration;
          if (booking.selected_service === 'End of Lease Cleaning') {
            duration = calculateEndOfLeaseDuration(booking.pricing);
          }

          jobs.push({
            id: instance.booking_status_on_app_id,
            booking_id: instance.master_booking_id,
            job_status: 'assigned', // From booking_status_on_app (not used for recurring)
            is_recurring: true,
            assigned_to: instance.assigned_to,
            assigned_at: instance.assigned_at,
            booking_number: booking.booking_number,
            selected_service: booking.selected_service,
            status: booking.status,
            pricing: booking.pricing,
            service_details_id: booking.service_details_id,
            duration: duration,
            frequency: serviceDetails?.frequency,
            customer: booking.customer,
            recurring_instance: {
              id: instance.id,
              instance_number: instance.instance_number,
              instance_date: instance.instance_date,
              instance_booking_number: instance.instance_booking_number,
              job_status: instance.job_status,
              assigned_to: instance.assigned_to,
            },
          });
        }
      }

      setMyJobs(jobs);
    } catch (error) {
      console.error('Error fetching roster jobs:', error);
      setMyJobs([]);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================================
  // HELPERS
  // ============================================================================

  const getJobDate = (job: MyJob): string => {
    if (job.is_recurring && job.recurring_instance) {
      return job.recurring_instance.instance_date;
    }
    return job.customer?.schedule_date || 'no-date';
  };

  const hasRecurringInstance = (job: MyJob): boolean => {
    return job.is_recurring && job.recurring_instance !== null && job.recurring_instance !== undefined;
  };

  const openJobDetails = (job: MyJob) => {
    setSelectedJob(job);
    setModalVisible(true);
  };

  const closeJobDetails = () => {
    setModalVisible(false);
    setSelectedJob(null);
  };

  const isDatePast = (dateString: string): boolean => {
    if (!dateString || dateString === 'no-date') return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const jobDate = new Date(dateString + 'T12:00:00');
    jobDate.setHours(0, 0, 0, 0);
    return jobDate < today;
  };

  const isDateToday = (dateString: string): boolean => {
    if (!dateString || dateString === 'no-date') return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const jobDate = new Date(dateString + 'T12:00:00');
    jobDate.setHours(0, 0, 0, 0);
    return jobDate.getTime() === today.getTime();
  };

  const formatDateHeader = (dateString: string): string => {
    if (dateString === 'no-date') return 'Unscheduled';
    const date = new Date(dateString + 'T12:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const jobDate = new Date(date);
    jobDate.setHours(0, 0, 0, 0);
    
    const isToday = jobDate.getTime() === today.getTime();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = jobDate.getTime() === tomorrow.getTime();
    
    const options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'short' };
    const formattedDate = date.toLocaleDateString('en-AU', options);
    
    if (isToday) return `Today, ${formattedDate}`;
    if (isTomorrow) return `Tomorrow, ${formattedDate}`;
    return formattedDate;
  };

  // ============================================================================
  // GROUPING & FILTERING
  // ============================================================================

  const rosterDates = getRosterDates();
  const datesWithShifts = myJobs.map(job => getJobDate(job));

  // Group jobs by date
  const groupedJobs: { [key: string]: MyJob[] } = {};
  myJobs.forEach((job) => {
    const dateKey = getJobDate(job);
    // Only include jobs within roster date range
    if (rosterDates.includes(dateKey)) {
      if (!groupedJobs[dateKey]) {
        groupedJobs[dateKey] = [];
      }
      groupedJobs[dateKey].push(job);
    }
  });

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <View style={styles.container}>
      {/* ============ WEEKLY CALENDAR BAR ============ */}
      <View style={styles.weeklyCalendar}>
        <View style={styles.weekRow}>
          {currentWeekDays.map((day) => {
            const isSelected = selectedDate === day.dateString;
            const isToday = day.isToday;
            const hasShift = datesWithShifts.includes(day.dateString);

            return (
              <TouchableOpacity
                key={day.dateString}
                style={styles.dayContainer}
                onPress={() => handleCalendarDateSelect(day.dateString)}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.dayName,
                  (isToday || isSelected) && styles.dayNameToday,
                ]}>
                  {day.dayName}
                </Text>
                <View style={[
                  styles.dateCircle,
                  isToday && !isSelected && styles.dateCircleToday,
                  isSelected && styles.dateCircleSelected,
                ]}>
                  <Text style={[
                    styles.dateNumber,
                    isToday && !isSelected && styles.dateNumberToday,
                    isSelected && styles.dateNumberSelected,
                  ]}>
                    {day.dayNumber}
                  </Text>
                </View>
                {hasShift && !isSelected && (
                  <View style={[styles.shiftDot, isToday && styles.shiftDotToday]} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Monthly View Trigger Bar (drag handle) - only this animates */}
        <Animated.View 
          style={[
            styles.monthlyTrigger,
            { transform: [{ translateY: pullDownAnim }] }
          ]}
          {...panResponder.panHandlers}
        >
          <View style={styles.monthlyTriggerBar} />
        </Animated.View>
      </View>

      {/* ============ ROSTER LIST ============ */}
      <ScrollView 
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#0066cc']}
            tintColor="#0066cc"
          />
        }
      >
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#0066cc" />
          </View>
        ) : myJobs.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={64} color="#0066cc" />
            <Text style={styles.emptyText}>No Upcoming Shifts</Text>
            <Text style={styles.emptySubtext}>Your assigned shifts will appear here</Text>
          </View>
        ) : (
          <View style={styles.jobsList}>
            {rosterDates.map((dateKey) => {
              const jobsOnDate = groupedJobs[dateKey] || [];
              const isPast = isDatePast(dateKey);
              const isToday = isDateToday(dateKey);

              return (
                <View 
                  key={dateKey} 
                  style={styles.dateSection}
                  onLayout={(event) => {
                    const { y } = event.nativeEvent.layout;
                    handleDateLayout(dateKey, y);
                  }}
                >
                  {/* Date Header */}
                  <View style={styles.dateHeader}>
                    <Text style={[styles.dateHeaderText, isToday && styles.dateHeaderTextToday]}>
                      {formatDateHeader(dateKey)}
                    </Text>
                    {jobsOnDate.length > 0 && (
                      <Text style={styles.jobCount}>
                        {jobsOnDate.length} {jobsOnDate.length === 1 ? 'Job' : 'Jobs'}
                      </Text>
                    )}
                  </View>

                  {/* Jobs on this date */}
                  {jobsOnDate.length === 0 ? (
                    <View style={styles.noJobsPlaceholder}>
                      <Text style={styles.noJobsText}>No shifts scheduled</Text>
                    </View>
                  ) : (
                    jobsOnDate.map((job) => {
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
                      
                      const reactKey = job.display_id || job.id;
                      
                      if (hasRecurringInstance(job) && job.recurring_instance) {
                        return (
                          <RecurringInstanceCard
                            key={reactKey}
                            jobId={job.id}
                            bookingId={job.booking_id}
                            bookingNumber={job.booking_number}
                            selectedService={job.selected_service as 'Regular Cleaning' | 'NDIS Cleaning'}
                            customerName={customerName}
                            location={location}
                            duration={job.duration}
                            frequency={job.frequency}
                            instance={job.recurring_instance}
                            onPress={() => openJobDetails(job)}
                          />
                        );
                      }

                      const getPriceDisplay = (): string => {
                        if (job.selected_service === 'End of Lease Cleaning') {
                          const staffAmount = calculateEndOfLeaseStaffAmount(job.pricing);
                          return staffAmount > 0 ? `$${staffAmount}` : 'N/A';
                        }
                        const hourlyRate = getHourlyRate(job.selected_service);
                        return hourlyRate ? `$${hourlyRate}/hr` : 'N/A';
                      };

                      const statusTag = getJobStatusTag(job.job_status);

                      const renderServiceContent = () => {
                        const isEndOfLease = job.selected_service === 'End of Lease Cleaning';
                        const staffAmount = isEndOfLease ? calculateEndOfLeaseStaffAmount(job.pricing) : 0;
                        const estimatedHours = isEndOfLease ? calculateEndOfLeaseHours(staffAmount) : '';
                        const showFrequency = job.frequency && 
                          (job.selected_service === 'Regular Cleaning' || 
                           job.selected_service === 'NDIS Cleaning' ||
                           job.selected_service === 'Commercial Cleaning');

                        return (
                          <>
                            <View style={styles.cardRow}>
                              <Text style={styles.cardCustomerName}>{customerName}</Text>
                              <Text style={styles.cardPriceText}>{getPriceDisplay()}</Text>
                            </View>
                            <View style={styles.cardRow}>
                              <View style={styles.locationRow}>
                                <Ionicons name="location-outline" size={14} color="#6B7280" />
                                <Text style={styles.cardDetailText}>{location}</Text>
                              </View>
                              <Text style={styles.cardDateText}>{scheduleDate}</Text>
                            </View>
                            <View style={styles.cardRow}>
                              <View style={styles.locationRow}>
                                <Ionicons name="time-outline" size={14} color="#6B7280" />
                                <Text style={styles.cardDetailText}>
                                  {isEndOfLease ? (
                                    <>{estimatedHours} • <Text style={styles.cardEstimatedText}>estimated</Text></>
                                  ) : (
                                    <>
                                      {job.duration || 'TBD'}
                                      {showFrequency && ` • ${job.frequency}`}
                                    </>
                                  )}
                                </Text>
                              </View>
                              {statusTag && (
                                <View style={[styles.jobStatusTag, { backgroundColor: statusTag.color }]}>
                                  <Text style={styles.jobStatusTagText}>{statusTag.label}</Text>
                                </View>
                              )}
                            </View>
                          </>
                        );
                      };

                      return (
                        <TouchableOpacity
                          key={reactKey}
                          style={[styles.jobCard, isPast && styles.jobCardPast]}
                          onPress={() => openJobDetails(job)}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.cardLeftBorder, { backgroundColor: serviceColor }]} />
                          <View style={[styles.serviceBadge, { backgroundColor: serviceColor }]}>
                            <Text style={styles.serviceBadgeText}>
                              {job.selected_service.replace(' Cleaning', '')}
                            </Text>
                          </View>
                          <View style={styles.cardContent}>
                            {renderServiceContent()}
                          </View>
                        </TouchableOpacity>
                      );
                    })
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ============ MONTHLY VIEW MODAL ============ */}
      <Modal
        visible={showMonthlyView}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowMonthlyView(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowMonthlyView(false)} style={styles.closeButton}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
              <TouchableOpacity onPress={goToToday} style={styles.todayButton}>
                <Text style={styles.todayButtonText}>Today</Text>
              </TouchableOpacity>
            </View>

            {/* Month Navigation */}
            <View style={styles.monthNavigation}>
              <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.navButton}>
                <Ionicons name="chevron-back" size={24} color="#0066cc" />
              </TouchableOpacity>
              <Text style={styles.monthText}>
                {monthlyViewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </Text>
              <TouchableOpacity onPress={() => changeMonth(1)} style={styles.navButton}>
                <Ionicons name="chevron-forward" size={24} color="#0066cc" />
              </TouchableOpacity>
            </View>

            {/* Day Headers */}
            <View style={styles.dayHeaders}>
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                <Text key={day} style={styles.dayHeader}>{day}</Text>
              ))}
            </View>

            {/* Calendar Grid */}
            <ScrollView>
              <View style={styles.calendarGrid}>
                {getMonthDays(monthlyViewDate.getFullYear(), monthlyViewDate.getMonth()).map((day, index) => {
                  const hasShift = datesWithShifts.includes(day.dateString);
                  const isSelected = selectedDate === day.dateString;

                  return (
                    <TouchableOpacity
                      key={`${day.dateString}-${index}`}
                      style={[
                        styles.calendarDay,
                        !day.isCurrentMonth && styles.calendarDayOtherMonth,
                        day.isToday && styles.calendarDayToday,
                        isSelected && styles.calendarDaySelected,
                      ]}
                      onPress={() => handleMonthlyDateSelect(day)}
                      activeOpacity={0.7}
                    >
                      <Text style={[
                        styles.calendarDayText,
                        !day.isCurrentMonth && styles.calendarDayTextOtherMonth,
                        day.isToday && styles.calendarDayTextToday,
                        isSelected && styles.calendarDayTextSelected,
                      ]}>
                        {day.dayNumber}
                      </Text>
                      {hasShift && (
                        <View style={[
                          styles.calendarShiftDot,
                          isSelected && styles.calendarShiftDotSelected,
                        ]} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Job Details Modal */}
      <MyJobDetailsPanel
        job={selectedJob ? {
          id: selectedJob.id,
          booking_id: selectedJob.booking_id,
          booking_number: selectedJob.booking_number,
          selected_service: selectedJob.selected_service,
          status: selectedJob.status,
          job_status: selectedJob.job_status,
          is_recurring: selectedJob.is_recurring,
          pricing: selectedJob.pricing,
          duration: selectedJob.duration,
          frequency: selectedJob.frequency,
          assigned_to: selectedJob.assigned_to,
          assigned_at: selectedJob.assigned_at,
          service_details_id: selectedJob.service_details_id,
          customer: selectedJob.customer,
          recurring_instance: selectedJob.recurring_instance || undefined,
        } : null}
        visible={modalVisible}
        onClose={closeJobDetails}
        userId={userId}
        userFirstName={userFirstName}
        onStatusUpdate={(jobId, newStatus) => {
          // Trigger full refresh of My tab
          onJobStatusChange?.();
        }}
        onJobCancelled={() => {
          closeJobDetails();
          onJobStatusChange?.();
        }}
      />
    </View>
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

  // Weekly Calendar Bar
  weeklyCalendar: {
    backgroundColor: '#fff',
    paddingTop: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  dayContainer: {
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 12,
    minWidth: 44,
    height: 70,
  },
  dayName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  dayNameToday: {
    color: '#0066cc',
  },
  dayNameSelected: {
    color: '#0066cc',
  },
  dateCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateCircleToday: {
    borderWidth: 2,
    borderColor: '#0066cc',
  },
  dateCircleSelected: {
    backgroundColor: '#0066cc',
  },
  dateNumber: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  dateNumberToday: {
    color: '#0066cc',
  },
  dateNumberSelected: {
    color: '#fff',
  },
  shiftDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#10B981',
    marginTop: 4,
  },
  shiftDotToday: {
    backgroundColor: '#0066cc',
  },

  // Monthly Trigger Bar
  monthlyTrigger: {
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 10,
  },
  monthlyTriggerBar: {
    width: 40,
    height: 4,
    backgroundColor: '#D1D5DB',
    borderRadius: 2,
  },

  // List
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 300,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
    textAlign: 'center',
  },
  jobsList: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 8,
  },
  dateSection: {
    marginBottom: 16,
  },
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    marginBottom: 4,
  },
  dateHeaderText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#9CA3AF',
  },
  dateHeaderTextToday: {
    color: '#6B9FD6',
    fontWeight: '600',
  },
  jobCount: {
    fontSize: 11,
    fontWeight: '500',
    color: '#D1D5DB',
  },
  noJobsPlaceholder: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#FAFAFA',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    borderStyle: 'dashed',
  },
  noJobsText: {
    fontSize: 13,
    color: '#D1D5DB',
    textAlign: 'center',
  },

  // Job Card
  jobCard: {
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
  jobCardPast: {
    opacity: 0.6,
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
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  cardDateText: {
    fontSize: 12,
    color: '#3B82F6',
    fontWeight: '500',
  },
  cardDetailText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  cardEstimatedText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '400',
    fontStyle: 'italic',
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

  // Modal Styles
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
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  closeButton: {
    padding: 4,
  },
  todayButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
  },
  todayButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0066cc',
  },
  monthNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  navButton: {
    padding: 8,
  },
  monthText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  dayHeaders: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  dayHeader: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
  },
  calendarDay: {
    width: (SCREEN_WIDTH - 16) / 7,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarDayOtherMonth: {
    opacity: 0.3,
  },
  calendarDayToday: {
    backgroundColor: '#EFF6FF',
    borderRadius: 24,
  },
  calendarDaySelected: {
    backgroundColor: '#0066cc',
    borderRadius: 24,
  },
  calendarDayText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  calendarDayTextOtherMonth: {
    color: '#9CA3AF',
  },
  calendarDayTextToday: {
    color: '#0066cc',
    fontWeight: '700',
  },
  calendarDayTextSelected: {
    color: '#fff',
  },
  calendarShiftDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#0066cc',
    marginTop: 2,
    position: 'absolute',
    bottom: 6,
  },
  calendarShiftDotSelected: {
    backgroundColor: '#fff',
  },
});
