import { KardexMovement, StockLevel, UnbundleRequest } from '../types';

/**
 * Valida y calcula la transformación de inventario al romper un paquete en unidades individuales.
 */
export function executeUnbundlingCalculation(
  request: UnbundleRequest,
  currentBundleStock: number,
  currentUnitStocks: Record<string, number>,
  bundleCostPriceNio: number = 0,
  /** Precio de venta de cada unidad: el costo del paquete se reparte en proporción a él */
  unitSalePrices: Record<string, number> = {}
): {
  isValid: boolean;
  error?: string;
  allocatedUnitCostNio: number;
  /** Costo asignado por unidad, por SKU (reparto según precio de venta; igual que erp_desempacar) */
  allocatedCostBySku: Record<string, number>;
  bundleMovement: Omit<KardexMovement, 'id' | 'createdAt'>;
  unitMovements: Omit<KardexMovement, 'id' | 'createdAt'>[];
} {
  if (request.quantityPacksToUnbundle <= 0) {
    return {
      isValid: false,
      error: 'La cantidad de paquetes a desempacar debe ser mayor a 0.',
      allocatedUnitCostNio: 0,
      allocatedCostBySku: {},
      bundleMovement: {} as any,
      unitMovements: [],
    };
  }

  if (currentBundleStock < request.quantityPacksToUnbundle) {
    return {
      isValid: false,
      error: `Stock insuficiente del paquete. Disponible: ${currentBundleStock}, solicitado: ${request.quantityPacksToUnbundle}`,
      allocatedUnitCostNio: 0,
      allocatedCostBySku: {},
      bundleMovement: {} as any,
      unitMovements: [],
    };
  }

  // Calcular el costo unitario asignado a cada prenda resultante
  const totalUnitsAdded = request.targetUnitSkus.reduce((acc, u) => acc + u.quantityToAdd, 0);
  const allocatedUnitCostNio = totalUnitsAdded > 0
    ? Number(((bundleCostPriceNio * request.quantityPacksToUnbundle) / totalUnitsAdded).toFixed(2))
    : bundleCostPriceNio;

  // Reparto por valor: una prenda que se vende al doble absorbe el doble del costo del paquete
  const totalCost = bundleCostPriceNio * request.quantityPacksToUnbundle;
  const weightSum = request.targetUnitSkus.reduce(
    (acc, u) => acc + (unitSalePrices[u.unitSkuId] || 0) * u.quantityToAdd,
    0
  );
  const allocatedCostBySku: Record<string, number> = {};
  request.targetUnitSkus.forEach((u) => {
    if (u.quantityToAdd <= 0) return;
    const itemPrice = unitSalePrices[u.unitSkuId] || 0;
    const share = weightSum > 0 && itemPrice > 0
      ? (totalCost * (itemPrice * u.quantityToAdd) / weightSum) / u.quantityToAdd
      : (totalUnitsAdded > 0 ? totalCost / totalUnitsAdded : 0);
    allocatedCostBySku[u.unitSkuId] = Number(share.toFixed(2));
  });

  // 1. Movimiento de salida del paquete
  const bundleMovement: Omit<KardexMovement, 'id' | 'createdAt'> = {
    skuId: request.bundleSkuId,
    movementType: 'despaquetizado_salida_pack',
    quantity: -request.quantityPacksToUnbundle,
    previousStock: currentBundleStock,
    newStock: currentBundleStock - request.quantityPacksToUnbundle,
    referenceId: request.bundleSkuId,
    notes: `Desempaque de ${request.quantityPacksToUnbundle} paquetes a unidades individuales (Costo pack: C$ ${bundleCostPriceNio.toFixed(2)}). ${request.notes || ''}`,
  };

  // 2. Movimientos de entrada para cada SKU unitario resultante
  const unitMovements: Omit<KardexMovement, 'id' | 'createdAt'>[] = request.targetUnitSkus.map(unit => {
    const prevStock = currentUnitStocks[unit.unitSkuId] || 0;
    return {
      skuId: unit.unitSkuId,
      skuCode: unit.unitSkuCode,
      productName: unit.unitSkuName,
      movementType: 'despaquetizado_entrada_unidad',
      quantity: unit.quantityToAdd,
      previousStock: prevStock,
      newStock: prevStock + unit.quantityToAdd,
      referenceId: request.bundleSkuId,
      notes: `Ingreso por desempaque. Costo asignado C$ ${(allocatedCostBySku[unit.unitSkuId] ?? allocatedUnitCostNio).toFixed(2)} c/u`,
    };
  });

  return {
    isValid: true,
    allocatedUnitCostNio,
    allocatedCostBySku,
    bundleMovement,
    unitMovements,
  };
}

export function calculateTotalInventoryValueNio(stocks: StockLevel[]): number {
  return Number(
    stocks
      .reduce((acc, stock) => acc + (stock.quantityAvailable * (stock.costPriceNio || 0)), 0)
      .toFixed(2)
  );
}

export function calculateTotalSaleValueNio(stocks: StockLevel[]): number {
  return Number(
    stocks
      .reduce((acc, stock) => acc + (stock.quantityAvailable * (stock.salePriceNio || 0)), 0)
      .toFixed(2)
  );
}
