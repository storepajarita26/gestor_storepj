import { dataStore } from '@/infrastructure/repositories/dataStore';
import { normalizeSearch } from '@/domain/sales/services/customerService';

/** Variante lista para venderse en el punto de venta */
export interface SellableSku {
  skuId: string;
  skuCode: string;
  productName: string;
  description: string;
  size?: string;
  colorName?: string;
  colorHex?: string;
  mainImageUrl?: string;
  /** Precio que se cobra (promoción si hay una vigente) */
  price: number;
  regularPrice: number;
  costNio: number;
  available: number;
  /** Texto normalizado para buscar */
  haystack: string;
}

/** Variantes activas de productos activos, con su disponible para vender */
export function getSellableSkus(): SellableSku[] {
  const stock = new Map(dataStore.getStock().map((s) => [s.skuId, s]));
  const list: SellableSku[] = [];
  dataStore.getProducts().forEach((product) => {
    if (product.isActive === false) return;
    (product.skus || []).forEach((sku) => {
      if (sku.isActive === false) return;
      const st = stock.get(sku.id);
      const regular = sku.salePriceNio || st?.salePriceNio || 0;
      const promo = sku.promoPriceNio && sku.promoPriceNio > 0 && sku.promoPriceNio < regular ? sku.promoPriceNio : undefined;
      const description = sku.skuDescription || [product.name, sku.size, sku.colorName].filter(Boolean).join(' ');
      list.push({
        skuId: sku.id,
        skuCode: sku.skuCode,
        productName: product.name,
        description,
        size: sku.size,
        colorName: sku.colorName,
        colorHex: sku.colorHex,
        mainImageUrl: sku.mainImageUrl || st?.mainImageUrl,
        price: promo ?? regular,
        regularPrice: regular,
        costNio: sku.costPriceNio || st?.costPriceNio || 0,
        available: dataStore.getAvailableToSell(sku.id),
        haystack: normalizeSearch(
          [sku.skuCode, product.productCode, product.name, description, sku.size, sku.colorName].filter(Boolean).join(' ')
        ),
      });
    });
  });
  return list;
}

/** Coincidencia exacta por código (lo que envía un lector de código de barras) */
export function findByCode(list: SellableSku[], code: string): SellableSku | undefined {
  const c = code.trim().toUpperCase();
  if (!c) return undefined;
  return list.find((s) => s.skuCode.toUpperCase() === c);
}

/**
 * Busca por palabras (todas deben aparecer). Primero los que coinciden por código y
 * los que tienen existencia.
 */
export function searchSkus(list: SellableSku[], query: string, limit = 8): SellableSku[] {
  const q = normalizeSearch(query.trim());
  if (!q) return [];
  const words = q.split(/\s+/);
  return list
    .filter((s) => words.every((w) => s.haystack.includes(w)))
    .sort((a, b) => {
      const ac = a.skuCode.toLowerCase().startsWith(q) ? 0 : 1;
      const bc = b.skuCode.toLowerCase().startsWith(q) ? 0 : 1;
      if (ac !== bc) return ac - bc;
      const as = a.available > 0 ? 0 : 1;
      const bs = b.available > 0 ? 0 : 1;
      if (as !== bs) return as - bs;
      return a.description.localeCompare(b.description);
    })
    .slice(0, limit);
}
