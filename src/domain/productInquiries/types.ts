export type ProductInquiryPlatform = 'shein' | 'amazon' | 'otro';

export type ProductInquiryStatus = 'pendiente' | 'cotizado' | 'aceptado' | 'descartado';

export interface ProductInquiry {
  id: string;
  /** Nombre o alias de la persona que solicita la cotización */
  customerName: string;
  /** Teléfono o WhatsApp de contacto (opcional) */
  customerPhone?: string;
  /** Plataforma de origen (Shein, Amazon, u otra) */
  platform: ProductInquiryPlatform;
  /** Enlace o URL del producto en la tienda */
  productUrl: string;
  /** Nombre o descripción breve del producto / prenda (opcional) */
  productTitle?: string;
  /** ID de SKU o código identificador en Shein / Amazon */
  skuId: string;
  /** Precio del producto en dólares ($) */
  priceUsd: number;
  /** Costo de envío / flete en dólares ($) */
  shippingCostUsd: number;
  /** Costo total calculado: precioUsd + shippingCostUsd */
  totalCostUsd: number;
  /** Precio de venta estimado sugerido: costoTotal / 0.8 (margen bruto 20%) */
  estimatedSalePriceUsd: number;
  /** Precio de venta final ingresado en córdobas (C$) */
  finalSalePriceNio: number;
  /** Precio de venta final recalculado en dólares ($) */
  finalSalePriceUsd: number;
  /** Talla, color, especificaciones o notas adicionales */
  notes?: string;
  /** Estado de la consulta */
  status: ProductInquiryStatus;
  /** Fecha de registro ISO */
  createdAt: string;
  /** Fecha de última actualización ISO */
  updatedAt: string;
}

export interface CreateInquiryInput {
  customerName: string;
  customerPhone?: string;
  platform?: ProductInquiryPlatform;
  productUrl: string;
  productTitle?: string;
  skuId?: string;
  priceUsd: number;
  shippingCostUsd: number;
  finalSalePriceNio?: number;
  finalSalePriceUsd?: number;
  exchangeRate?: number;
  notes?: string;
  status?: ProductInquiryStatus;
}

export interface UpdateInquiryInput {
  customerName?: string;
  customerPhone?: string;
  platform?: ProductInquiryPlatform;
  productUrl?: string;
  productTitle?: string;
  skuId?: string;
  priceUsd?: number;
  shippingCostUsd?: number;
  finalSalePriceNio?: number;
  finalSalePriceUsd?: number;
  exchangeRate?: number;
  notes?: string;
  status?: ProductInquiryStatus;
}

export interface InquiryFilterOptions {
  query?: string;
  status?: ProductInquiryStatus | 'todos';
  platform?: ProductInquiryPlatform | 'todas';
}
