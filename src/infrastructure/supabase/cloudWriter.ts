import { supabase } from './client';
import { isValidUuid } from './supabaseSyncService';
import { Category, Product, ProductSku } from '@/domain/catalog/types';
import { Customer } from '@/domain/sales/types';
import { PurchaseOrder } from '@/domain/procurement/types';
import { KardexMovement } from '@/domain/inventory/types';

/**
 * Escrituras hacia Supabase usadas por la cola de sincronización.
 *
 * A diferencia de SupabaseService (que registra el error y devuelve false/null),
 * estas funciones LANZAN un CloudError clasificado, para que la cola sepa si debe
 * reintentar (sin conexión / sesión vencida) o marcar el cambio como rechazado
 * (la base lo rechazó por una regla de negocio o de datos).
 *
 * Todas son idempotentes: si se reintentan con los mismos ids no duplican datos.
 */

export type CloudErrorKind = 'network' | 'auth' | 'business';

export class CloudError extends Error {
  constructor(public kind: CloudErrorKind, message: string, public code?: string) {
    super(message);
    this.name = 'CloudError';
  }
}

/** Clasifica un error de Supabase/PostgREST o de red */
export function classifyError(err: unknown): CloudError {
  if (err instanceof CloudError) return err;
  const anyErr = err as { message?: string; code?: string; status?: number; details?: string; hint?: string };
  const message = anyErr?.message || String(err);
  const code = anyErr?.code;

  if (/failed to fetch|networkerror|network request failed|fetch failed|load failed|timeout|ECONN|ENOTFOUND/i.test(message)) {
    return new CloudError('network', 'Sin conexión con la nube.', code);
  }
  if (code === 'PGRST301' || code === 'PGRST302' || /jwt|not authenticated|invalid claim/i.test(message)) {
    return new CloudError('auth', 'La sesión venció. Inicie sesión de nuevo.', code);
  }
  // 42501 = sin permiso (RLS): con sesión válida es un rechazo real, no un problema de red
  // P0001 = RAISE EXCEPTION de las funciones erp_* (mensaje de negocio en español)
  // PGRST202 = función inexistente (falta aplicar la migración de Fase 2)
  // PGRST204 = columna inexistente (falta aplicar la migración de descripción HTML)
  if (code === 'PGRST204' && /description_html/i.test(message)) {
    return new CloudError('business', 'La base de datos no tiene la columna de descripción HTML. Aplique la migración 20261017100000.', code);
  }
  if (code === 'PGRST202') {
    return new CloudError('business', 'La base de datos no tiene las funciones de la Fase 2. Aplique la migración 20261013090000.', code);
  }
  return new CloudError('business', cleanDbMessage(message), code);
}

/** Quita prefijos técnicos de los mensajes de las funciones erp_* (p. ej. "STOCK_INSUFICIENTE: ...") */
export function cleanDbMessage(message: string): string {
  return message.replace(/^[A-Z_]{4,}:\s*/, '');
}

function client() {
  if (!supabase) throw new CloudError('network', 'Supabase no está configurado.');
  return supabase;
}

async function run<T>(promise: PromiseLike<{ data: T; error: any }>): Promise<T> {
  let res: { data: T; error: any };
  try {
    res = await promise;
  } catch (e) {
    throw classifyError(e);
  }
  if (res.error) throw classifyError(res.error);
  return res.data;
}

// ---------------------------------------------------------------------------
// Funciones transaccionales (RPC erp_*)
// ---------------------------------------------------------------------------
export async function callRpc<T = any>(fn: string, params: Record<string, unknown>): Promise<T> {
  return run<T>(client().rpc(fn, params) as any);
}

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------
function categoryRow(cat: Category) {
  return {
    id: cat.id,
    name: cat.name,
    slug: cat.slug,
    parent_id: isValidUuid(cat.parentId) ? cat.parentId : null,
    description: cat.description ?? null,
    image_url: cat.imageUrl ?? null,
    is_active: cat.isActive ?? true,
    display_order: cat.displayOrder ?? 0,
    updated_at: new Date().toISOString(),
  };
}

export async function upsertCategory(cat: Category): Promise<void> {
  await run(client().from('categories').upsert(categoryRow(cat), { onConflict: 'id' }) as any);
}

export async function deleteCategory(id: string): Promise<void> {
  await run(client().from('categories').delete().eq('id', id) as any);
}

function productRow(product: Product) {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    product_code: product.productCode || null,
    category_id: isValidUuid(product.categoryId) ? product.categoryId : null,
    subcategory_id: isValidUuid(product.subcategoryId) ? product.subcategoryId : null,
    description: product.description ?? null,
    seo_description: product.seoDescription ?? null,
    description_html: product.descriptionHtml || null,
    product_type: product.productType,
    is_featured: product.isFeatured ?? false,
    is_active: product.isActive ?? true,
    ...(product.createdAt ? { created_at: product.createdAt } : {}),
    updated_at: new Date().toISOString(),
  };
}

function skuRow(sku: ProductSku) {
  return {
    id: sku.id,
    product_id: sku.productId,
    sku_code: sku.skuCode,
    sku_description: sku.skuDescription ?? null,
    sku_type: sku.skuType || 'simple',
    description_html: sku.descriptionHtml || null,
    size: sku.size ?? null,
    color_name: sku.colorName ?? null,
    color_hex: sku.colorHex ?? null,
    cost_price_nio: sku.costPriceNio ?? 0,
    cost_price_usd: sku.costPriceUsd ?? 0,
    sale_price_nio: sku.salePriceNio ?? 0,
    promo_price_nio: sku.promoPriceNio ?? null,
    main_image_url: sku.mainImageUrl ?? null,
    is_active: sku.isActive ?? true,
    ...(sku.createdAt ? { created_at: sku.createdAt } : {}),
    updated_at: new Date().toISOString(),
  };
}

function isMissingSkuTypeColumn(e: unknown): boolean {
  const err = e as CloudError;
  return err?.code === 'PGRST204' && /sku_type/i.test(err.message || '');
}

function stripSkuType<T extends Record<string, any>>(row: T): Omit<T, 'sku_type'> {
  const { sku_type: _ignored, ...rest } = row;
  return rest;
}

/** Siguiente código PRD- según el más alto que ya existe en la nube */
async function nextProductCodeFromCloud(): Promise<string> {
  const rows = await run<{ product_code: string }[]>(
    client().from('products').select('product_code').like('product_code', 'PRD-%').order('product_code', { ascending: false }).limit(1) as any
  );
  const max = parseInt((rows?.[0]?.product_code || 'PRD-0').replace(/\D/g, ''), 10) || 0;
  return `PRD-${String(max + 1).padStart(5, '0')}`;
}

/** Siguiente código SKU- según el más alto que ya existe en la nube */
async function nextSkuCodeFromCloud(): Promise<string> {
  const rows = await run<{ sku_code: string }[]>(
    client().from('product_skus').select('sku_code').like('sku_code', 'SKU-%').order('sku_code', { ascending: false }).limit(50) as any
  );
  let max = 0;
  (rows || []).forEach((r) => {
    const m = /^SKU-(\d{5,})$/.exec(r.sku_code || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return `SKU-${String(max + 1).padStart(5, '0')}`;
}

function isCodeConflict(e: unknown, column: 'product_code' | 'sku_code'): boolean {
  const err = e as CloudError;
  return err?.code === '23505' && new RegExp(column, 'i').test(err.message || '');
}

/**
 * Guarda una variante. Si el código SKU- generado en este equipo ya lo usó otro equipo,
 * se asigna el siguiente libre de la nube y se devuelve para actualizar la variante local.
 */
async function upsertSkuRowSafe(row: ReturnType<typeof skuRow>): Promise<string> {
  let current: Record<string, any> = row;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await run(client().from('product_skus').upsert(current, { onConflict: 'id' }) as any);
      return current.sku_code;
    } catch (e) {
      if (isMissingSkuTypeColumn(e) && 'sku_type' in current) {
        current = stripSkuType(current);
        continue;
      }
      if (!isCodeConflict(e, 'sku_code')) throw e;
      current = { ...current, sku_code: await nextSkuCodeFromCloud() };
    }
  }
  throw new CloudError('business', `No se pudo asignar un código SKU libre a la variante ${row.id}.`);
}

/** Resultado de guardar en la nube: códigos que la nube tuvo que cambiar por choque con otro equipo */
export interface CodeReassignments {
  productCode?: string;
  /** id de la variante → código SKU definitivo (solo las que cambiaron) */
  skuCodes?: Record<string, string>;
}

/**
 * Crea o actualiza el producto. Con includeSkus también sus variantes.
 * Si el código PRD- o SKU- generado en este equipo ya lo usó otro equipo, se asigna el siguiente
 * libre y se devuelve para actualizar el producto local.
 */
export async function upsertProduct(product: Product, includeSkus: boolean = true): Promise<CodeReassignments> {
  let row = productRow(product);
  try {
    await run(client().from('products').upsert(row, { onConflict: 'id' }) as any);
  } catch (e) {
    if (!isCodeConflict(e, 'product_code')) throw e;
    row = { ...row, product_code: await nextProductCodeFromCloud() };
    await run(client().from('products').upsert(row, { onConflict: 'id' }) as any);
  }
  const result: CodeReassignments = { productCode: row.product_code || undefined };

  if (includeSkus && product.skus?.length) {
    const rows = product.skus.filter((s) => isValidUuid(s.id)).map((s) => skuRow({ ...s, productId: product.id }));
    if (rows.length) {
      try {
        await run(client().from('product_skus').upsert(rows, { onConflict: 'id' }) as any);
      } catch (e) {
        if (isMissingSkuTypeColumn(e)) {
          const strippedRows = rows.map(stripSkuType);
          await run(client().from('product_skus').upsert(strippedRows, { onConflict: 'id' }) as any);
          return result;
        }
        if (!isCodeConflict(e, 'sku_code')) throw e;
        // Algún código SKU chocó con el de otro equipo: guardar una por una, reasignando los repetidos
        const changed: Record<string, string> = {};
        for (const r of rows) {
          const finalCode = await upsertSkuRowSafe(r);
          if (finalCode !== r.sku_code) changed[r.id] = finalCode;
        }
        if (Object.keys(changed).length) result.skuCodes = changed;
      }
    }
  }
  return result;
}

export async function deleteProduct(id: string): Promise<void> {
  await run(client().from('products').delete().eq('id', id) as any);
}

export async function upsertSku(sku: ProductSku): Promise<CodeReassignments> {
  const row = skuRow(sku);
  const finalCode = await upsertSkuRowSafe(row);

  // Sincronizar receta de paquete en sku_bundle_items si corresponde
  if (isValidUuid(sku.id)) {
    try {
      await run(client().from('sku_bundle_items').delete().eq('bundle_sku_id', sku.id) as any);
      if (sku.skuType === 'paquete' && sku.bundleItems && sku.bundleItems.length > 0) {
        const rowsToInsert = sku.bundleItems
          .filter((bi) => isValidUuid(bi.unitSkuId) && bi.quantityPerPack > 0)
          .map((bi) => ({
            bundle_sku_id: sku.id,
            unit_sku_id: bi.unitSkuId,
            quantity_per_pack: Math.max(1, Number(bi.quantityPerPack) || 1),
          }));
        if (rowsToInsert.length > 0) {
          await run(client().from('sku_bundle_items').insert(rowsToInsert) as any);
        }
      }
    } catch (e) {
      console.warn('Advertencia actualizando sku_bundle_items en Supabase:', e);
    }
  }

  return finalCode !== row.sku_code ? { skuCodes: { [row.id]: finalCode } } : {};
}

export async function deleteSku(id: string): Promise<void> {
  await run(client().from('product_skus').delete().eq('id', id) as any);
}

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------
export async function upsertCustomer(customer: Customer): Promise<void> {
  await run(
    client()
      .from('customers')
      .upsert(
        {
          id: customer.id,
          full_name: customer.fullName,
          identification_number: customer.identificationNumber ?? null,
          phone_whatsapp: customer.phoneWhatsapp ?? null,
          address: customer.address ?? null,
          city: customer.city || 'Managua',
          notes: customer.notes ?? null,
        },
        { onConflict: 'id' }
      ) as any
  );
}

/**
 * Garantiza que el cliente exista en la nube SIN pisar los datos que ya tenga allá.
 * Se llama antes de registrar una venta: si el cliente se creó en este equipo y su alta
 * nunca subió (o fue rechazada), la venta fallaría con CLIENTE_NO_EXISTE.
 */
export async function ensureCustomer(customer: Customer): Promise<void> {
  await run(
    client()
      .from('customers')
      .upsert(
        {
          id: customer.id,
          full_name: customer.fullName,
          identification_number: customer.identificationNumber ?? null,
          phone_whatsapp: customer.phoneWhatsapp ?? null,
          address: customer.address ?? null,
          city: customer.city || 'Managua',
          notes: customer.notes ?? null,
        },
        { onConflict: 'id', ignoreDuplicates: true }
      ) as any
  );
}

// ---------------------------------------------------------------------------
// Compras (la creación de la orden; recepciones y gastos van por RPC)
// ---------------------------------------------------------------------------
export async function upsertPurchaseOrder(order: PurchaseOrder): Promise<void> {
  await run(
    client()
      .from('purchase_orders')
      .upsert(
        {
          id: order.id,
          order_number: order.orderNumber,
          supplier_name: order.supplierName,
          supplier_order_id: order.supplierOrderId ?? null,
          tracking_number: order.trackingNumber ?? null,
          supplier_invoice_id: order.supplierInvoiceId ?? null,
          modality: order.modality,
          status: order.status,
          proration_method: order.prorationMethod || 'valor',
          exchange_rate: order.exchangeRate ?? null,
          date_purchased: order.datePurchased,
          total_cost_usd: order.totalCostUsd,
          total_cost_nio: order.totalCostNio,
          total_import_expenses_nio: order.totalImportExpensesNio,
          notes: order.notes ?? null,
        },
        { onConflict: 'id' }
      ) as any
  );

  const items = (order.items || [])
    .filter((it) => isValidUuid(it.id) && isValidUuid(it.skuId))
    .map((it) => ({
      id: it.id,
      purchase_order_id: order.id,
      sku_id: it.skuId,
      quantity_ordered: it.quantityOrdered,
      quantity_received: it.quantityReceived || 0,
      weight_lbs: it.weightLbs ?? 0,
      unit_cost_usd: it.unitCostUsd,
      unit_cost_nio: it.unitCostNio,
      prorated_expense_nio: it.proratedExpenseNio,
      total_landed_cost_nio: it.totalLandedCostNio,
      suggested_sale_price_nio: it.suggestedSalePriceNio,
      reception_status: it.receptionStatus || 'pendiente',
    }));
  if (items.length) {
    await run(client().from('purchase_items').upsert(items, { onConflict: 'id' }) as any);
    const keepItemIds = items.map((it) => it.id);
    await run(
      client()
        .from('purchase_items')
        .delete()
        .eq('purchase_order_id', order.id)
        .not('id', 'in', `(${keepItemIds.join(',')})`) as any
    );
  } else {
    await run(client().from('purchase_items').delete().eq('purchase_order_id', order.id) as any);
  }

  const expenses = (order.expenses || [])
    .filter((exp) => isValidUuid(exp.id))
    .map((exp) => ({
      id: exp.id,
      purchase_order_id: order.id,
      concept: exp.concept,
      amount_usd: exp.amountUsd,
      amount_nio: exp.amountNio,
      notes: exp.notes ?? null,
    }));
  if (expenses.length) {
    await run(client().from('import_expenses').upsert(expenses, { onConflict: 'id' }) as any);
    const keepExpIds = expenses.map((exp) => exp.id);
    await run(
      client()
        .from('import_expenses')
        .delete()
        .eq('purchase_order_id', order.id)
        .not('id', 'in', `(${keepExpIds.join(',')})`) as any
    );
  } else {
    await run(client().from('import_expenses').delete().eq('purchase_order_id', order.id) as any);
  }
}

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------
export async function saveExchangeRate(rate: number): Promise<void> {
  await run(
    client().from('currency_rates').insert({
      rate_usd_to_nio: rate,
      is_active: true,
      effective_date: new Date().toISOString(),
    }) as any
  );
}

// ---------------------------------------------------------------------------
// Kardex heredado (movimientos locales anteriores a la Fase 2)
// ---------------------------------------------------------------------------
export async function backfillMovements(movements: KardexMovement[]): Promise<void> {
  const rows = movements
    .filter((m) => isValidUuid(m.id) && isValidUuid(m.skuId))
    .map((m) => ({
      id: m.id,
      sku_id: m.skuId,
      movement_type: m.movementType,
      quantity: m.quantity,
      previous_stock: m.previousStock,
      new_stock: m.newStock,
      reference_id: isValidUuid(m.referenceId) ? m.referenceId : null,
      notes: m.notes ?? null,
      created_at: m.createdAt,
    }));
  if (rows.length === 0) return;
  try {
    await run(client().from('inventory_movements').upsert(rows, { onConflict: 'id', ignoreDuplicates: true }) as any);
  } catch (e) {
    if ((e as CloudError).kind !== 'business' || rows.length === 1) throw e;
    // Mejor esfuerzo: subir uno por uno y omitir los que la base rechace
    // (p. ej. movimientos de un SKU que nunca llegó a la nube)
    for (const row of rows) {
      try {
        await run(client().from('inventory_movements').upsert(row, { onConflict: 'id', ignoreDuplicates: true }) as any);
      } catch (rowErr) {
        if ((rowErr as CloudError).kind !== 'business') throw rowErr;
        console.warn(`Movimiento de kardex ${row.id} omitido:`, (rowErr as Error).message);
      }
    }
  }
}
