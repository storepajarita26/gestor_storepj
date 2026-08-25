import { KardexMovement, StockLevel, UnbundleRequest } from '../types';

/**
 * Valida y calcula la transformación de inventario al romper un paquete en unidades individuales.
 */
export function executeUnbundlingCalculation(
  request: UnbundleRequest,
  currentBundleStock: number,
  currentUnitStocks: Record<string, number>
): {
  isValid: boolean;
  error?: string;
  bundleMovement: Omit<KardexMovement, 'id' | 'createdAt'>;
  unitMovements: Omit<KardexMovement, 'id' | 'createdAt'>[];
} {
  if (request.quantityPacksToUnbundle <= 0) {
    return {
      isValid: false,
      error: 'La cantidad de paquetes a desempacar debe ser mayor a 0.',
      bundleMovement: {} as any,
      unitMovements: [],
    };
  }

  if (currentBundleStock < request.quantityPacksToUnbundle) {
    return {
      isValid: false,
      error: `Stock insuficiente del paquete. Disponible: ${currentBundleStock}, solicitado: ${request.quantityPacksToUnbundle}`,
      bundleMovement: {} as any,
      unitMovements: [],
    };
  }

  // 1. Movimiento de salida del paquete
  const bundleMovement: Omit<KardexMovement, 'id' | 'createdAt'> = {
    skuId: request.bundleSkuId,
    movementType: 'despaquetizado_salida_pack',
    quantity: -request.quantityPacksToUnbundle,
    previousStock: currentBundleStock,
    newStock: currentBundleStock - request.quantityPacksToUnbundle,
    referenceId: request.bundleSkuId,
    notes: `Desempaque de ${request.quantityPacksToUnbundle} paquetes a unidades individuales. ${request.notes || ''}`,
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
      notes: `Ingreso de unidades por desempaque de paquete (${request.bundleSkuId})`,
    };
  });

  return {
    isValid: true,
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
