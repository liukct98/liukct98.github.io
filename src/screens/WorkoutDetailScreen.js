import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import colors from '../utils/colors';
import { calculateVolume } from '../utils/stats';
import Storage from '../services/storage';
import NoSleep from 'nosleep.js';
import SupabaseStorage from '../services/supabaseStorage';
import SharingService from '../services/sharingService';
import Timer from '../components/Timer';
import AlertModal from '../components/AlertModal';

const WorkoutDetailScreen = ({ route, navigation }) => {
  const [workout, setWorkout] = useState(route.params.workout);
  const [currentTimer, setCurrentTimer] = useState(null);
  const [workoutInProgress, setWorkoutInProgress] = useState(false);
  const [popup, setPopup] = useState({ visible: false, title: '', message: '', buttons: [] });
  const showPopup = (title, message, buttons) => setPopup({ visible: true, title, message, buttons: buttons || [{ text: 'OK' }] });
  const hidePopup = () => setPopup(p => ({ ...p, visible: false }));
  const [workoutStartTime, setWorkoutStartTime] = useState(null);
  const [workoutDuration, setWorkoutDuration] = useState(0);
  // Always-current workout ref — avoids stale closures in async callbacks
  const workoutRef = useRef(workout);
  workoutRef.current = workout;
  const workoutStartTimeRef = useRef(workoutStartTime);
  workoutStartTimeRef.current = workoutStartTime;
  const workoutInProgressRef = useRef(workoutInProgress);
  workoutInProgressRef.current = workoutInProgress;
  const setRowRefs = useRef({});
  const exerciseCardRefs = useRef({});

  // Carica l'allenamento in corso al mount
  useEffect(() => {
    loadActiveWorkout();
  }, []);

  const loadActiveWorkout = async () => {
    const activeWorkout = await Storage.getActiveWorkout();
    
    // Se c'è un allenamento attivo e corrisponde a questo workout
    if (activeWorkout && activeWorkout.workoutId === route.params.workout.id) {
      setWorkout(activeWorkout.workout);
      setWorkoutInProgress(true);
      setWorkoutStartTime(activeWorkout.startTime);
      // La durata verrà ricalcolata dal timer
    } else if (route.params?.workout) {
      setWorkout(route.params.workout);
    }
  };

  // Aggiorna il workout quando arrivano nuovi params (ma non sovrascrive l'allenamento attivo)
  useEffect(() => {
    if (route.params?.workout && !workoutInProgress) {
      setWorkout(route.params.workout);
    }
  }, [route.params?.workout]);

  // Timer per la durata dell'allenamento
  useEffect(() => {
    let interval;
    if (workoutInProgress && workoutStartTime) {
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - workoutStartTime) / 1000);
        setWorkoutDuration(elapsed);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [workoutInProgress, workoutStartTime]);

  const audioCtxRef = useRef(null);

  const ensureAudioCtx = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtxRef.current;
  };

  const playBeep = () => {
    try {
      const ctx = ensureAudioCtx();
      ctx.resume().then(() => {
        const count = 5;
        const beepDuration = 0.18;
        const gap = 0.1;
        for (let i = 0; i < count; i++) {
          const start = ctx.currentTime + i * (beepDuration + gap);
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = 'sine';
          osc.frequency.setValueAtTime(880, start);
          gain.gain.setValueAtTime(0.3, start);
          gain.gain.exponentialRampToValueAtTime(0.001, start + beepDuration);
          osc.start(start);
          osc.stop(start + beepDuration);
        }
      });
    } catch (_) {}
  };

  // Segna la serie come completata e fa partire il timer
  const scrollRef = useRef(null);
  const scrollYRef = useRef(0);
  const toggleSetCompleted = async (exIndex, setIndex) => {
    ensureAudioCtx(); // unlock AudioContext during user gesture for iOS
    const latest = workoutRef.current;
    const updatedWorkout = {
      ...latest,
      exercises: latest.exercises.map((ex, eIdx) => {
        if (eIdx !== exIndex) return ex;
        return {
          ...ex,
          sets: ex.sets.map((s, sIdx) => {
            if (sIdx !== setIndex) return s;
            return { ...s, completed: !s.completed };
          }),
        };
      }),
    };
    const set = updatedWorkout.exercises[exIndex].sets[setIndex];

    workoutRef.current = updatedWorkout;
    setWorkout(updatedWorkout);
    // Restore scroll position after re-render
    setTimeout(() => {
      if (scrollRef.current) scrollRef.current.scrollTo({ y: scrollYRef.current, animated: false });
    }, 0);

    // Se la serie viene marcata come completata e l'allenamento non è ancora iniziato, avvialo
    if (set.completed && !workoutInProgress) {
      const startTime = Date.now();
      setWorkoutInProgress(true);
      setWorkoutStartTime(startTime);
      setWorkoutDuration(0);
      await Storage.saveActiveWorkout({
        workoutId: updatedWorkout.id,
        workout: updatedWorkout,
        startTime: startTime,
      });
    } else if (workoutInProgress) {
      await Storage.saveActiveWorkout({
        workoutId: updatedWorkout.id,
        workout: updatedWorkout,
        startTime: workoutStartTime,
      });
    }

    // Salva nel calendario se completato, altrimenti aggiorna il template
    if (updatedWorkout.completedAt) {
      const calendar = await Storage.getCalendar();
      const index = calendar.findIndex((w) => w.id === updatedWorkout.id);
      if (index !== -1) {
        calendar[index] = updatedWorkout;
        await Storage.saveCalendar(calendar);
        await SupabaseStorage.syncCalendar();
      }
    } else {
      const templates = await Storage.getTemplates();
      const idx = templates.findIndex((t) => t.id === updatedWorkout.id);
      if (idx !== -1) {
        templates[idx] = updatedWorkout;
        await Storage.saveTemplates(templates);
      }
    }
    // Timer
    if (set.completed) {
      const restTime = set.time && set.time > 0 ? set.time : 90;
      setCurrentTimer(restTime);
    }
  };

  // Start inline editing
  const updateSetField = (exIndex, setIndex, field, rawValue) => {
    const latest = workoutRef.current;
    const updated = {
      ...latest,
      exercises: latest.exercises.map((ex, eIdx) => {
        if (eIdx !== exIndex) return ex;
        return {
          ...ex,
          sets: ex.sets.map((s, sIdx) => {
            if (sIdx !== setIndex) return s;
            const updatedSet = { ...s };
            if (field === 'reps') updatedSet.reps = rawValue === '' ? '' : (parseInt(rawValue) || 0);
            if (field === 'weight') updatedSet.weight = rawValue === '' ? '' : (parseFloat(rawValue) || 0);
            if (field === 'time') updatedSet.time = rawValue === '' ? '' : (parseInt(rawValue) || 0);
            return updatedSet;
          }),
        };
      }),
    };
    workoutRef.current = updated;
    setWorkout(updated);
  };

  const syncWorkoutToStorage = async () => {
    const latest = workoutRef.current;
    if (workoutInProgressRef.current) {
      await Storage.saveActiveWorkout({
        workoutId: latest.id,
        workout: latest,
        startTime: workoutStartTimeRef.current,
      });
    }
    if (!latest.completedAt) {
      const templates = await Storage.getTemplates();
      const idx = templates.findIndex((t) => t.id === latest.id);
      if (idx !== -1) {
        const templateToSave = {
          ...latest,
          exercises: latest.exercises.map((ex) => ({
            ...ex,
            sets: ex.sets.map((s) => ({
              reps: s.reps,
              weight: s.weight,
              rest: s.rest,
              time: s.time,
              completed: false,
            })),
          })),
        };
        templates[idx] = templateToSave;
        await Storage.saveTemplates(templates);
        await SupabaseStorage.syncTemplates();
      }
    }
  };

  // Salva la modifica della serie
  const saveEditSet = async () => {
    const { exIndex, setIndex, reps, weight } = editSetModal;
    const updatedWorkout = { ...workout };
    const set = updatedWorkout.exercises[exIndex].sets[setIndex];
    set.reps = parseInt(reps) || 0;
    set.weight = parseFloat(weight) || 0;
    setWorkout({ ...updatedWorkout });
    setEditSetModal({ ...editSetModal, visible: false });
    // Salva nel calendario se completato, altrimenti aggiorna il template
    if (workout.completedAt) {
      const calendar = await Storage.getCalendar();
      const index = calendar.findIndex((w) => w.id === workout.id);
      if (index !== -1) {
        calendar[index] = updatedWorkout;
        await Storage.saveCalendar(calendar);
        await SupabaseStorage.syncCalendar();
      }
    } else {
      // Aggiorna il template locale
      const templates = await Storage.getTemplates();
      const idx = templates.findIndex((t) => t.id === workout.id);
      if (idx !== -1) {
        templates[idx] = updatedWorkout;
        await Storage.saveTemplates(templates);
      }
    }
  };

  const handleShare = async () => {
    try {
      const result = await SharingService.shareWorkout(workout);
      
      if (result.success) {
        Clipboard.setString(result.shareCode);
        showPopup(
          'Codice Copiato!',
          `Il codice "${result.shareCode}" è stato copiato negli appunti.\n\nCondividilo con un amico per permettergli di importare questo allenamento.`
        );
      } else {
        showPopup('Errore', result.error || "Impossibile condividere l'allenamento");
      }
    } catch (error) {
      showPopup('Errore', 'Errore durante la condivisione');
    }
  };

  const noSleepRef = useRef(null);

  const acquireWakeLock = () => {
    try {
      if (!noSleepRef.current) noSleepRef.current = new NoSleep();
      noSleepRef.current.enable();
    } catch (_) {}
  };

  const releaseWakeLock = () => {
    try {
      if (noSleepRef.current) noSleepRef.current.disable();
    } catch (_) {}
  };

  const startWorkout = async () => {
    const startTime = Date.now();
    setWorkoutInProgress(true);
    setWorkoutStartTime(startTime);
    setWorkoutDuration(0);
    acquireWakeLock();
    // Persist immediately so edits made right after start survive a reload
    await Storage.saveActiveWorkout({
      workoutId: workout.id,
      workout,
      startTime,
    });
  };

  const stopWorkout = async () => {
    releaseWakeLock();
    await Storage.clearActiveWorkout();
    setWorkoutInProgress(false);
    setWorkoutStartTime(null);
    setWorkoutDuration(0);
    // Reset completed sets so the template stays clean
    const resetWorkout = {
      ...workout,
      exercises: workout.exercises.map((ex) => ({
        ...ex,
        sets: ex.sets.map((s) => ({ ...s, completed: false })),
      })),
    };
    setWorkout(resetWorkout);
  };

  const handleStopPress = () => {
    showPopup('Termina Allenamento', 'Vuoi salvare questo allenamento nel calendario?', [
      { text: 'Non Salvare', style: 'destructive', onPress: stopWorkout },
      { text: 'Salva', onPress: finishWorkout },
    ]);
  };

  const finishWorkout = async () => {
    releaseWakeLock();
    const now = new Date();
    const dateOnly = now.toISOString().split('T')[0]; // Formato: YYYY-MM-DD
    
    const completedWorkout = {
      ...workout,
      id: Date.now().toString(),
      date: dateOnly,
      duration: workoutDuration,
      completedAt: now.toISOString(),
    };

    // Salva nel calendario
    const calendar = await Storage.getCalendar();
    await Storage.saveCalendar([completedWorkout, ...calendar]);
    await SupabaseStorage.syncCalendar();

    // Aggiorna il template con i nuovi valori (pesi, reps, ecc.) per la prossima volta
    const templates = await Storage.getTemplates();
    const templateIndex = templates.findIndex((t) => t.id === workout.id);
    if (templateIndex !== -1) {
      // Crea una versione del workout senza completed e senza le info di completamento
      const updatedTemplate = {
        ...workout,
        exercises: workout.exercises.map((ex) => ({
          ...ex,
          sets: ex.sets.map((s) => ({
            reps: s.reps,
            weight: s.weight,
            rest: s.rest,
            time: s.time,
            completed: false, // Reset completed per la prossima volta
          })),
        })),
      };
      templates[templateIndex] = updatedTemplate;
      await Storage.saveTemplates(templates);
      await SupabaseStorage.syncTemplates();
    }

    setWorkoutInProgress(false);
    setWorkoutStartTime(null);
    setWorkoutDuration(0);
    
    // Cancella l'allenamento attivo dallo storage
    await Storage.clearActiveWorkout();

    showPopup(
      'Allenamento Completato!',
      `Durata: ${formatDuration(workoutDuration)}\n\nL'allenamento è stato salvato nel calendario.`
    );
  };

  const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  const totalVolume = calculateVolume(workout.exercises);
  const completedSets = workout.exercises.reduce(
    (sum, ex) => sum + ex.sets.filter((s) => s.completed).length,
    0
  );
  const totalSets = workout.exercises.reduce((sum, ex) => sum + ex.sets.length, 0);

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        onScroll={(e) => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}
      >
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{workout.name}</Text>
            <View style={styles.headerButtons}>
              <TouchableOpacity onPress={() => navigation.navigate('EditWorkout', { workout })} style={styles.iconButton}>
                <Ionicons name="pencil" size={24} color={colors.white} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleShare} style={styles.iconButton}>
                <Ionicons name="share-social" size={24} color={colors.white} />
              </TouchableOpacity>
            </View>
          </View>
          {!!workout.notes && (
            <View style={styles.notesCard}>
              <Text style={styles.notesLabel}>Note:</Text>
              <Text style={styles.notesText}>{workout.notes}</Text>
            </View>
          )}
        </View>

      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Ionicons name="fitness" size={24} color={colors.primary} />
          <Text style={styles.statValue}>{workout.exercises.length}</Text>
          <Text style={styles.statLabel}>Esercizi</Text>
        </View>
        <View style={styles.statItem}>
          <Ionicons name="checkbox" size={24} color={colors.success} />
          <Text style={styles.statValue}>
            {completedSets}/{totalSets}
          </Text>
          <Text style={styles.statLabel}>Serie</Text>
        </View>
        <View style={styles.statItem}>
          <Ionicons name="trending-up" size={24} color={colors.warning} />
          <Text style={styles.statValue}>{totalVolume}</Text>
          <Text style={styles.statLabel}>Volume (kg)</Text>
        </View>
      </View>

     {typeof currentTimer === 'number' && (
        <Modal visible={true} transparent animationType="fade">
          <View style={styles.timerOverlay}>
            <Timer
              initialSeconds={currentTimer}
              onComplete={() => { setCurrentTimer(null); playBeep(); }}
              onStop={() => setCurrentTimer(null)}
            />
          </View>
        </Modal>
      )}

      <View style={styles.exercisesList}>
        {workout.exercises.map((exercise, exIndex) => {
          const exVolume = calculateVolume([exercise]);
          return (
            <View
              key={exIndex}
              style={styles.exerciseCard}
              ref={ref => { if (ref) exerciseCardRefs.current[exIndex] = ref; }}
            >
              <View style={styles.exerciseHeader}>
                <Text style={styles.exerciseName}>
                  {String(exercise.exerciseName)}
                </Text>

                <Text style={styles.exerciseVolume}>
                  {Number(exVolume) || 0} kg
                </Text>
              </View>

              <View style={styles.setsContainer}>
                <View style={styles.setsHeader}>
                  <Text style={styles.setsHeaderText}>{'Serie'}</Text>
                  <Text style={styles.setsHeaderText}>{'Reps'}</Text>
                  <Text style={styles.setsHeaderText}>{'Peso'}</Text>
                  <Text style={styles.setsHeaderText}>{'Tempo (s)'}</Text>
                </View>
                {exercise.sets.map((set, setIndex) => {
                  const key = `${exIndex}-${setIndex}`;
                  return (
                    <View
                      key={setIndex}
                      style={[styles.setRow, set.completed && styles.setRowCompleted]}
                      ref={ref => { if (ref) setRowRefs.current[key] = ref; }}
                    >
                      {/* Checkbox numerata */}
                      <TouchableOpacity
                        style={styles.setCell}
                        onPress={() => toggleSetCompleted(exIndex, setIndex)}
                        activeOpacity={0.7}
                      >
                        {set.completed ? (
                          <Ionicons name="checkmark-circle" size={24} color={colors.success} />
                        ) : (
                          <View style={styles.setNumber}>
                            <Text style={styles.setNumberText}>{setIndex + 1}</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                      {/* Reps */}
                      <View style={styles.setCell}>
                        <TextInput
                          style={styles.setCellInput}
                          value={set.reps !== undefined && set.reps !== null ? String(set.reps) : ''}
                          onChangeText={(v) => updateSetField(exIndex, setIndex, 'reps', v)}
                          onBlur={syncWorkoutToStorage}
                          keyboardType="numeric"
                          returnKeyType="done"
                          selectTextOnFocus
                        />
                      </View>
                      {/* Peso */}
                      <View style={styles.setCell}>
                        <TextInput
                          style={styles.setCellInput}
                          value={set.weight !== undefined && set.weight !== null ? String(set.weight) : ''}
                          onChangeText={(v) => updateSetField(exIndex, setIndex, 'weight', v)}
                          onBlur={syncWorkoutToStorage}
                          keyboardType="decimal-pad"
                          returnKeyType="done"
                          selectTextOnFocus
                        />
                      </View>
                      {/* Tempo */}
                      <View style={styles.setCell}>
                        <TextInput
                          style={styles.setCellInput}
                          value={set.time !== undefined && set.time !== null ? String(set.time) : '90'}
                          onChangeText={(v) => updateSetField(exIndex, setIndex, 'time', v)}
                          onBlur={syncWorkoutToStorage}
                          keyboardType="numeric"
                          returnKeyType="done"
                          selectTextOnFocus
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })}
      </View>
            {/* No modal: inline editing only */}
      </ScrollView>

      <AlertModal visible={popup.visible} title={popup.title} message={popup.message} buttons={popup.buttons} onDismiss={hidePopup} />

      {/* Footer compatto */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.compactButton, workoutInProgress && styles.compactButtonActive]}
          onPress={workoutInProgress ? handleStopPress : startWorkout}
        >
          <Ionicons
            name={workoutInProgress ? "stop-circle" : "play-circle"}
            size={20}
            color={colors.white}
          />
          <Text style={styles.compactButtonText}>
            {workoutInProgress ? `Termina (${formatDuration(workoutDuration)})` : "Inizia Allenamento"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    backgroundColor: colors.primary,
    padding: 20,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    color: colors.white,
    fontSize: 28,
    fontWeight: 'bold',
    flex: 1,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    padding: 8,
  },
  date: {
    color: colors.white,
    fontSize: 16,
    opacity: 0.9,
  },
  notesCard: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  notesLabel: {
    color: colors.white,
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  notesText: {
    color: colors.white,
    fontSize: 14,
  },
  statsBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    padding: 16,
    gap: 12,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: colors.text,
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 8,
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
  timerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  exercisesList: {
    padding: 16,
  },
  exerciseCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  exerciseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  exerciseName: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  exerciseNotes: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
  exerciseVolume: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: 'bold',
  },
  setsContainer: {
    gap: 8,
  },
  setsHeader: {
    flexDirection: 'row',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  setsHeaderText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  setRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    borderRadius: 8,
    marginBottom: 2,
  },
  setRowCompleted: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  setCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setCellText: {
    color: colors.text,
    fontSize: 16,
    textAlign: 'center',
  },
  setCellInput: {
    color: colors.text,
    fontSize: 12,
    textAlign: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 2,
    width: '80%',
    alignSelf: 'center',
  },
  setNumber: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
  },
  setNumberText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: 'bold',
  },
  footer: {
    backgroundColor: colors.surface,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  compactButton: {
    flex: 1,
    backgroundColor: colors.success,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
  },
  compactButtonActive: {
    backgroundColor: colors.danger,
  },
  compactButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
});

export default WorkoutDetailScreen;
