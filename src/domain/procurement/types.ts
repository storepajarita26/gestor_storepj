// Dominio de Compras, Importaciones y Rastreo (Shein / Amazon)
export type PurchaseModality = 'simple' | 'especial' | 'regalia';
export type PurchaseStatus = 
  | 'comprado'
  | 'en_agencia_envio'
  | 'en_transito_nicaragua'
  | 'recibido_parcial'
  | 'recibido_completo'
  | 'cancelado';

export type ReceptionItemStatus = 'pendiente' | 'recibido' | 'no_vino' | 'devuelto' | 'cancelado';

export interface ImportExpense {
  id: string;
  purchaseOrderId?: string;
  concept: string; // Flete Aéreo, Aduana, Delivery, etc.
  amountUsd: number;
  amountNio: number;
  notes?: string;
}

export interface PurchaseItem {
  id: string;
  purchaseOrderId: string;
  skuId: string;
  skuCode?: string;
  skuDescription?: string;
  productName?: string;
  size?: string;
  colorName?: string;
  colorHex?: string;
  mainImageUrl?: string;
  
  quantityOrdered: number;
  quantityReceived: number;
  weightLbs?: number;
  
  unitCostUsd: number;
  unitCostNio: number;
  
  proratedExpenseNio: number;
  totalLandedCostNio: number; // Costo base + flete prorrateado
  suggestedSalePriceNio: number; // Precio calculado con regla de margen
  
  receptionStatus: ReceptionItemStatus;
  modality?: PurchaseModality; // 'simple' (Stock Normal / Vitrina) | 'especial' (Bajo Pedido) | 'regalia'
  orderRef?: string; // Referencia opcional (ej. "Para Pedido PED-0004" o nombre de cliente)
}

export interface PurchaseOrder {
  id: string;
  orderNumber: string;          // Ej: PO-2026-001
  supplierName: string;         // Shein, Amazon, Proveedor Local
  supplierOrderId?: string;     // ID en la plataforma Shein/Amazon
  trackingNumber?: string;      // Guía aérea / ID de rastreo
  supplierInvoiceId?: string;   // Factura comercial
  modality: PurchaseModality;
  prorationMethod?: 'valor' | 'peso'; // Método de prorrateo: por valor (default) o por peso en libras
  exchangeRate?: number;              // Tasa USD/NIO usada al costear la orden
  status: PurchaseStatus;
  
  datePurchased: string;
  dateDeliveredToAgency?: string;
  dateReceivedNicaragua?: string;
  
  totalCostUsd: number;
  totalCostNio: number;
  totalImportExpensesNio: number;
  
  items: PurchaseItem[];
  expenses: ImportExpense[];
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}
