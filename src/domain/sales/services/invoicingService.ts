import { InvoiceItem, InvoicePayment, InvoiceStatus, SalesInvoice } from '../types';

export const IVA_RATE_NICARAGUA = 0.15; // 15% IVA Fiscal

export function calculateInvoiceTotals(
  items: InvoiceItem[],
  globalDiscountNio: number = 0,
  ivaRate: number = IVA_RATE_NICARAGUA
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

export function calculateInvoiceBalance(
  totalConIvaNio: number,
  payments: InvoicePayment[]
): {
  amountPaidNio: number;
  balanceDueNio: number;
  status: InvoiceStatus;
} {
  const amountPaidNio = payments.reduce((acc, p) => acc + (p.amountNio || 0), 0);
  const balanceDueNio = Math.max(0, totalConIvaNio - amountPaidNio);

  let status: InvoiceStatus = 'pendiente';
  if (amountPaidNio >= totalConIvaNio && totalConIvaNio > 0) {
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
