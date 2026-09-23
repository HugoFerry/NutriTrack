import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { AiFood } from '../domain/aiFoods';
import type { ChatMessage, DailyTargets, JournalEntry, Macros, Meal, Profile } from '../domain/types';
import { ACTIVITY } from '../domain/nutrition';
import { artifactSample } from './artifact';

export const MODELS = [
  { id: 'claude-opus-5', label: 'Claude Opus 5', desc: 'Le plus précis (recommandé)' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', desc: 'Rapide et économique' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', desc: 'Le moins cher' },
];

const MEAL_IDS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

const Per100Schema = z.object({
  cal: z.number().describe('kcal pour 100 g (ou 100 ml)'),
  p: z.number().describe('Protéines (g) pour 100 g'),
  g: z.number().describe('Glucides (g) pour 100 g'),
  l: z.number().describe('Lipides (g) pour 100 g'),
  fib: z.number().describe('Fibres (g) pour 100 g'),
});

const EntrySchema = z.object({
  ref: z.string().describe('Référence du catalogue (a12, r3…) si un aliment ou une recette correspond, sinon chaîne vide'),
  name: z.string().describe("Nom court de l'aliment ou du plat, sans quantité"),
  brand: z.string().describe('Marque si connue (Picard, Lidl…), sinon chaîne vide'),
  meal: z.enum(MEAL_IDS),
  grams: z.number().describe('Quantité consommée en g (ou ml), estimée si comptée en pièces ; poids sec pour un aliment du catalogue en poids sec'),
  unit: z.enum(['g', 'ml']),
  pieces: z.number().describe("Nombre de pièces (ou de portions d'une recette) si l'utilisateur compte ainsi, sinon 0"),
  pieceLabel: z.string().describe("Nom d'une pièce au singulier (boulette, tranche…), sinon chaîne vide"),
  per100: Per100Schema.describe('Valeurs pour 100 g (ou 100 ml), toujours remplies ; avec une référence, celles du catalogue'),
});

export const ChatSchema = z.object({
  reply: z.string().describe("Réponse en français à afficher à l'utilisateur, en markdown léger"),
  entries: z.array(EntrySchema).describe("Aliments à ajouter au journal. Vide sauf si l'utilisateur dit avoir MANGÉ quelque chose."),
});

// Version tolérante pour le JSON libre de l'artefact : un champ manquant ne fait pas perdre l'entrée.
const looseNum = z.coerce.number().catch(Number.NaN);
export const LooseChatSchema = z.object({
  reply: z.string().catch(''),
  entries: z
    .array(
      z.object({
        ref: z.string().catch(''),
        name: z.string().catch(''),
        brand: z.string().catch(''),
        meal: z.enum(MEAL_IDS).catch('snack'),
        grams: z.coerce.number().catch(0),
        unit: z.enum(['g', 'ml']).catch('g'),
        pieces: z.coerce.number().catch(0),
        pieceLabel: z.string().catch(''),
        per100: z
          .object({ cal: looseNum, p: looseNum, g: looseNum, l: looseNum, fib: z.coerce.number().catch(0) })
          .catch({ cal: Number.NaN, p: Number.NaN, g: Number.NaN, l: Number.NaN, fib: 0 }),
      }),
    )
    .catch([]),
});

export interface AiReply {
  reply: string;
  entries: AiFood[];
}

/** Garde les entrées exploitables : un nom ou une référence au catalogue. */
const usable = (e: AiFood) => !!(e.name.trim() || e.ref.trim());

export interface AiContext {
  profile: Profile;
  targets: DailyTargets;
  consumed: Macros;
  entries: JournalEntry[];
  date: string;
  currentMeal: Meal;
  adaptiveTdee: number | null;
}

/** Prompt système en deux parties, dans l'ordre d'envoi. */
export interface SystemPrompt {
  /** Rôle, règles et catalogue : identiques d'un message à l'autre tant que la base ne change pas (mis en cache). */
  stable: string;
  /** Contexte du jour : profil, cibles, déjà consommé. */
  day: string;
}

const MEAL_FR: Record<Meal, string> = { breakfast: 'petit-déjeuner', lunch: 'déjeuner', dinner: 'dîner', snack: 'collation' };

export function buildSystemPrompt(c: AiContext, catalog: string): SystemPrompt {
  const p = c.profile;
  const t = c.targets;
  const rem = { cal: t.cal - c.consumed.cal, p: t.p - c.consumed.p, g: t.g - c.consumed.g, l: t.l - c.consumed.l };
  const act = ACTIVITY.find((a) => a.id === p.activity)?.label ?? p.activity;
  const eaten = c.entries.length
    ? c.entries.map((e) => `- [${MEAL_FR[e.meal]}] ${e.name} ${e.qtyLabel} : ${e.cal} kcal (P${e.p} G${e.g} L${e.l})`).join('\n')
    : "Rien d'enregistré pour l'instant.";
  const stable = `Tu es un nutritionniste sportif expert, direct et motivant. Tu réponds en français, de façon concise.

## Règles
- Sois précis sur les valeurs. Repères : pâtes sèches 350 kcal/100g, cuites 160 ; riz sec 360, cuit 130 ; poulet 165 ; oeuf 78 kcal pièce ; huile 884/100g.
- Si l'utilisateur ne précise pas cru/cuit pour des féculents, demande-le au lieu de deviner, et ne remplis pas "entries".
- "entries" ne doit contenir des aliments QUE si l'utilisateur déclare avoir mangé ou bu quelque chose. Pour une question, une demande de conseil ou une hypothèse, "entries" est vide.
- Attribue chaque entrée au repas indiqué par l'utilisateur, sinon au repas en cours (donné dans le contexte du jour).
- Quand tu ajoutes des entrées, dis-le en une ligne dans "reply" et donne un conseil court pour la suite de la journée.
- Une photo : identifie chaque aliment visible, estime les portions avec les repères visuels (assiette ≈ 26 cm, main, couverts) et donne une fourchette d'incertitude dans "reply".

## Saisie des aliments
Cherche d'abord chaque aliment dans le catalogue de l'utilisateur ci-dessous : ce sont ses propres valeurs, elles priment sur les tiennes.
- Un aliment ou une recette du catalogue correspond (même produit, même état : sec ou cuit, cru ou cuit) : mets sa référence dans "ref" et la quantité dans l'unité indiquée, "grams" (poids sec pour un aliment en poids sec) ou "pieces" pour un aliment compté en pièces et pour une recette (nombre de portions).
- Sinon "ref" est vide : nom court sans quantité, marque si elle est connue, poids consommé dans "grams". Pour un produit de marque, prends les valeurs de son étiquette si tu les connais ; sur une photo d'étiquette, recopie-les.
- Si l'utilisateur compte en pièces (9 boulettes, 2 tranches), mets ce nombre dans "pieces", le nom d'une pièce au singulier dans "pieceLabel" et le poids total estimé dans "grams".
- Remplis toujours "per100" (valeurs pour 100 g ou 100 ml) ; avec une référence, recopie celles de sa ligne du catalogue.
- Un aliment absent du catalogue est ajouté aux aliments perso de l'utilisateur, à vérifier : dis-le dans "reply".

## Catalogue (réf | nom | valeurs | unité de saisie)
${catalog || '(vide)'}`;
  const day = `## Utilisateur
${p.sex === 'male' ? 'Homme' : 'Femme'}, ${p.age} ans, ${p.height} cm, ${p.weight} kg. Activité : ${act}.
Jours d'entraînement : ${p.trainingDays.length}/sem. ${t.isTraining ? "Aujourd'hui est un jour d'entraînement." : "Aujourd'hui est un jour de repos."}
TDEE ${c.adaptiveTdee ? `mesuré ${c.adaptiveTdee} kcal (formule ${t.tdeeFormula})` : `${t.tdee} kcal`}. Déficit visé : ${t.deficit} kcal/j.

## Cibles du jour (${c.date})
${t.cal} kcal — Protéines ${t.p} g, Glucides ${t.g} g, Lipides ${t.l} g, Fibres ${t.fib} g.

## Déjà consommé
${eaten}
Total : ${Math.round(c.consumed.cal)} kcal (P${Math.round(c.consumed.p)} G${Math.round(c.consumed.g)} L${Math.round(c.consumed.l)} Fib${Math.round(c.consumed.fib)}).
Reste : ${Math.round(rem.cal)} kcal, P${Math.round(rem.p)} g, G${Math.round(rem.g)} g, L${Math.round(rem.l)} g.
Repas en cours de saisie : ${MEAL_FR[c.currentMeal]}.`;
  return { stable, day };
}

export function makeClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2, timeout: 90_000 });
}

export interface ChatInput {
  apiKey: string;
  model: string;
  system: SystemPrompt;
  history: ChatMessage[];
  userText: string;
  imageBase64?: string;
}

export async function sendChat(input: ChatInput): Promise<AiReply> {
  if (!input.apiKey) throw new Error('Ajoute ta clé API Anthropic dans Réglages.');
  const client = makeClient(input.apiKey);

  const messages: Anthropic.MessageParam[] = input.history
    .filter((m) => m.content.trim())
    .slice(-16)
    .map((m) => ({ role: m.role, content: m.content }));

  const content: Anthropic.ContentBlockParam[] = [];
  if (input.imageBase64) {
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: input.imageBase64 } });
  }
  content.push({ type: 'text', text: input.userText || (input.imageBase64 ? "Voici ce que j'ai mangé. Estime les aliments et les quantités, puis ajoute-les au journal." : '') });
  messages.push({ role: 'user', content });

  const response = await client.messages.parse({
    model: input.model,
    max_tokens: 4000,
    // Partie stable d'abord, marquée pour le cache ; le contexte du jour change à chaque repas et vient après.
    system: [
      { type: 'text', text: input.system.stable, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: input.system.day },
    ],
    messages,
    // Haiku 4.5 n'accepte pas `effort` ; sur les autres modèles, 'low' suffit pour du chat.
    output_config: { format: zodOutputFormat(ChatSchema), ...(input.model.startsWith('claude-haiku') ? {} : { effort: 'low' as const }) },
  });

  if (response.stop_reason === 'refusal') {
    return { reply: "Je ne peux pas répondre à cette demande. Reformule autrement ?", entries: [] };
  }
  const parsed = response.parsed_output;
  if (!parsed) {
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    return { reply: text || 'Réponse illisible, réessaie.', entries: [] };
  }
  return { reply: parsed.reply, entries: parsed.entries.filter(usable) };
}

/** Message d'erreur lisible pour l'UI. */
export function describeAiError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return 'Clé API invalide. Vérifie-la dans Réglages.';
  if (e instanceof Anthropic.RateLimitError) return 'Trop de requêtes, patiente quelques secondes.';
  if (e instanceof Anthropic.APIConnectionError) return 'Pas de connexion au serveur.';
  if (e instanceof Anthropic.APIError) return `Erreur API (${e.status}) : ${e.message}`;
  return e instanceof Error ? e.message : 'Erreur inconnue';
}

// ---------- Version artefact : Claude via l'abonnement du visiteur ----------

const JSON_FORMAT = `Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour ni bloc de code, de la forme :
{"reply": "texte markdown léger pour l'utilisateur", "entries": [{"ref": "a12 ou vide", "name": "…", "brand": "", "meal": "breakfast|lunch|dinner|snack", "grams": 0, "unit": "g|ml", "pieces": 0, "pieceLabel": "", "per100": {"cal": 0, "p": 0, "g": 0, "l": 0, "fib": 0}}]}
"entries" est vide sauf si l'utilisateur déclare avoir mangé quelque chose.`;

export interface SampleChatInput {
  system: SystemPrompt;
  history: ChatMessage[];
  userText: string;
  imageBlob?: Blob;
}

export async function sampleAvailable(): Promise<{ ok: boolean; images: boolean }> {
  const s = await artifactSample();
  if (!s) return { ok: false, images: false };
  try {
    const l = await s.limits();
    return { ok: true, images: !!l.images };
  } catch {
    return { ok: true, images: false };
  }
}

/** Même contrat que sendChat, mais via Claude sur l'abonnement du visiteur (sans clé API). */
export async function sendChatViaSample(input: SampleChatInput): Promise<AiReply> {
  const s = await artifactSample();
  if (!s) throw new Error("L'assistant IA n'est pas disponible dans cette vue.");
  const history = input.history.filter((m) => m.content.trim());
  const build = (keep: number) => {
    const transcript = history
      .slice(history.length - keep)
      .map((m) => `${m.role === 'user' ? 'Utilisateur' : 'Assistant'} : ${m.content}`)
      .join('\n');
    return (
      `${input.system.stable}\n\n${input.system.day}\n\n## Historique récent\n${transcript || '(aucun)'}\n\n## Message de l'utilisateur\n` +
      (input.userText || (input.imageBlob ? "Voici une photo de ce que j'ai mangé. Estime les aliments et les quantités, puis ajoute-les au journal." : '')) +
      (input.imageBlob ? "\n(Une photo du repas est jointe : identifie chaque aliment visible et estime les portions.)" : '') +
      `\n\n${JSON_FORMAT}`
    );
  };
  // Le catalogue alourdit le prompt : on raccourcit l'historique plutôt que d'échouer sur la limite de taille.
  const limit = await s.limits().then((l) => l.maxPromptBytes ?? Infinity, () => Infinity);
  const bytes = (t: string) => new TextEncoder().encode(t).length;
  let keep = Math.min(12, history.length);
  let prompt = build(keep);
  while (keep > 0 && bytes(prompt) > limit) {
    keep = Math.max(0, keep - 2);
    prompt = build(keep);
  }
  const raw = await s.json<unknown>(prompt, { modelTier: 'default', cache: false, images: input.imageBlob });
  const parsed = LooseChatSchema.safeParse(raw);
  if (!parsed.success) {
    const text = typeof raw === 'object' && raw && 'reply' in raw ? String((raw as { reply: unknown }).reply) : 'Réponse illisible, réessaie.';
    return { reply: text, entries: [] };
  }
  return { reply: parsed.data.reply || 'Réponse illisible, réessaie.', entries: parsed.data.entries.filter(usable) };
}

export function describeSampleError(e: unknown): string {
  const code = typeof e === 'object' && e && 'code' in e ? String((e as { code: unknown }).code) : '';
  switch (code) {
    case 'not_granted': return "Tu as refusé l'accès à Claude pour cette page. Recharge-la pour redonner l'autorisation.";
    case 'rate_limited': return 'Trop de requêtes, patiente une minute.';
    case 'prompt_too_large': return 'Message trop long, raccourcis ou efface la conversation.';
    case 'images_unavailable': return "Les photos ne sont pas disponibles dans cette vue.";
    case 'image_rejected': return 'Image refusée : essaie un JPEG ou un PNG plus léger.';
    case 'invalid_json': return "Réponse mal formée, réessaie.";
    case 'refused': return "Claude n'a pas pu répondre à cette demande.";
    default: return e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : 'Erreur inconnue';
  }
}

