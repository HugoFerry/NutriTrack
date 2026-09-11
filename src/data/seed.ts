import type { FoodItem } from '../domain/types';

type SeedFood = Omit<FoodItem, 'id' | 'category' | 'source' | 'favorite' | 'createdAt' | 'unit'> & { unit?: FoodItem['unit'] };

const S: Record<string, SeedFood[]> = {
  Féculents: [
    { name: 'Pâtes (poids sec)', cal: 350, p: 12, g: 72, l: 1.5, fib: 3, dry: 2.2, dryNote: 'cuites', quickQty: [60, 80, 100, 120] },
    { name: 'Pâtes cuites', cal: 160, p: 5.5, g: 31, l: 0.7, fib: 1.4, quickQty: [150, 200, 250] },
    { name: 'Riz blanc (poids sec)', cal: 360, p: 7, g: 79, l: 0.6, fib: 1.3, dry: 2.5, dryNote: 'cuit', quickQty: [60, 80, 100] },
    { name: 'Riz blanc cuit', cal: 130, p: 2.7, g: 28, l: 0.3, fib: 0.4, quickQty: [150, 200, 250] },
    { name: 'Riz complet (poids sec)', cal: 362, p: 7.5, g: 76, l: 2.7, fib: 3.6, dry: 2.5, dryNote: 'cuit', quickQty: [60, 80, 100] },
    { name: 'Riz complet cuit', cal: 123, p: 2.7, g: 25.6, l: 0.9, fib: 1.6, quickQty: [150, 200, 250] },
    { name: 'Pomme de terre', cal: 80, p: 2, g: 17, l: 0.1, fib: 1.8, note: 'Cuite', quickQty: [150, 200, 300] },
    { name: 'Patate douce', cal: 90, p: 1.6, g: 20, l: 0.1, fib: 3, note: 'Cuite', quickQty: [150, 200, 300] },
    { name: 'Pain blanc', cal: 265, p: 8, g: 50, l: 3, fib: 2.7, note: '1 tranche = 30g', quickQty: [30, 60, 90] },
    { name: 'Pain complet', cal: 247, p: 10, g: 43, l: 3.5, fib: 6.8, note: '1 tranche = 30g', quickQty: [30, 60, 90] },
    { name: "Flocons d'avoine", cal: 372, p: 13, g: 60, l: 7, fib: 10, note: 'Poids sec', quickQty: [40, 60, 80] },
    { name: 'Quinoa cuit', cal: 120, p: 4.4, g: 21, l: 1.9, fib: 2.8, quickQty: [150, 200] },
    { name: 'Semoule cuite', cal: 112, p: 3.6, g: 23, l: 0.2, fib: 1.4, quickQty: [150, 200, 250] },
    { name: 'Lentilles cuites', cal: 116, p: 9, g: 20, l: 0.4, fib: 7.9, quickQty: [150, 200] },
    { name: 'Pois chiches cuits', cal: 164, p: 8.9, g: 27, l: 2.6, fib: 7.6, quickQty: [100, 150] },
    { name: 'Galettes de riz', cal: 387, p: 8, g: 82, l: 3, fib: 3, unit: 'pcs', pcs: 8, pcsLabel: 'galette' },
    { name: 'Wrap / tortilla', cal: 310, p: 8, g: 50, l: 8, fib: 3, unit: 'pcs', pcs: 60, pcsLabel: 'wrap' },
  ],
  Protéines: [
    { name: 'Blanc de poulet', cal: 165, p: 31, g: 0, l: 3.6, fib: 0, quickQty: [120, 150, 200] },
    { name: 'Cuisse de poulet (sans peau)', cal: 177, p: 26, g: 0, l: 8, fib: 0, quickQty: [120, 150, 200] },
    { name: 'Steak haché 5%', cal: 137, p: 26, g: 0, l: 5, fib: 0, quickQty: [100, 125, 150] },
    { name: 'Steak haché 15%', cal: 217, p: 24, g: 0, l: 15, fib: 0, quickQty: [100, 125, 150] },
    { name: 'Saumon', cal: 208, p: 20, g: 0, l: 13, fib: 0, quickQty: [120, 150] },
    { name: 'Thon en boîte (naturel)', cal: 116, p: 26, g: 0, l: 1, fib: 0, note: '1 boîte = 112g égouttée', quickQty: [112] },
    { name: 'Cabillaud', cal: 82, p: 18, g: 0, l: 0.7, fib: 0, quickQty: [150, 200] },
    { name: 'Crevettes', cal: 99, p: 24, g: 0.2, l: 0.3, fib: 0, quickQty: [100, 150] },
    { name: 'Oeuf entier', cal: 155, p: 13, g: 1.1, l: 11, fib: 0, unit: 'pcs', pcs: 60, pcsLabel: 'oeuf', quickQty: [1, 2, 3] },
    { name: "Blanc d'oeuf", cal: 52, p: 11, g: 0.7, l: 0.2, fib: 0, unit: 'pcs', pcs: 33, pcsLabel: 'blanc', quickQty: [2, 3, 4] },
    { name: 'Whey protéine', cal: 400, p: 80, g: 8, l: 5, fib: 0, unit: 'pcs', pcs: 30, pcsLabel: 'scoop', note: '1 scoop = 30g', quickQty: [1, 2] },
    { name: 'Dinde (escalope)', cal: 135, p: 30, g: 0, l: 1, fib: 0, quickQty: [120, 150, 200] },
    { name: 'Jambon blanc', cal: 110, p: 20, g: 1, l: 3, fib: 0, note: '1 tranche = 40g', quickQty: [40, 80] },
    { name: 'Tofu ferme', cal: 144, p: 15, g: 2, l: 8.7, fib: 1, quickQty: [100, 150] },
    { name: 'Skyr', cal: 60, p: 10.5, g: 4, l: 0.2, fib: 0, note: '1 pot = 150g', quickQty: [150, 200] },
  ],
  Lipides: [
    { name: "Huile d'olive", cal: 884, p: 0, g: 0, l: 100, fib: 0, unit: 'pcs', pcs: 14, pcsLabel: 'c.à.s', note: '1 c.à.s = 14g', quickQty: [0.5, 1, 2] },
    { name: 'Beurre', cal: 717, p: 0.9, g: 0.1, l: 81, fib: 0, note: '1 noisette = 10g', quickQty: [10, 15, 20] },
    { name: 'Beurre de cacahuète', cal: 588, p: 25, g: 20, l: 50, fib: 6, note: '1 c.à.s = 15g', quickQty: [15, 30] },
    { name: 'Amandes', cal: 579, p: 21, g: 22, l: 50, fib: 12, note: '1 poignée = 25g', quickQty: [15, 25, 30] },
    { name: 'Noix', cal: 654, p: 15, g: 14, l: 65, fib: 6.7, note: '1 poignée = 25g', quickQty: [15, 25] },
    { name: 'Noix de cajou', cal: 553, p: 18, g: 30, l: 44, fib: 3.3, quickQty: [20, 30] },
    { name: 'Avocat', cal: 160, p: 2, g: 8.5, l: 15, fib: 6.7, unit: 'pcs', pcs: 170, pcsLabel: 'avocat', quickQty: [0.5, 1] },
    { name: 'Chocolat noir 70%', cal: 598, p: 8, g: 46, l: 43, fib: 11, note: '1 carré = 10g', quickQty: [10, 20, 30] },
  ],
  Laitiers: [
    { name: 'Fromage blanc 0%', cal: 46, p: 8, g: 3.5, l: 0.2, fib: 0, note: '1 pot = 100g', quickQty: [100, 200, 300] },
    { name: 'Fromage blanc 3,5%', cal: 68, p: 7, g: 3.5, l: 3.5, fib: 0, quickQty: [100, 200] },
    { name: 'Yaourt grec 0%', cal: 59, p: 10, g: 3.6, l: 0.4, fib: 0, note: '1 pot = 170g', quickQty: [170] },
    { name: 'Yaourt grec 5%', cal: 97, p: 9, g: 3.6, l: 5, fib: 0, quickQty: [150, 170] },
    { name: 'Yaourt nature', cal: 61, p: 3.5, g: 4.7, l: 3.3, fib: 0, note: '1 pot = 125g', quickQty: [125] },
    { name: 'Lait demi-écrémé', cal: 46, p: 3.3, g: 4.8, l: 1.6, fib: 0, unit: 'ml', note: '1 verre = 200ml', quickQty: [100, 200, 250] },
    { name: "Lait d'amande", cal: 24, p: 0.5, g: 3, l: 1.1, fib: 0.4, unit: 'ml', quickQty: [200, 250] },
    { name: 'Emmental', cal: 380, p: 27, g: 0, l: 30, fib: 0, quickQty: [20, 30, 40] },
    { name: 'Mozzarella', cal: 280, p: 22, g: 2.2, l: 21, fib: 0, note: '1 boule = 125g', quickQty: [60, 125] },
    { name: 'Feta', cal: 264, p: 14, g: 4, l: 21, fib: 0, quickQty: [30, 50] },
    { name: 'Parmesan', cal: 431, p: 38, g: 4, l: 29, fib: 0, quickQty: [10, 20] },
  ],
  Légumes: [
    { name: 'Brocoli', cal: 34, p: 2.8, g: 7, l: 0.4, fib: 2.6, quickQty: [150, 200, 300] },
    { name: 'Haricots verts', cal: 31, p: 1.8, g: 7, l: 0.1, fib: 3.4, quickQty: [150, 200, 300] },
    { name: 'Courgette', cal: 17, p: 1.2, g: 3.1, l: 0.3, fib: 1, quickQty: [150, 200, 300] },
    { name: 'Épinards', cal: 23, p: 2.9, g: 3.6, l: 0.4, fib: 2.2, quickQty: [100, 200] },
    { name: 'Tomate', cal: 18, p: 0.9, g: 3.9, l: 0.2, fib: 1.2, unit: 'pcs', pcs: 150, pcsLabel: 'tomate', quickQty: [1, 2] },
    { name: 'Carotte', cal: 41, p: 0.9, g: 10, l: 0.2, fib: 2.8, unit: 'pcs', pcs: 100, pcsLabel: 'carotte', quickQty: [1, 2] },
    { name: 'Poivron', cal: 27, p: 1, g: 6, l: 0.3, fib: 1.7, unit: 'pcs', pcs: 160, pcsLabel: 'poivron', quickQty: [0.5, 1] },
    { name: 'Concombre', cal: 15, p: 0.7, g: 3.6, l: 0.1, fib: 0.5, quickQty: [100, 200] },
    { name: 'Salade verte', cal: 15, p: 1.4, g: 2.9, l: 0.2, fib: 1.3, quickQty: [50, 100] },
    { name: 'Champignons', cal: 22, p: 3.1, g: 3.3, l: 0.3, fib: 1, quickQty: [100, 150, 200] },
    { name: 'Oignon', cal: 40, p: 1.1, g: 9.3, l: 0.1, fib: 1.7, unit: 'pcs', pcs: 110, pcsLabel: 'oignon', quickQty: [0.5, 1] },
    { name: 'Légumes surgelés (mélange)', cal: 45, p: 2.5, g: 7, l: 0.5, fib: 3.5, quickQty: [200, 300] },
    { name: 'Poêlée de légumes verts Picard', brand: 'Picard', barcode: '3270160119745', cal: 65, p: 4, g: 6.1, l: 1.9, fib: 4.1, note: 'Surgelés, valeurs Open Food Facts', quickQty: [150, 200, 300] },
  ],
  Fruits: [
    { name: 'Banane', cal: 89, p: 1.1, g: 23, l: 0.3, fib: 2.6, unit: 'pcs', pcs: 120, pcsLabel: 'banane', quickQty: [1, 2] },
    { name: 'Pomme', cal: 52, p: 0.3, g: 14, l: 0.2, fib: 2.4, unit: 'pcs', pcs: 180, pcsLabel: 'pomme', quickQty: [1] },
    { name: 'Orange', cal: 47, p: 0.9, g: 12, l: 0.1, fib: 2.4, unit: 'pcs', pcs: 150, pcsLabel: 'orange', quickQty: [1] },
    { name: 'Kiwi', cal: 61, p: 1.1, g: 15, l: 0.5, fib: 3, unit: 'pcs', pcs: 75, pcsLabel: 'kiwi', quickQty: [1, 2] },
    { name: 'Fraises', cal: 32, p: 0.7, g: 7.7, l: 0.3, fib: 2, note: '1 barquette = 250g', quickQty: [125, 250] },
    { name: 'Myrtilles', cal: 57, p: 0.7, g: 14, l: 0.3, fib: 2.4, quickQty: [100, 125] },
    { name: 'Raisin', cal: 69, p: 0.7, g: 18, l: 0.2, fib: 0.9, quickQty: [100, 150] },
    { name: 'Poire', cal: 57, p: 0.4, g: 15, l: 0.1, fib: 3.1, unit: 'pcs', pcs: 170, pcsLabel: 'poire', quickQty: [1] },
    { name: 'Clémentine', cal: 47, p: 0.9, g: 12, l: 0.2, fib: 1.7, unit: 'pcs', pcs: 70, pcsLabel: 'clémentine', quickQty: [2, 3] },
  ],
  'Plats & snacks': [
    { name: 'Kebab (sandwich)', cal: 215, p: 12, g: 20, l: 10, fib: 1.5, unit: 'pcs', pcs: 350, pcsLabel: 'kebab' },
    { name: 'Frites', cal: 312, p: 3.4, g: 41, l: 15, fib: 3.8, quickQty: [100, 150, 200] },
    { name: 'Pizza (margherita)', cal: 250, p: 11, g: 30, l: 9, fib: 2, note: '1 part = 120g', quickQty: [120, 240, 360] },
    { name: 'Croissant', cal: 406, p: 8, g: 45, l: 21, fib: 2.6, unit: 'pcs', pcs: 55, pcsLabel: 'croissant', quickQty: [1] },
    { name: 'Barre protéinée', cal: 380, p: 33, g: 30, l: 12, fib: 8, unit: 'pcs', pcs: 60, pcsLabel: 'barre', quickQty: [1] },
    { name: 'Muesli', cal: 380, p: 10, g: 60, l: 8, fib: 8, quickQty: [40, 60] },
    { name: 'Miel', cal: 304, p: 0.3, g: 82, l: 0, fib: 0, note: '1 c.à.c = 7g', quickQty: [7, 15, 20] },
    { name: 'Confiture', cal: 250, p: 0.4, g: 60, l: 0.1, fib: 1, note: '1 c.à.c = 10g', quickQty: [10, 20] },
  ],
  Suppléments: [
    { name: 'Créatine', cal: 0, p: 0, g: 0, l: 0, fib: 0, unit: 'pcs', pcs: 5, pcsLabel: 'dose', note: '0 calorie', quickQty: [1] },
    { name: 'Collagène', cal: 36, p: 9, g: 0, l: 0, fib: 0, unit: 'pcs', pcs: 10, pcsLabel: 'dose', note: 'Protéine incomplète', quickQty: [1] },
  ],
};

/** Identifiant stable pour un aliment de base (pour les mises à jour futures du seed). */
export function seedId(category: string, name: string): string {
  const slug = `${category}-${name}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `seed:${slug}`;
}

export const SEED_VERSION = 3;

export function seedFoods(): FoodItem[] {
  const now = Date.now();
  return Object.entries(S).flatMap(([category, list]) =>
    list.map((f) => ({
      ...f,
      unit: f.unit ?? 'g',
      id: seedId(category, f.name),
      category,
      source: 'seed' as const,
      favorite: false,
      createdAt: now,
    })),
  );
}

export const CATEGORIES = Object.keys(S);
