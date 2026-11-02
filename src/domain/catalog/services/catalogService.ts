import { Product, ProductSku, ProductType } from '../types';

/** Formato oficial de los códigos: PRD-00001 (producto) y SKU-00001 (variante) */
export const PRODUCT_CODE_PATTERN = /^PRD-\d{5,}$/;
export const SKU_CODE_PATTERN = /^SKU-\d{5,}$/;

export function isValidProductCode(code?: string | null): boolean {
  return PRODUCT_CODE_PATTERN.test((code || '').trim());
}

export function isValidSkuCode(code?: string | null): boolean {
  return SKU_CODE_PATTERN.test((code || '').trim());
}

/** Arma un código con prefijo y al menos 5 dígitos (ej. formatCode('SKU-', 84) → SKU-00084) */
export function formatCode(prefix: 'PRD-' | 'SKU-', value: number): string {
  return `${prefix}${String(value).padStart(5, '0')}`;
}

/** Número más alto entre los códigos con el formato oficial del prefijo (los demás se ignoran) */
function maxCodeNumber(codes: (string | undefined | null)[], prefix: 'PRD-' | 'SKU-'): number {
  const pattern = prefix === 'PRD-' ? PRODUCT_CODE_PATTERN : SKU_CODE_PATTERN;
  let max = 0;
  codes.forEach((code) => {
    const c = (code || '').trim();
    if (!pattern.test(c)) return;
    const num = parseInt(c.slice(prefix.length), 10);
    if (!isNaN(num) && num > max) max = num;
  });
  return max;
}

/**
 * Siguiente código de variante SKU-00000 según el más alto que ya existe.
 * offset permite reservar varios seguidos (offset 0 = el siguiente, 1 = el que sigue…).
 */
export function generateNextSkuCode(existingCodes: (string | undefined | null)[], offset: number = 0): string {
  return formatCode('SKU-', maxCodeNumber(existingCodes, 'SKU-') + 1 + offset);
}

/**
 * Genera el siguiente código secuencial de producto con prefijo PRD y 5 dígitos (ej. PRD-00084).
 * Si no hay productos, inicia en PRD-00001. Respeta el correlativo más alto existente.
 */
export function generateNextProductCode(existingProducts: { productCode?: string }[]): string {
  return formatCode('PRD-', maxCodeNumber(existingProducts.map((p) => p.productCode), 'PRD-') + 1);
}

export function filterActiveSkus(skus: ProductSku[]): ProductSku[] {
  return skus.filter(sku => sku.isActive);
}

export function validateProductData(product: Partial<Product>): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!product.name || product.name.trim().length === 0) {
    errors.push('El nombre del producto es obligatorio.');
  }
  if (!product.skus || product.skus.length === 0) {
    errors.push('El producto debe contener al menos un SKU o variante.');
  }
  return {
    isValid: errors.length === 0,
    errors,
  };
}
