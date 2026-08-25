// Dominio de Ventas, Facturación, Clientes y Créditos / Abonos
export type SaleType = 'normal' | 'pedido';
export type PaymentTerm = 'contado' | 'credito';
export type InvoiceStatus = 'borrador' | 'pendiente' | 'parcial' | 'pagada' | 'anulada';
export type PaymentMethod =
  | 'efectivo_cordobas'
  | 'efectivo_dolares'
  | 'transferencia_bancaria'
  | 'tarjeta'
  | 'otro';

export interface Customer {
  id: string;
  fullName: string;
  identificationNumber?: string; // Cédula / RUC
  phoneWhatsapp?: string;
  address?: string;
  city: string;
  notes?: string;
  createdAt?: string;
}

export interface InvoiceItem {
  id?: string;
  invoiceId?: string;
  skuId: string;
  skuCode?: string;
  productName?: string;
  size?: string;
  colorName?: string;
  mainImageUrl?: string;
  quantity: number;
  
  // Columnas Fiscales de Precios
  regularPriceSinIvaNio: number;    // Precio regular unitario sin IVA
  promoPriceSinIvaNio?: number;     // Precio promocional unitario sin IVA (si aplica)
  unitPriceSinIvaNio: number;       // Precio de venta unitario sin IVA aplicado
  unitPriceNio: number;             // Compatible con unitPriceSinIvaNio
  ivaAmountNio: number;             // Monto de IVA por esta línea (15%)
  unitCostNio: number;              // Costo de compra unitario
  discountNio: number;              // Descuento unitario o de línea
  lineTotalSinIvaNio: number;       // Total línea sin IVA = (unitPriceSinIvaNio * quantity) - discountNio
  lineTotalNio: number;             // Total línea con IVA (compatibilidad)
  lineTotalConIvaNio: number;       // Total línea con IVA = lineTotalSinIvaNio * 1.15
}

export interface InvoicePayment {
  id: string;
  invoiceId: string;
  paymentDate: string;
  amountNio: number;
  amountUsd?: number;
  exchangeRateApplied?: number;
  paymentMethod: PaymentMethod;
  receiptNumber?: string;
  referenceNumber?: string;
  notes?: string;
  createdAt?: string;
}

export interface SalesInvoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName?: string;
  customerPhone?: string;
  customerIdentification?: string;
  customerAddress?: string;
  saleType: SaleType;
  paymentTerm: PaymentTerm;
  status: InvoiceStatus;
  
  issueDate: string;
  dueDate?: string;
  
  // Desglose Fiscal de Facturación
  subtotalSinIvaNio: number;        // Suma de líneas sin IVA
  subtotalNio: number;              // Subtotal sin IVA (compatibilidad)
  discountNio: number;              // Descuento global
  ivaRate: number;                  // 0.15 (15% IVA)
  ivaTotalNio: number;              // Monto total de IVA (15%)
  totalConIvaNio: number;           // Total Final Factura con IVA = (Subtotal - Desc) + IVA
  totalNio: number;                 // Total con IVA (compatibilidad)
  amountPaidNio: number;            // Total abonado a la fecha
  balanceDueNio: number;            // Saldo pendiente por cobrar
  
  items: InvoiceItem[];
  payments: InvoicePayment[];
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreatePaymentInput {
  invoiceId: string;
  amountNio: number;
  amountUsd?: number;
  paymentMethod: PaymentMethod;
  receiptNumber?: string;
  referenceNumber?: string;
  notes?: string;
}
