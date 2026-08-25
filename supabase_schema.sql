-- =============================================================================
-- ESQUEMA DE BASE DE DATOS PARA PAJARITA STORE 2.0 (SUPABASE POSTGRESQL)
-- =============================================================================

-- Habilitar extensión UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- 1. ENUMS Y TIPOS PERSONALIZADOS
-- =============================================================================

DO $$ BEGIN
    CREATE TYPE product_type_enum AS ENUM ('simple', 'paquete');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE purchase_modality_enum AS ENUM ('simple', 'especial', 'regalia');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE purchase_status_enum AS ENUM (
        'comprado',
        'en_agencia_envio',
        'en_transito_nicaragua',
        'recibido_parcial',
        'recibido_completo',
        'cancelado'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE reception_item_status_enum AS ENUM (
        'pendiente',
        'recibido',
        'no_vino',
        'devuelto',
        'cancelado'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE sale_type_enum AS ENUM ('normal', 'pedido');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_term_enum AS ENUM ('contado', 'credito');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE invoice_status_enum AS ENUM (
        'borrador',
        'pendiente',
        'parcial',
        'pagada',
        'anulada'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_method_enum AS ENUM (
        'efectivo_cordobas',
        'efectivo_dolares',
        'transferencia_bancaria',
        'tarjeta',
        'otro'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE movement_type_enum AS ENUM (
        'compra_recepcion',
        'venta_factura',
        'despaquetizado_salida_pack',
        'despaquetizado_entrada_unidad',
        'ajuste_positivo',
        'ajuste_negativo',
        'regalia_promocion',
        'devolucion'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE promo_type_enum AS ENUM (
        'descuento_porcentaje',
        'descuento_monto_fijo',
        'regalia_producto',
        '2x1'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =============================================================================
-- 2. TABLA DE TASAS DE CAMBIO (USD / NIO)
-- =============================================================================
CREATE TABLE IF NOT EXISTS currency_rates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rate_usd_to_nio NUMERIC(10, 4) NOT NULL, -- Ej: 36.80
    is_active BOOLEAN NOT NULL DEFAULT true,
    effective_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 3. PERFILES DE USUARIOS Y ROLES (ADMIN / COLABORADORES)
-- =============================================================================
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'vendedor' CHECK (role IN ('admin', 'vendedor', 'inventario')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 4. CATÁLOGO Y PRODUCTOS
-- =============================================================================

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

CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,    -- Nivel 1 Principal
    subcategory_id UUID REFERENCES categories(id) ON DELETE SET NULL, -- Nivel 2 Subcategoría
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    seo_description TEXT,
    product_type product_type_enum NOT NULL DEFAULT 'simple',
    is_featured BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Asegurar columna subcategory_id si la tabla products ya existía previamente
ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory_id UUID REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE product_skus ADD COLUMN IF NOT EXISTS color_hex TEXT;
ALTER TABLE product_skus ADD COLUMN IF NOT EXISTS main_image_url TEXT;

CREATE TABLE IF NOT EXISTS product_skus (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku_code TEXT NOT NULL UNIQUE,
    sku_description TEXT,
    size TEXT,                      -- Ej: 'S', 'M', 'L', 'XL', 'Única'
    color_name TEXT,                -- Ej: 'Rojo Carmesí', 'Negro'
    color_hex TEXT,                 -- Ej: '#FF0000' (para selector de pelotitas de color)
    cost_price_nio NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    cost_price_usd NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    sale_price_nio NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    promo_price_nio NUMERIC(12, 2), -- Precio de oferta si aplica
    main_image_url TEXT,
    gallery_image_urls TEXT[] DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Relación de desglose para SKUs de tipo paquete
-- Ej: Pack de 3 camisas M se divide en 3 SKUs unitarios (1 Roja, 1 Azul, 1 Blanca)
CREATE TABLE IF NOT EXISTS sku_bundle_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bundle_sku_id UUID NOT NULL REFERENCES product_skus(id) ON DELETE CASCADE,
    unit_sku_id UUID NOT NULL REFERENCES product_skus(id) ON DELETE CASCADE,
    quantity_per_pack INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 5. COMPRAS, IMPORTACIONES (SHEIN/AMAZON) Y PRORRATEO
-- =============================================================================

CREATE TABLE IF NOT EXISTS purchase_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number TEXT NOT NULL UNIQUE,       -- Código interno / Lote
    supplier_name TEXT NOT NULL,             -- Ej: 'Shein', 'Amazon', 'Proveedor Local'
    supplier_order_id TEXT,                  -- ID de pedido en Shein/Amazon
    tracking_number TEXT,                    -- ID de rastreo de paquete
    supplier_invoice_id TEXT,                -- Factura comercial (opcional)
    modality purchase_modality_enum NOT NULL DEFAULT 'simple',
    status purchase_status_enum NOT NULL DEFAULT 'comprado',
    
    date_purchased DATE NOT NULL DEFAULT CURRENT_DATE,
    date_delivered_to_agency DATE,          -- Fecha entrega en casillero/agencia USA
    date_received_nicaragua DATE,           -- Fecha llegada a Nicaragua
    
    total_cost_usd NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_cost_nio NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_import_expenses_nio NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    
    notes TEXT,
    created_by UUID REFERENCES user_profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS import_expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    concept TEXT NOT NULL,                   -- Ej: 'Flete Aéreo', 'Aduana', 'Costo Extra Venta'
    amount_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    amount_nio NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    sku_id UUID NOT NULL REFERENCES product_skus(id) ON DELETE RESTRICT,
    quantity_ordered INT NOT NULL CHECK (quantity_ordered > 0),
    quantity_received INT NOT NULL DEFAULT 0,
    
    unit_cost_usd NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    unit_cost_nio NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    
    -- Costo prorrateado asignado tras el reparto de flete/gastos
    prorated_expense_nio NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_landed_cost_nio NUMERIC(12, 2) NOT NULL DEFAULT 0.00, -- (unit_cost_nio + prorated_expense_nio)
    
    -- Precio sugerido calculado con las reglas de margen
    suggested_sale_price_nio NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    
    reception_status reception_item_status_enum NOT NULL DEFAULT 'pendiente',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 6. INVENTARIO FÍSICO Y MOVIMIENTOS (KARDEX)
-- =============================================================================

CREATE TABLE IF NOT EXISTS inventory_stock (
    sku_id UUID PRIMARY KEY REFERENCES product_skus(id) ON DELETE CASCADE,
    quantity_available INT NOT NULL DEFAULT 0,
    quantity_reserved INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku_id UUID NOT NULL REFERENCES product_skus(id) ON DELETE RESTRICT,
    movement_type movement_type_enum NOT NULL,
    quantity INT NOT NULL,                   -- Positivo para entradas, negativo para salidas
    previous_stock INT NOT NULL,
    new_stock INT NOT NULL,
    reference_id UUID,                       -- ID de purchase_order, sales_invoice, etc.
    notes TEXT,
    created_by UUID REFERENCES user_profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 7. CLIENTES, FACTURACIÓN Y CUENTAS POR COBRAR (ABONOS)
-- =============================================================================

CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name TEXT NOT NULL,
    identification_number TEXT,              -- Cédula o RUC
    phone_whatsapp TEXT,
    address TEXT,
    city TEXT DEFAULT 'Managua',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_number TEXT NOT NULL UNIQUE,     -- Consecutivo: FAC-0001
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    sale_type sale_type_enum NOT NULL DEFAULT 'normal',
    payment_term payment_term_enum NOT NULL DEFAULT 'contado',
    status invoice_status_enum NOT NULL DEFAULT 'pendiente',
    
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    
    -- Desglose Fiscal de Facturación
    subtotal_sin_iva_nio NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    subtotal_nio NUMERIC(12, 2) NOT NULL DEFAULT 0.00, -- Compatibilidad
    discount_nio NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    iva_rate NUMERIC(6, 4) NOT NULL DEFAULT 0.15,      -- 15% IVA Nicaragua
    iva_total_nio NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_con_iva_nio NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_nio NUMERIC(12, 2) NOT NULL DEFAULT 0.00,    -- Total con IVA
    amount_paid_nio NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    balance_due_nio NUMERIC(12, 2) NOT NULL DEFAULT 0.00, -- Saldo pendiente
    
    notes TEXT,
    created_by UUID REFERENCES user_profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Asegurar columnas fiscales en sales_invoices si la tabla ya existía
ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS subtotal_sin_iva_nio NUMERIC(12, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS iva_rate NUMERIC(6, 4) NOT NULL DEFAULT 0.15;
ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS iva_total_nio NUMERIC(12, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS total_con_iva_nio NUMERIC(12, 2) NOT NULL DEFAULT 0.00;

CREATE TABLE IF NOT EXISTS sales_invoice_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
    sku_id UUID NOT NULL REFERENCES product_skus(id) ON DELETE RESTRICT,
    quantity INT NOT NULL CHECK (quantity > 0),
    
    -- Precios Fiscales sin IVA y con IVA
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

-- Asegurar columnas fiscales en sales_invoice_items si la tabla ya existía
ALTER TABLE sales_invoice_items ADD COLUMN IF NOT EXISTS regular_price_sin_iva_nio NUMERIC(12, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE sales_invoice_items ADD COLUMN IF NOT EXISTS unit_price_sin_iva_nio NUMERIC(12, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE sales_invoice_items ADD COLUMN IF NOT EXISTS promo_price_sin_iva_nio NUMERIC(12, 2);
ALTER TABLE sales_invoice_items ADD COLUMN IF NOT EXISTS iva_amount_nio NUMERIC(12, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE sales_invoice_items ADD COLUMN IF NOT EXISTS line_total_sin_iva_nio NUMERIC(12, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE sales_invoice_items ADD COLUMN IF NOT EXISTS line_total_con_iva_nio NUMERIC(12, 2) NOT NULL DEFAULT 0.00;

CREATE TABLE IF NOT EXISTS invoice_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
    payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    amount_nio NUMERIC(12, 2) NOT NULL CHECK (amount_nio > 0),
    amount_usd NUMERIC(12, 2) DEFAULT 0.00,
    exchange_rate_applied NUMERIC(10, 4),
    payment_method payment_method_enum NOT NULL DEFAULT 'efectivo_cordobas',
    receipt_number TEXT,
    reference_number TEXT,
    notes TEXT,
    created_by UUID REFERENCES user_profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 8. PROMOCIONES Y REGALÍAS
-- =============================================================================

CREATE TABLE IF NOT EXISTS promotions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    promo_type promo_type_enum NOT NULL,
    discount_value NUMERIC(10, 2) DEFAULT 0.00, -- Porcentaje o valor fijo
    gift_sku_id UUID REFERENCES product_skus(id) ON DELETE SET NULL, -- Si es una regalía
    min_purchase_amount_nio NUMERIC(12, 2) DEFAULT 0.00,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 9. ÍNDICES DE RENDIMIENTO
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_subcategory ON products(subcategory_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_skus_product ON product_skus(product_id);
CREATE INDEX IF NOT EXISTS idx_skus_active ON product_skus(is_active);
CREATE INDEX IF NOT EXISTS idx_purchases_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_purchases_tracking ON purchase_orders(tracking_number);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON sales_invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON sales_invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due ON sales_invoices(balance_due_nio) WHERE balance_due_nio > 0;
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON invoice_payments(invoice_id);

-- =============================================================================
-- 10. FUNCIONES Y TRIGGERS DE LÓGICA DE NEGOCIO
-- =============================================================================

-- A. Función para cálculo de Pricing Sugerido según reglas:
--    - Costo < 100 NIO: 40% de ganancia (Precio = Costo / 0.60)
--    - Costo >= 100 NIO: 30% de ganancia (Precio = Costo / 0.70)
--    - Modalidad Especial (Bajo Pedido): 25% de ganancia (Precio = Costo / 0.75)
CREATE OR REPLACE FUNCTION calculate_suggested_price(
    cost_nio NUMERIC,
    modality purchase_modality_enum
)
RETURNS NUMERIC AS $$
BEGIN
    IF cost_nio <= 0 THEN
        RETURN 0.00;
    END IF;
    
    IF modality = 'especial' THEN
        -- Margen 25%
        RETURN ROUND(cost_nio / 0.75, 2);
    ELSIF cost_nio < 100 THEN
        -- Margen 40%
        RETURN ROUND(cost_nio / 0.60, 2);
    ELSE
        -- Margen 30%
        RETURN ROUND(cost_nio / 0.70, 2);
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- B. Función para prorratear gastos de importación y calcular precios
CREATE OR REPLACE FUNCTION prorate_purchase_order_expenses(p_order_id UUID)
RETURNS VOID AS $$
DECLARE
    v_total_expenses_nio NUMERIC;
    v_total_base_cost_nio NUMERIC;
    v_modality purchase_modality_enum;
BEGIN
    -- Obtener modalidad y suma de gastos
    SELECT modality INTO v_modality FROM purchase_orders WHERE id = p_order_id;
    
    SELECT COALESCE(SUM(amount_nio), 0) INTO v_total_expenses_nio
    FROM import_expenses WHERE purchase_order_id = p_order_id;
    
    -- Actualizar total_import_expenses_nio en la orden
    UPDATE purchase_orders 
    SET total_import_expenses_nio = v_total_expenses_nio 
    WHERE id = p_order_id;
    
    -- Suma base de costos de los productos de la orden (unit_cost_nio * quantity_ordered)
    SELECT COALESCE(SUM(unit_cost_nio * quantity_ordered), 0) INTO v_total_base_cost_nio
    FROM purchase_items
    WHERE purchase_order_id = p_order_id;
    
    IF v_total_base_cost_nio > 0 THEN
        -- Prorratear proporcionalmente
        UPDATE purchase_items
        SET 
            prorated_expense_nio = ROUND(( (unit_cost_nio * quantity_ordered) / v_total_base_cost_nio * v_total_expenses_nio ) / quantity_ordered, 2),
            total_landed_cost_nio = unit_cost_nio + ROUND(( (unit_cost_nio * quantity_ordered) / v_total_base_cost_nio * v_total_expenses_nio ) / quantity_ordered, 2),
            suggested_sale_price_nio = calculate_suggested_price(
                unit_cost_nio + ROUND(( (unit_cost_nio * quantity_ordered) / v_total_base_cost_nio * v_total_expenses_nio ) / quantity_ordered, 2),
                v_modality
            )
        WHERE purchase_order_id = p_order_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- C. Trigger para actualizar el balance pendiente y estado de la factura tras pagos
CREATE OR REPLACE FUNCTION update_invoice_balance_on_payment()
RETURNS TRIGGER AS $$
DECLARE
    v_total_paid NUMERIC;
    v_total_invoice NUMERIC;
BEGIN
    -- Sumar todos los abonos realizados a la factura
    SELECT COALESCE(SUM(amount_nio), 0) INTO v_total_paid
    FROM invoice_payments
    WHERE invoice_id = NEW.invoice_id;
    
    SELECT total_nio INTO v_total_invoice
    FROM sales_invoices
    WHERE id = NEW.invoice_id;
    
    UPDATE sales_invoices
    SET 
        amount_paid_nio = v_total_paid,
        balance_due_nio = GREATEST(0, v_total_invoice - v_total_paid),
        status = CASE 
            WHEN v_total_paid >= v_total_invoice THEN 'pagada'::invoice_status_enum
            WHEN v_total_paid > 0 THEN 'parcial'::invoice_status_enum
            ELSE 'pendiente'::invoice_status_enum
        END,
        updated_at = NOW()
    WHERE id = NEW.invoice_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_invoice_balance ON invoice_payments;
CREATE TRIGGER trg_update_invoice_balance
AFTER INSERT OR UPDATE OR DELETE ON invoice_payments
FOR EACH ROW
EXECUTE FUNCTION update_invoice_balance_on_payment();

-- =============================================================================
-- 11. ROW LEVEL SECURITY (POLÍTICAS DE SEGURIDAD EN SUPABASE)
-- =============================================================================

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_skus ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;

-- 1. Catálogo Público: Solo lectura para clientes (anon y authenticated)
DROP POLICY IF EXISTS "Public categories read access" ON categories;
CREATE POLICY "Public categories read access" ON categories
FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Public products read access" ON products;
CREATE POLICY "Public products read access" ON products
FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Public skus read access" ON product_skus;
CREATE POLICY "Public skus read access" ON product_skus
FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Public promotions read access" ON promotions;
CREATE POLICY "Public promotions read access" ON promotions
FOR SELECT USING (is_active = true AND NOW() BETWEEN start_date AND end_date);

-- 2. Mini ERP: Acceso completo para usuarios autenticados con rol administrativo
DROP POLICY IF EXISTS "Admin full access categories" ON categories;
CREATE POLICY "Admin full access categories" ON categories
FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin full access products" ON products;
CREATE POLICY "Admin full access products" ON products
FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin full access product_skus" ON product_skus;
CREATE POLICY "Admin full access product_skus" ON product_skus
FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin full access inventory" ON inventory_stock;
CREATE POLICY "Admin full access inventory" ON inventory_stock
FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin full access purchases" ON purchase_orders;
CREATE POLICY "Admin full access purchases" ON purchase_orders
FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin full access purchase_items" ON purchase_items;
CREATE POLICY "Admin full access purchase_items" ON purchase_items
FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin full access import_expenses" ON import_expenses;
CREATE POLICY "Admin full access import_expenses" ON import_expenses
FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin full access customers" ON customers;
CREATE POLICY "Admin full access customers" ON customers
FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin full access invoices" ON sales_invoices;
CREATE POLICY "Admin full access invoices" ON sales_invoices
FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin full access invoice_items" ON sales_invoice_items;
CREATE POLICY "Admin full access invoice_items" ON sales_invoice_items
FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin full access payments" ON invoice_payments;
CREATE POLICY "Admin full access payments" ON invoice_payments
FOR ALL TO authenticated USING (true);

ALTER TABLE currency_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public currency rates read access" ON currency_rates;
CREATE POLICY "Public currency rates read access" ON currency_rates FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin currency rates access" ON currency_rates;
CREATE POLICY "Admin currency rates access" ON currency_rates FOR ALL TO authenticated USING (true);
