import { useEffect, useState } from 'react';
import { initDb } from './data/db';
import { todayKey } from './domain/dates';
import type { DateKey } from './domain/types';
import { syncNotifications } from './services/notifications';
import { isNative } from './services/platform';
import { IconChart, IconChat, IconJournal, IconUser } from './ui/components/Icons';
import { ToastProvider } from './ui/components/Toast';
import { useSettings } from './ui/hooks/useSettings';
import { ChatScreen } from './ui/screens/Chat';
import { JournalScreen } from './ui/screens/Journal';
import { ProfileScreen } from './ui/screens/Profile';
import { TrackingScreen } from './ui/screens/Tracking';

type Tab = 'journal' | 'track' | 'chat' | 'profile';
const TABS: { id: Tab; label: string; Icon: typeof IconJournal }[] = [
  { id: 'journal', label: 'Journal', Icon: IconJournal },
  { id: 'track', label: 'Suivi', Icon: IconChart },
  { id: 'chat', label: 'Chat IA', Icon: IconChat },
  { id: 'profile', label: 'Profil', Icon: IconUser },
];

export default function App() {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>('journal');
  const [date, setDate] = useState<DateKey>(todayKey());
  const [settings, update] = useSettings();

  useEffect(() => {
    initDb().then(() => setReady(true));
  }, []);
  // Re-synchronise les rappels au démarrage (l'OS peut les perdre après une mise à jour).
  useEffect(() => {
    if (ready && isNative()) syncNotifications(settings.notifications).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  // Revenir sur aujourd'hui quand l'app est réouverte un autre jour.
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') setDate((d) => (d < todayKey() && d === lastToday ? todayKey() : d)); lastToday = todayKey(); };
    let lastToday = todayKey();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  if (!ready) return <div className="app" style={{ alignItems: 'center', justifyContent: 'center' }}><div className="muted">Chargement…</div></div>;

  return (
    <ToastProvider>
      <div className="app">
        <header className="app-header">
          <div>
            <h1>{TABS.find((t) => t.id === tab)?.label === 'Journal' ? 'NutriTrack' : TABS.find((t) => t.id === tab)?.label}</h1>
            <div className="sub">{settings.profile.weight} kg · {settings.profile.height} cm</div>
          </div>
        </header>
        <main className={'app-body' + (tab === 'chat' ? ' no-pad' : '')}>
          {tab === 'journal' && <JournalScreen settings={settings} date={date} setDate={setDate} goProfile={() => setTab('profile')} />}
          {tab === 'track' && <TrackingScreen settings={settings} update={update} />}
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
