const EMPTY: never[] = [];
import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, newId } from '../../data/db';
import { addAiResults, addChat, allFoods, allRecipes, clearChat, entryFromFood, entryFromRecipe } from '../../data/repos';
import { buildCatalog, resolveAiFoods } from '../../domain/aiFoods';
import type { DateKey, Meal, Settings } from '../../domain/types';
import { buildSystemPrompt, describeAiError, describeSampleError, sampleAvailable, sendChat, sendChatViaSample } from '../../services/ai';
import { isArtifactBuild } from '../../services/artifact';
import { fileToJpegBase64, thumbnail } from '../../services/image';
import { pickFile } from '../../services/platform';
import { IconCamera, IconSend, IconTrash } from '../components/Icons';
import { Markdown } from '../components/Markdown';
import { useToast } from '../components/Toast';
import { useDay } from '../hooks/useDay';
import { mealForNow } from '../theme';

const STARTERS = [
  "J'ai mangé 2 oeufs et 80g de pâtes sèches avec 150g de poulet",
  'Ce midi : un kebab avec frites',
  'Que manger ce soir pour finir mes macros ?',
  "Combien de calories dans un croissant ?",
];

/** Bilan d'une saisie IA : ajoutés au journal, nouveaux aliments perso, entrées ignorées. */
function aiToast(added: number, created: number, skipped: number): string {
  const parts: string[] = [];
  if (added) parts.push(`${added} aliment${added > 1 ? 's' : ''} ajouté${added > 1 ? 's' : ''} au journal`);
  if (created) parts.push(`${created} nouveau${created > 1 ? 'x' : ''} dans Perso, à vérifier`);
  if (skipped) parts.push(`${skipped} ignoré${skipped > 1 ? 's' : ''} (quantité ou valeurs manquantes)`);
  return parts.join(' · ');
}

export function ChatScreen({ settings, date, goProfile }: { settings: Settings; date: DateKey; goProfile: () => void }) {
  const msgs = useLiveQuery(() => db.chat.orderBy('createdAt').toArray(), []) ?? EMPTY;
  const d = useDay(date, settings);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<{ base64: string; thumb: string; blob?: Blob } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const artifact = isArtifactBuild();
  const [sampleOk, setSampleOk] = useState<{ ok: boolean; images: boolean } | null>(null);
  useEffect(() => { if (artifact) sampleAvailable().then(setSampleOk); }, [artifact]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs.length, busy]);

  const pickPhoto = async () => {
    const file = await pickFile('image/*', artifact ? undefined : 'environment');
    if (!file) return;
    try {
      const { base64, dataUrl } = await fileToJpegBase64(file);
      setPhoto({ base64, thumb: await thumbnail(dataUrl), blob: file });
    } catch {
      toast('Image illisible', 'err');
    }
  };

  const send = async () => {
    const text = input.trim();
    if ((!text && !photo) || busy) return;
    if (!artifact && !settings.apiKey) { toast('Ajoute ta clé API dans Profil › IA', 'err'); goProfile(); return; }
    setBusy(true);
    setInput('');
    const img = photo;
    setPhoto(null);
    const history = msgs;
    await addChat({ role: 'user', content: text || '📷 Photo du repas', image: img?.thumb });
    try {
      const meal: Meal = mealForNow();
      // L'IA reçoit la base de l'utilisateur : elle réutilise ses aliments au lieu de les réestimer.
      const [foods, recipes] = await Promise.all([allFoods(), allRecipes()]);
      const catalog = buildCatalog(foods, recipes);
      const system = buildSystemPrompt({ profile: settings.profile, targets: d.targets, consumed: d.consumed, entries: d.entries, date, currentMeal: meal, adaptiveTdee: d.adaptiveInUse }, catalog.text);
      const res = artifact
        ? await sendChatViaSample({ system, history, userText: text, imageBlob: img?.blob })
        : await sendChat({ apiKey: settings.apiKey, model: settings.model, system, history, userText: text, imageBase64: img?.base64 });
      if (res.entries.length) {
        const { items, created, skipped } = resolveAiFoods(res.entries, catalog, foods, { now: Date.now(), newId });
        const entries = items.map((it, i) => {
          const e = it.kind === 'recipe' ? entryFromRecipe(it.recipe, it.servings, date, it.meal) : entryFromFood(it.food, it.qty, date, it.meal);
          return { ...e, createdAt: e.createdAt + i };
        });
        if (entries.length) await addAiResults(created, entries);
        toast(aiToast(entries.length, created.length, skipped), entries.length ? 'ok' : 'err');
      }
      await addChat({ role: 'assistant', content: res.reply });
    } catch (e) {
      await addChat({ role: 'assistant', content: '⚠️ ' + (artifact ? describeSampleError(e) : describeAiError(e)) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="chat">
      <div className="chat-msgs">
        {msgs.length === 0 && (
          <div className="center" style={{ marginTop: 24 }}>
            <div style={{ fontSize: 34 }}>🥗</div>
            <div className="bold mt8" style={{ fontSize: 16 }}>Nutritionniste IA</div>
            <div className="small dim mt4" style={{ lineHeight: 1.6 }}>Décris ce que tu as mangé ou envoie une photo de ton assiette : c'est ajouté au journal automatiquement. Pose aussi tes questions.</div>
            {!artifact && !settings.apiKey && <button className="btn outline sm mt12" onClick={goProfile}>Configurer ma clé API</button>}
            {artifact && <div className="callout info mt12" style={{ textAlign: 'left' }}>{sampleOk === null ? 'Connexion à Claude…' : sampleOk.ok ? "L'assistant utilise ton abonnement Claude : aucune clé API à configurer. Une autorisation te sera demandée au premier message." : "Claude n'est pas accessible dans cette vue (page ouverte hors de claude.ai ?)."}</div>}
            <div className="col mt16">
              {STARTERS.map((s) => <button key={s} className="pill" style={{ textAlign: 'left' }} onClick={() => setInput(s)}>{s}</button>)}
            </div>
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={'bubble ' + (m.role === 'user' ? 'user' : 'ai')}>
            {m.image && <img src={m.image} alt="" />}
            {m.role === 'user' ? m.content : <Markdown text={m.content} />}
          </div>
        ))}
        {busy && <div className="bubble ai dots"><span /><span /><span /></div>}
        <div ref={endRef} />
      </div>
      <div className="chat-in">
        {msgs.length > 0 && <button className="iconbtn" onClick={async () => { await clearChat(); toast('Conversation effacée'); }} aria-label="Effacer" title="Effacer la conversation"><IconTrash /></button>}
        {(!artifact || sampleOk?.images) && <button className="iconbtn" onClick={pickPhoto} aria-label="Photo" style={{ color: photo ? 'var(--acc)' : undefined }}>
          {photo ? <img src={photo.thumb} alt="" style={{ width: 30, height: 30, borderRadius: 6, objectFit: 'cover' }} /> : <IconCamera />}
        </button>}
        <textarea className="input" rows={1} value={input} onChange={(e) => setInput(e.target.value)} placeholder={photo ? 'Précision sur la photo (optionnel)…' : 'Dis ce que tu as mangé…'}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <button className="btn icon" onClick={send} disabled={busy || (!input.trim() && !photo)} aria-label="Envoyer"><IconSend style={{ width: 18, height: 18 }} /></button>
      </div>
    </div>
  );
}
