import { ImportExpense, PurchaseItem, PurchaseModality, PurchaseOrder } from '../types';

/**
 * Calcula el precio de venta sugerido en base a las reglas de negocio de Pajarita Store:
 * 1. Modalidad regalía (Promoción / Regalo para cliente): Precio 0.00
 * 2. Modalidad especial (Bajo pedido directo de cliente): Margen 25%
 * 3. Productos con costo aterrizado < 100 C$: Margen 40%
 * 4. Productos con costo aterrizado >= 100 C$: Margen 30%
 */
export function calculateSuggestedPrice(
  landedCostNio: number,
  modality: PurchaseModality
): number {
  if (!landedCostNio || landedCostNio <= 0) return 0;

  if (modality === 'regalia') {
    // Producto obsequio o promoción
    return 0;
  }

  if (modality === 'especial') {
    // 25% de margen sobre precio final: Costo / (1 - 0.25)
    return Number((landedCostNio / 0.75).toFixed(2));
  }

  if (landedCostNio < PRICE_TIER_THRESHOLD_NIO) {
    // 40% de margen sobre precio final: Costo / (1 - 0.40)
    return Number((landedCostNio / 0.60).toFixed(2));
  }

  // 30% de margen sobre precio final: Costo / (1 - 0.30).
  // Sin "salto" en el umbral: un artículo de costo ≥ C$100 nunca sugiere un precio menor que
  // uno de C$100 al 40% (antes: costo C$99 → C$165, pero costo C$100 → C$142.86).
  // Debe coincidir con calculate_suggested_price en la base de datos.
  const floorPrice = PRICE_TIER_THRESHOLD_NIO / 0.60;
  return Number(Math.max(landedCostNio / 0.70, floorPrice).toFixed(2));
}

/** Umbral de costo landed que separa el margen de 40% del de 30% */
export const PRICE_TIER_THRESHOLD_NIO = 100;

/** Estados de un ítem que ya no llegará: no absorben flete ni gastos */
const CLOSED_RECEPTION_STATUSES = ['no_vino', 'devuelto', 'cancelado'];

/** Cantidad sobre la que se prorratea: lo que no vino no carga gastos (C4 de la auditoría) */
function proratableQuantity(item: PurchaseItem): number {
  if (CLOSED_RECEPTION_STATUSES.includes(item.receptionStatus)) {
    // Si llegó una parte antes de cerrarse, esa parte sí carga gastos
    return Math.max(0, item.quantityReceived || 0);
  }
  return item.quantityOrdered > 0 ? item.quantityOrdered : 1;
}

/**
 * Prorratea los gastos de flete/importación proporcionalmente:
 * - Por Valor (por defecto): Según el costo base total de cada artículo
 * - Por Peso: Según el peso en libras de cada artículo (tarifa de casillero USA -> Nicaragua)
 */
export function prorateExpenses(
  items: PurchaseItem[],
  expenses: ImportExpense[],
  modality: PurchaseModality,
  method: 'valor' | 'peso' = 'valor'
): PurchaseItem[] {
  const totalExpenseNio = expenses.reduce((acc, exp) => acc + (exp.amountNio || 0), 0);
  
  if (items.length === 0 || totalExpenseNio === 0) {
    return items.map(item => ({
      ...item,
      proratedExpenseNio: 0,
      totalLandedCostNio: item.unitCostNio,
      suggestedSalePriceNio: calculateSuggestedPrice(item.unitCostNio, item.modality || modality),
    }));
  }

  // Comprobar si se puede prorratear por peso
  const totalWeightLbs = items.reduce(
    (acc, item) => acc + ((item.weightLbs || 0) * proratableQuantity(item)),
    0
  );

  const effectiveMethod = (method === 'peso' && totalWeightLbs > 0) ? 'peso' : 'valor';

  const totalBaseNio = items.reduce(
    (acc, item) => acc + (item.unitCostNio * proratableQuantity(item)),
    0
  );

  if (totalBaseNio === 0 && effectiveMethod === 'valor') {
    return items.map(item => ({
      ...item,
      proratedExpenseNio: 0,
      totalLandedCostNio: item.unitCostNio,
      suggestedSalePriceNio: calculateSuggestedPrice(item.unitCostNio, item.modality || modality),
    }));
  }

  return items.map(item => {
    const qty = proratableQuantity(item);
    const itemModality = item.modality || modality;
    if (qty <= 0) {
      // No llegó nada de este ítem: no lleva gastos
      return {
        ...item,
        proratedExpenseNio: 0,
        totalLandedCostNio: item.unitCostNio,
        suggestedSalePriceNio: calculateSuggestedPrice(item.unitCostNio, itemModality),
      };
    }
    let proportion = 0;

    if (effectiveMethod === 'peso' && totalWeightLbs > 0) {
      const itemTotalWeight = (item.weightLbs || 0) * qty;
      proportion = itemTotalWeight / totalWeightLbs;
    } else {
      const itemTotalBase = item.unitCostNio * qty;
      proportion = totalBaseNio > 0 ? itemTotalBase / totalBaseNio : 0;
    }

    const itemTotalExpense = proportion * totalExpenseNio;
    const unitExpense = Number((itemTotalExpense / qty).toFixed(2));
    const landedCost = Number((item.unitCostNio + unitExpense).toFixed(2));
    const suggestedPrice = calculateSuggestedPrice(landedCost, itemModality);

    return {
      ...item,
      proratedExpenseNio: unitExpense,
      totalLandedCostNio: landedCost,
      suggestedSalePriceNio: suggestedPrice,
    };
  });
}

/**
 * Calcula los totales de una orden de compra completa
 */
export function calculateOrderTotals(order: Partial<PurchaseOrder>, exchangeRate: number = 36.80): {
  totalCostUsd: number;
  totalCostNio: number;
  totalImportExpensesNio: number;
  grandTotalNio: number;
} {
  const items = order.items || [];
  const expenses = order.expenses || [];

  const totalCostUsd = items.reduce(
    (acc, it) => acc + (it.unitCostUsd || 0) * (it.quantityOrdered || 0),
    0
  );
  
  const totalCostNio = items.reduce(
    (acc, it) => acc + (it.unitCostNio || ((it.unitCostUsd || 0) * exchangeRate)) * (it.quantityOrdered || 0),
    0
  );

  const totalImportExpensesNio = expenses.reduce(
    (acc, exp) => acc + (exp.amountNio || ((exp.amountUsd || 0) * exchangeRate)),
    0
  );

  return {
    totalCostUsd: Number(totalCostUsd.toFixed(2)),
    totalCostNio: Number(totalCostNio.toFixed(2)),
    totalImportExpensesNio: Number(totalImportExpensesNio.toFixed(2)),
    grandTotalNio: Number((totalCostNio + totalImportExpensesNio).toFixed(2)),
  };
}

/**
 * Siguiente número de orden de compra (PO-00001, PO-00002...), a partir del más alto existente.
 * Se puede editar; la base de datos rechaza números repetidos.
 */
export function generateNextOrderNumber(existing: { orderNumber?: string }[]): string {
  let max = 0;
  existing.forEach((o) => {
    const match = (o.orderNumber || '').match(/^PO-(\d+)$/i);
    if (match) max = Math.max(max, parseInt(match[1], 10));
  });
  return `PO-${String(max + 1).padStart(5, '0')}`;
}
