import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { ChatMessage, DailyTargets, JournalEntry, Macros, Meal, Profile } from '../domain/types';
import { ACTIVITY } from '../domain/nutrition';

export const MODELS = [
  { id: 'claude-opus-5', label: 'Claude Opus 5', desc: 'Le plus précis (recommandé)' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', desc: 'Rapide et économique' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', desc: 'Le moins cher' },
];

const EntrySchema = z.object({
  name: z.string().describe("Nom court de l'aliment ou du plat"),
  qtyLabel: z.string().describe('Quantité affichée, ex: "150g", "2 oeufs", "80g sec › 176g cuites"'),
  meal: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  cal: z.number().describe('Calories TOTALES pour la quantité (pas pour 100g)'),
  p: z.number().describe('Protéines totales en g'),
  g: z.number().describe('Glucides totaux en g'),
  l: z.number().describe('Lipides totaux en g'),
  fib: z.number().describe('Fibres totales en g'),
});

const ChatSchema = z.object({
  reply: z.string().describe("Réponse en français à afficher à l'utilisateur, en markdown léger"),
  entries: z.array(EntrySchema).describe("Aliments à ajouter au journal. Vide sauf si l'utilisateur dit avoir MANGÉ quelque chose."),
});

export type AiEntry = z.infer<typeof EntrySchema>;
export interface AiReply {
  reply: string;
  entries: AiEntry[];
}

export interface AiContext {
  profile: Profile;
  targets: DailyTargets;
  consumed: Macros;
  entries: JournalEntry[];
  date: string;
  currentMeal: Meal;
  adaptiveTdee: number | null;
}

const MEAL_FR: Record<Meal, string> = { breakfast: 'petit-déjeuner', lunch: 'déjeuner', dinner: 'dîner', snack: 'collation' };

export function buildSystemPrompt(c: AiContext): string {
  const p = c.profile;
  const t = c.targets;
  const rem = { cal: t.cal - c.consumed.cal, p: t.p - c.consumed.p, g: t.g - c.consumed.g, l: t.l - c.consumed.l };
  const act = ACTIVITY.find((a) => a.id === p.activity)?.label ?? p.activity;
  const eaten = c.entries.length
    ? c.entries.map((e) => `- [${MEAL_FR[e.meal]}] ${e.name} ${e.qtyLabel} : ${e.cal} kcal (P${e.p} G${e.g} L${e.l})`).join('\n')
    : "Rien d'enregistré pour l'instant.";
  return `Tu es un nutritionniste sportif expert, direct et motivant. Tu réponds en français, de façon concise.

## Utilisateur
${p.sex === 'male' ? 'Homme' : 'Femme'}, ${p.age} ans, ${p.height} cm, ${p.weight} kg. Activité : ${act}.
Jours d'entraînement : ${p.trainingDays.length}/sem. ${t.isTraining ? "Aujourd'hui est un jour d'entraînement." : "Aujourd'hui est un jour de repos."}
TDEE ${c.adaptiveTdee ? `mesuré ${c.adaptiveTdee} kcal (formule ${t.tdeeFormula})` : `${t.tdee} kcal`}. Déficit visé : ${t.deficit} kcal/j.

## Cibles du jour (${c.date})
${t.cal} kcal — Protéines ${t.p} g, Glucides ${t.g} g, Lipides ${t.l} g, Fibres ${t.fib} g.

## Déjà consommé
${eaten}
Total : ${Math.round(c.consumed.cal)} kcal (P${Math.round(c.consumed.p)} G${Math.round(c.consumed.g)} L${Math.round(c.consumed.l)} Fib${Math.round(c.consumed.fib)}).
Reste : ${Math.round(rem.cal)} kcal, P${Math.round(rem.p)} g, G${Math.round(rem.g)} g, L${Math.round(rem.l)} g.
Repas en cours de saisie : ${MEAL_FR[c.currentMeal]}.

## Règles
- Sois précis sur les valeurs. Repères : pâtes sèches 350 kcal/100g, cuites 160 ; riz sec 360, cuit 130 ; poulet 165 ; oeuf 78 kcal pièce ; huile 884/100g.
- Si l'utilisateur ne précise pas cru/cuit pour des féculents, demande-le au lieu de deviner, et ne remplis pas "entries".
- "entries" ne doit contenir des aliments QUE si l'utilisateur déclare avoir mangé ou bu quelque chose. Pour une question, une demande de conseil ou une hypothèse, "entries" est vide.
- Les valeurs de "entries" sont les totaux pour la quantité réellement consommée.
- Attribue chaque entrée au repas indiqué par l'utilisateur, sinon au repas en cours (${MEAL_FR[c.currentMeal]}).
- Quand tu ajoutes des entrées, dis-le en une ligne dans "reply" et donne un conseil court pour la suite de la journée.
- Une photo : identifie chaque aliment visible, estime les portions avec les repères visuels (assiette ≈ 26 cm, main, couverts) et donne une fourchette d'incertitude dans "reply".`;
}

export function makeClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2, timeout: 90_000 });
}

export interface ChatInput {
  apiKey: string;
  model: string;
  system: string;
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
    system: [{ type: 'text', text: input.system, cache_control: { type: 'ephemeral' } }],
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
  return { reply: parsed.reply, entries: parsed.entries.filter((e) => e.name && Number.isFinite(e.cal)) };
}

/** Message d'erreur lisible pour l'UI. */
export function describeAiError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return 'Clé API invalide. Vérifie-la dans Réglages.';
  if (e instanceof Anthropic.RateLimitError) return 'Trop de requêtes, patiente quelques secondes.';
  if (e instanceof Anthropic.APIConnectionError) return 'Pas de connexion au serveur.';
  if (e instanceof Anthropic.APIError) return `Erreur API (${e.status}) : ${e.message}`;
  return e instanceof Error ? e.message : 'Erreur inconnue';
}
