# 🛍️ ESPECIFICACIÓN DE LÓGICA DE DATOS Y ARQUITECTURA: CATÁLOGO WEB TIENDA (PAJARITA STORE 2.0)

> **Documento maestro de arquitectura, lógica de negocio y modelo de datos** para aplicaciones de catálogo web, e-commerce, punto de venta (POS) y panel administrativo.
> *Diseñado para ser suministrado a asistentes de IA (Antigravity / Gemini) o desarrolladores para la inicialización y construcción rápida y consistente de proyectos.*

---

## 1. VISIÓN GENERAL DEL SISTEMA Y FLUJO OPERATIVO

El sistema integra un **Catálogo Web para Clientes** y un **Mini ERP / Panel Administrativo** para el control integral de:
- Catálogo multinivel y variantes visuales con stock en tiempo real.
- Compras e importaciones (Shein, Amazon, proveedores locales) con prorrateo de flete/aduana.
- Inventario, despaquetizado de prendas (bundles) y trazabilidad mediante kardex.
- Facturación con desglose fiscal (IVA 15% Nicaragua), apartados, cuentas por cobrar y seguimiento de entregas/envíos.
- Persistencia híbrida y resiliente: **Supabase (PostgreSQL)** en la nube con respaldo y fallback offline inmediato en **LocalStorage**.

```
  ┌────────────────────────────────────────────────────────┐
  │                    CATÁLOGO WEB                        │
  │  (Categorías, Subcategorías, Tallas, Colores HEX,      │
  │   Precios C$/USD, Carrito, Pedido WhatsApp / Checkout) │
  └──────────────────────────┬─────────────────────────────┘
                             │
                             ▼
  ┌────────────────────────────────────────────────────────┐
  │              CAPA DE SERVICIOS / DATASTORE             │
  │     (Sincronización Híbrida: Supabase + LocalStorage)  │
  └──────────┬──────────────────┬──────────────────┬───────┘
             │                  │                  │
             ▼                  ▼                  ▼
    ┌────────────────┐  ┌───────────────┐  ┌───────────────┐
    │  PROCUREMENT   │  │   INVENTORY   │  │     SALES     │
    │  • Importación │  │  • Stock Disp.│  │ • Facturación │
    │  • Prorrateo   │  │  • Desempaque │  │ • Desglose IVA│
    │  • Landed Cost │  │  • Kardex     │  │ • Abonos/Créd.│
    │  • Margen %    │  │  • Reservas   │  │ • Delivery    │
    └────────────────┘  └───────────────┘  └───────────────┘
```

---

## 2. DICCIONARIO DE TIPOS Y ENUMS

```typescript
// Tipos de Producto
export type ProductType = 'simple' | 'paquete';

// Modalidades de Compra / Importación
export type PurchaseModality = 'simple' | 'especial' | 'regalia';

// Estados de Órdenes de Compra
export type PurchaseStatus = 
  | 'comprado' 
  | 'en_agencia_envio' 
  | 'en_transito_nicaragua' 
  | 'recibido_parcial' 
  | 'recibido_completo' 
  | 'cancelado';

// Estados de Recepción de Artículos en Lotes
export type ReceptionItemStatus = 'pendiente' | 'recibido' | 'no_vino' | 'devuelto' | 'cancelado';

// Tipos de Venta y Plazos
export type SaleType = 'normal' | 'pedido';
export type PaymentTerm = 'contado' | 'credito';

// Estados de Factura y Cuentas por Cobrar
export type InvoiceStatus = 'borrador' | 'pendiente' | 'parcial' | 'pagada' | 'anulada';

// Estados de Cumplimiento y Entrega / Envíos
export type DeliveryStatus = 'pendiente' | 'en_transito' | 'listo_entrega' | 'entregado' | 'cancelado';

// Métodos de Pago
export type PaymentMethod = 
  | 'efectivo_cordobas' 
  | 'efectivo_dolares' 
  | 'transferencia_bancaria' 
  | 'tarjeta' 
  | 'otro';

// Tipos de Movimiento de Kardex
export type MovementType = 
  | 'compra_recepcion' 
  | 'venta_factura' 
  | 'despaquetizado_salida_pack' 
  | 'despaquetizado_entrada_unidad' 
  | 'ajuste_positivo' 
  | 'ajuste_negativo' 
  | 'regalia_promocion' 
  | 'devolucion';

// Tipos de Promociones
export type PromoType = 'descuento_porcentaje' | 'descuento_monto_fijo' | 'regalia_producto' | '2x1';
```

---

## 3. MODELO DE DATOS TYPESCRIPT (INTERFACES DE DOMINIO)

### 3.1. Catálogo, Categorías y Variantes (SKUs)

```typescript
export interface Category {
  id: string;
  parentId?: string | null;     // null = Categoría Principal Nivel 1; con ID = Subcategoría Nivel 2
  parentName?: string;
  name: string;
  slug: string;
  description?: string;
  imageUrl?: string;
  isActive: boolean;
  displayOrder: number;
  subcategories?: Category[];
}

export interface SkuBundleItem {
  id?: string;
  bundleSkuId: string;          // SKU del paquete padre
  unitSkuId: string;            // SKU de la prenda o unidad individual
  unitSkuCode?: string;
  unitSkuName?: string;
  quantityPerPack: number;      // Cuántas unidades contiene este pack
}

export interface ProductSku {
  id: string;
  productId: string;
  skuCode: string;              // Código único (ej. CAM-ROJ-M-01)
  skuDescription?: string;
  size?: string;                // 'XS', 'S', 'M', 'L', 'XL', 'Única', etc.
  colorName?: string;           // 'Rojo Carmesí', 'Negro', etc.
  colorHex?: string;            // '#FF0000' (para selectores visuales de UI)
  costPriceNio: number;         // Costo en NIO
  costPriceUsd: number;         // Costo en USD
  salePriceNio: number;         // Precio regular de venta en NIO
  promoPriceNio?: number;       // Precio de oferta (opcional)
  mainImageUrl?: string;        // Foto principal
  galleryImageUrls?: string[];  // Fotos secundarias
  isActive: boolean;
  stockAvailable?: number;      // Stock físico disponible
  stockReserved?: number;       // Stock apartado / en pedido
  bundleItems?: SkuBundleItem[];// Desglose si es paquete
}

export interface Product {
  id: string;
  categoryId?: string;          // Nivel 1 Principal
  categoryName?: string;
  subcategoryId?: string;       // Nivel 2 Subcategoría
  subcategoryName?: string;
  name: string;
  slug: string;
  description?: string;
  seoDescription?: string;
  productType: ProductType;     // 'simple' | 'paquete'
  isFeatured: boolean;          // Destacado en portada/carrusel
  isActive: boolean;
  skus: ProductSku[];
  createdAt?: string;
  updatedAt?: string;
}
```

### 3.2. Clientes, Facturación, Envíos y Carrito de Compras

```typescript
export interface Customer {
  id: string;
  fullName: string;
  identificationNumber?: string;// Cédula o RUC
  phoneWhatsapp?: string;
  address?: string;
  city: string;                 // Ej. 'Managua'
  notes?: string;
  createdAt?: string;
}

export interface CartItem {
  skuId: string;
  productId: string;
  productName: string;
  skuCode: string;
  size?: string;
  colorName?: string;
  colorHex?: string;
  imageUrl?: string;
  unitPriceNio: number;
  promoPriceNio?: number;
  quantity: number;
  maxStock: number;
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
  
  // Desglose de precios
  regularPriceSinIvaNio: number;
  promoPriceSinIvaNio?: number;
  unitPriceSinIvaNio: number;
  unitPriceNio: number;
  ivaAmountNio: number;         // 15% IVA Nicaragua
  unitCostNio: number;
  discountNio: number;
  lineTotalSinIvaNio: number;
  lineTotalConIvaNio: number;
  lineTotalNio: number;
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
  invoiceNumber: string;        // Ej. 'FAC-0001' o 'PED-0001'
  customerId: string;
  customerName?: string;
  customerPhone?: string;
  customerIdentification?: string;
  customerAddress?: string;
  saleType: SaleType;
  paymentTerm: PaymentTerm;
  status: InvoiceStatus;
  
  // Seguimiento de Entrega / Despacho
  deliveryStatus: DeliveryStatus;
  deliveryDate?: string;
  trackingRef?: string;
  
  issueDate: string;
  dueDate?: string;
  
  // Totales Fiscales
  subtotalSinIvaNio: number;
  subtotalNio: number;
  discountNio: number;
  ivaRate: number;              // 0.15 por defecto
  ivaTotalNio: number;
  totalConIvaNio: number;
  totalNio: number;
  amountPaidNio: number;        // Total abonado
  balanceDueNio: number;        // Saldo pendiente
  
  items: InvoiceItem[];
  payments?: InvoicePayment[];
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}
```

### 3.3. Compras, Importaciones y Prorrateo de Flete

```typescript
export interface ImportExpense {
  id: string;
  purchaseOrderId: string;
  concept: string;              // 'Flete Aéreo', 'Aduana', 'Comisión'
  amountUsd: number;
  amountNio: number;
  notes?: string;
}

export interface PurchaseItem {
  id: string;
  purchaseOrderId: string;
  skuId: string;
  skuCode?: string;
  productName?: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitCostUsd: number;
  unitCostNio: number;
  proratedExpenseNio: number;   // Gasto de flete/aduana asignado por prorrateo
  totalLandedCostNio: number;   // Costo unitario real en destino
  suggestedSalePriceNio: number;// Precio sugerido según reglas de margen
  receptionStatus: ReceptionItemStatus;
}

export interface PurchaseOrder {
  id: string;
  orderNumber: string;          // Lote / Orden interna
  supplierName: string;         // 'Shein', 'Amazon', etc.
  supplierOrderId?: string;
  trackingNumber?: string;
  modality: PurchaseModality;
  status: PurchaseStatus;
  
  datePurchased: string;
  dateDeliveredToAgency?: string;
  dateReceivedNicaragua?: string;
  
  totalCostUsd: number;
  totalCostNio: number;
  totalImportExpensesNio: number;
  
  items: PurchaseItem[];
  expenses: ImportExpense[];
}
```

### 3.4. Analítica y KPIs Ejecutivos

```typescript
export interface DashboardKpis {
  totalActiveSkus: number;
  totalInventoryCostNio: number;
  totalInventorySaleValueNio: number;
  capitalInTransitUsd: number;
  capitalInTransitNio: number;
  ordersInTransitCount: number;
  monthlySalesNio: number;
  monthlyGrossProfitNio: number;
  totalReceivablesNio: number; // Saldo en cuentas por cobrar
  pendingInvoicesCount: number;
}

export interface SalesCategoryBreakdown {
  categoryName: string;
  totalSalesNio: number;
  percentage: number;
}
```

---

## 4. REGLAS DE NEGOCIO Y ALGORITMOS

### A. Algoritmo de Precios Sugeridos (Pricing Automático)
Calcula el precio de venta recomendado con base en el costo landed real:
- **Costo $< \text{C\$} 100$:** Margen del **40%** $\rightarrow \text{Precio} = \text{round}\left(\frac{\text{Costo}}{0.60}, 2\right)$
- **Costo $\ge \text{C\$} 100$:** Margen del **30%** $\rightarrow \text{Precio} = \text{round}\left(\frac{\text{Costo}}{0.70}, 2\right)$
- **Modalidad 'Especial' (Pedido exclusivo):** Margen del **25%** $\rightarrow \text{Precio} = \text{round}\left(\frac{\text{Costo}}{0.75}, 2\right)$

### B. Algoritmo de Prorrateo de Gastos de Importación (Landed Cost)
Distribuye los gastos de flete, aduana e impuestos proporcionalmente entre todos los artículos:
$$\text{Base Total NIO} = \sum (\text{Costo Base NIO}_i \times \text{Cantidad}_i)$$
$$\text{Factor de Gasto} = \frac{\text{Total Gastos Importación NIO}}{\text{Base Total NIO}}$$
$$\text{Gasto Unitario Prorrateado} = \text{Costo Base NIO} \times \text{Factor de Gasto}$$
$$\text{Costo Landed Unitario} = \text{Costo Base NIO} + \text{Gasto Unitario Prorrateado}$$

### C. Lógica de Despaquetizado de Bundles (Control de Inventario)
Cuando se desarma 1 paquete para vender prendas sueltas:
1. Se descuenta $-1$ unidad del SKU paquete.
2. Se suman $+(\text{quantityPerPack})$ unidades a cada SKU unitario integrante.
3. Se registran los movimientos correspondientes en el Kardex (`despaquetizado_salida_pack` y `despaquetizado_entrada_unidad`).

### D. Conversión de Divisas
- Tasa de cambio parametrizable (por defecto `1 USD = 36.80 NIO`).
- Todos los cálculos financieros y saldos se conservan en **NIO (Córdobas)** para máxima consistencia contable.

---

## 5. ESQUEMA DE BASE DE DATOS SUPABASE / POSTGRESQL (DDL ACTUALIZADO)

```sql
-- Extensiones
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Categorías
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    image_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    display_order INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Productos
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    subcategory_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    seo_description TEXT,
    product_type TEXT NOT NULL DEFAULT 'simple' CHECK (product_type IN ('simple', 'paquete')),
    is_featured BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Variantes (SKUs)
CREATE TABLE IF NOT EXISTS product_skus (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku_code TEXT NOT NULL UNIQUE,
    sku_description TEXT,
    size TEXT,
    color_name TEXT,
    color_hex TEXT,
    cost_price_nio NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    cost_price_usd NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    sale_price_nio NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    promo_price_nio NUMERIC(12, 2),
    main_image_url TEXT,
    gallery_image_urls TEXT[] DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Paquetes / Bundles
CREATE TABLE IF NOT EXISTS sku_bundle_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bundle_sku_id UUID NOT NULL REFERENCES product_skus(id) ON DELETE CASCADE,
    unit_sku_id UUID NOT NULL REFERENCES product_skus(id) ON DELETE CASCADE,
    quantity_per_pack INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Stock Físico
CREATE TABLE IF NOT EXISTS inventory_stock (
    sku_id UUID PRIMARY KEY REFERENCES product_skus(id) ON DELETE CASCADE,
    quantity_available INT NOT NULL DEFAULT 0,
    quantity_reserved INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Clientes
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name TEXT NOT NULL,
    identification_number TEXT,
    phone_whatsapp TEXT,
    address TEXT,
    city TEXT DEFAULT 'Managua',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Facturas / Pedidos con Seguimiento de Entrega
CREATE TABLE IF NOT EXISTS sales_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_number TEXT NOT NULL UNIQUE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    sale_type TEXT NOT NULL DEFAULT 'normal' CHECK (sale_type IN ('normal', 'pedido')),
    payment_term TEXT NOT NULL DEFAULT 'contado' CHECK (payment_term IN ('contado', 'credito')),
    status TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('borrador', 'pendiente', 'parcial', 'pagada', 'anulada')),
    
    -- Seguimiento de Envíos / Despacho
    delivery_status TEXT NOT NULL DEFAULT 'pendiente' CHECK (delivery_status IN ('pendiente', 'en_transito', 'listo_entrega', 'entregado', 'cancelado')),
    delivery_date DATE,
    tracking_ref TEXT,
    
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    subtotal_sin_iva_nio NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    subtotal_nio NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    discount_nio NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    iva_rate NUMERIC(6, 4) NOT NULL DEFAULT 0.15,
    iva_total_nio NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_con_iva_nio NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_nio NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    amount_paid_nio NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    balance_due_nio NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Líneas de Factura
CREATE TABLE IF NOT EXISTS sales_invoice_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
    sku_id UUID NOT NULL REFERENCES product_skus(id) ON DELETE RESTRICT,
    quantity INT NOT NULL CHECK (quantity > 0),
    regular_price_sin_iva_nio NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    unit_price_sin_iva_nio NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    promo_price_sin_iva_nio NUMERIC(12, 2),
    unit_price_nio NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    iva_amount_nio NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    unit_cost_nio NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    discount_nio NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    line_total_sin_iva_nio NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    line_total_con_iva_nio NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    line_total_nio NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Pagos y Abonos
CREATE TABLE IF NOT EXISTS invoice_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
    payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    amount_nio NUMERIC(12, 2) NOT NULL CHECK (amount_nio > 0),
    amount_usd NUMERIC(12, 2) DEFAULT 0.00,
    exchange_rate_applied NUMERIC(10, 4),
    payment_method TEXT NOT NULL DEFAULT 'efectivo_cordobas',
    receipt_number TEXT,
    reference_number TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Políticas RLS (Catálogo público / Panel admin)
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_skus ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public categories read" ON categories FOR SELECT USING (is_active = true);
CREATE POLICY "Public products read" ON products FOR SELECT USING (is_active = true);
CREATE POLICY "Public skus read" ON product_skus FOR SELECT USING (is_active = true);
CREATE POLICY "Admin full access categories" ON categories FOR ALL TO authenticated USING (true);
CREATE POLICY "Admin full access products" ON products FOR ALL TO authenticated USING (true);
CREATE POLICY "Admin full access skus" ON product_skus FOR ALL TO authenticated USING (true);
```

---

## 6. ESTRATEGIA DE PERSISTENCIA HÍBRIDA (SUPABASE + LOCALSTORAGE)

Para garantizar funcionamiento continuo sin caídas:
1. **Inicialización:**
   - La app intenta cargar datos desde `SupabaseService`.
   - Si las variables `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` están configuradas y hay conexión, los datos de Supabase alimentan el `AppDataStore`.
2. **Fallback y Operación Offline:**
   - Si no hay conexión o no está configurado Supabase, el `AppDataStore` lee de `LocalStorage` (o de `mockSeedData`).
3. **Escritura Resiliente:**
   - Cada mutación (crear producto, registrar pago, actualizar orden, emitir factura) se guarda en `LocalStorage` inmediatamente y se replica de forma asíncrona hacia Supabase.

---

## 7. FORMATO DEL MENSAJE DE PEDIDO PARA WHATSAPP

Plantilla optimizada para el botón *"Comprar / Ordenar por WhatsApp"*:

```text
🛍️ *¡HOLA! QUIERO REALIZAR UN PEDIDO EN PAJARITA STORE* 🛍️

👤 *Cliente:* [Nombre del Cliente]
📱 *Teléfono:* [Número de WhatsApp]
📍 *Dirección de Entrega:* [Dirección y Ciudad]

📋 *PRODUCTOS SELECCIONADOS:*
• 1x Camisa Casual Lino - Rojo Carmesí / Talla M (C$ 650.00)
• 2x Vestido Floral Verano - Negro / Talla S (C$ 850.00 c/u -> C$ 1,700.00)

💵 *RESUMEN DE PAGO:*
• Subtotal: C$ 2,350.00 (~$63.85 USD)
• Envío: A coordinar
• *Total Estimado: C$ 2,350.00*

¿Me confirman disponibilidad para coordinar la entrega y el método de pago? ¡Gracias!
```

---
*Documento actualizado y sincronizado con la última versión del modelo de datos y reglas de negocio.*
