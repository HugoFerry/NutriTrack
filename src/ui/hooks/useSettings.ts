import { useLiveQuery } from 'dexie-react-hooks';
import { db, DEFAULT_SETTINGS } from '../../data/db';
import type { Settings } from '../../domain/types';
import { updateSettings } from '../../data/repos';

export function useSettings(): [Settings, (patch: Partial<Settings>) => Promise<void>] {
  const s = useLiveQuery(() => db.settings.get('app'), [], DEFAULT_SETTINGS);
  return [s ?? DEFAULT_SETTINGS, updateSettings];
}
