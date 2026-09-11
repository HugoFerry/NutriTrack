import type { FoodItem } from '../domain/types';

const UA = 'NutriTrack/1.0 (application personnelle)';
const FIELDS = 'code,product_name,product_name_fr,brands,nutriments,serving_quantity,serving_size,quantity';

interface OffProduct {
  code: string;
  product_name?: string;
  product_name_fr?: string;
  brands?: string;
  serving_quantity?: number | string;
  serving_size?: string;
  nutriments?: Record<string, number | string | undefined>;
}

function num(v: number | string | undefined): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Convertit un produit Open Food Facts en aliment (valeurs / 100 g). */
export function mapProduct(p: OffProduct): FoodItem | null {
  const n = p.nutriments ?? {};
  let cal = num(n['energy-kcal_100g']);
  if (cal === null) {
    const kj = num(n['energy_100g']) ?? num(n['energy-kj_100g']);
    if (kj !== null) cal = Math.round(kj / 4.184);
  }
  const prot = num(n['proteins_100g']);
  const carb = num(n['carbohydrates_100g']);
  const fat = num(n['fat_100g']);
  if (cal === null && prot === null && carb === null && fat === null) return null;
  const name = (p.product_name_fr || p.product_name || '').trim();
  if (!name) return null;
  const serving = num(p.serving_quantity);
  const isLiquid = /\b(ml|cl|l)\b/i.test(p.serving_size ?? '') || /\b(ml|cl|l)\b/i.test(String((p as { quantity?: string }).quantity ?? ''));
  return {
    id: `off:${p.code}`,
    name,
    brand: p.brands?.split(',')[0]?.trim() || undefined,
    category: 'Open Food Facts',
    unit: isLiquid ? 'ml' : 'g',
    cal: Math.round(cal ?? (prot ?? 0) * 4 + (carb ?? 0) * 4 + (fat ?? 0) * 9),
    p: prot ?? 0,
    g: carb ?? 0,
    l: fat ?? 0,
    fib: num(n['fiber_100g']) ?? 0,
    source: 'off',
    barcode: p.code,
    favorite: false,
    createdAt: Date.now(),
    note: p.serving_size ? `Portion : ${p.serving_size}` : undefined,
    quickQty: serving && serving > 0 ? [Math.round(serving)] : undefined,
  };
}

export async function fetchByBarcode(code: string, signal?: AbortSignal): Promise<FoodItem | null> {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`, {
    headers: { 'User-Agent': UA },
    signal,
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Open Food Facts : HTTP ${res.status}`);
  const data = (await res.json()) as { status?: number; product?: OffProduct };
  if (!data.product) return null;
  return mapProduct(data.product);
}

export async function searchProducts(query: string, signal?: AbortSignal): Promise<FoodItem[]> {
  const url =
    `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}` +
    `&search_simple=1&action=process&json=1&page_size=25&lc=fr&fields=${FIELDS}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal });
  if (!res.ok) throw new Error(`Open Food Facts : HTTP ${res.status}`);
  const data = (await res.json()) as { products?: OffProduct[] };
  return (data.products ?? []).map(mapProduct).filter((f): f is FoodItem => !!f);
}
