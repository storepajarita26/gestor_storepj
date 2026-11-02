import { Customer, DeliveryStatus, InvoiceItem, InvoicePayment, PaymentMethod, PaymentTerm, SaleType, SalesInvoice } from '../types';

/**
 * Arma la factura a partir de un carrito (punto de venta).
 * Los precios del SKU son precios finales; con IVA (régimen general) se desglosan.
 */

export interface CartLine {
  skuId: string;
  skuCode: string;
  productName: string;
  size?: string;
  colorName?: string;
  mainImageUrl?: string;
  quantity: number;
  /** Precio de lista (final, con IVA si aplica) */
  regularPrice: number;
  /** Precio cobrado por unidad (final). Menor que el de lista = promoción o rebaja */
  unitPrice: number;
  unitCostNio: number;
}

export interface CheckoutInput {
  customer: Customer;
  saleType: SaleType;
  paymentTerm: PaymentTerm;
  deliveryStatus: DeliveryStatus;
  trackingRef?: string;
  dueDate?: string;
  /** Monto que se cobra ahora en C$ (todo en contado; el abono inicial en crédito) */
  paymentNowNio: number;
  paymentMethod: PaymentMethod;
  exchangeRate: number;
  referenceNumber?: string;
  notes?: string;
  ivaRate: number;
  issueDate: string;
}

const round2 = (n: number) => Number((n || 0).toFixed(2));

export function cartTotal(lines: CartLine[]): number {
  return round2(lines.reduce((acc, l) => acc + l.unitPrice * l.quantity, 0));
}

export function cartSavings(lines: CartLine[]): number {
  return round2(lines.reduce((acc, l) => acc + Math.max(0, l.regularPrice - l.unitPrice) * l.quantity, 0));
}

export function buildSaleInvoice(lines: CartLine[], input: CheckoutInput): Omit<SalesInvoice, 'id' | 'amountPaidNio' | 'balanceDueNio'> {
  const rate = input.ivaRate || 0;
  const items: InvoiceItem[] = lines.map((l) => {
    const unitSinIva = round2(l.unitPrice / (1 + rate));
    const regularSinIva = round2(l.regularPrice / (1 + rate));
    const lineConIva = round2(l.unitPrice * l.quantity);
    const lineSinIva = round2(lineConIva / (1 + rate));
    return {
      skuId: l.skuId,
      skuCode: l.skuCode,
      productName: l.productName,
      size: l.size,
      colorName: l.colorName,
      mainImageUrl: l.mainImageUrl,
      quantity: l.quantity,
      regularPriceSinIvaNio: regularSinIva,
      promoPriceSinIvaNio: l.unitPrice < l.regularPrice ? unitSinIva : undefined,
      unitPriceSinIvaNio: unitSinIva,
      unitPriceNio: unitSinIva,
      ivaAmountNio: round2(lineConIva - lineSinIva),
      unitCostNio: l.unitCostNio || 0,
      discountNio: 0,
      lineTotalSinIvaNio: lineSinIva,
      lineTotalConIvaNio: lineConIva,
      lineTotalNio: lineConIva,
    };
  });

  const total = round2(items.reduce((acc, it) => acc + it.lineTotalConIvaNio, 0));
  const subtotalSinIva = round2(items.reduce((acc, it) => acc + it.lineTotalSinIvaNio, 0));
  const amountNow = round2(Math.min(input.paymentNowNio, total));
  const isUsd = input.paymentMethod === 'efectivo_dolares' && input.exchangeRate > 0;

  const payments: InvoicePayment[] =
    amountNow > 0
      ? [
          {
            id: '',
            invoiceId: '',
            paymentDate: new Date().toISOString(),
            amountNio: amountNow,
            amountUsd: isUsd ? round2(amountNow / input.exchangeRate) : undefined,
            exchangeRateApplied: isUsd ? input.exchangeRate : undefined,
            paymentMethod: input.paymentMethod,
            referenceNumber: input.referenceNumber || undefined,
            notes: input.paymentTerm === 'contado' ? 'Pago completo de contado' : 'Abono inicial',
          },
        ]
      : [];

  return {
    invoiceNumber: '', // lo asigna el sistema
    customerId: input.customer.id,
    customerName: input.customer.fullName,
    customerPhone: input.customer.phoneWhatsapp,
    customerIdentification: input.customer.identificationNumber || undefined,
    customerAddress: input.customer.address,
    saleType: input.saleType,
    paymentTerm: input.paymentTerm,
    status: 'pendiente',
    deliveryStatus: input.deliveryStatus,
    trackingRef: input.trackingRef || undefined,
    deliveryDate: input.deliveryStatus === 'entregado' ? input.issueDate : undefined,
    issueDate: input.issueDate,
    dueDate: input.paymentTerm === 'credito' ? input.dueDate : undefined,
    subtotalSinIvaNio: subtotalSinIva,
    subtotalNio: subtotalSinIva,
    discountNio: 0,
    ivaRate: rate,
    ivaTotalNio: round2(total - subtotalSinIva),
    totalConIvaNio: total,
    totalNio: total,
    items,
    payments,
    notes: input.notes || undefined,
  };
}
