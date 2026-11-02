// Dominio de Catálogo y Jerarquía de Productos
export type SkuType = 'simple' | 'paquete';
export type ProductType = SkuType;

export interface Category {
  id: string;
  parentId?: string; // Si es null o undefined, es Categoría Nivel 1 (Principal). Si tiene valor, es Subcategoría Nivel 2.
  parentName?: string;
  name: string;
  slug: string;
  description?: string;
  imageUrl?: string;
  isActive: boolean;
  displayOrder: number;
  subcategories?: Category[];
}

export interface SkuBundleItem {
  id?: string;
  bundleSkuId: string;
  unitSkuId: string;
  unitSkuCode?: string;
  unitSkuName?: string;
  quantityPerPack: number;
}

export interface ProductSku {
  id: string;
  productId: string;
  skuCode: string;
  skuDescription: string;
  /** Tipo de variante: 'simple' (unidad individual) o 'paquete' (pack/combo desempacable en bodega) */
  skuType?: SkuType;
  /** Opcional: descripción HTML propia de la variante; vacía = usa la del producto */
  descriptionHtml?: string;
  size?: string;
  colorName?: string;
  colorHex?: string;
  costPriceNio: number;
  costPriceUsd: number;
  salePriceNio: number;
  promoPriceNio?: number;
  mainImageUrl?: string;
  galleryImageUrls?: string[];
  isActive: boolean;
  stockAvailable?: number;
  bundleItems?: SkuBundleItem[];
  createdAt?: string;
  updatedAt?: string;
}

export interface Product {
  id: string;
  categoryId?: string;       // Categoría Nivel 1
  categoryName?: string;
  subcategoryId?: string;    // Subcategoría Nivel 2
  subcategoryName?: string;
  name: string;
  slug: string;
  productCode?: string;
  description?: string;
  seoDescription?: string;
  /** Descripción larga con formato (HTML limpio) para la ficha de la web */
  descriptionHtml?: string;
  productType: ProductType;
  isFeatured: boolean;
  isActive: boolean;
  skus: ProductSku[];
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateProductInput {
  name: string;
  categoryId?: string;
  subcategoryId?: string;
  description?: string;
  seoDescription?: string;
  /** Descripción larga con formato (HTML limpio) para la ficha de la web */
  descriptionHtml?: string;
  productType?: ProductType;
  isFeatured?: boolean;
  skus: Omit<ProductSku, 'id' | 'productId'>[];
}
