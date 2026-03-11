import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface DateRangeFilterProps {
  onDateChange: (startDate: Date, endDate: Date) => void;
}

type FilterType = 'today' | 'thisWeek' | 'lastWeek';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']; // Week starts on Monday

export default function DateRangeFilter({ onDateChange }: DateRangeFilterProps) {
  const [activeFilter, setActiveFilter] = useState<FilterType>('thisWeek');
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [showModal, setShowModal] = useState(false);
  const [tempStartDate, setTempStartDate] = useState<Date | null>(null);
  const [tempEndDate, setTempEndDate] = useState<Date | null>(null);
  const [selectingStart, setSelectingStart] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const hasInitialized = useRef(false);

  // Initialize with "This Week"
  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      applyFilter('thisWeek');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyFilter = React.useCallback((filter: FilterType) => {
    // Set active filter FIRST before any other state updates
    setActiveFilter(filter);
    
    const now = new Date();
    let newStartDate: Date;
    let newEndDate: Date;

    switch (filter) {
      case 'today':
        newStartDate = new Date(now);
        newStartDate.setHours(0, 0, 0, 0);
        newEndDate = new Date(now);
        newEndDate.setHours(23, 59, 59, 999);
        break;

      case 'thisWeek':
        // Start of this week (Monday)
        const dayOfWeek = now.getDay();
        const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // If Sunday (0), go back 6 days, else go to Monday
        newStartDate = new Date(now);
        newStartDate.setDate(now.getDate() + diff);
        newStartDate.setHours(0, 0, 0, 0);
        // End of week (Sunday)
        newEndDate = new Date(newStartDate);
        newEndDate.setDate(newStartDate.getDate() + 6);
        newEndDate.setHours(23, 59, 59, 999);
        break;

      case 'lastWeek':
        // Last week Monday
        const currentDay = now.getDay();
        const daysToLastMonday = currentDay === 0 ? -13 : 1 - currentDay - 7;
        newStartDate = new Date(now);
        newStartDate.setDate(now.getDate() + daysToLastMonday);
        newStartDate.setHours(0, 0, 0, 0);
        // Last week Sunday
        newEndDate = new Date(newStartDate);
        newEndDate.setDate(newStartDate.getDate() + 6);
        newEndDate.setHours(23, 59, 59, 999);
        break;

      default:
        newStartDate = new Date(now);
        newStartDate.setHours(0, 0, 0, 0);
        newEndDate = new Date(now);
        newEndDate.setHours(23, 59, 59, 999);
    }
    
    // Update dates and notify parent
    setStartDate(newStartDate);
    setEndDate(newEndDate);
    onDateChange(newStartDate, newEndDate);
  }, [onDateChange]);

  const openCustomDateModal = () => {
    setTempStartDate(new Date(startDate));
    setTempEndDate(new Date(endDate));
    setSelectingStart(true);
    setCurrentMonth(new Date(startDate));
    setShowModal(true);
  };

  const handleDateSelect = (date: Date) => {
    if (selectingStart) {
      setTempStartDate(date);
      setSelectingStart(false);
    } else {
      if (tempStartDate && date < tempStartDate) {
        // If end date is before start date, swap them
        setTempEndDate(tempStartDate);
        setTempStartDate(date);
      } else {
        setTempEndDate(date);
      }
      setSelectingStart(true);
    }
  };

  const applyCustomDates = () => {
    if (tempStartDate && tempEndDate) {
      const newStartDate = new Date(tempStartDate);
      newStartDate.setHours(0, 0, 0, 0);
      const newEndDate = new Date(tempEndDate);
      newEndDate.setHours(23, 59, 59, 999);
      
      setStartDate(newStartDate);
      setEndDate(newEndDate);
      onDateChange(newStartDate, newEndDate);
      setShowModal(false);
    }
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    
    // Get first day of month (0 = Sunday, 1 = Monday, etc.)
    let firstDayOfWeek = firstDay.getDay();
    // Convert to Monday-based (0 = Monday, 6 = Sunday)
    firstDayOfWeek = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
    
    const days = [];
    
    // Add empty cells for days before month starts
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(null);
    }
    
    // Add days of month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    
    return days;
  };

  const isDateSelected = (date: Date | null) => {
    if (!date || !tempStartDate || !tempEndDate) return false;
    const dateTime = date.getTime();
    return dateTime >= tempStartDate.getTime() && dateTime <= tempEndDate.getTime();
  };

  const isDateStart = (date: Date | null) => {
    if (!date || !tempStartDate) return false;
    return date.toDateString() === tempStartDate.toDateString();
  };

  const isDateEnd = (date: Date | null) => {
    if (!date || !tempEndDate) return false;
    return date.toDateString() === tempEndDate.toDateString();
  };

  const formatDisplayDate = (date: Date): string => {
    return date.toLocaleDateString('en-AU', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const changeMonth = (direction: number) => {
    const newMonth = new Date(currentMonth);
    newMonth.setMonth(currentMonth.getMonth() + direction);
    setCurrentMonth(newMonth);
  };

  return (
    <View style={styles.container}>
      {/* Filter Buttons */}
      <View style={styles.filterButtons}>
        <TouchableOpacity
          style={[styles.filterButton, activeFilter === 'today' && styles.filterButtonActive]}
          onPress={() => applyFilter('today')}
        >
          <Text style={[styles.filterText, activeFilter === 'today' && styles.filterTextActive]}>
            Today
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterButton, activeFilter === 'thisWeek' && styles.filterButtonActive]}
          onPress={() => applyFilter('thisWeek')}
        >
          <Text style={[styles.filterText, activeFilter === 'thisWeek' && styles.filterTextActive]}>
            This Week
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterButton, activeFilter === 'lastWeek' && styles.filterButtonActive]}
          onPress={() => applyFilter('lastWeek')}
        >
          <Text style={[styles.filterText, activeFilter === 'lastWeek' && styles.filterTextActive]}>
            Last Week
          </Text>
        </TouchableOpacity>
      </View>

      {/* Date Display Buttons */}
      <View style={styles.datePickersContainer}>
        <View style={styles.datePickerWrapper}>
          <Text style={styles.dateLabel}>FROM</Text>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={openCustomDateModal}
          >
            <Ionicons name="calendar-outline" size={18} color="#0066cc" />
            <Text style={styles.dateText}>{formatDisplayDate(startDate)}</Text>
          </TouchableOpacity>
        </View>

        <Ionicons name="arrow-forward" size={20} color="#999" style={styles.arrowIcon} />

        <View style={styles.datePickerWrapper}>
          <Text style={styles.dateLabel}>TO</Text>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={openCustomDateModal}
          >
            <Ionicons name="calendar-outline" size={18} color="#0066cc" />
            <Text style={styles.dateText}>{formatDisplayDate(endDate)}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Custom Date Modal */}
      <Modal
        visible={showModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Custom dates</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            {/* Selected Date Range Display */}
            <View style={styles.dateRangeDisplay}>
              <View style={styles.selectedDateBox}>
                <Text style={styles.selectedDateText}>
                  {tempStartDate?.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                </Text>
              </View>
              <Text style={styles.toText}>To</Text>
              <View style={styles.selectedDateBox}>
                <Text style={styles.selectedDateText}>
                  {tempEndDate?.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                </Text>
              </View>
            </View>

            {/* Month Navigation */}
            <View style={styles.monthNavigation}>
              <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.monthArrow}>
                <Ionicons name="chevron-back" size={24} color="#000" />
              </TouchableOpacity>
              <Text style={styles.monthText}>
                {MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
              </Text>
              <TouchableOpacity onPress={() => changeMonth(1)} style={styles.monthArrow}>
                <Ionicons name="chevron-forward" size={24} color="#000" />
              </TouchableOpacity>
            </View>

            {/* Calendar */}
            <ScrollView style={styles.calendarContainer}>
              {/* Day Headers */}
              <View style={styles.dayHeaders}>
                {DAYS.map(day => (
                  <Text key={day} style={styles.dayHeader}>{day}</Text>
                ))}
              </View>

              {/* Calendar Grid */}
              <View style={styles.calendarGrid}>
                {getDaysInMonth(currentMonth).map((date, index) => {
                  if (!date) {
                    return <View key={`empty-${index}`} style={styles.dayCell} />;
                  }

                  const isSelected = isDateSelected(date);
                  const isStart = isDateStart(date);
                  const isEnd = isDateEnd(date);
                  const isToday = date.toDateString() === new Date().toDateString();

                  return (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.dayCell,
                        isSelected && styles.dayCellSelected,
                        (isStart || isEnd) && styles.dayCellEdge,
                      ]}
                      onPress={() => handleDateSelect(date)}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          (isStart || isEnd) && styles.dayTextSelected,
                          isToday && !isSelected && styles.dayTextToday,
                        ]}
                      >
                        {date.getDate()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            {/* Modal Footer */}
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.applyButton}
                onPress={applyCustomDates}
              >
                <Text style={styles.applyButtonText}>Apply</Text>
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
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  filterButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#fff',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  filterButtonActive: {
    backgroundColor: '#0066cc',
    borderColor: '#0066cc',
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  filterTextActive: {
    color: '#fff',
  },
  datePickersContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  datePickerWrapper: {
    flex: 1,
  },
  dateLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#999',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 8,
  },
  dateText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
    flex: 1,
  },
  arrowIcon: {
    marginTop: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000',
  },
  dateRangeDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 12,
  },
  selectedDateBox: {
    backgroundColor: '#e6f2ff',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  selectedDateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0066cc',
  },
  toText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  monthNavigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  monthArrow: {
    padding: 5,
  },
  monthText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  calendarContainer: {
    paddingHorizontal: 20,
    maxHeight: 400,
  },
  dayHeaders: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  dayHeader: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 2,
  },
  dayCellSelected: {
    backgroundColor: '#e6f2ff',
  },
  dayCellEdge: {
    backgroundColor: '#0066cc',
    borderRadius: 8,
  },
  dayText: {
    fontSize: 16,
    color: '#000',
  },
  dayTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  dayTextToday: {
    color: '#0066cc',
    fontWeight: '700',
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  applyButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#0066cc',
    alignItems: 'center',
  },
  applyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
