export const MEALS: { id: 'breakfast' | 'lunch' | 'dinner' | 'snack'; label: string; icon: string; hours: [number, number] }[] = [
  { id: 'breakfast', label: 'Petit-déjeuner', icon: '☀️', hours: [4, 11] },
  { id: 'lunch', label: 'Déjeuner', icon: '🍽️', hours: [11, 15] },
  { id: 'snack', label: 'Collation', icon: '🍎', hours: [15, 18] },
  { id: 'dinner', label: 'Dîner', icon: '🌙', hours: [18, 28] },
];

export function mealForNow(d = new Date()): 'breakfast' | 'lunch' | 'dinner' | 'snack' {
  const h = d.getHours();
  const hh = h < 4 ? h + 24 : h;
  return MEALS.find((m) => hh >= m.hours[0] && hh < m.hours[1])?.id ?? 'snack';
}

export const MACRO_COLOR = { p: 'var(--c-prot)', g: 'var(--c-carb)', l: 'var(--c-fat)', fib: 'var(--c-fib)' } as const;
