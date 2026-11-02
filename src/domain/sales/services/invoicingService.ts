import { InvoiceItem, InvoicePayment, InvoiceStatus, SalesInvoice } from '../types';
import { TaxRegime } from '../../shared/types';

export const IVA_RATE_NICARAGUA = 0.15; // 15% IVA Fiscal (solo régimen general)
export const DEFAULT_TAX_REGIME: TaxRegime = 'cuota_fija';

/**
 * Tasa de IVA a aplicar según el régimen fiscal de la tienda.
 * En cuota fija la tienda no traslada IVA: la tasa es 0 y el precio del SKU es el precio final.
 */
export function getIvaRateForRegime(regime: TaxRegime | undefined): number {
  return (regime ?? DEFAULT_TAX_REGIME) === 'general' ? IVA_RATE_NICARAGUA : 0;
}

/** Indica si una factura emitida lleva desglose de IVA (según la tasa con que se emitió). */
export function invoiceHasIva(invoice: Pick<SalesInvoice, 'ivaRate' | 'ivaTotalNio'>): boolean {
  return (invoice.ivaRate ?? 0) > 0 && (invoice.ivaTotalNio ?? 0) > 0;
}

export function calculateInvoiceTotals(
  items: InvoiceItem[],
  globalDiscountNio: number = 0,
  ivaRate: number = getIvaRateForRegime(DEFAULT_TAX_REGIME) // Pasar dataStore.getIvaRate() desde la UI
): {
  subtotalSinIvaNio: number;
  subtotalNio: number;
  discountNio: number;
  ivaRate: number;
  ivaTotalNio: number;
  totalConIvaNio: number;
  totalNio: number;
} {
  // Suma de líneas sin IVA
  const subtotalSinIvaNio = items.reduce((acc, item) => {
    const unitPriceSinIva = item.unitPriceSinIvaNio ?? item.unitPriceNio;
    const lineTotalSinIva = (unitPriceSinIva * item.quantity) - (item.discountNio || 0);
    return acc + Math.max(0, lineTotalSinIva);
  }, 0);

  const totalDiscount = (items.reduce((acc, it) => acc + (it.discountNio || 0), 0)) + globalDiscountNio;
  const taxableBase = Math.max(0, subtotalSinIvaNio - globalDiscountNio);
  const ivaTotalNio = taxableBase * ivaRate;
  const totalConIvaNio = taxableBase + ivaTotalNio;

  return {
    subtotalSinIvaNio: Number(subtotalSinIvaNio.toFixed(2)),
    subtotalNio: Number(subtotalSinIvaNio.toFixed(2)),
    discountNio: Number(totalDiscount.toFixed(2)),
    ivaRate,
    ivaTotalNio: Number(ivaTotalNio.toFixed(2)),
    totalConIvaNio: Number(totalConIvaNio.toFixed(2)),
    totalNio: Number(totalConIvaNio.toFixed(2)),
  };
}

/**
 * Saldo y estado de una factura. Considera pagos y notas de crédito (devoluciones).
 * Debe coincidir con erp_recalcular_saldo_factura en la base de datos.
 */
export function calculateInvoiceBalance(
  totalConIvaNio: number,
  payments: InvoicePayment[],
  creditedNio: number = 0
): {
  amountPaidNio: number;
  balanceDueNio: number;
  status: InvoiceStatus;
} {
  const amountPaidNio = payments.reduce((acc, p) => acc + (p.amountNio || 0), 0);
  const balanceDueNio = Math.max(0, totalConIvaNio - creditedNio - amountPaidNio);

  let status: InvoiceStatus = 'pendiente';
  if (totalConIvaNio > 0 && amountPaidNio + creditedNio >= totalConIvaNio - 0.005) {
    status = 'pagada';
  } else if (amountPaidNio > 0) {
    status = 'parcial';
  }

  return {
    amountPaidNio: Number(amountPaidNio.toFixed(2)),
    balanceDueNio: Number(balanceDueNio.toFixed(2)),
    status,
  };
}

export function filterPendingInvoices(invoices: SalesInvoice[]): SalesInvoice[] {
  return invoices.filter(inv => inv.balanceDueNio > 0 && inv.status !== 'anulada');
}

export function calculateTotalReceivablesNio(invoices: SalesInvoice[]): number {
  return Number(
    invoices
      .filter(inv => inv.status !== 'anulada')
      .reduce((acc, inv) => acc + (inv.balanceDueNio || 0), 0)
      .toFixed(2)
  );
}
