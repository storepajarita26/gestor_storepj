import { supabase, isSupabaseConfigured } from './client';
import { Product, ProductSku, Category } from '@/domain/catalog/types';
import { PurchaseOrder, ImportExpense } from '@/domain/procurement/types';
import { StockLevel, KardexMovement } from '@/domain/inventory/types';
import { SalesInvoice, InvoicePayment, Customer } from '@/domain/sales/types';

// Validador de formato UUID v4
export function isValidUuid(str?: string): boolean {
  if (!str) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

// Columnas de product_skus visibles para visitantes sin sesión (sin costos).
// Deben coincidir con los permisos de columna de supabase_seguridad_rls.sql.
const PUBLIC_SKU_COLUMNS =
  'id, product_id, sku_code, sku_description, size, color_name, color_hex, sale_price_nio, promo_price_nio, main_image_url, is_active, created_at, updated_at';

export class SupabaseService {
  public static isConnected(): boolean {
    return isSupabaseConfigured && supabase !== null;
  }

  /** true si hay una sesión iniciada (las políticas RLS solo permiten el ERP a usuarios autenticados) */
  public static async isAuthenticated(): Promise<boolean> {
    if (!this.isConnected()) return false;
    try {
      const { data } = await supabase!.auth.getSession();
      return Boolean(data.session?.user);
    } catch {
      return false;
    }
  }

  // =========================================================================
  // 1. CATEGORÍAS (N1 & N2)
  // =========================================================================
  public static async fetchCategories(): Promise<Category[] | null> {
    if (!this.isConnected()) return null;
    try {
      const { data, error } = await supabase!
        .from('categories')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) {
        console.warn('Error al obtener categorías de Supabase:', error.message);
        return null;
      }

      const rawCategories = data || [];
      const nameMap = new Map(rawCategories.map((r) => [r.id, r.name]));

      return rawCategories.map((row) => ({
        id: row.id,
        parentId: row.parent_id || undefined,
        parentName: row.parent_id ? nameMap.get(row.parent_id) : undefined,
        name: row.name,
        slug: row.slug,
        description: row.description,
        imageUrl: row.image_url,
        isActive: row.is_active,
        displayOrder: row.display_order,
      }));
    } catch (e) {
      console.warn('Excepción al leer categorías de Supabase:', e);
      return null;
    }
  }

  public static async insertCategory(cat: Category): Promise<string | null> {
    if (!this.isConnected()) return null;
    try {
      const payload: any = {
        name: cat.name,
        slug: cat.slug,
        description: cat.description,
        image_url: cat.imageUrl,
        is_active: cat.isActive ?? true,
        display_order: cat.displayOrder ?? 0,
      };

      if (isValidUuid(cat.id)) payload.id = cat.id;
      if (isValidUuid(cat.parentId)) payload.parent_id = cat.parentId;

      const { data, error } = await supabase!
        .from('categories')
        .insert(payload)
        .select('id')
        .single();

      if (error) {
        console.warn('Error al insertar categoría en Supabase:', error.message);
        return null;
      }
      return data?.id || null;
    } catch (e) {
      console.warn('Excepción insertando categoría en Supabase:', e);
      return null;
    }
  }

  public static async updateCategory(cat: Category): Promise<boolean> {
    if (!this.isConnected() || !isValidUuid(cat.id)) return false;
    try {
      const { data, error } = await supabase!
        .from('categories')
        .update({
          name: cat.name,
          slug: cat.slug,
          parent_id: isValidUuid(cat.parentId) ? cat.parentId : null,
          description: cat.description,
          image_url: cat.imageUrl,
          is_active: cat.isActive,
          display_order: cat.displayOrder,
          updated_at: new Date().toISOString(),
        })
        .eq('id', cat.id)
        .select('id');

      if (error) {
        console.error('Error al actualizar categoría en Supabase:', error.message);
        return false;
      }
      return Boolean(data && data.length > 0);
    } catch (e) {
      console.warn('Excepción actualizando categoría en Supabase:', e);
      return false;
    }
  }

  public static async deleteCategory(id: string): Promise<boolean> {
    if (!this.isConnected() || !isValidUuid(id)) return false;
    try {
      const { error } = await supabase!.from('categories').delete().eq('id', id);
      return !error;
    } catch (e) {
      console.warn('Excepción eliminando categoría en Supabase:', e);
      return false;
    }
  }

  // =========================================================================
  // 2. PRODUCTOS Y VARIANTES (SKUS)
  // =========================================================================
  public static async fetchProducts(): Promise<Product[] | null> {
    if (!this.isConnected()) return null;
    try {
      // Sin sesión, la base solo permite leer columnas públicas de product_skus (sin costos)
      const authenticated = await this.isAuthenticated();
      const skuColumns = authenticated ? '*' : PUBLIC_SKU_COLUMNS;
      const { data, error } = await supabase!
        .from('products')
        .select(`
          *,
          product_skus (${skuColumns})
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Error al obtener productos de Supabase:', error.message);
        return null;
      }

      const categories = (await this.fetchCategories()) || [];
      const catMap = new Map(categories.map((c) => [c.id, c.name]));

      const bundleItemsMap = new Map<string, any[]>();
      try {
        const { data: bData } = await supabase!.from('sku_bundle_items').select('*');
        if (bData && bData.length > 0) {
          bData.forEach((bi: any) => {
            const list = bundleItemsMap.get(bi.bundle_sku_id) || [];
            list.push({
              id: bi.id,
              bundleSkuId: bi.bundle_sku_id,
              unitSkuId: bi.unit_sku_id,
              quantityPerPack: Number(bi.quantity_per_pack) || 1,
            });
            bundleItemsMap.set(bi.bundle_sku_id, list);
          });
        }
      } catch (e) {
        // Ignorar si la tabla no está accesible en modo anónimo
      }

      return (data || []).map((row) => ({
        id: row.id,
        productCode: row.product_code || undefined,
        categoryId: row.category_id,
        categoryName: row.category_id ? catMap.get(row.category_id) : undefined,
        subcategoryId: row.subcategory_id,
        subcategoryName: row.subcategory_id ? catMap.get(row.subcategory_id) : undefined,
        name: row.name,
        slug: row.slug,
        description: row.description,
        seoDescription: row.seo_description,
        descriptionHtml: row.description_html || undefined,
        productType: row.product_type,
        isFeatured: row.is_featured,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        skus: (row.product_skus || [])
          .map((s: any) => ({
            id: s.id,
            productId: s.product_id,
            skuCode: s.sku_code,
            skuDescription: s.sku_description,
            skuType: s.sku_type === 'paquete' ? 'paquete' : s.sku_type === 'simple' ? 'simple' : undefined,
            bundleItems: bundleItemsMap.get(s.id) || (s.bundle_items || []),
            descriptionHtml: s.description_html || undefined,
            size: s.size,
            colorName: s.color_name,
            colorHex: s.color_hex,
            costPriceNio: Number(s.cost_price_nio || 0),
            costPriceUsd: Number(s.cost_price_usd || 0),
            salePriceNio: Number(s.sale_price_nio || 0),
            promoPriceNio: s.promo_price_nio ? Number(s.promo_price_nio) : undefined,
            mainImageUrl: s.main_image_url,
            isActive: s.is_active,
            createdAt: s.created_at,
            updatedAt: s.updated_at,
          }))
          .sort((a: any, b: any) => {
            const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            if (timeB !== timeA) return timeB - timeA;
            return (b.skuCode || '').localeCompare(a.skuCode || '', undefined, { numeric: true });
          }),
      }));
    } catch (err) {
      console.warn('Excepción obteniendo productos de Supabase:', err);
      return null;
    }
  }

  public static async insertProduct(product: Product): Promise<string | null> {
    if (!this.isConnected()) return null;
    try {
      const payload: any = {
        name: product.name,
        slug: product.slug,
        product_code: product.productCode || null,
        description: product.description,
        seo_description: product.seoDescription,
        description_html: product.descriptionHtml || null,
        product_type: product.productType,
        is_featured: product.isFeatured ?? false,
        is_active: product.isActive ?? true,
      };

      if (isValidUuid(product.id)) payload.id = product.id;
      if (isValidUuid(product.categoryId)) payload.category_id = product.categoryId;
      if (isValidUuid(product.subcategoryId)) payload.subcategory_id = product.subcategoryId;

      const { data: prodData, error: prodErr } = await supabase!
        .from('products')
        .insert(payload)
        .select('id, product_code')
        .single();

      if (prodErr || !prodData) {
        console.warn('Error al insertar producto en Supabase:', prodErr?.message);
        return null;
      }

      const assignedProdId = prodData.id;

      if (product.skus && product.skus.length > 0) {
        const skusToInsert = product.skus.map((s) => {
          const skuRow: any = {
            product_id: assignedProdId,
            sku_code: s.skuCode,
            sku_description: s.skuDescription,
            description_html: s.descriptionHtml || null,
            size: s.size,
            color_name: s.colorName,
            color_hex: s.colorHex,
            cost_price_nio: s.costPriceNio,
            cost_price_usd: s.costPriceUsd,
            sale_price_nio: s.salePriceNio,
            promo_price_nio: s.promoPriceNio,
            main_image_url: s.mainImageUrl,
            is_active: s.isActive ?? true,
          };
          if (isValidUuid(s.id)) skuRow.id = s.id;
          return skuRow;
        });

        await supabase!.from('product_skus').insert(skusToInsert);
      }

      return assignedProdId;
    } catch (e) {
      console.warn('Excepción insertando producto en Supabase:', e);
      return null;
    }
  }

  public static async updateProduct(product: Product): Promise<boolean> {
    if (!this.isConnected() || !isValidUuid(product.id)) return false;
    try {
      const updatePayload: any = {
        name: product.name,
        slug: product.slug,
        category_id: isValidUuid(product.categoryId) ? product.categoryId : null,
        subcategory_id: isValidUuid(product.subcategoryId) ? product.subcategoryId : null,
        description: product.description,
        seo_description: product.seoDescription,
        description_html: product.descriptionHtml || null,
        product_type: product.productType,
        is_featured: product.isFeatured,
        is_active: product.isActive,
        updated_at: new Date().toISOString(),
      };

      if (product.productCode) {
        updatePayload.product_code = product.productCode;
      }

      const { data, error } = await supabase!
        .from('products')
        .update(updatePayload)
        .eq('id', product.id)
        .select('id');

      if (error) {
        console.error('Error al actualizar producto en Supabase:', error.message);
        return false;
      }
      if (!data || data.length === 0) {
        console.warn('Supabase no actualizó ningún registro en products (bloqueado por políticas RLS en Supabase).');
        return false;
      }
      return true;
    } catch (e) {
      console.warn('Excepción actualizando producto en Supabase:', e);
      return false;
    }
  }

  public static async deleteProduct(id: string): Promise<boolean> {
    if (!this.isConnected() || !isValidUuid(id)) return false;
    try {
      const { error } = await supabase!.from('products').delete().eq('id', id);
      return !error;
    } catch (e) {
      console.warn('Excepción eliminando producto en Supabase:', e);
      return false;
    }
  }

  public static async updateSku(sku: ProductSku): Promise<boolean> {
    if (!this.isConnected() || !isValidUuid(sku.id)) return false;
    try {
      const { data, error } = await supabase!
        .from('product_skus')
        .update({
          sku_code: sku.skuCode,
          sku_description: sku.skuDescription,
          description_html: sku.descriptionHtml || null,
          size: sku.size,
          color_name: sku.colorName,
          color_hex: sku.colorHex,
          cost_price_nio: sku.costPriceNio,
          cost_price_usd: sku.costPriceUsd,
          sale_price_nio: sku.salePriceNio,
          promo_price_nio: sku.promoPriceNio,
          main_image_url: sku.mainImageUrl,
          is_active: sku.isActive,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sku.id)
        .select('id');

      if (error) {
        console.error('Error al actualizar SKU en Supabase:', error.message);
        return false;
      }
      if (!data || data.length === 0) {
        console.warn('Supabase no actualizó ningún registro en product_skus (bloqueado por políticas RLS en Supabase).');
        return false;
      }
      return true;
    } catch (e) {
      console.warn('Excepción actualizando SKU en Supabase:', e);
      return false;
    }
  }

  public static async insertSku(sku: ProductSku): Promise<string | null> {
    if (!this.isConnected() || !isValidUuid(sku.productId)) return null;
    try {
      const payload: any = {
        product_id: sku.productId,
        sku_code: sku.skuCode,
        sku_description: sku.skuDescription,
        description_html: sku.descriptionHtml || null,
        size: sku.size,
        color_name: sku.colorName,
        color_hex: sku.colorHex,
        cost_price_nio: sku.costPriceNio,
        cost_price_usd: sku.costPriceUsd,
        sale_price_nio: sku.salePriceNio,
        promo_price_nio: sku.promoPriceNio,
        main_image_url: sku.mainImageUrl,
        is_active: sku.isActive ?? true,
      };

      if (isValidUuid(sku.id)) payload.id = sku.id;

      const { data, error } = await supabase!
        .from('product_skus')
        .insert(payload)
        .select('id')
        .single();

      if (error) {
        console.error('Error al insertar SKU en Supabase:', error.message);
        return null;
      }
      return data?.id || null;
    } catch (e) {
      console.warn('Excepción insertando SKU en Supabase:', e);
      return null;
    }
  }

  public static async deleteSku(id: string): Promise<boolean> {
    if (!this.isConnected() || !isValidUuid(id)) return false;
    try {
      const { error } = await supabase!.from('product_skus').delete().eq('id', id);
      return !error;
    } catch (e) {
      console.warn('Excepción eliminando SKU en Supabase:', e);
      return false;
    }
  }

  // =========================================================================
  // 3. ÓRDENES DE COMPRA & PRORRATEO
  // =========================================================================
  public static async fetchPurchaseOrders(): Promise<PurchaseOrder[] | null> {
    if (!this.isConnected()) return null;
    try {
      const { data, error } = await supabase!
        .from('purchase_orders')
        .select(`
          *,
          purchase_items (*),
          import_expenses (*)
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Error al obtener órdenes de compra de Supabase:', error.message);
        return null;
      }

      return (data || []).map((row) => mapPurchaseOrderRow(row));
    } catch (e) {
      console.warn('Excepción obteniendo órdenes de compra de Supabase:', e);
      return null;
    }
  }

  /**
   * Consulta bajo demanda las órdenes de compra ya recibidas (completas o parciales)
   * aplicando filtros y límite en la consulta para no afectar el rendimiento general.
   */
  public static async fetchCompletedReceptionsOnDemand(params?: {
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    statusFilter?: 'todos' | 'recibido_completo' | 'recibido_parcial';
    limit?: number;
  }): Promise<PurchaseOrder[] | null> {
    if (!this.isConnected()) return null;
    try {
      const limit = Math.min(Math.max(params?.limit || 30, 5), 200);
      let query = supabase!
        .from('purchase_orders')
        .select(`
          *,
          purchase_items (*),
          import_expenses (*)
        `);

      if (params?.statusFilter && params.statusFilter !== 'todos') {
        query = query.eq('status', params.statusFilter);
      } else {
        query = query.in('status', ['recibido_completo', 'recibido_parcial']);
      }

      if (params?.dateFrom) {
        query = query.gte('date_received_nicaragua', params.dateFrom);
      }
      if (params?.dateTo) {
        query = query.lte('date_received_nicaragua', params.dateTo);
      }

      const { data, error } = await query
        .order('date_received_nicaragua', { ascending: false, nullsFirst: false })
        .order('updated_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.warn('Error consultando recepciones realizadas bajo demanda:', error.message);
        return null;
      }

      return (data || []).map((row) => mapPurchaseOrderRow(row));
    } catch (e) {
      console.warn('Excepción consultando recepciones realizadas bajo demanda:', e);
      return null;
    }
  }

  /**
   * Obtiene bajo demanda los movimientos de Kardex (compra_recepcion) de una orden específica.
   */
  public static async fetchReceptionMovementsByOrder(orderId: string): Promise<KardexMovement[] | null> {
    if (!this.isConnected() || !isValidUuid(orderId)) return null;
    try {
      const { data, error } = await supabase!
        .from('inventory_movements')
        .select(`
          *,
          product_skus (
            sku_code,
            products (name)
          )
        `)
        .eq('reference_id', orderId)
        .eq('movement_type', 'compra_recepcion')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Error consultando movimientos de recepción por orden:', error.message);
        return null;
      }

      return (data || []).map((row) => mapMovementRow(row));
    } catch (e) {
      console.warn('Excepción consultando movimientos de recepción por orden:', e);
      return null;
    }
  }

  public static async insertPurchaseOrder(order: PurchaseOrder): Promise<string | null> {
    if (!this.isConnected()) return null;
    try {
      const orderPayload: any = {
        order_number: order.orderNumber,
        supplier_name: order.supplierName,
        supplier_order_id: order.supplierOrderId,
        tracking_number: order.trackingNumber,
        modality: order.modality,
        status: order.status,
        date_purchased: order.datePurchased,
        total_cost_usd: order.totalCostUsd,
        total_cost_nio: order.totalCostNio,
        total_import_expenses_nio: order.totalImportExpensesNio,
        notes: order.notes,
      };
      if (isValidUuid(order.id)) orderPayload.id = order.id;

      const { data: orderData, error: orderErr } = await supabase!
        .from('purchase_orders')
        .insert(orderPayload)
        .select('id')
        .single();

      if (orderErr || !orderData) {
        console.warn('Error al insertar orden de compra en Supabase:', orderErr?.message);
        return null;
      }

      const assignedOrderId = orderData.id;

      // Insertar ítems
      if (order.items && order.items.length > 0) {
        const itemsPayload = order.items
          .filter((it) => isValidUuid(it.skuId))
          .map((it) => {
            const itemRow: any = {
              purchase_order_id: assignedOrderId,
              sku_id: it.skuId,
              quantity_ordered: it.quantityOrdered,
              quantity_received: it.quantityReceived || 0,
              unit_cost_usd: it.unitCostUsd,
              unit_cost_nio: it.unitCostNio,
              prorated_expense_nio: it.proratedExpenseNio,
              total_landed_cost_nio: it.totalLandedCostNio,
              suggested_sale_price_nio: it.suggestedSalePriceNio,
              reception_status: it.receptionStatus || 'pendiente',
            };
            if (isValidUuid(it.id)) itemRow.id = it.id;
            return itemRow;
          });

        if (itemsPayload.length > 0) {
          await supabase!.from('purchase_items').insert(itemsPayload);
        }
      }

      // Insertar gastos
      if (order.expenses && order.expenses.length > 0) {
        const expensesPayload = order.expenses.map((exp) => {
          const expRow: any = {
            purchase_order_id: assignedOrderId,
            concept: exp.concept,
            amount_usd: exp.amountUsd,
            amount_nio: exp.amountNio,
            notes: exp.notes,
          };
          if (isValidUuid(exp.id)) expRow.id = exp.id;
          return expRow;
        });

        await supabase!.from('import_expenses').insert(expensesPayload);
      }

      return assignedOrderId;
    } catch (e) {
      console.warn('Excepción insertando orden de compra en Supabase:', e);
      return null;
    }
  }

  public static async insertImportExpense(orderId: string, expense: ImportExpense): Promise<boolean> {
    if (!this.isConnected() || !isValidUuid(orderId)) return false;
    try {
      const payload: any = {
        purchase_order_id: orderId,
        concept: expense.concept,
        amount_usd: expense.amountUsd,
        amount_nio: expense.amountNio,
        notes: expense.notes,
      };
      if (isValidUuid(expense.id)) payload.id = expense.id;

      const { error } = await supabase!.from('import_expenses').insert(payload);
      return !error;
    } catch (e) {
      console.warn('Excepción insertando gasto de importación en Supabase:', e);
      return false;
    }
  }

  public static async updateOrderReception(
    orderId: string,
    receivedItems: { skuId: string; quantityReceived: number; status: string }[],
    dateReceivedNicaragua?: string
  ): Promise<boolean> {
    if (!this.isConnected() || !isValidUuid(orderId)) return false;
    try {
      // Actualizar estado general de la orden
      await supabase!
        .from('purchase_orders')
        .update({
          status: 'recibido_completo',
          date_received_nicaragua: dateReceivedNicaragua || new Date().toISOString().split('T')[0],
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId);

      // Actualizar cada ítem de la orden
      for (const it of receivedItems) {
        if (isValidUuid(it.skuId)) {
          await supabase!
            .from('purchase_items')
            .update({
              quantity_received: it.quantityReceived,
              reception_status: it.status,
            })
            .eq('purchase_order_id', orderId)
            .eq('sku_id', it.skuId);
        }
      }

      return true;
    } catch (e) {
      console.warn('Excepción actualizando recepción en Supabase:', e);
      return false;
    }
  }

  // =========================================================================
  // 4. FACTURAS Y ABONOS
  // =========================================================================
  public static async fetchInvoices(): Promise<SalesInvoice[] | null> {
    if (!this.isConnected()) return null;
    try {
      const baseSelect = `
          *,
          customers (*),
          sales_invoice_items (*),
          invoice_payments (*)`;
      let { data, error } = await supabase!
        .from('sales_invoices')
        .select(`${baseSelect}, credit_notes (*, credit_note_items (*))`)
        .order('created_at', { ascending: false });

      // Si la migración de Fase 2 aún no está aplicada no existe credit_notes: leer sin ella
      if (error && /credit_notes|relationship/i.test(error.message)) {
        ({ data, error } = await supabase!
          .from('sales_invoices')
          .select(baseSelect)
          .order('created_at', { ascending: false }));
      }

      if (error) {
        console.warn('Error al obtener facturas de Supabase:', error.message);
        return null;
      }

      return (data || []).map((row) => mapInvoiceRow(row));
    } catch (e) {
      console.warn('Excepción obteniendo facturas de Supabase:', e);
      return null;
    }
  }

  public static async insertSalesInvoice(invoice: SalesInvoice): Promise<string | null> {
    if (!this.isConnected()) return null;
    try {
      // Si el customerId no es UUID, creamos o verificamos cliente en Supabase
      let validCustomerId = invoice.customerId;
      if (!isValidUuid(validCustomerId)) {
        const { data: custData } = await supabase!
          .from('customers')
          .insert({
            full_name: invoice.customerName || 'Cliente General',
            identification_number: invoice.customerIdentification,
            phone_whatsapp: invoice.customerPhone,
            address: invoice.customerAddress,
            city: 'Managua',
          })
          .select('id')
          .single();

        if (custData) {
          validCustomerId = custData.id;
        }
      }

      if (!isValidUuid(validCustomerId)) {
        console.warn('No se puede crear factura sin un customer_id UUID válido en Supabase.');
        return null;
      }

      const invPayload: any = {
        invoice_number: invoice.invoiceNumber,
        customer_id: validCustomerId,
        sale_type: invoice.saleType,
        payment_term: invoice.paymentTerm,
        status: invoice.status,
        delivery_status: invoice.deliveryStatus || 'entregado',
        delivery_date: invoice.deliveryDate,
        tracking_ref: invoice.trackingRef,
        issue_date: invoice.issueDate || new Date().toISOString().split('T')[0],
        due_date: invoice.dueDate,
        subtotal_sin_iva_nio: invoice.subtotalSinIvaNio,
        subtotal_nio: invoice.subtotalSinIvaNio,
        discount_nio: invoice.discountNio || 0,
        iva_rate: invoice.ivaRate ?? 0,
        iva_total_nio: invoice.ivaTotalNio,
        total_con_iva_nio: invoice.totalConIvaNio,
        total_nio: invoice.totalNio,
        amount_paid_nio: invoice.amountPaidNio || 0,
        balance_due_nio: invoice.balanceDueNio || 0,
        notes: invoice.notes,
      };
      if (isValidUuid(invoice.id)) invPayload.id = invoice.id;

      const { data: invData, error: invErr } = await supabase!
        .from('sales_invoices')
        .insert(invPayload)
        .select('id')
        .single();

      if (invErr || !invData) {
        console.warn('Error al insertar factura en Supabase:', invErr?.message);
        return null;
      }

      const assignedInvId = invData.id;

      // Insertar líneas de factura
      if (invoice.items && invoice.items.length > 0) {
        const itemsPayload = invoice.items
          .filter((it) => isValidUuid(it.skuId))
          .map((it) => {
            const itemRow: any = {
              invoice_id: assignedInvId,
              sku_id: it.skuId,
              quantity: it.quantity,
              regular_price_sin_iva_nio: it.regularPriceSinIvaNio,
              unit_price_sin_iva_nio: it.unitPriceSinIvaNio,
              promo_price_sin_iva_nio: it.promoPriceSinIvaNio,
              unit_price_nio: it.unitPriceNio,
              iva_amount_nio: it.ivaAmountNio,
              unit_cost_nio: it.unitCostNio || 0,
              discount_nio: it.discountNio || 0,
              line_total_sin_iva_nio: it.lineTotalSinIvaNio,
              line_total_con_iva_nio: it.lineTotalConIvaNio,
              line_total_nio: it.lineTotalNio,
            };
            if (isValidUuid(it.id)) itemRow.id = it.id;
            return itemRow;
          });

        if (itemsPayload.length > 0) {
          await supabase!.from('sales_invoice_items').insert(itemsPayload);
        }
      }

      // Insertar abonos iniciales si existen
      if (invoice.payments && invoice.payments.length > 0) {
        const paymentsPayload = invoice.payments.map((p) => {
          const payRow: any = {
            invoice_id: assignedInvId,
            payment_date: p.paymentDate || new Date().toISOString(),
            amount_nio: p.amountNio,
            amount_usd: p.amountUsd || 0,
            payment_method: p.paymentMethod,
            receipt_number: p.receiptNumber,
            reference_number: p.referenceNumber,
            notes: p.notes,
          };
          if (isValidUuid(p.id)) payRow.id = p.id;
          return payRow;
        });

        await supabase!.from('invoice_payments').insert(paymentsPayload);
      }

      return assignedInvId;
    } catch (e) {
      console.warn('Excepción insertando factura en Supabase:', e);
      return null;
    }
  }

  public static async updateInvoiceDeliveryStatus(
    invoiceId: string,
    deliveryStatus: string,
    deliveryDate?: string,
    notes?: string
  ): Promise<boolean> {
    if (!this.isConnected() || !isValidUuid(invoiceId)) return false;
    try {
      const updateData: any = {
        delivery_status: deliveryStatus,
        updated_at: new Date().toISOString(),
      };
      if (deliveryDate) updateData.delivery_date = deliveryDate;
      if (notes) updateData.notes = notes;

      const { error } = await supabase!
        .from('sales_invoices')
        .update(updateData)
        .eq('id', invoiceId);

      return !error;
    } catch (e) {
      console.warn('Excepción actualizando estado de entrega en Supabase:', e);
      return false;
    }
  }

  public static async insertPayment(payment: InvoicePayment): Promise<boolean> {
    if (!this.isConnected() || !isValidUuid(payment.invoiceId)) return false;
    try {
      const payload: any = {
        invoice_id: payment.invoiceId,
        payment_date: payment.paymentDate || new Date().toISOString(),
        amount_nio: payment.amountNio,
        amount_usd: payment.amountUsd || 0,
        payment_method: payment.paymentMethod,
        receipt_number: payment.receiptNumber,
        reference_number: payment.referenceNumber,
        notes: payment.notes,
      };
      if (isValidUuid(payment.id)) payload.id = payment.id;

      const { error } = await supabase!.from('invoice_payments').insert(payload);
      return !error;
    } catch (e) {
      console.warn('Excepción insertando abono en Supabase:', e);
      return false;
    }
  }

  // =========================================================================
  // 5. INVENTARIO FÍSICO
  // =========================================================================
  public static async fetchStock(): Promise<{ sku_id: string; quantity_available: number; quantity_reserved: number }[] | null> {
    if (!this.isConnected()) return null;
    try {
      const { data, error } = await supabase!
        .from('inventory_stock')
        .select('*');

      if (error) {
        console.warn('Error al obtener inventario de Supabase:', error.message);
        return null;
      }
      return (data || []).map((row) => ({
        sku_id: row.sku_id,
        quantity_available: Number(row.quantity_available || 0),
        quantity_reserved: Number(row.quantity_reserved || 0),
      }));
    } catch (e) {
      console.warn('Excepción obteniendo inventario de Supabase:', e);
      return null;
    }
  }

  public static async updateStock(skuId: string, quantityAvailable: number, quantityReserved: number = 0): Promise<boolean> {
    if (!this.isConnected() || !isValidUuid(skuId)) return false;
    try {
      const { error } = await supabase!
        .from('inventory_stock')
        .upsert({
          sku_id: skuId,
          quantity_available: quantityAvailable,
          quantity_reserved: quantityReserved,
          updated_at: new Date().toISOString(),
        });

      return !error;
    } catch (e) {
      console.warn('Excepción actualizando inventario en Supabase:', e);
      return false;
    }
  }

  // =========================================================================
  // 5b. KARDEX (MOVIMIENTOS DE INVENTARIO) — tabla inventory_movements
  // =========================================================================
  public static async insertMovements(movements: KardexMovement[]): Promise<boolean> {
    if (!this.isConnected() || movements.length === 0) return false;
    try {
      const payload = movements
        .filter((m) => isValidUuid(m.skuId))
        .map((m) => ({
          id: isValidUuid(m.id) ? m.id : undefined,
          sku_id: m.skuId,
          movement_type: m.movementType,
          quantity: m.quantity,
          previous_stock: m.previousStock,
          new_stock: m.newStock,
          reference_id: isValidUuid(m.referenceId) ? m.referenceId : null,
          notes: m.notes,
          created_at: m.createdAt,
        }));
      if (payload.length === 0) return false;

      const { error } = await supabase!.from('inventory_movements').insert(payload);
      if (!error) return true;

      // Si el lote falla (p. ej. un SKU que no existe en la nube), reintentar uno por uno
      // para no perder los movimientos válidos.
      if (payload.length > 1) {
        let allOk = true;
        for (const row of payload) {
          const { error: rowError } = await supabase!.from('inventory_movements').insert(row);
          if (rowError && rowError.code !== '23505') {
            // 23505 = ya existe (subido antes): se ignora
            allOk = false;
            console.warn(`Movimiento de kardex ${row.id} no guardado en Supabase:`, rowError.message);
          }
        }
        return allOk;
      }
      if (error.code === '23505') return true;
      console.warn('Error al guardar movimientos de kardex en Supabase:', error.message);
      return false;
    } catch (e) {
      console.warn('Excepción guardando kardex en Supabase:', e);
      return false;
    }
  }

  /** Devuelve null si hubo error (para no borrar el kardex local por una falla de red) */
  public static async fetchMovements(limit: number = 5000): Promise<KardexMovement[] | null> {
    if (!this.isConnected()) return null;
    try {
      const { data, error } = await supabase!
        .from('inventory_movements')
        .select('*, product_skus (sku_code, products (name))')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.warn('Error al obtener kardex de Supabase:', error.message);
        return null;
      }
      return (data || []).map(mapMovementRow);
    } catch (e) {
      console.warn('Excepción obteniendo kardex de Supabase:', e);
      return null;
    }
  }

  // =========================================================================
  // 6. CLIENTES
  // =========================================================================
  public static async fetchCustomers(): Promise<Customer[] | null> {
    if (!this.isConnected()) return null;
    try {
      const { data, error } = await supabase!
        .from('customers')
        .select('*')
        .order('full_name', { ascending: true });

      if (error) {
        console.warn('Error al obtener clientes de Supabase:', error.message);
        return null;
      }

      return (data || []).map((row) => ({
        id: row.id,
        fullName: row.full_name,
        identificationNumber: row.identification_number,
        phoneWhatsapp: row.phone_whatsapp,
        address: row.address,
        city: row.city || 'Managua',
        notes: row.notes,
        createdAt: row.created_at,
      }));
    } catch (e) {
      console.warn('Excepción obteniendo clientes de Supabase:', e);
      return null;
    }
  }

  public static async insertCustomer(customer: Customer): Promise<string | null> {
    if (!this.isConnected()) return null;
    try {
      const payload: any = {
        full_name: customer.fullName,
        identification_number: customer.identificationNumber,
        phone_whatsapp: customer.phoneWhatsapp,
        address: customer.address,
        city: customer.city || 'Managua',
        notes: customer.notes,
      };
      if (isValidUuid(customer.id)) payload.id = customer.id;

      const { data, error } = await supabase!
        .from('customers')
        .insert(payload)
        .select('id')
        .single();

      if (error) {
        console.warn('Error al insertar cliente en Supabase:', error.message);
        return null;
      }
      return data?.id || null;
    } catch (e) {
      console.warn('Excepción insertando cliente en Supabase:', e);
      return null;
    }
  }

  // =========================================================================
  // 7. TASA DE CAMBIO
  // =========================================================================
  public static async fetchExchangeRate(): Promise<number | null> {
    if (!this.isConnected()) return null;
    try {
      const { data, error } = await supabase!
        .from('currency_rates')
        .select('rate_usd_to_nio')
        .eq('is_active', true)
        .order('effective_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) return null;
      return Number(data.rate_usd_to_nio);
    } catch {
      return null;
    }
  }

  public static async saveExchangeRate(rate: number): Promise<boolean> {
    if (!this.isConnected()) return false;
    try {
      const { error } = await supabase!
        .from('currency_rates')
        .insert({
          rate_usd_to_nio: rate,
          is_active: true,
          effective_date: new Date().toISOString(),
        });
      return !error;
    } catch {
      return false;
    }
  }
}

// =============================================================================
// MAPEOS FILA (BASE) → DOMINIO
// Se usan tanto en las lecturas como al aplicar las respuestas de las funciones erp_*.
// =============================================================================

/** Factura desde una fila de sales_invoices (con relaciones embebidas o el JSON de erp_factura_json) */
export function mapInvoiceRow(row: any): SalesInvoice {
  const subtotalSinIva = Number(row.subtotal_sin_iva_nio || row.subtotal_nio || 0);
  // Usar ?? (no ||): una tasa 0 (régimen de cuota fija) es un valor válido y no debe convertirse en 15%
  const ivaRate = Number(row.iva_rate ?? 0);
  const ivaTotal = Number(row.iva_total_nio ?? (subtotalSinIva * ivaRate));
  const totalConIva = Number(row.total_con_iva_nio || row.total_nio || (subtotalSinIva + ivaTotal));
  const itemRows: any[] = row.sales_invoice_items || row.items || [];
  const paymentRows: any[] = row.invoice_payments || row.payments || [];
  const creditRows: any[] = row.credit_notes || [];

  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    customerId: row.customer_id,
    customerName: row.customers?.full_name,
    customerPhone: row.customers?.phone_whatsapp,
    customerIdentification: row.customers?.identification_number,
    customerAddress: row.customers?.address,
    saleType: row.sale_type,
    paymentTerm: row.payment_term,
    status: row.status,
    deliveryStatus: row.delivery_status || 'entregado',
    deliveryDate: row.delivery_date || undefined,
    trackingRef: row.tracking_ref || undefined,
    issueDate: row.issue_date,
    dueDate: row.due_date || undefined,
    subtotalSinIvaNio: subtotalSinIva,
    subtotalNio: subtotalSinIva,
    discountNio: Number(row.discount_nio || 0),
    ivaRate,
    ivaTotalNio: ivaTotal,
    totalConIvaNio: totalConIva,
    totalNio: totalConIva,
    amountPaidNio: Number(row.amount_paid_nio || 0),
    balanceDueNio: Number(row.balance_due_nio || 0),
    creditedNio: Number(row.credited_nio || 0),
    exchangeRate: row.exchange_rate != null ? Number(row.exchange_rate) : undefined,
    dispatchedAt: row.dispatched_at || undefined,
    voidedAt: row.voided_at || undefined,
    voidReason: row.void_reason || undefined,
    notes: row.notes || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: itemRows.map((it: any) => {
      const unitSinIva = Number(it.unit_price_sin_iva_nio || it.unit_price_nio || 0);
      const regularSinIva = Number(it.regular_price_sin_iva_nio || unitSinIva);
      const discount = Number(it.discount_nio || 0);
      const lineSinIva = Number(it.line_total_sin_iva_nio || ((unitSinIva * it.quantity) - discount));
      const lineConIva = Number(it.line_total_con_iva_nio || it.line_total_nio || (lineSinIva * (1 + ivaRate)));
      return {
        id: it.id,
        invoiceId: it.invoice_id,
        skuId: it.sku_id,
        quantity: Number(it.quantity),
        regularPriceSinIvaNio: regularSinIva,
        promoPriceSinIvaNio: it.promo_price_sin_iva_nio ? Number(it.promo_price_sin_iva_nio) : undefined,
        unitPriceSinIvaNio: unitSinIva,
        unitPriceNio: unitSinIva,
        ivaAmountNio: Number(it.iva_amount_nio ?? (lineSinIva * ivaRate)),
        unitCostNio: Number(it.unit_cost_nio || 0),
        discountNio: discount,
        lineTotalSinIvaNio: lineSinIva,
        lineTotalConIvaNio: lineConIva,
        lineTotalNio: lineConIva,
        itemType: it.item_type || undefined,
      };
    }),
    payments: paymentRows.map((p: any) => ({
      id: p.id,
      invoiceId: p.invoice_id,
      paymentDate: p.payment_date,
      amountNio: Number(p.amount_nio || 0),
      amountUsd: Number(p.amount_usd || 0),
      exchangeRateApplied: p.exchange_rate_applied != null ? Number(p.exchange_rate_applied) : undefined,
      paymentMethod: p.payment_method,
      receiptNumber: p.receipt_number,
      referenceNumber: p.reference_number || undefined,
      notes: p.notes || undefined,
      createdAt: p.created_at,
    })),
    creditNotes: creditRows.map((c: any) => ({
      id: c.id,
      creditNoteNumber: c.credit_note_number,
      invoiceId: c.invoice_id,
      amountNio: Number(c.amount_nio || 0),
      reason: c.reason,
      restock: c.restock !== false,
      items: (c.credit_note_items || []).map((ci: any) => ({
        skuId: ci.sku_id,
        quantity: Number(ci.quantity),
        amountNio: Number(ci.amount_nio || 0),
      })),
      createdAt: c.created_at,
    })),
  };
}

/** Orden de compra desde una fila de purchase_orders y sus ítems/gastos */
export function mapPurchaseOrderRow(row: any, itemRows?: any[], expenseRows?: any[]): PurchaseOrder {
  return {
    id: row.id,
    orderNumber: row.order_number,
    supplierName: row.supplier_name,
    supplierOrderId: row.supplier_order_id || undefined,
    trackingNumber: row.tracking_number || undefined,
    supplierInvoiceId: row.supplier_invoice_id || undefined,
    modality: row.modality,
    prorationMethod: row.proration_method || 'valor',
    exchangeRate: row.exchange_rate != null ? Number(row.exchange_rate) : undefined,
    status: row.status,
    datePurchased: row.date_purchased,
    dateDeliveredToAgency: row.date_delivered_to_agency || undefined,
    dateReceivedNicaragua: row.date_received_nicaragua || undefined,
    totalCostUsd: Number(row.total_cost_usd || 0),
    totalCostNio: Number(row.total_cost_nio || 0),
    totalImportExpensesNio: Number(row.total_import_expenses_nio || 0),
    notes: row.notes || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: (itemRows || row.purchase_items || []).map(mapPurchaseItemRow),
    expenses: (expenseRows || row.import_expenses || []).map((exp: any) => ({
      id: exp.id,
      purchaseOrderId: exp.purchase_order_id,
      concept: exp.concept,
      amountUsd: Number(exp.amount_usd || 0),
      amountNio: Number(exp.amount_nio || 0),
      notes: exp.notes || undefined,
    })),
  };
}

export function mapPurchaseItemRow(it: any): PurchaseOrder['items'][number] {
  return {
    id: it.id,
    purchaseOrderId: it.purchase_order_id,
    skuId: it.sku_id,
    skuCode: it.sku_code,
    productName: it.product_name,
    quantityOrdered: Number(it.quantity_ordered),
    quantityReceived: Number(it.quantity_received || 0),
    weightLbs: it.weight_lbs != null ? Number(it.weight_lbs) : undefined,
    unitCostUsd: Number(it.unit_cost_usd || 0),
    unitCostNio: Number(it.unit_cost_nio || 0),
    proratedExpenseNio: Number(it.prorated_expense_nio || 0),
    totalLandedCostNio: Number(it.total_landed_cost_nio || 0),
    suggestedSalePriceNio: Number(it.suggested_sale_price_nio || 0),
    receptionStatus: it.reception_status,
    modality: it.modality || undefined,
    orderRef: it.order_ref || undefined,
  };
}

/** Movimiento de kardex desde una fila de inventory_movements */
export function mapMovementRow(row: any): KardexMovement {
  return {
    id: row.id,
    skuId: row.sku_id,
    skuCode: row.product_skus?.sku_code,
    productName: row.product_skus?.products?.name,
    movementType: row.movement_type,
    quantity: Number(row.quantity),
    previousStock: Number(row.previous_stock),
    newStock: Number(row.new_stock),
    referenceId: row.reference_id || undefined,
    notes: row.notes || undefined,
    createdAt: row.created_at,
    createdBy: row.created_by || undefined,
  };
}
