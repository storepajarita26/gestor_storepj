// Dominio de Inventario Físico, Kardex y Despaquetización
export type MovementType =
  | 'compra_recepcion'
  | 'venta_factura'
  | 'despaquetizado_salida_pack'
  | 'despaquetizado_entrada_unidad'
  | 'ajuste_positivo'
  | 'ajuste_negativo'
  | 'regalia_promocion'
  | 'devolucion';

export interface StockLevel {
  skuId: string;
  skuCode: string;
  productName: string;
  skuDescription: string;
  size?: string;
  colorName?: string;
  colorHex?: string;
  mainImageUrl?: string;
  costPriceNio: number;
  salePriceNio: number;
  quantityAvailable: number;
  quantityReserved: number;
  updatedAt?: string;
}

export interface KardexMovement {
  id: string;
  skuId: string;
  skuCode?: string;
  productName?: string;
  movementType: MovementType;
  quantity: number; // Positivo para entradas, negativo para salidas
  previousStock: number;
  newStock: number;
  referenceId?: string; // ID de orden de compra, factura, o lote de desempaque
  notes?: string;
  createdAt: string;
  createdBy?: string;
}

export interface UnbundleRequest {
  bundleSkuId: string;
  quantityPacksToUnbundle: number;
  targetUnitSkus: {
    unitSkuId: string;
    unitSkuCode?: string;
    unitSkuName?: string;
    quantityToAdd: number;
  }[];
  notes?: string;
}
