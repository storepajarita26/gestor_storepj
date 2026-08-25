import { supabase, isSupabaseConfigured } from './client';
import { Product, ProductSku, Category } from '@/domain/catalog/types';
import { PurchaseOrder } from '@/domain/procurement/types';
import { StockLevel, KardexMovement } from '@/domain/inventory/types';
import { SalesInvoice, Customer } from '@/domain/sales/types';

export class SupabaseService {
  public static isConnected(): boolean {
    return isSupabaseConfigured && supabase !== null;
  }

  // --- PRODUCTOS Y CATÁLOGO ---
  public static async fetchCategories(): Promise<Category[]> {
    if (!this.isConnected()) return [];
    const { data, error } = await supabase!
      .from('categories')
      .select('*')
      .order('display_order', { ascending: true });
    
    if (error) {
      console.error('Error fetching categories from Supabase:', error);
      return [];
    }

    return (data || []).map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      imageUrl: row.image_url,
      isActive: row.is_active,
      displayOrder: row.display_order,
    }));
  }

  public static async fetchProducts(): Promise<Product[]> {
    if (!this.isConnected()) return [];
    const { data, error } = await supabase!
      .from('products')
      .select(`
        *,
        categories (name),
        product_skus (*)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching products from Supabase:', error);
      return [];
    }

    return (data || []).map((row) => ({
      id: row.id,
      categoryId: row.category_id,
      categoryName: row.categories?.name,
      subcategoryId: row.subcategory_id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      seoDescription: row.seo_description,
      productType: row.product_type,
      isFeatured: row.is_featured,
      isActive: row.is_active,
      skus: (row.product_skus || []).map((s: any) => ({
        id: s.id,
        productId: s.product_id,
        skuCode: s.sku_code,
        skuDescription: s.sku_description,
        size: s.size,
        colorName: s.color_name,
        colorHex: s.color_hex,
        costPriceNio: Number(s.cost_price_nio),
        costPriceUsd: Number(s.cost_price_usd),
        salePriceNio: Number(s.sale_price_nio),
        promoPriceNio: s.promo_price_nio ? Number(s.promo_price_nio) : undefined,
        mainImageUrl: s.main_image_url,
        isActive: s.is_active,
      })),
    }));
  }

  public static async insertProduct(product: Omit<Product, 'id'>) {
    if (!this.isConnected()) return null;
    const { data: prodData, error: prodErr } = await supabase!
      .from('products')
      .insert({
        name: product.name,
        slug: product.slug,
        category_id: product.categoryId,
        subcategory_id: product.subcategoryId,
        description: product.description,
        seo_description: product.seoDescription,
        product_type: product.productType,
        is_featured: product.isFeatured,
        is_active: product.isActive,
      })
      .select()
      .single();

    if (prodErr || !prodData) {
      console.error('Error creating product in Supabase:', prodErr);
      return null;
    }

    if (product.skus && product.skus.length > 0) {
      const skusToInsert = product.skus.map((s) => ({
        product_id: prodData.id,
        sku_code: s.skuCode,
        sku_description: s.skuDescription,
        size: s.size,
        color_name: s.colorName,
        color_hex: s.colorHex,
        cost_price_nio: s.costPriceNio,
        cost_price_usd: s.costPriceUsd,
        sale_price_nio: s.salePriceNio,
        is_active: s.isActive,
      }));

      await supabase!.from('product_skus').insert(skusToInsert);
    }

    return prodData;
  }

  // --- ÓRDENES DE COMPRA ---
  public static async fetchPurchaseOrders(): Promise<PurchaseOrder[]> {
    if (!this.isConnected()) return [];
    const { data, error } = await supabase!
      .from('purchase_orders')
      .select(`
        *,
        purchase_items (*),
        import_expenses (*)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching purchase orders from Supabase:', error);
      return [];
    }

    return (data || []).map((row) => ({
      id: row.id,
      orderNumber: row.order_number,
      supplierName: row.supplier_name,
      supplierOrderId: row.supplier_order_id,
      trackingNumber: row.tracking_number,
      supplierInvoiceId: row.supplier_invoice_id,
      modality: row.modality,
      status: row.status,
      datePurchased: row.date_purchased,
      dateDeliveredToAgency: row.date_delivered_to_agency,
      dateReceivedNicaragua: row.date_received_nicaragua,
      totalCostUsd: Number(row.total_cost_usd),
      totalCostNio: Number(row.total_cost_nio),
      totalImportExpensesNio: Number(row.total_import_expenses_nio),
      notes: row.notes,
      items: (row.purchase_items || []).map((it: any) => ({
        id: it.id,
        purchaseOrderId: it.purchase_order_id,
        skuId: it.sku_id,
        quantityOrdered: it.quantity_ordered,
        quantityReceived: it.quantity_received,
        unitCostUsd: Number(it.unit_cost_usd),
        unitCostNio: Number(it.unit_cost_nio),
        proratedExpenseNio: Number(it.prorated_expense_nio),
        totalLandedCostNio: Number(it.total_landed_cost_nio),
        suggestedSalePriceNio: Number(it.suggested_sale_price_nio),
        receptionStatus: it.reception_status,
      })),
      expenses: (row.import_expenses || []).map((exp: any) => ({
        id: exp.id,
        purchaseOrderId: exp.purchase_order_id,
        concept: exp.concept,
        amountUsd: Number(exp.amount_usd),
        amountNio: Number(exp.amount_nio),
        notes: exp.notes,
      })),
    }));
  }

  // --- FACTURAS Y ABONOS ---
  public static async fetchInvoices(): Promise<SalesInvoice[]> {
    if (!this.isConnected()) return [];
    const { data, error } = await supabase!
      .from('sales_invoices')
      .select(`
        *,
        customers (*),
        sales_invoice_items (*),
        invoice_payments (*)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching sales invoices from Supabase:', error);
      return [];
    }

    return (data || []).map((row) => {
      const subtotalSinIva = Number(row.subtotal_sin_iva_nio || row.subtotal_nio || 0);
      const ivaRate = Number(row.iva_rate || 0.15);
      const ivaTotal = Number(row.iva_total_nio || (subtotalSinIva * ivaRate));
      const totalConIva = Number(row.total_con_iva_nio || row.total_nio || (subtotalSinIva + ivaTotal));

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
        issueDate: row.issue_date,
        dueDate: row.due_date,
        subtotalSinIvaNio: subtotalSinIva,
        subtotalNio: subtotalSinIva,
        discountNio: Number(row.discount_nio || 0),
        ivaRate,
        ivaTotalNio: ivaTotal,
        totalConIvaNio: totalConIva,
        totalNio: totalConIva,
        amountPaidNio: Number(row.amount_paid_nio || 0),
        balanceDueNio: Number(row.balance_due_nio || 0),
        notes: row.notes,
        items: (row.sales_invoice_items || []).map((it: any) => {
          const unitSinIva = Number(it.unit_price_sin_iva_nio || it.unit_price_nio || 0);
          const regularSinIva = Number(it.regular_price_sin_iva_nio || unitSinIva);
          const discount = Number(it.discount_nio || 0);
          const lineSinIva = Number(it.line_total_sin_iva_nio || ((unitSinIva * it.quantity) - discount));
          const lineConIva = Number(it.line_total_con_iva_nio || it.line_total_nio || (lineSinIva * (1 + ivaRate)));

          return {
            id: it.id,
            invoiceId: it.invoice_id,
            skuId: it.sku_id,
            quantity: it.quantity,
            regularPriceSinIvaNio: regularSinIva,
            promoPriceSinIvaNio: it.promo_price_sin_iva_nio ? Number(it.promo_price_sin_iva_nio) : undefined,
            unitPriceSinIvaNio: unitSinIva,
            unitPriceNio: unitSinIva,
            ivaAmountNio: Number(it.iva_amount_nio || (lineSinIva * ivaRate)),
            unitCostNio: Number(it.unit_cost_nio || 0),
            discountNio: discount,
            lineTotalSinIvaNio: lineSinIva,
            lineTotalConIvaNio: lineConIva,
            lineTotalNio: lineConIva,
          };
        }),
        payments: (row.invoice_payments || []).map((p: any) => ({
          id: p.id,
          invoiceId: p.invoice_id,
          paymentDate: p.payment_date,
          amountNio: Number(p.amount_nio),
          amountUsd: Number(p.amount_usd),
          paymentMethod: p.payment_method,
          receiptNumber: p.receipt_number,
          referenceNumber: p.reference_number,
          notes: p.notes,
        })),
      };
    });
  }
}
