import { describe, expect, it } from 'vitest';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { buildCoachPrompt, buildSamplePrompt, buildSystemPrompt, ChatSchema, LooseChatSchema, sendChatViaSample, type AiContext } from '../ai';
import { calcTargets, DEFAULT_PROFILE } from '../../domain/nutrition';
import type { ChatMessage } from '../../domain/types';

describe('sendChatViaSample (artefact)', () => {
  it("raccourcit l'historique quand le prompt dépasse la limite, sans toucher au message", async () => {
    const LIMIT = 2500;
    const prompts: string[] = [];
    const sample = {
      json: async (p: string) => { prompts.push(p); return { reply: 'ok', entries: [] }; },
      limits: async () => ({ maxPromptBytes: LIMIT }),
    };
    Object.assign(globalThis, { window: { claude: { use: async (name: string) => (name === 'sample' ? sample : null) } } });
    const history: ChatMessage[] = Array.from({ length: 12 }, (_, i) => ({ id: String(i), role: i % 2 ? 'assistant' : 'user', content: `message ${i} ${'x'.repeat(500)}`, createdAt: i }));
    const r = await sendChatViaSample({ system: { stable: 'Règles', day: 'Journée' }, history, userText: 'Question finale' });
    expect(r.reply).toBe('ok');
    const p = prompts[0];
    expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(LIMIT);
    expect(p).toContain('message 11');
    expect(p).not.toContain('message 0 ');
    expect(p).toContain('Question finale');
  });
});

describe('ChatSchema (sorties structurées de l’API)', () => {
  it('tous les objets sont fermés et tous leurs champs requis', () => {
    const { schema } = zodOutputFormat(ChatSchema) as unknown as { schema: unknown };
    const objects: Record<string, unknown>[] = [];
    const walk = (o: unknown) => {
      if (!o || typeof o !== 'object') return;
      const r = o as Record<string, unknown>;
      if (r.type === 'object') objects.push(r);
      Object.values(r).forEach(walk);
    };
    walk(schema);
    expect(objects.length).toBe(3);
    for (const o of objects) {
      expect(o.additionalProperties).toBe(false);
      expect([...(o.required as string[])].sort()).toEqual(Object.keys(o.properties as object).sort());
    }
  });
});

describe('LooseChatSchema (JSON libre de l’artefact)', () => {
  it("complète les champs manquants au lieu de perdre l'entrée", () => {
    const r = LooseChatSchema.parse({ reply: 'ok', entries: [{ name: 'Éclair', grams: '100', per100: { cal: 262, p: 5, g: 33, l: 12 } }] });
    expect(r.entries[0]).toEqual({ ref: '', name: 'Éclair', brand: '', meal: 'snack', grams: 100, unit: 'g', pieces: 0, pieceLabel: '', per100: { cal: 262, p: 5, g: 33, l: 12, fib: 0 } });
  });
  it('valeurs absentes : NaN, que la résolution écartera', () => {
    const r = LooseChatSchema.parse({ reply: 'ok', entries: [{ name: 'X', grams: 50 }] });
    expect(Number.isNaN(r.entries[0].per100.cal)).toBe(true);
  });
});

describe('buildSystemPrompt', () => {
  const ctx = (over: Partial<AiContext> = {}): AiContext => ({
    profile: DEFAULT_PROFILE,
    targets: calcTargets(DEFAULT_PROFILE, '2026-09-23'),
    consumed: { cal: 0, p: 0, g: 0, l: 0, fib: 0 },
    entries: [],
    date: '2026-09-23',
    currentMeal: 'lunch',
    adaptiveTdee: null,
    ...over,
  });
  it('la partie stable ne dépend pas de la journée, elle reste en cache', () => {
    const catalog = 'a1 | Pain blanc | 265 kcal P8 G50 L3 pour 100 g | g';
    const a = buildSystemPrompt(ctx(), catalog);
    const b = buildSystemPrompt(ctx({ date: '2026-09-24', currentMeal: 'dinner', consumed: { cal: 1200, p: 80, g: 120, l: 40, fib: 10 } }), catalog);
    expect(a.stable).toBe(b.stable);
    expect(a.stable).toContain(catalog);
    expect(a.day).not.toBe(b.day);
    expect(b.day).toContain('2026-09-24');
  });
});

describe('coach', () => {
  const base = {
    profile: DEFAULT_PROFILE, targets: calcTargets(DEFAULT_PROFILE, '2026-09-26'), consumed: { cal: 900, p: 60, g: 90, l: 30, fib: 8 },
    dateLabel: 'Sam 26 sept.', program: '- Dos : Tractions 4×8', habits: 'Pas de jours fixes.', recent: '- Ven 25 sept. : Bras / Épaules',
    suggestion: "Séance suggérée par l'app aujourd'hui : Pecs.", week: { avgCal: 2400, avgP: 170, loggedDays: 6 }, adaptiveTdee: 2900, realDeficit: -480, weightMa: 89.4,
  };
  it('partie stable (persona, habitudes, programme) indépendante du jour ; contexte du jour complet', () => {
    const a = buildCoachPrompt(base);
    const b = buildCoachPrompt({ ...base, dateLabel: 'Dim 27 sept.', recent: 'autre', consumed: { cal: 0, p: 0, g: 0, l: 0, fib: 0 } });
    expect(a.stable).toBe(b.stable);
    expect(a.stable).toContain('- Dos : Tractions 4×8');
    expect(a.stable).toContain('Pas de jours fixes.');
    expect(a.day).toContain('Sam 26 sept.');
    expect(a.day).toContain("Séance suggérée par l'app aujourd'hui : Pecs.");
    expect(a.day).toContain('2400 kcal et 170 g de protéines par jour en moyenne (6 jours saisis)');
    expect(a.day).toContain('bilan réel mesuré -480 kcal/j ; dépense mesurée 2900 kcal/j');
    expect(a.day).toContain('moyenne 7 jours 89.4 kg');
  });
  it('buildSamplePrompt : consignes finales ajoutées, sinon rien', () => {
    const p = buildCoachPrompt(base);
    expect(buildSamplePrompt(p, [], 'Je cours ?', 'Réponds en markdown.')).toMatch(/Je cours \?\n\nRéponds en markdown\.$/);
    expect(buildSamplePrompt(p, [], 'Je cours ?', '')).toMatch(/Je cours \?$/);
  });
});
