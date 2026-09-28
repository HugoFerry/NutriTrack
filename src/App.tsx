import { useEffect, useState } from 'react';
import { initDb } from './data/db';
import { todayKey } from './domain/dates';
import type { DateKey } from './domain/types';
import { syncNotifications } from './services/notifications';
import { syncHealth } from './services/health';
import { isArtifactBuild } from './services/artifact';
import { onNewerVersion, resync, startSync } from './data/sync';
import { isNative } from './services/platform';
import { IconChart, IconChat, IconDumbbell, IconJournal, IconRefresh, IconUser } from './ui/components/Icons';
import { ToastProvider } from './ui/components/Toast';
import { useSettings } from './ui/hooks/useSettings';
import { ChatScreen } from './ui/screens/Chat';
import { JournalScreen } from './ui/screens/Journal';
import { ProfileScreen } from './ui/screens/Profile';
import { SportScreen } from './ui/screens/Sport';
import { TrackingScreen } from './ui/screens/Tracking';

type Tab = 'journal' | 'track' | 'sport' | 'chat' | 'profile';
const TABS: { id: Tab; label: string; Icon: typeof IconJournal }[] = [
  { id: 'journal', label: 'Journal', Icon: IconJournal },
  { id: 'track', label: 'Suivi', Icon: IconChart },
  { id: 'sport', label: 'Sport', Icon: IconDumbbell },
  { id: 'chat', label: 'IA', Icon: IconChat },
  { id: 'profile', label: 'Profil', Icon: IconUser },
];

export default function App() {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>('journal');
  const [date, setDate] = useState<DateKey>(todayKey());
  const [settings, update] = useSettings();
  const [newer, setNewer] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    initDb().then(() => {
      setReady(true);
      if (isArtifactBuild()) startSync().catch(() => {});
    });
  }, []);
  // Re-synchronise les rappels au démarrage (l'OS peut les perdre après une mise à jour).
  useEffect(() => {
    if (!ready || !isNative()) return;
    syncNotifications(settings.notifications).catch(() => {});
    syncHealth().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  // Revenir sur aujourd'hui quand l'app est réouverte un autre jour ; dans la version web, resynchroniser :
  // une mise en veille ou un onglet en arrière-plan coupe l'écoute des changements sans prévenir.
  useEffect(() => {
    let lastResync = Date.now();
    const refresh = () => {
      if (!isArtifactBuild() || Date.now() - lastResync < 15_000) return;
      lastResync = Date.now();
      resync().catch(() => {});
    };
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      setDate((d) => (d < todayKey() && d === lastToday ? todayKey() : d));
      lastToday = todayKey();
      if (isNative()) syncHealth().catch(() => {});
      refresh();
    };
    let lastToday = todayKey();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', refresh);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', refresh);
    };
  }, []);
  useEffect(() => onNewerVersion(setNewer), []);

  /** Bouton « Actualiser » : données resynchronisées, puis l'app rechargée (qui prend la dernière version si possible). */
  const actualiser = async () => {
    setRefreshing(true);
    await resync().catch(() => false);
    window.location.reload();
  };

  if (!ready) return <div className="app" style={{ alignItems: 'center', justifyContent: 'center' }}><div className="muted">Chargement…</div></div>;

  return (
    <ToastProvider>
      <div className="app">
        <header className="app-header">
          <div>
            <h1>{TABS.find((t) => t.id === tab)?.label === 'Journal' ? 'NutriTrack' : TABS.find((t) => t.id === tab)?.label}</h1>
            <div className="sub">{settings.profile.weight} kg · {settings.profile.height} cm</div>
          </div>
          {isArtifactBuild() && (
            <button className={'btn ghost icon' + (refreshing ? ' spin' : '')} onClick={actualiser} disabled={refreshing} aria-label="Actualiser" title="Actualiser : resynchroniser et recharger">
              <IconRefresh style={{ width: 18, height: 18 }} />
            </button>
          )}
        </header>
        <main className={'app-body' + (tab === 'chat' ? ' no-pad' : '')}>
          {newer && (
            <div className="callout warn mb12">
              Une version plus récente de NutriTrack a été publiée. Ferme l'artefact puis rouvre-le pour l'avoir.
              <button className="btn sm ghost mt8" onClick={actualiser}>Essayer de recharger</button>
            </div>
          )}
          {tab === 'journal' && <JournalScreen settings={settings} date={date} setDate={setDate} goProfile={() => setTab('profile')} />}
          {tab === 'track' && <TrackingScreen settings={settings} update={update} />}
          {tab === 'sport' && <SportScreen settings={settings} />}
          {tab === 'chat' && <ChatScreen settings={settings} date={date} goProfile={() => setTab('profile')} />}
          {tab === 'profile' && <ProfileScreen settings={settings} update={update} />}
        </main>
        <nav className="tabbar">
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon /><span>{label}</span></button>
          ))}
        </nav>
      </div>
    </ToastProvider>
  );
}
