import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import Storage from '../services/storage';
import { SupabaseStorage } from '../services/supabaseStorage';
import colors from '../utils/colors';
import { getWorkoutsByDate } from '../utils/stats';
import { format, getDaysInMonth, startOfWeek, addDays, isSameDay, isSameMonth } from 'date-fns';
import { it } from 'date-fns/locale';

const CalendarScreen = ({ navigation }) => {
  const [workouts, setWorkouts] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());

  useFocusEffect(
    React.useCallback(() => {
      loadWorkouts();
    }, [])
  );

  const loadWorkouts = async () => {
    // Carica prima da Supabase, poi da local storage
    await SupabaseStorage.loadCalendar();
    const data = await Storage.getCalendar();
    console.log('[CalendarScreen] Loaded calendar workouts:', data.length);
    console.log('[CalendarScreen] Calendar data:', JSON.stringify(data, null, 2));
    setWorkouts(data);
  };

  const previousMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1)
    );
  };

  const nextMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)
    );
  };

const year = currentDate.getFullYear();
const month = currentDate.getMonth();
// Nuova logica: genera la matrice delle settimane per il mese corrente con date-fns
const generateCalendarMatrix = (date) => {
  const year = date.getFullYear();
  const month = date.getMonth();
  const daysInMonth = getDaysInMonth(date);
  const firstOfMonth = new Date(year, month, 1);
  const startDate = startOfWeek(firstOfMonth, { weekStartsOn: 1, locale: it });
  const weeks = [];
  let day = startDate;
  while (true) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push(day);
      day = addDays(day, 1);
    }
    weeks.push(week);
    if (!isSameMonth(day, firstOfMonth) && day.getDate() === 1) break;
  }
  return weeks;
};
const weeks = generateCalendarMatrix(currentDate);

  const monthNames = [
    'Gennaio',
    'Febbraio',
    'Marzo',
    'Aprile',
    'Maggio',
    'Giugno',
    'Luglio',
    'Agosto',
    'Settembre',
    'Ottobre',
    'Novembre',
    'Dicembre',
  ];

  const dayNames = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

  const getWorkoutsForDay = (day) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayWorkouts = getWorkoutsByDate(workouts, dateStr);
    if (dayWorkouts.length > 0) {
      console.log(`[CalendarScreen] Day ${day}: Found ${dayWorkouts.length} workouts for date ${dateStr}`);
    }
    return dayWorkouts;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={previousMonth} style={styles.navButton}>
          <Ionicons name="chevron-back" size={24} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {monthNames[month]} {year}
        </Text>
        <TouchableOpacity onPress={nextMonth} style={styles.navButton}>
          <Ionicons name="chevron-forward" size={24} color={colors.white} />
        </TouchableOpacity>
      </View>

      <View style={styles.dayNamesRow}>
        {dayNames.map((name) => (
          <Text key={name} style={styles.dayName}>
            {name}
          </Text>
        ))}
      </View>

      <ScrollView style={styles.calendarContainer}>
        <View style={styles.calendarGrid}>
          {weeks.map((week, weekIdx) => (
            <View key={weekIdx} style={{ flexDirection: 'row' }}>
              {week.map((dateObj, dayIdx) => {
                const isCurrentMonth = dateObj.getMonth() === month;
                const day = dateObj.getDate();
                const today = new Date();
                const isToday =
                  dateObj.getDate() === today.getDate() &&
                  dateObj.getMonth() === today.getMonth() &&
                  dateObj.getFullYear() === today.getFullYear();
                const dayWorkouts = getWorkoutsByDate(
                  workouts,
                  `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`
                );
                const hasWorkouts = dayWorkouts.length > 0;
                return (
                  <TouchableOpacity
                    key={`${weekIdx}-${dayIdx}`}
                    style={[
                      styles.calendarDay,
                      !isCurrentMonth && { opacity: 0.3 },
                      isToday && styles.calendarDayToday,
                      hasWorkouts && styles.calendarDayWithWorkout,
                    ]}
                    onPress={() => {
                      if (hasWorkouts) {
                        if (dayWorkouts.length === 1) {
                          navigation.navigate('WorkoutDetail', {
                            workout: dayWorkouts[0],
                          });
                        }
                      }
                    }}
                    disabled={!isCurrentMonth}
                  >
                    <Text
                      style={[
                        styles.calendarDayText,
                        isToday && styles.calendarDayTextToday,
                        hasWorkouts && styles.calendarDayTextWithWorkout,
                      ]}
                    >
                      {day}
                    </Text>
                    {hasWorkouts && (
                      <View style={styles.workoutIndicator}>
                        <Text style={styles.workoutCount}>{dayWorkouts.length}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>

        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
            <Text style={styles.legendText}>Oggi</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
            <Text style={styles.legendText}>Allenamenti</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.primary,
    padding: 16,
  },
  navButton: {
    padding: 8,
  },
  headerTitle: {
    color: colors.white,
    fontSize: 20,
    fontWeight: 'bold',
  },
  dayNamesRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    paddingVertical: 12,
  },
  dayName: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  calendarContainer: {
    flex: 1,
  },
  calendarGrid: {
    padding: 8,
  },
  calendarDay: {
    flex: 1,
    aspectRatio: 1,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    margin: 2,
    minWidth: 0, // per evitare overflow
  },
  calendarDayToday: {
    backgroundColor: colors.primary,
  },
  calendarDayWithWorkout: {
    backgroundColor: colors.success,
  },
  calendarDayText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '500',
  },
  calendarDayTextToday: {
    color: colors.white,
    fontWeight: 'bold',
  },
  calendarDayTextWithWorkout: {
    color: colors.white,
    fontWeight: 'bold',
  },
  workoutIndicator: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  workoutCount: {
    color: colors.white,
    fontSize: 10,
    fontWeight: 'bold',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    padding: 16,
    backgroundColor: colors.surface,
    marginTop: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    color: colors.text,
    fontSize: 14,
  },
});

export default CalendarScreen;
