import { Product, ProductSku, ProductType } from '../types';

export function generateSkuCode(productName: string, size?: string, colorName?: string): string {
  const cleanName = productName
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4) || 'PROD';
    
  const cleanSize = (size || 'UNI').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
  const cleanColor = (colorName || 'DEF').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  
  return `PS-${cleanName}-${cleanSize}-${cleanColor}-${randomSuffix}`;
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
