import { ImportExpense, PurchaseItem, PurchaseModality, PurchaseOrder } from '../types';

/**
 * Calcula el precio de venta sugerido en base a las reglas de negocio de Pajarita Store:
 * 1. Modalidad especial (Bajo pedido directo de cliente): Margen 25%
 * 2. Productos con costo aterrizado < 100 C$: Margen 40%
 * 3. Productos con costo aterrizado >= 100 C$: Margen 30%
 */
export function calculateSuggestedPrice(
  landedCostNio: number,
  modality: PurchaseModality
): number {
  if (!landedCostNio || landedCostNio <= 0) return 0;

  if (modality === 'especial') {
    // 25% de margen sobre precio final: Costo / (1 - 0.25)
    return Number((landedCostNio / 0.75).toFixed(2));
  }

  if (landedCostNio < 100) {
    // 40% de margen sobre precio final: Costo / (1 - 0.40)
    return Number((landedCostNio / 0.60).toFixed(2));
  }

  // 30% de margen sobre precio final: Costo / (1 - 0.30)
  return Number((landedCostNio / 0.70).toFixed(2));
}

/**
 * Prorratea los gastos de flete/importación proporcionalmente según el costo base de cada producto.
 * Fórmula: (Costo Total Item / Costo Total Orden) * Gastos Totales de Importación
 */
export function prorateExpenses(
  items: PurchaseItem[],
  expenses: ImportExpense[],
  modality: PurchaseModality
): PurchaseItem[] {
  const totalExpenseNio = expenses.reduce((acc, exp) => acc + (exp.amountNio || 0), 0);
  const totalBaseCostNio = items.reduce(
    (acc, item) => acc + item.unitCostNio * item.quantityOrdered,
    0
  );

  if (totalBaseCostNio === 0 || totalExpenseNio === 0) {
    return items.map(item => ({
      ...item,
      proratedExpenseNio: 0,
      totalLandedCostNio: item.unitCostNio,
      suggestedSalePriceNio: calculateSuggestedPrice(item.unitCostNio, modality),
    }));
  }

  return items.map(item => {
    const itemTotalBase = item.unitCostNio * item.quantityOrdered;
    const proportion = itemTotalBase / totalBaseCostNio;
    const itemTotalExpense = proportion * totalExpenseNio;
    const unitExpense = Number((itemTotalExpense / item.quantityOrdered).toFixed(2));
    const landedCost = Number((item.unitCostNio + unitExpense).toFixed(2));
    const suggestedPrice = calculateSuggestedPrice(landedCost, modality);

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
