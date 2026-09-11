import { describe, expect, it } from 'vitest';
import { groupDaily, groupWorkouts, hasTrainingWorkout, trainingOverride, workoutLabel } from '../health';
import { toDateKey } from '../dates';

const local = (y: number, m: number, d: number, h: number) => new Date(y, m - 1, d, h).toISOString();

describe('health', () => {
  it('regroupe les séances par jour local et les libelle', () => {
    const g = groupWorkouts([
      { startDate: local(2026, 9, 10, 18), endDate: local(2026, 9, 10, 19), workoutType: 'STRENGTH_TRAINING', duration: 3300, calories: 320.4, sourceBundleId: 'com.sec.android.app.shealth' },
      { startDate: local(2026, 9, 10, 7), endDate: local(2026, 9, 10, 7), workoutType: 'WALKING', duration: 30 },
      { startDate: local(2026, 9, 11, 8), endDate: local(2026, 9, 11, 9), workoutType: 'RUNNING', duration: 1800 },
    ]);
    const k = toDateKey(new Date(2026, 8, 10));
    expect(g.get(k)).toHaveLength(1);
    expect(g.get(k)![0]).toMatchObject({ label: 'Musculation', minutes: 55, kcal: 320, source: 'Samsung Health' });
    expect(g.get(toDateKey(new Date(2026, 8, 11)))![0].label).toBe('Course');
    expect(workoutLabel('SOME_NEW_TYPE')).toBe('Some new type');
  });
  it('agrège les pas par jour', () => {
    const g = groupDaily([{ startDate: local(2026, 9, 10, 0), value: 5000 }, { startDate: local(2026, 9, 10, 12), value: 3200.6 }]);
    expect(g.get(toDateKey(new Date(2026, 8, 10)))).toBe(8201);
  });
  it('détermine le type de jour', () => {
    const day = { training: null, workouts: [{ type: 'WALKING', label: 'Marche', minutes: 15, kcal: 50, source: '', start: 0 }] };
    expect(hasTrainingWorkout(day, 20)).toBe(false);
    expect(trainingOverride(day, true, 20)).toBeNull();
    expect(trainingOverride({ ...day, workouts: [{ ...day.workouts[0], minutes: 45 }] }, true, 20)).toBe(true);
    expect(trainingOverride({ ...day, workouts: [{ ...day.workouts[0], minutes: 45 }] }, false, 20)).toBeNull();
    expect(trainingOverride({ ...day, training: false, workouts: [{ ...day.workouts[0], minutes: 45 }] }, true, 20)).toBe(false);
  });
});
