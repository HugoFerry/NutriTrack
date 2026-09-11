import { LocalNotifications } from '@capacitor/local-notifications';
import type { NotificationPrefs } from '../domain/types';
import { isNative } from './platform';

const ID_WEIGH = 1001;
const ID_JOURNAL = 1002;

function parseTime(t: string): { hour: number; minute: number } {
  const [h, m] = t.split(':').map(Number);
  return { hour: Number.isFinite(h) ? h : 8, minute: Number.isFinite(m) ? m : 0 };
}

/** (Re)programme les rappels quotidiens selon les préférences. */
export async function syncNotifications(prefs: NotificationPrefs): Promise<boolean> {
  if (!isNative()) return false;
  await LocalNotifications.cancel({ notifications: [{ id: ID_WEIGH }, { id: ID_JOURNAL }] });
  if (!prefs.weighIn && !prefs.journal) return true;
  const perm = await LocalNotifications.requestPermissions();
  if (perm.display !== 'granted') return false;
  const list = [];
  if (prefs.weighIn) {
    list.push({
      id: ID_WEIGH,
      title: 'Pesée du matin',
      body: 'Monte sur la balance et note ton poids dans NutriTrack.',
      schedule: { on: parseTime(prefs.weighInTime), allowWhileIdle: true },
    });
  }
  if (prefs.journal) {
    list.push({
      id: ID_JOURNAL,
      title: 'Journal du soir',
      body: 'Tout est noté pour aujourd’hui ?',
      schedule: { on: parseTime(prefs.journalTime), allowWhileIdle: true },
    });
  }
  await LocalNotifications.schedule({ notifications: list });
  return true;
}
