import { describe, expect, it } from 'vitest';
import { mapProduct } from '../openfoodfacts';

describe('mapProduct', () => {
  it('convertit un produit OFF en aliment /100g', () => {
    const f = mapProduct({
      code: '3017620422003',
      product_name_fr: 'Pâte à tartiner',
      brands: 'Ferrero, Nutella',
      serving_size: '15 g',
      serving_quantity: 15,
      nutriments: { 'energy-kcal_100g': 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9, fiber_100g: 0 },
    });
    expect(f).not.toBeNull();
    expect(f!.cal).toBe(539);
    expect(f!.brand).toBe('Ferrero');
    expect(f!.barcode).toBe('3017620422003');
    expect(f!.quickQty).toEqual([15]);
    expect(f!.unit).toBe('g');
  });
  it('déduit les kcal depuis les kJ et détecte les liquides', () => {
    const f = mapProduct({ code: '1', product_name: 'Jus', quantity: '1 l', serving_size: '200 ml', nutriments: { energy_100g: 188, carbohydrates_100g: 10 } } as never);
    expect(f!.cal).toBe(45);
    expect(f!.unit).toBe('ml');
  });
  it('rejette un produit sans nutriments ni nom', () => {
    expect(mapProduct({ code: '2', product_name: 'X', nutriments: {} })).toBeNull();
    expect(mapProduct({ code: '3', nutriments: { proteins_100g: 1 } })).toBeNull();
  });
});
