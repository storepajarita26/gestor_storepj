import { Category, Product, ProductSku, SkuType } from '@/domain/catalog/types';
import { generateNextProductCode, generateNextSkuCode, isValidProductCode, isValidSkuCode } from '@/domain/catalog/services/catalogService';
import { PurchaseOrder, ImportExpense, PurchaseStatus, ReceptionItemStatus, PurchaseItem } from '@/domain/procurement/types';
import { StockLevel, KardexMovement, UnbundleRequest, InventoryAdjustmentInput, MovementType } from '@/domain/inventory/types';
import {
  Customer,
  SalesInvoice,
  InvoicePayment,
  CreatePaymentInput,
  DeliveryStatus,
  ReturnInput,
  CreditNote,
} from '@/domain/sales/types';
import { StoreSettings, TaxRegime } from '@/domain/shared/types';
import { prorateExpenses, generateNextOrderNumber } from '@/domain/procurement/services/prorationService';
import { executeUnbundlingCalculation } from '@/domain/inventory/services/unbundlingService';
import { calculateInvoiceBalance, DEFAULT_TAX_REGIME, getIvaRateForRegime } from '@/domain/sales/services/invoicingService';
import {
  SupabaseService,
  isValidUuid,
  mapInvoiceRow,
  mapPurchaseOrderRow,
  mapMovementRow,
} from '../supabase/supabaseSyncService';
import * as cloud from '../supabase/cloudWriter';
import { CloudError } from '../supabase/cloudWriter';
import { SyncQueue, SyncOp, SyncOutcome, SyncState } from '../sync/syncQueue';

// Validador de identificadores de datos semilla para purgar residuos
function isMockEntityId(id?: string): boolean {
  if (!id) return false;
  return /^(cat-\d+|sub-\d+|prd-0000\d|sku-0000\d|po-\d+|cust-\d+|inv-\d+|pi-\d+|exp-\d+|pay-\d+)$/.test(id);
}

// Generador de UUID v4 estándar
export function generateEntityId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const DEFAULT_STORE_SETTINGS: StoreSettings = {
  storeName: 'Pajarita Store',
  phoneWhatsapp: '+505 8658 1794',
  address: 'Bo. el Rodeo De la iglesia catolica 6 cuadras al lago',
  email: 'contacto@pajaritastore.com',
  website: 'www.pajaritastore.com',
  ruc: '',
  taxRegime: DEFAULT_TAX_REGIME,
  defaultCreditDays: 30,
};

/**
 * Cliente genérico para ventas de mostrador sin datos ("Consumidor final").
 * Tiene un id fijo para que todos los equipos usen el mismo registro en la nube.
 */
export const WALK_IN_CUSTOMER_ID = '00000000-0000-4000-8000-000000000001';
const WALK_IN_CUSTOMER: Customer = {
  id: WALK_IN_CUSTOMER_ID,
  fullName: 'Cliente Invitado (Consumidor Final)',
  city: 'Managua',
  notes: 'Cliente genérico para ventas de contado sin datos personales',
};

/** Tiempo para deshacer un borrado antes de enviarlo a la nube */
const UNDO_WINDOW_MS = 8_000;

/** Borrado que todavía se puede deshacer */
export interface UndoHandle {
  token: string;
  label: string;
}

interface PendingDelete {
  label: string;
  timer: ReturnType<typeof setTimeout>;
  /** Envía el borrado a la cola de la nube */
  commit: () => void;
  /** Devuelve los datos locales a como estaban */
  restore: () => void;
}

/** Estados de entrega que implican salida física de bodega */
const DISPATCH_STATUSES: DeliveryStatus[] = ['en_transito', 'listo_entrega', 'entregado'];

/** Resultado de una operación que se guarda local y luego en la nube */
export interface OperationResult<T = undefined> {
  success: boolean;
  message: string;
  /** synced = confirmado por la nube; pending = guardado en este equipo; failed = la nube lo rechazó; local = sin nube configurada */
  sync: 'synced' | 'pending' | 'failed' | 'local';
  data?: T;
}

// Nombres de las acciones de la cola de sincronización
const A = {
  upsertCategory: 'upsertCategory',
  deleteCategory: 'deleteCategory',
  upsertProduct: 'upsertProduct',
  updateProduct: 'updateProduct',
  deleteProduct: 'deleteProduct',
  upsertSku: 'upsertSku',
  deleteSku: 'deleteSku',
  upsertCustomer: 'upsertCustomer',
  upsertPurchaseOrder: 'upsertPurchaseOrder',
  saveExchangeRate: 'saveExchangeRate',
  backfillMovements: 'backfillMovements',
  venta: 'rpc:erp_registrar_venta',
  pago: 'rpc:erp_registrar_pago',
  despacho: 'rpc:erp_despachar_pedido',
  anulacion: 'rpc:erp_anular_factura',
  devolucion: 'rpc:erp_registrar_devolucion',
  ajuste: 'rpc:erp_ajustar_inventario',
  recepcion: 'rpc:erp_recibir_orden',
  gasto: 'rpc:erp_registrar_gasto_orden',
  desempaque: 'rpc:erp_desempacar',
  estadoOrden: 'rpc:erp_actualizar_estado_orden',
} as const;

class AppDataStore {
  private categories: Category[] = [];
  private products: Product[] = [];
  private skuTypes: Record<string, SkuType> = {};
  private purchaseOrders: PurchaseOrder[] = [];
  private customers: Customer[] = [];
  private invoices: SalesInvoice[] = [];
  private stock: StockLevel[] = [];
  private kardex: KardexMovement[] = [];
  private exchangeRate: number = 36.80;
  private storeSettings: StoreSettings = { ...DEFAULT_STORE_SETTINGS };
  private listeners: Set<() => void> = new Set();
  private isInitialized = false;
  private queue: SyncQueue;
  private pendingDeletes = new Map<string, PendingDelete>();

  constructor() {
    this.queue = new SyncQueue({
      configured: SupabaseService.isConnected(),
      isAuthenticated: () => SupabaseService.isAuthenticated(),
    });
    this.registerSyncActions();
    this.queue.subscribe(() => this.notify());

    if (typeof window !== 'undefined') {
      // Si se cierra o recarga la página durante la ventana de "Deshacer", el borrado se confirma
      const flush = () => this.flushPendingDeletes();
      window.addEventListener('pagehide', flush);
      window.addEventListener('beforeunload', flush);
      this.loadFromStorage();
      // Sincronización en segundo plano con Supabase si está configurado
      if (SupabaseService.isConnected()) {
        this.syncFromSupabase();
      }
    } else {
      this.initDefaults();
    }
  }

  // ===========================================================================
  // SINCRONIZACIÓN
  // ===========================================================================

  /** true si hay una base Supabase configurada (si no, la app trabaja solo en este equipo) */
  private get cloudEnabled(): boolean {
    return SupabaseService.isConnected();
  }

  public getSyncState(): SyncState { return this.queue.getState(); }
  public getSyncOps(): SyncOp[] { return this.queue.getOps(); }

  /** Reintenta un cambio rechazado por la nube */
  public retrySyncOp(opId: string) { this.queue.retry(opId); }

  /**
   * Descarta un cambio rechazado. Como el cambio ya se había aplicado en este equipo,
   * se vuelve a leer todo desde la nube para quedar igual que ella.
   */
  public async discardSyncOp(opId: string) {
    this.queue.discard(opId);
    await this.syncFromSupabase();
  }

  /** Envía lo pendiente y, si no queda nada por subir, trae la versión de la nube */
  public async syncNow() {
    await this.queue.process();
    await this.syncFromSupabase();
  }

  public async syncFromSupabase() {
    if (!SupabaseService.isConnected()) return;
    try {
      // 1) Primero subir lo pendiente. Mientras haya cambios sin confirmar no se reemplazan
      //    los datos locales con los de la nube (se perderían esos cambios).
      await this.queue.process();
      if (!this.queue.isEmpty() || this.pendingDeletes.size > 0) return;

      // 2) Sin sesión, las políticas RLS solo exponen el catálogo público. En ese caso NO se
      //    sobrescriben ventas, compras, clientes ni kardex locales con listas vacías.
      const authenticated = await SupabaseService.isAuthenticated();

      const [remoteCats, remoteProds, remoteOrders, remoteInvs, remoteCusts, remoteRate, remoteStock, remoteKardex] = await Promise.all([
        SupabaseService.fetchCategories(),
        SupabaseService.fetchProducts(),
        authenticated ? SupabaseService.fetchPurchaseOrders() : Promise.resolve(null),
        authenticated ? SupabaseService.fetchInvoices() : Promise.resolve(null),
        authenticated ? SupabaseService.fetchCustomers() : Promise.resolve(null),
        SupabaseService.fetchExchangeRate(),
        SupabaseService.fetchStock(),
        authenticated ? SupabaseService.fetchMovements() : Promise.resolve(null),
      ]);

      // Si mientras se leía se hizo un cambio local, no pisarlo
      if (!this.queue.isEmpty() || this.pendingDeletes.size > 0) return;

      let hasChanges = false;
      if (Array.isArray(remoteCats)) {
        this.categories = remoteCats;
        hasChanges = true;
      }
      if (Array.isArray(remoteProds)) {
        this.products = this.normalizeProductsSkuTypes(
          [...remoteProds].sort((a, b) => {
            const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            if (timeB !== timeA) return timeB - timeA;
            return (b.productCode || b.id || '').localeCompare(a.productCode || a.id || '');
          })
        );
        hasChanges = true;

        // Reconstruir existencias de stock con los SKUs remotos y niveles reales
        const stockMap = new Map((remoteStock || []).map((s) => [s.sku_id, s]));
        const allRemoteSkus = this.products.flatMap((p) => p.skus || []);
        this.stock = allRemoteSkus.map((s) => {
          const remoteStockItem = stockMap.get(s.id);
          const existing = this.stock.find((st) => st.skuId === s.id || st.skuCode === s.skuCode);
          return {
            skuId: s.id,
            skuCode: s.skuCode,
            productName: this.products.find((p) => p.id === s.productId)?.name || '',
            skuDescription: s.skuDescription || s.skuCode,
            size: s.size,
            colorName: s.colorName,
            colorHex: s.colorHex,
            mainImageUrl: s.mainImageUrl,
            costPriceNio: s.costPriceNio,
            salePriceNio: s.salePriceNio,
            quantityAvailable: remoteStockItem ? remoteStockItem.quantity_available : (existing ? existing.quantityAvailable : 0),
            quantityReserved: remoteStockItem ? remoteStockItem.quantity_reserved : (existing ? existing.quantityReserved : 0),
          };
        });
      }
      if (Array.isArray(remoteOrders)) {
        this.purchaseOrders = remoteOrders.map((o) => this.enrichOrder(o));
        hasChanges = true;
      }
      if (Array.isArray(remoteCusts)) {
        const hasWalkIn = remoteCusts.some((c) => c.id === WALK_IN_CUSTOMER_ID);
        this.customers = hasWalkIn
          ? remoteCusts
          : [...remoteCusts, { ...WALK_IN_CUSTOMER }];
        hasChanges = true;
      }
      if (Array.isArray(remoteInvs)) {
        this.invoices = remoteInvs.map((inv) => this.enrichInvoice(inv));
        hasChanges = true;
      }
      if (remoteRate && remoteRate > 0) {
        this.exchangeRate = remoteRate;
        hasChanges = true;
      }
      if (Array.isArray(remoteKardex)) {
        // Movimientos locales que la nube no tiene:
        //  - provisionales (syncOpId) de cambios ya confirmados o descartados → se descartan
        //  - históricos de antes de la Fase 2 → se suben a la nube (una vez)
        const remoteIds = new Set(remoteKardex.map((m) => m.id));
        const legacyLocal = this.kardex.filter((m) => !remoteIds.has(m.id) && !m.syncOpId);
        if (legacyLocal.length > 0) {
          this.queue.enqueue(A.backfillMovements, legacyLocal, `Subir ${legacyLocal.length} movimientos de kardex históricos`);
        }
        this.kardex = [...legacyLocal, ...remoteKardex.map((m) => this.enrichMovement(m))].sort((a, b) =>
          (b.createdAt || '').localeCompare(a.createdAt || '')
        );
        hasChanges = true;
      }

      if (hasChanges) {
        this.saveToStorage();
      }
    } catch (err) {
      console.warn('Supabase sync error (usando datos locales):', err);
    }
  }

  /** Registra en la cola qué hacer en la nube para cada acción y cómo aplicar la respuesta */
  private registerSyncActions() {
    const q = this.queue;
    q.register(A.upsertCategory, (cat: Category) => cloud.upsertCategory(cat));
    q.register(A.deleteCategory, (id: string) => cloud.deleteCategory(id));
    // Si la nube asignó otro código PRD- (choque con otro equipo), se actualiza el producto local
    // Igual con los códigos SKU- que chocaron con los de otro equipo.
    const applyProductCode = (res: any, op: SyncOp) => {
      const id = (op.payload as Product)?.id;
      const product = this.products.find((p) => p.id === id);
      let changed = false;
      if (product && res?.productCode && res.productCode !== product.productCode) {
        product.productCode = res.productCode;
        changed = true;
      }
      if (this.applySkuCodes(res?.skuCodes)) changed = true;
      if (changed) this.saveToStorage();
    };
    const applySkuCode = (res: any) => {
      if (this.applySkuCodes(res?.skuCodes)) this.saveToStorage();
    };
    q.register(A.upsertProduct, (p: Product) => cloud.upsertProduct(p, true), applyProductCode);
    q.register(A.updateProduct, (p: Product) => cloud.upsertProduct(p, false), applyProductCode);
    q.register(A.deleteProduct, (id: string) => cloud.deleteProduct(id));
    q.register(A.upsertSku, (sku: ProductSku) => cloud.upsertSku(sku), applySkuCode);
    q.register(A.deleteSku, (id: string) => cloud.deleteSku(id));
    q.register(A.upsertCustomer, (c: Customer) => cloud.upsertCustomer(c));
    q.register(A.upsertPurchaseOrder, (o: PurchaseOrder) => cloud.upsertPurchaseOrder(o));
    q.register(A.saveExchangeRate, (rate: number) => cloud.saveExchangeRate(rate));
    q.register(A.backfillMovements, (list: KardexMovement[]) => cloud.backfillMovements(list));

    // Operaciones transaccionales: la respuesta de la nube es la verdad (números de documento,
    // existencias y costos calculados con bloqueo) y reemplaza el cálculo provisional local.
    const applyInvoiceResult = (res: any, op: SyncOp) => {
      if (res?.invoice) this.applyServerInvoice(res.invoice);
      this.applyServerMovements(op.id, res?.movements);
      this.applyStockSnapshot(res?.stock);
      this.saveToStorage();
    };
    q.register(A.venta, async (p) => {
      // Asegurar que el cliente exista en la nube antes de facturar (evita CLIENTE_NO_EXISTE
      // cuando el alta del cliente quedó solo en este equipo o fue rechazada).
      // El "Consumidor final" se crea en la nube con la primera venta que lo usa
      const customer =
        this.customers.find((c) => c.id === p?.customer_id) ||
        (p?.customer_id === WALK_IN_CUSTOMER_ID ? WALK_IN_CUSTOMER : undefined);
      if (customer && isValidUuid(customer.id)) await cloud.ensureCustomer(customer);
      return cloud.callRpc('erp_registrar_venta', { p_venta: p });
    }, applyInvoiceResult);
    q.register(A.pago, (p) => cloud.callRpc('erp_registrar_pago', { p_pago: p }), applyInvoiceResult);
    q.register(A.despacho, (p) => cloud.callRpc('erp_despachar_pedido', p), applyInvoiceResult);
    q.register(A.anulacion, (p) => cloud.callRpc('erp_anular_factura', p), applyInvoiceResult);
    q.register(A.devolucion, (p) => cloud.callRpc('erp_registrar_devolucion', { p_dev: p }), applyInvoiceResult);

    const applyStockResult = (res: any, op: SyncOp) => {
      this.applyServerMovements(op.id, res?.movements);
      this.applyStockSnapshot(res?.stock);
      this.saveToStorage();
    };
    q.register(A.ajuste, (p) => cloud.callRpc('erp_ajustar_inventario', { p_aj: p }), applyStockResult);
    q.register(A.desempaque, (p) => cloud.callRpc('erp_desempacar', { p_op: p }), applyStockResult);

    q.register(A.recepcion, (p) => cloud.callRpc('erp_recibir_orden', { p_rec: p }), (res: any, op) => {
      if (res?.order) this.applyServerOrder(res.order, res.items);
      this.applyServerMovements(op.id, res?.movements);
      this.applyStockSnapshot(res?.stock);
      this.saveToStorage();
    });
    q.register(A.gasto, (p) => cloud.callRpc('erp_registrar_gasto_orden', { p_gasto: p }), (res: any, op) => {
      const orderId = op.meta?.orderId as string | undefined;
      const order = this.purchaseOrders.find((o) => o.id === orderId);
      if (order && Array.isArray(res?.items)) this.applyServerOrder({ ...this.orderToRow(order) }, res.items);
      this.applyStockSnapshot(res?.stock);
      this.saveToStorage();
    });
    q.register(A.estadoOrden, (p) => cloud.callRpc('erp_actualizar_estado_orden', p), (res: any) => {
      if (res?.id) {
        const order = this.purchaseOrders.find((o) => o.id === res.id);
        if (order) this.applyServerOrder(res, undefined);
        this.saveToStorage();
      }
    });
  }

  /** Encola un cambio si hay nube; devuelve el id de la operación (o null en modo local) */
  private enqueue(action: string, payload: unknown, label: string, meta?: Record<string, unknown>): string | null {
    if (!this.cloudEnabled) return null;
    return this.queue.enqueue(action, payload, label, meta);
  }

  /**
   * Espera la confirmación de la nube unos segundos y arma un mensaje honesto:
   * "sincronizado", "guardado en este equipo" o el motivo del rechazo.
   */
  private async outcome<T>(opId: string | null, okMessage: string, data?: T, timeoutMs = 8_000): Promise<OperationResult<T>> {
    if (!opId) return { success: true, message: okMessage, sync: 'local', data };
    const res: SyncOutcome = await this.queue.waitFor(opId, timeoutMs);
    if (res.status === 'synced') return { success: true, message: `${okMessage} Sincronizado con la nube.`, sync: 'synced', data };
    if (res.status === 'failed') {
      return {
        success: false,
        message: `La nube rechazó el cambio: ${res.error}. Revíselo en el panel de sincronización.`,
        sync: 'failed',
        data,
      };
    }
    return {
      success: true,
      message: `${okMessage} Guardado en este equipo; se subirá a la nube al recuperar la conexión.`,
      sync: 'pending',
      data,
    };
  }

  // ===========================================================================
  // PERSISTENCIA LOCAL
  // ===========================================================================
  private initDefaults() {
    this.categories = [];
    this.products = [];
    this.purchaseOrders = [];
    this.customers = [];
    this.invoices = [];
    this.stock = [];
    this.kardex = [];
    this.storeSettings = { ...DEFAULT_STORE_SETTINGS };
    this.isInitialized = true;
  }

  private saveToStorage() {
    if (typeof window === 'undefined') {
      this.notify();
      return;
    }
    try {
      localStorage.setItem('ps_categories', JSON.stringify(this.categories));
      localStorage.setItem('ps_products', JSON.stringify(this.products));
      localStorage.setItem('ps_sku_types', JSON.stringify(this.skuTypes));
      localStorage.setItem('ps_purchases', JSON.stringify(this.purchaseOrders));
      localStorage.setItem('ps_customers', JSON.stringify(this.customers));
      localStorage.setItem('ps_invoices', JSON.stringify(this.invoices));
      localStorage.setItem('ps_stock', JSON.stringify(this.stock));
      localStorage.setItem('ps_kardex', JSON.stringify(this.kardex));
      localStorage.setItem('ps_exchange_rate', JSON.stringify(this.exchangeRate));
      localStorage.setItem('ps_store_settings', JSON.stringify(this.storeSettings));
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
    this.notify();
  }

  private loadFromStorage() {
    try {
      const storedCats = localStorage.getItem('ps_categories');
      const storedProds = localStorage.getItem('ps_products');
      const storedSkuTypes = localStorage.getItem('ps_sku_types');
      const storedPurchases = localStorage.getItem('ps_purchases');
      const storedCusts = localStorage.getItem('ps_customers');
      const storedInvs = localStorage.getItem('ps_invoices');
      const storedStock = localStorage.getItem('ps_stock');
      const storedKardex = localStorage.getItem('ps_kardex');
      const storedRate = localStorage.getItem('ps_exchange_rate');
      const storedSettings = localStorage.getItem('ps_store_settings');

      // Cargar datos reales y filtrar automáticamente cualquier residuo de datos semilla
      const parsedCats = storedCats ? JSON.parse(storedCats) : [];
      const parsedProds = storedProds ? JSON.parse(storedProds) : [];
      const parsedSkuTypes = storedSkuTypes ? JSON.parse(storedSkuTypes) : {};
      const parsedPurchases = storedPurchases ? JSON.parse(storedPurchases) : [];
      const parsedCusts = storedCusts ? JSON.parse(storedCusts) : [];
      const parsedInvs = storedInvs ? JSON.parse(storedInvs) : [];
      const parsedStock = storedStock ? JSON.parse(storedStock) : [];
      const parsedKardex = storedKardex ? JSON.parse(storedKardex) : [];

      this.skuTypes = parsedSkuTypes && typeof parsedSkuTypes === 'object' ? parsedSkuTypes : {};
      this.categories = Array.isArray(parsedCats) ? parsedCats.filter((c: Category) => !isMockEntityId(c.id)) : [];
      this.products = this.normalizeProductsSkuTypes(
        Array.isArray(parsedProds) ? parsedProds.filter((p: Product) => !isMockEntityId(p.id)) : []
      );
      this.purchaseOrders = Array.isArray(parsedPurchases) ? parsedPurchases.filter((o: PurchaseOrder) => !isMockEntityId(o.id)) : [];
      this.customers = Array.isArray(parsedCusts) ? parsedCusts.filter((c: Customer) => !isMockEntityId(c.id)) : [];
      this.invoices = Array.isArray(parsedInvs) ? parsedInvs.filter((i: SalesInvoice) => !isMockEntityId(i.id)) : [];
      this.stock = Array.isArray(parsedStock) ? parsedStock.filter((s: StockLevel) => !isMockEntityId(s.skuId)) : [];
      this.kardex = Array.isArray(parsedKardex) ? parsedKardex.filter((k: KardexMovement) => !isMockEntityId(k.skuId)) : [];
      this.exchangeRate = storedRate ? JSON.parse(storedRate) : 36.80;
      if (storedSettings) {
        const parsed = JSON.parse(storedSettings);
        if (
          parsed.address?.includes('Altamira') ||
          parsed.phoneWhatsapp === '+505 8899-7766' ||
          parsed.ruc === 'J0310000294829'
        ) {
          parsed.address = DEFAULT_STORE_SETTINGS.address;
          parsed.phoneWhatsapp = DEFAULT_STORE_SETTINGS.phoneWhatsapp;
          parsed.ruc = '';
        }
        this.storeSettings = { ...DEFAULT_STORE_SETTINGS, ...parsed };
      } else {
        this.storeSettings = { ...DEFAULT_STORE_SETTINGS };
      }

      // Si había residuos de datos semilla en LocalStorage, persistir la limpieza de inmediato
      const hadMockData =
        (storedCats && parsedCats.length !== this.categories.length) ||
        (storedProds && parsedProds.length !== this.products.length) ||
        (storedPurchases && parsedPurchases.length !== this.purchaseOrders.length) ||
        (storedCusts && parsedCusts.length !== this.customers.length) ||
        (storedInvs && parsedInvs.length !== this.invoices.length) ||
        (storedStock && parsedStock.length !== this.stock.length);

      if (hadMockData) {
        this.saveToStorage();
      }
    } catch {
      this.initDefaults();
    }
    this.isInitialized = true;
  }

  /**
   * Determina el tipo de un SKU ('simple' o 'paquete') de forma independiente por variante.
   * Prioriza la configuración explícita del SKU o del mapa local; para datos heredados donde
   * el tipo estaba solo en el producto padre, clasifica como 'paquete' únicamente las variantes
   * que tengan receta, palabras clave de paquete (pack/combo/paquete) o color "Variado".
   */
  public resolveSkuType(sku: ProductSku, parentProduct?: Product): SkuType {
    const localOverride = this.skuTypes[sku.id] || (sku.skuCode ? this.skuTypes[sku.skuCode] : undefined);
    if (localOverride === 'simple' || localOverride === 'paquete') {
      return localOverride;
    }
    if (sku.skuType === 'simple' || sku.skuType === 'paquete') {
      return sku.skuType;
    }
    if (sku.bundleItems && sku.bundleItems.length > 0) {
      return 'paquete';
    }
    const text = `${sku.skuCode || ''} ${sku.skuDescription || ''} ${sku.colorName || ''}`.toLowerCase();
    if (/\b(pack|paquete|combo|set|docena)\b/i.test(text)) {
      return 'paquete';
    }
    if (parentProduct?.productType === 'paquete' && /variad/i.test(`${sku.colorName || ''} ${sku.skuDescription || ''}`)) {
      return 'paquete';
    }
    return 'simple';
  }

  public isBundleSku(skuOrId: ProductSku | string): boolean {
    if (typeof skuOrId === 'string') {
      const found = this.findSku(skuOrId);
      if (!found) return false;
      return this.resolveSkuType(found.sku, found.product) === 'paquete';
    }
    const parent = this.products.find((p) => p.id === skuOrId.productId);
    return this.resolveSkuType(skuOrId, parent) === 'paquete';
  }

  private normalizeProductsSkuTypes(products: Product[]): Product[] {
    return products.map((p) => ({
      ...p,
      skus: (p.skus || []).map((s) => {
        const resolved = this.resolveSkuType(s, p);
        return { ...s, skuType: resolved };
      }),
    }));
  }

  public subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach(fn => fn());
  }

  // ===========================================================================
  // KARDEX Y EXISTENCIAS: AUXILIARES
  // ===========================================================================

  /** Registra un movimiento en el kardex local (provisional si hay un cambio pendiente de la nube) */
  private recordMovement(movement: KardexMovement) {
    this.kardex.unshift(movement);
  }

  private newMovement(
    skuId: string,
    movementType: MovementType,
    quantity: number,
    previousStock: number,
    newStock: number,
    referenceId: string,
    notes: string,
    syncOpId?: string | null
  ): KardexMovement {
    const found = this.findSku(skuId);
    const fallbackImg = found?.sku.mainImageUrl || found?.product.skus?.find((s) => s.mainImageUrl)?.mainImageUrl;
    return {
      id: generateEntityId(),
      skuId,
      skuCode: found?.sku.skuCode,
      productName: found?.product.name,
      skuDescription: found?.sku.skuDescription,
      mainImageUrl: fallbackImg,
      movementType,
      quantity,
      previousStock,
      newStock,
      referenceId,
      notes,
      createdAt: new Date().toISOString(),
      syncOpId: syncOpId || undefined,
    };
  }

  /**
   * Unidades que se pueden vender o despachar de inmediato:
   * existencia física menos lo apartado para pedidos.
   */
  public getAvailableToSell(skuId: string): number {
    const s = this.stock.find((st) => st.skuId === skuId);
    if (!s) return 0;
    return Math.max(0, (s.quantityAvailable || 0) - (s.quantityReserved || 0));
  }

  private findSku(skuId: string): { sku: ProductSku; product: Product } | undefined {
    for (const product of this.products) {
      const sku = (product.skus || []).find((s) => s.id === skuId);
      if (sku) return { sku, product };
    }
    return undefined;
  }

  /** Devuelve el registro de existencia del SKU, creándolo en 0 si no existía. */
  private ensureStockEntry(skuId: string, skuCode?: string, productName?: string): StockLevel {
    let entry = this.stock.find(s => s.skuId === skuId);
    if (entry) return entry;
    const found = this.findSku(skuId);
    const fallbackImg = found?.sku.mainImageUrl || found?.product.skus?.find((s) => s.mainImageUrl)?.mainImageUrl;
    entry = {
      skuId,
      skuCode: found?.sku.skuCode || skuCode || 'SKU',
      productName: found?.product.name || productName || '',
      skuDescription: found?.sku.skuDescription || found?.sku.skuCode || skuCode || '',
      size: found?.sku.size,
      colorName: found?.sku.colorName,
      colorHex: found?.sku.colorHex,
      mainImageUrl: fallbackImg,
      costPriceNio: found?.sku.costPriceNio || 0,
      salePriceNio: found?.sku.salePriceNio || 0,
      quantityAvailable: 0,
      quantityReserved: 0,
    };
    this.stock.push(entry);
    return entry;
  }

  /** Actualiza el costo unitario (landed) de un SKU en el catálogo y en la existencia LOCAL. */
  private setLocalSkuCost(skuId: string, costNio: number) {
    const cost = Number(Math.max(0, costNio).toFixed(2));
    const stockEntry = this.stock.find(s => s.skuId === skuId);
    if (stockEntry) stockEntry.costPriceNio = cost;
    this.products = this.products.map(p => {
      if (!(p.skus || []).some(s => s.id === skuId)) return p;
      return {
        ...p,
        skus: p.skus.map(s => s.id !== skuId ? s : {
          ...s,
          costPriceNio: cost,
          costPriceUsd: this.exchangeRate > 0 ? Number((cost / this.exchangeRate).toFixed(2)) : s.costPriceUsd,
        }),
      };
    });
  }

  private weightedCost(onHand: number, currentCost: number, incoming: number, incomingCost: number): number {
    if (onHand > 0 && currentCost > 0 && onHand + incoming > 0) {
      return (onHand * currentCost + incoming * incomingCost) / (onHand + incoming);
    }
    return incomingCost;
  }

  // --- Aplicar respuestas de la nube -------------------------------------------------

  private applyStockSnapshot(rows: any[] | undefined) {
    if (!Array.isArray(rows)) return;
    rows.forEach((row) => {
      const entry = this.ensureStockEntry(row.sku_id);
      entry.quantityAvailable = Number(row.quantity_available || 0);
      entry.quantityReserved = Number(row.quantity_reserved || 0);
      if (row.cost_price_nio != null) {
        const incomingCost = Number(row.cost_price_nio);
        // Evitar que una respuesta con costo 0 (desincronización o falta de costo en la nube)
        // sobreescriba un costo válido mayor que cero en la existencia local
        if (incomingCost > 0 || !entry.costPriceNio) {
          entry.costPriceNio = incomingCost;
          this.products = this.products.map((p) => {
            if (!(p.skus || []).some((s) => s.id === row.sku_id)) return p;
            return {
              ...p,
              skus: p.skus.map((s) => s.id !== row.sku_id ? s : {
                ...s,
                costPriceNio: incomingCost,
                costPriceUsd: row.cost_price_usd != null ? Number(row.cost_price_usd) : s.costPriceUsd,
              }),
            };
          });
        }
      }
    });
  }

  /** Reemplaza los movimientos provisionales de una operación por los definitivos de la nube */
  private applyServerMovements(opId: string, rows: any[] | undefined) {
    if (!Array.isArray(rows)) return;
    this.kardex = this.kardex.filter((m) => m.syncOpId !== opId);
    const incoming = rows.map((r) => this.enrichMovement(mapMovementRow(r)));
    const existingIds = new Set(this.kardex.map((m) => m.id));
    this.kardex = [...incoming.filter((m) => !existingIds.has(m.id)), ...this.kardex].sort((a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || '')
    );
  }

  private applyServerInvoice(row: any) {
    const mapped = this.enrichInvoice(mapInvoiceRow(row));
    const idx = this.invoices.findIndex((i) => i.id === mapped.id);
    if (idx === -1) {
      this.invoices.unshift(mapped);
    } else {
      // Conservar datos que la respuesta no trae (nombre del cliente, etc.)
      const local = this.invoices[idx];
      this.invoices[idx] = {
        ...mapped,
        customerName: mapped.customerName || local.customerName,
        customerPhone: mapped.customerPhone || local.customerPhone,
        customerIdentification: mapped.customerIdentification || local.customerIdentification,
        customerAddress: mapped.customerAddress || local.customerAddress,
        syncOpId: undefined,
      };
    }
  }

  private applyServerOrder(orderRow: any, itemRows: any[] | undefined) {
    const local = this.purchaseOrders.find((o) => o.id === orderRow.id);
    const mapped = mapPurchaseOrderRow(orderRow, itemRows ?? (local ? local.items.map((it) => this.itemToRow(it)) : []), []);
    const merged = this.enrichOrder({
      ...mapped,
      items: itemRows ? mapped.items : (local?.items || []),
      expenses: local?.expenses || mapped.expenses,
    });
    const idx = this.purchaseOrders.findIndex((o) => o.id === merged.id);
    if (idx === -1) this.purchaseOrders.unshift(merged);
    else this.purchaseOrders[idx] = merged;
  }

  private orderToRow(o: PurchaseOrder) {
    return {
      id: o.id, order_number: o.orderNumber, supplier_name: o.supplierName, supplier_order_id: o.supplierOrderId,
      tracking_number: o.trackingNumber, supplier_invoice_id: o.supplierInvoiceId, modality: o.modality,
      proration_method: o.prorationMethod, exchange_rate: o.exchangeRate, status: o.status,
      date_purchased: o.datePurchased, date_delivered_to_agency: o.dateDeliveredToAgency,
      date_received_nicaragua: o.dateReceivedNicaragua, total_cost_usd: o.totalCostUsd,
      total_cost_nio: o.totalCostNio, total_import_expenses_nio: o.totalImportExpensesNio, notes: o.notes,
    };
  }

  private itemToRow(it: PurchaseItem) {
    return {
      id: it.id, purchase_order_id: it.purchaseOrderId, sku_id: it.skuId, quantity_ordered: it.quantityOrdered,
      quantity_received: it.quantityReceived, weight_lbs: it.weightLbs, unit_cost_usd: it.unitCostUsd,
      unit_cost_nio: it.unitCostNio, prorated_expense_nio: it.proratedExpenseNio,
      total_landed_cost_nio: it.totalLandedCostNio, suggested_sale_price_nio: it.suggestedSalePriceNio,
      reception_status: it.receptionStatus,
    };
  }

  /** Completa datos descriptivos (código, nombre, talla, foto) que la base no guarda en las líneas */
  private enrichInvoice(inv: SalesInvoice): SalesInvoice {
    const isWalkIn = inv.customerId === WALK_IN_CUSTOMER_ID;
    const customer = this.customers.find((c) => c.id === inv.customerId);
    const previous = this.invoices.find((i) => i.id === inv.id);
    return {
      ...inv,
      customerName:
        inv.customerName ||
        customer?.fullName ||
        previous?.customerName ||
        (isWalkIn ? WALK_IN_CUSTOMER.fullName : undefined),
      customerPhone: inv.customerPhone || customer?.phoneWhatsapp || previous?.customerPhone,
      customerIdentification: inv.customerIdentification || customer?.identificationNumber || previous?.customerIdentification,
      customerAddress: inv.customerAddress || customer?.address || previous?.customerAddress,
      items: (inv.items || []).map((it) => {
        const found = this.findSku(it.skuId);
        return {
          ...it,
          skuCode: it.skuCode || found?.sku.skuCode,
          productName: it.productName || found?.product.name,
          size: it.size || found?.sku.size,
          colorName: it.colorName || found?.sku.colorName,
          mainImageUrl: it.mainImageUrl || found?.sku.mainImageUrl,
        };
      }),
    };
  }

  private enrichOrder(order: PurchaseOrder): PurchaseOrder {
    return {
      ...order,
      items: (order.items || []).map((it) => {
        const found = this.findSku(it.skuId);
        return {
          ...it,
          skuCode: it.skuCode || found?.sku.skuCode,
          productName: it.productName || found?.product.name,
          size: it.size || found?.sku.size,
          colorName: it.colorName || found?.sku.colorName,
          colorHex: it.colorHex || found?.sku.colorHex,
          mainImageUrl: it.mainImageUrl || found?.sku.mainImageUrl,
        };
      }),
    };
  }

  private enrichMovement(m: KardexMovement): KardexMovement {
    const found = this.findSku(m.skuId);
    const fallbackImg = found?.sku.mainImageUrl || found?.product.skus?.find((s) => s.mainImageUrl)?.mainImageUrl;
    return {
      ...m,
      skuCode: m.skuCode || found?.sku.skuCode,
      productName: m.productName || found?.product.name,
      skuDescription: m.skuDescription || found?.sku.skuDescription,
      mainImageUrl: m.mainImageUrl || fallbackImg,
    };
  }

  /**
   * Garantiza que el inventario contenga exclusivamente variantes SKU válidas del catálogo,
   * enriqueciendo cada línea con su código SKU, descripción, atributos e imagen.
   */
  private reconcileStockWithCatalog(): StockLevel[] {
    if (this.products.length === 0) return this.stock;
    const validSkuIds = new Set<string>();
    for (const product of this.products) {
      const productFallbackImg = (product.skus || []).find((s) => s.mainImageUrl)?.mainImageUrl;
      for (const sku of product.skus || []) {
        validSkuIds.add(sku.id);
        let entry = this.stock.find((s) => s.skuId === sku.id || (s.skuCode && s.skuCode === sku.skuCode));
        if (!entry) {
          entry = {
            skuId: sku.id,
            skuCode: sku.skuCode,
            productName: product.name,
            skuDescription: sku.skuDescription || sku.skuCode,
            size: sku.size,
            colorName: sku.colorName,
            colorHex: sku.colorHex,
            mainImageUrl: sku.mainImageUrl || productFallbackImg,
            costPriceNio: sku.costPriceNio || 0,
            salePriceNio: sku.salePriceNio || 0,
            quantityAvailable: sku.stockAvailable || 0,
            quantityReserved: 0,
          };
          this.stock.push(entry);
        } else {
          entry.skuId = sku.id;
          entry.skuCode = sku.skuCode || entry.skuCode;
          entry.productName = product.name || entry.productName;
          entry.skuDescription = sku.skuDescription || entry.skuDescription || sku.skuCode;
          entry.size = sku.size ?? entry.size;
          entry.colorName = sku.colorName ?? entry.colorName;
          entry.colorHex = sku.colorHex ?? entry.colorHex;
          entry.mainImageUrl = sku.mainImageUrl || entry.mainImageUrl || productFallbackImg;
          entry.salePriceNio = sku.salePriceNio ?? entry.salePriceNio;
          if (!entry.costPriceNio && sku.costPriceNio) {
            entry.costPriceNio = sku.costPriceNio;
          }
        }
      }
    }
    this.stock = this.stock.filter((s) => validSkuIds.has(s.skuId));
    return this.stock;
  }

  // ===========================================================================
  // GETTERS GENERALES
  // ===========================================================================
  public getCategories(): Category[] { return [...this.categories]; }
  public getProducts(): Product[] { return [...this.products]; }
  public getAllSkus(): ProductSku[] {
    return this.products.flatMap((p) => {
      const fallbackImg = (p.skus || []).find((s) => s.mainImageUrl)?.mainImageUrl;
      return (p.skus || []).map((s) => ({
        ...s,
        skuType: this.resolveSkuType(s, p),
        mainImageUrl: s.mainImageUrl || fallbackImg,
      }));
    });
  }
  public getPurchaseOrders(): PurchaseOrder[] { return this.purchaseOrders; }
  public getCustomers(): Customer[] { return this.customers; }
  public getInvoices(): SalesInvoice[] { return this.invoices; }
  public getStock(): StockLevel[] { return this.reconcileStockWithCatalog(); }
  public getKardex(): KardexMovement[] { return this.kardex.map((m) => this.enrichMovement(m)); }
  public getExchangeRate(): number { return this.exchangeRate; }
  public getStoreSettings(): StoreSettings { return this.storeSettings; }
  public getTaxRegime(): TaxRegime { return this.storeSettings.taxRegime ?? DEFAULT_TAX_REGIME; }
  /** Tasa de IVA vigente para nuevas facturas (0 en cuota fija). */
  public getIvaRate(): number { return getIvaRateForRegime(this.getTaxRegime()); }

  // --- STORE SETTINGS ---
  public saveStoreSettings(settings: Partial<StoreSettings>) {
    this.storeSettings = { ...this.storeSettings, ...settings };
    this.saveToStorage();
  }

  // ===========================================================================
  // CATEGORÍAS (2 NIVELES)
  // ===========================================================================
  public getMainCategories(): Category[] {
    return this.categories.filter(c => !c.parentId);
  }

  public getSubcategories(parentId?: string): Category[] {
    if (!parentId) {
      return this.categories.filter(c => Boolean(c.parentId));
    }
    return this.categories.filter(c => c.parentId === parentId);
  }

  public addCategory(cat: Omit<Category, 'id'>): Category {
    const id = generateEntityId();
    const parent = cat.parentId ? this.categories.find(c => c.id === cat.parentId) : undefined;
    const newCategory: Category = {
      ...cat,
      id,
      parentName: parent?.name,
      slug: cat.slug || cat.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
    };
    this.categories.push(newCategory);
    this.saveToStorage();
    this.enqueue(A.upsertCategory, newCategory, `Categoría "${newCategory.name}"`);
    return newCategory;
  }

  public updateCategory(cat: Category) {
    const idx = this.categories.findIndex(c => c.id === cat.id);
    if (idx !== -1) {
      this.categories[idx] = cat;
      this.saveToStorage();
      this.enqueue(A.upsertCategory, cat, `Categoría "${cat.name}"`);
    }
  }

  /**
   * Elimina la categoría y sus subcategorías. El borrado se puede deshacer durante unos
   * segundos (undoDelete); después se envía a la nube.
   */
  public deleteCategory(id: string): UndoHandle | null {
    const before = [...this.categories];
    const removed = this.categories.filter(c => c.id === id || c.parentId === id);
    if (removed.length === 0) return null;
    this.categories = this.categories.filter(c => c.id !== id && c.parentId !== id);
    this.saveToStorage();
    const main = removed.find(c => c.id === id);
    return this.scheduleDelete(
      `Categoría "${main?.name || ''}"`,
      () => removed
        .sort((a, b) => (a.parentId ? -1 : 0) - (b.parentId ? -1 : 0)) // subcategorías primero
        .forEach(c => this.enqueue(A.deleteCategory, c.id, `Eliminar categoría "${c.name}"`)),
      () => {
        const missing = removed.filter(r => !this.categories.some(c => c.id === r.id));
        // Conservar el orden original y agregar al final lo creado después del borrado
        const restored = before.filter(c => missing.some(m => m.id === c.id) || this.categories.some(x => x.id === c.id));
        this.categories = [...restored, ...this.categories.filter(c => !restored.some(r => r.id === c.id))];
      }
    );
  }

  /** Qué se perdería al borrar una categoría (para el diálogo de confirmación) */
  public getCategoryDeleteImpact(id: string): { subcategories: number; products: number } {
    const ids = new Set(this.categories.filter(c => c.id === id || c.parentId === id).map(c => c.id));
    return {
      subcategories: ids.size > 0 ? ids.size - 1 : 0,
      products: this.products.filter(p => (p.categoryId && ids.has(p.categoryId)) || (p.subcategoryId && ids.has(p.subcategoryId))).length,
    };
  }

  // --- BORRADOS CON "DESHACER" ---
  private scheduleDelete(label: string, commit: () => void, restore: () => void): UndoHandle {
    const token = generateEntityId();
    const timer = setTimeout(() => {
      const pending = this.pendingDeletes.get(token);
      if (!pending) return;
      this.pendingDeletes.delete(token);
      pending.commit();
    }, UNDO_WINDOW_MS);
    this.pendingDeletes.set(token, { label, timer, commit, restore });
    return { token, label };
  }

  /** Revierte un borrado que aún no se envió a la nube. Devuelve false si ya no se puede. */
  public undoDelete(token: string): boolean {
    const pending = this.pendingDeletes.get(token);
    if (!pending) return false;
    clearTimeout(pending.timer);
    this.pendingDeletes.delete(token);
    pending.restore();
    this.saveToStorage();
    return true;
  }

  /** Confirma todos los borrados en espera (al salir de la página) */
  public flushPendingDeletes() {
    this.pendingDeletes.forEach((pending, token) => {
      clearTimeout(pending.timer);
      this.pendingDeletes.delete(token);
      pending.commit();
    });
  }

  public getUndoWindowMs(): number { return UNDO_WINDOW_MS; }

  // --- TASA DE CAMBIO ---
  public setExchangeRate(rate: number) {
    this.exchangeRate = rate;
    this.saveToStorage();
    this.enqueue(A.saveExchangeRate, rate, `Tasa de cambio C$ ${rate.toFixed(2)}`);
  }

  // ===========================================================================
  // CATÁLOGO
  // ===========================================================================
  public getNextProductCode(): string {
    return generateNextProductCode(this.products);
  }

  /** Todos los códigos SKU que existen en este equipo */
  private allSkuCodes(): string[] {
    return this.products.flatMap((p) => (p.skus || []).map((s) => s.skuCode));
  }

  /**
   * Siguiente código de variante SKU-00000. Con offset se previsualizan varios seguidos
   * (p. ej. las filas de variantes de un producto nuevo).
   */
  public getNextSkuCode(offset: number = 0): string {
    return generateNextSkuCode(this.allSkuCodes(), offset);
  }

  /**
   * Los códigos los asigna el sistema: se conserva el propuesto solo si tiene el formato
   * oficial y nadie más lo usa; si no, se toma el siguiente correlativo.
   */
  private resolveSkuCode(proposed: string | undefined, taken: Set<string>): string {
    const code = (proposed || '').trim().toUpperCase();
    if (isValidSkuCode(code) && !taken.has(code)) return code;
    return generateNextSkuCode(Array.from(taken));
  }

  /** Aplica los códigos SKU que la nube reasignó (id → código). Devuelve true si cambió algo. */
  private applySkuCodes(map: Record<string, string> | undefined): boolean {
    if (!map || Object.keys(map).length === 0) return false;
    this.products = this.products.map((p) => {
      if (!(p.skus || []).some((s) => map[s.id])) return p;
      return { ...p, skus: p.skus.map((s) => (map[s.id] ? { ...s, skuCode: map[s.id] } : s)) };
    });
    this.stock.forEach((st) => {
      if (map[st.skuId]) st.skuCode = map[st.skuId];
    });
    return true;
  }

  public addProduct(product: Omit<Product, 'id'>): Product {
    const id = generateEntityId();
    const now = new Date().toISOString();
    const proposedCode = (product.productCode || '').trim().toUpperCase();
    const finalProductCode =
      isValidProductCode(proposedCode) && !this.products.some((p) => p.productCode === proposedCode)
        ? proposedCode
        : generateNextProductCode(this.products);
    const taken = new Set(this.allSkuCodes());
    const newProduct: Product = {
      ...product,
      id,
      productCode: finalProductCode,
      productType: product.productType || 'simple',
      createdAt: product.createdAt || now,
      updatedAt: product.updatedAt || now,
      skus: (product.skus || []).map((s) => {
        const skuCode = this.resolveSkuCode(s.skuCode, taken);
        taken.add(skuCode);
        const skuId = s.id && isValidUuid(s.id) ? s.id : generateEntityId();
        const skuType: SkuType = s.skuType === 'paquete' ? 'paquete' : 'simple';
        this.skuTypes[skuId] = skuType;
        this.skuTypes[skuCode] = skuType;
        return {
          ...s,
          skuCode,
          skuType,
          id: skuId,
          productId: id,
          createdAt: s.createdAt || now,
          updatedAt: s.updatedAt || now,
        };
      }),
    };
    this.products.unshift(newProduct);
    newProduct.skus.forEach(sku => this.ensureStockEntry(sku.id, sku.skuCode, newProduct.name));
    this.saveToStorage();
    this.enqueue(A.upsertProduct, newProduct, `Producto "${newProduct.name}"`);
    return newProduct;
  }

  public async updateProduct(product: Product): Promise<{ success: boolean; message?: string }> {
    const idx = this.products.findIndex(p => p.id === product.id);
    if (idx === -1) return { success: false, message: 'Producto no encontrado' };

    const cat = this.categories.find(c => c.id === product.categoryId);
    const subcat = this.categories.find(c => c.id === product.subcategoryId);
    const updatedProduct: Product = {
      ...product,
      // El código PRD- no se edita a mano: se conserva el asignado
      productCode: this.products[idx].productCode || product.productCode,
      categoryName: cat?.name || product.categoryName,
      subcategoryName: subcat?.name || product.subcategoryName,
    };
    const updatedProducts = [...this.products];
    updatedProducts[idx] = updatedProduct;
    this.products = updatedProducts;
    this.saveToStorage();

    const opId = this.enqueue(A.updateProduct, updatedProduct, `Producto "${updatedProduct.name}"`);
    const res = await this.outcome(opId, `Producto "${updatedProduct.name}" actualizado.`, undefined, 5_000);
    return { success: res.success, message: res.message };
  }

  /** Elimina el producto (con sus variantes). Se puede deshacer durante unos segundos. */
  public deleteProduct(id: string): UndoHandle | null {
    const idx = this.products.findIndex(p => p.id === id);
    if (idx === -1) return null;
    const product = this.products[idx];
    const removedSkuIds = new Set((product.skus || []).map(s => s.id));
    const removedStock = this.stock.filter(s => removedSkuIds.has(s.skuId));
    this.products = this.products.filter(p => p.id !== id);
    this.stock = this.stock.filter(s => !removedSkuIds.has(s.skuId));
    this.saveToStorage();
    return this.scheduleDelete(
      `Producto "${product.name}"`,
      () => this.enqueue(A.deleteProduct, id, `Eliminar producto "${product.name}"`),
      () => {
        if (this.products.some(p => p.id === id)) return;
        const next = [...this.products];
        next.splice(Math.min(idx, next.length), 0, product);
        this.products = next;
        const existingSkuIds = new Set(this.stock.map(s => s.skuId));
        this.stock = [...this.stock, ...removedStock.filter(s => !existingSkuIds.has(s.skuId))];
      }
    );
  }

  /**
   * Qué implica borrar un producto: variantes, unidades en bodega y ventas registradas.
   * Con ventas la nube no permite borrarlo (se recomienda desactivarlo).
   */
  public getProductDeleteImpact(id: string): { skus: number; unitsInStock: number; salesLines: number } {
    const product = this.products.find(p => p.id === id);
    const skuIds = new Set((product?.skus || []).map(s => s.id));
    return {
      skus: skuIds.size,
      unitsInStock: this.stock.filter(s => skuIds.has(s.skuId)).reduce((acc, s) => acc + Math.max(0, s.quantityAvailable || 0), 0),
      salesLines: this.invoices.reduce((acc, inv) => acc + (inv.items || []).filter(it => skuIds.has(it.skuId)).length, 0),
    };
  }

  public async updateSku(input: ProductSku): Promise<{ success: boolean; message: string }> {
    // El código SKU- no se edita a mano: se conserva el asignado
    const current = this.products.flatMap(p => p.skus || []).find(s => s.id === input.id);
    const skuType: SkuType = input.skuType || current?.skuType || 'simple';
    const bundleItems = skuType === 'paquete'
      ? (input.bundleItems || current?.bundleItems || []).map((bi) => ({
          ...bi,
          id: bi.id || generateEntityId(),
          bundleSkuId: input.id,
          quantityPerPack: Math.max(1, Number(bi.quantityPerPack) || 1),
        }))
      : [];

    const sku: ProductSku = {
      ...input,
      skuCode: current?.skuCode || input.skuCode,
      skuType,
      bundleItems,
    };
    this.skuTypes[sku.id] = skuType;
    if (sku.skuCode) this.skuTypes[sku.skuCode] = skuType;

    let found = false;
    this.products = this.products.map(product => {
      const skuIdx = (product.skus || []).findIndex(s => s.id === sku.id);
      if (skuIdx === -1) return product;
      found = true;
      const newSkus = [...product.skus];
      newSkus[skuIdx] = { ...sku };
      return { ...product, skus: newSkus };
    });
    if (!found) return { success: false, message: 'SKU no encontrado en los productos activos.' };

    // Sincronizar atributos en el inventario físico local si existe
    const stockEntry = this.stock.find(s => s.skuId === sku.id);
    if (stockEntry) {
      Object.assign(stockEntry, {
        skuCode: sku.skuCode,
        skuDescription: sku.skuDescription || sku.skuCode,
        size: sku.size,
        colorName: sku.colorName,
        colorHex: sku.colorHex,
        mainImageUrl: sku.mainImageUrl,
        costPriceNio: sku.costPriceNio,
        salePriceNio: sku.salePriceNio,
      });
    }
    this.saveToStorage();

    const opId = this.enqueue(A.upsertSku, sku, `Variante ${sku.skuCode}`);
    const res = await this.outcome(opId, `Variante ${sku.skuCode} (${sku.isActive ? 'activa' : 'inactiva'}) guardada.`, undefined, 5_000);
    return { success: res.success, message: res.message };
  }

  public async addSku(productId: string, skuData: Omit<ProductSku, 'id' | 'productId'>): Promise<{ success: boolean; sku?: ProductSku; message: string }> {
    const productIdx = this.products.findIndex(p => p.id === productId);
    if (productIdx === -1) return { success: false, message: 'Producto padre no encontrado.' };

    const skuCode = this.resolveSkuCode(skuData.skuCode, new Set(this.allSkuCodes()));
    const skuId = generateEntityId();
    const skuType: SkuType = skuData.skuType === 'paquete' ? 'paquete' : 'simple';
    this.skuTypes[skuId] = skuType;
    this.skuTypes[skuCode] = skuType;

    const bundleItems = skuType === 'paquete' && skuData.bundleItems
      ? skuData.bundleItems.map((bi) => ({
          ...bi,
          id: bi.id || generateEntityId(),
          bundleSkuId: skuId,
          quantityPerPack: Math.max(1, Number(bi.quantityPerPack) || 1),
        }))
      : [];

    const now = new Date().toISOString();
    const newSku: ProductSku = {
      ...skuData,
      skuCode,
      skuType,
      bundleItems,
      id: skuId,
      productId,
      createdAt: (skuData as any).createdAt || now,
      updatedAt: (skuData as any).updatedAt || now,
    };
    const targetProduct = this.products[productIdx];
    const updatedProducts = [...this.products];
    updatedProducts[productIdx] = { ...targetProduct, skus: [...(targetProduct.skus || []), newSku] };
    this.products = updatedProducts;
    this.ensureStockEntry(newSku.id, newSku.skuCode, targetProduct.name);
    this.saveToStorage();

    const opId = this.enqueue(A.upsertSku, newSku, `Nueva variante ${newSku.skuCode}`);
    const res = await this.outcome(opId, `Nueva variante "${newSku.skuCode}" creada.`, undefined, 5_000);
    return { success: res.success, sku: newSku, message: res.message };
  }

  public async deleteSku(skuId: string): Promise<{ success: boolean; message: string }> {
    let found = false;
    this.products = this.products.map(p => {
      if (!p.skus?.some(s => s.id === skuId)) return p;
      found = true;
      return { ...p, skus: p.skus.filter(s => s.id !== skuId) };
    });
    if (!found) return { success: false, message: 'SKU no encontrado.' };

    this.stock = this.stock.filter(s => s.skuId !== skuId);
    this.saveToStorage();
    const opId = this.enqueue(A.deleteSku, skuId, 'Eliminar variante');
    const res = await this.outcome(opId, 'Variante eliminada.', undefined, 5_000);
    return { success: res.success, message: res.message };
  }

  // ===========================================================================
  // COMPRAS, PRORRATEO Y RECEPCIONES
  // ===========================================================================
  public getNextOrderNumber(): string {
    return generateNextOrderNumber(this.purchaseOrders);
  }

  /** Indica si la orden aún no tiene mercadería recibida y por tanto se puede editar libremente */
  public canEditPurchaseOrder(order: PurchaseOrder): boolean {
    if (!order) return false;
    if (order.status === 'recibido_parcial' || order.status === 'recibido_completo') return false;
    return !(order.items || []).some((it) => (it.quantityReceived || 0) > 0);
  }

  public addPurchaseOrder(order: Omit<PurchaseOrder, 'id'>): PurchaseOrder {
    const orderNumber = (order.orderNumber || '').trim() || this.getNextOrderNumber();
    if (this.purchaseOrders.some(o => o.orderNumber.toLowerCase() === orderNumber.toLowerCase())) {
      throw new Error(`Ya existe una orden con el número ${orderNumber}.`);
    }
    const id = generateEntityId();
    const proratedItems = prorateExpenses(order.items || [], order.expenses || [], order.modality, order.prorationMethod || 'valor');

    const newOrder: PurchaseOrder = this.enrichOrder({
      ...order,
      id,
      orderNumber,
      exchangeRate: order.exchangeRate ?? this.exchangeRate,
      items: proratedItems.map(it => ({ ...it, id: it.id && isValidUuid(it.id) ? it.id : generateEntityId(), purchaseOrderId: id })),
      expenses: (order.expenses || []).map(exp => ({ ...exp, id: exp.id && isValidUuid(exp.id) ? exp.id : generateEntityId(), purchaseOrderId: id })),
      datePurchased: order.datePurchased || new Date().toISOString().split('T')[0],
      status: order.status || 'comprado',
    });

    this.purchaseOrders.unshift(newOrder);
    this.saveToStorage();
    this.enqueue(A.upsertPurchaseOrder, newOrder, `Orden de compra ${newOrder.orderNumber}`);
    return newOrder;
  }

  /**
   * Edita una orden de compra completa siempre que no se haya recibido mercadería todavía.
   * Recalcula costos base, gastos y prorrateo.
   */
  public updatePurchaseOrder(order: PurchaseOrder): PurchaseOrder {
    const idx = this.purchaseOrders.findIndex((o) => o.id === order.id);
    if (idx === -1) {
      throw new Error('Orden de compra no encontrada.');
    }
    const existing = this.purchaseOrders[idx];
    if (!this.canEditPurchaseOrder(existing)) {
      throw new Error('No se puede editar una orden que ya tiene mercadería recibida.');
    }
    const orderNumber = (order.orderNumber || '').trim() || existing.orderNumber;
    if (this.purchaseOrders.some((o) => o.id !== order.id && o.orderNumber.toLowerCase() === orderNumber.toLowerCase())) {
      throw new Error(`Ya existe otra orden con el número ${orderNumber}.`);
    }

    const rate = order.exchangeRate || existing.exchangeRate || this.exchangeRate;
    const normalizedItems: PurchaseItem[] = (order.items || []).map((it) => {
      const unitCostUsd = Number(it.unitCostUsd) || 0;
      const unitCostNio = Number((unitCostUsd * rate).toFixed(2));
      return {
        ...it,
        id: it.id && isValidUuid(it.id) ? it.id : generateEntityId(),
        purchaseOrderId: order.id,
        quantityOrdered: Math.max(1, Number(it.quantityOrdered) || 1),
        quantityReceived: 0,
        weightLbs: Number(it.weightLbs || 0),
        unitCostUsd,
        unitCostNio,
        receptionStatus: 'pendiente',
      };
    });

    const normalizedExpenses: ImportExpense[] = (order.expenses || []).map((exp) => ({
      ...exp,
      id: exp.id && isValidUuid(exp.id) ? exp.id : generateEntityId(),
      purchaseOrderId: order.id,
      amountUsd: Number(exp.amountUsd || 0),
      amountNio: Number(exp.amountNio || (Number(exp.amountUsd || 0) * rate).toFixed(2)),
    }));

    const proratedItems = prorateExpenses(
      normalizedItems,
      normalizedExpenses,
      order.modality,
      order.prorationMethod || 'valor'
    );

    const totalCostUsd = proratedItems.reduce((acc, it) => acc + it.unitCostUsd * it.quantityOrdered, 0);
    const totalCostNio = totalCostUsd * rate;
    const totalImportExpensesNio = normalizedExpenses.reduce((acc, exp) => acc + exp.amountNio, 0);

    const updatedOrder: PurchaseOrder = this.enrichOrder({
      ...existing,
      ...order,
      id: existing.id,
      orderNumber,
      exchangeRate: rate,
      totalCostUsd: Number(totalCostUsd.toFixed(2)),
      totalCostNio: Number(totalCostNio.toFixed(2)),
      totalImportExpensesNio: Number(totalImportExpensesNio.toFixed(2)),
      items: proratedItems,
      expenses: normalizedExpenses,
    });

    const nextOrders = [...this.purchaseOrders];
    nextOrders[idx] = updatedOrder;
    this.purchaseOrders = nextOrders;
    this.saveToStorage();
    this.enqueue(A.upsertPurchaseOrder, updatedOrder, `Editar orden ${updatedOrder.orderNumber}`);
    return updatedOrder;
  }

  /**
   * Actualiza método de prorrateo (valor o peso) y pesos por ítem antes o durante la recepción,
   * recalculando el costo landed prorrateado de inmediato.
   */
  public updateOrderProrationSettings(
    orderId: string,
    prorationMethod: 'valor' | 'peso',
    itemWeights?: Record<string, number>
  ): PurchaseOrder | null {
    const order = this.purchaseOrders.find((o) => o.id === orderId);
    if (!order) return null;
    order.prorationMethod = prorationMethod;
    const updatedItems = order.items.map((it) => ({
      ...it,
      weightLbs: itemWeights && itemWeights[it.id] !== undefined ? Number(itemWeights[it.id]) : it.weightLbs,
    }));
    order.items = this.reprorateOrderLocally(order, updatedItems);
    this.saveToStorage();
    this.enqueue(A.upsertPurchaseOrder, order, `Prorrateo de orden ${order.orderNumber}`);
    return order;
  }

  /** Elimina un gasto de flete/importación de una orden y recalcula el prorrateo */
  public removeExpenseFromOrder(orderId: string, expenseId: string): PurchaseOrder | null {
    const order = this.purchaseOrders.find((o) => o.id === orderId);
    if (!order) return null;
    order.expenses = (order.expenses || []).filter((e) => e.id !== expenseId);
    order.totalImportExpensesNio = order.expenses.reduce((acc, e) => acc + (e.amountNio || 0), 0);
    order.items = this.reprorateOrderLocally(order, order.items);
    this.saveToStorage();
    this.enqueue(A.upsertPurchaseOrder, order, `Actualizar gastos de ${order.orderNumber}`);
    return order;
  }

  /** Cambia el estado de seguimiento de una orden (antes de recibir mercadería) */
  public async updatePurchaseOrderStatus(orderId: string, status: PurchaseStatus): Promise<OperationResult> {
    const order = this.purchaseOrders.find(o => o.id === orderId);
    if (!order) return { success: false, message: 'Orden no encontrada.', sync: 'local' };
    if (!['comprado', 'en_agencia_envio', 'en_transito_nicaragua', 'cancelado'].includes(status)) {
      return { success: false, message: 'Los estados de recepción se asignan al recibir la mercadería.', sync: 'local' };
    }
    if (order.status === 'recibido_parcial' || order.status === 'recibido_completo') {
      return { success: false, message: 'La orden ya tiene mercadería recibida; su estado lo define la recepción.', sync: 'local' };
    }
    if (status === 'cancelado' && order.items.some(it => (it.quantityReceived || 0) > 0)) {
      return { success: false, message: 'No se puede cancelar: la orden ya tiene unidades recibidas.', sync: 'local' };
    }

    order.status = status;
    if (status === 'en_agencia_envio' && !order.dateDeliveredToAgency) {
      order.dateDeliveredToAgency = new Date().toISOString().split('T')[0];
    }
    this.saveToStorage();
    const opId = this.enqueue(A.estadoOrden, { p_order_id: orderId, p_status: status }, `Estado de orden ${order.orderNumber}`);
    return this.outcome(opId, `Orden ${order.orderNumber} actualizada.`);
  }

  /**
   * Aplica en local un nuevo prorrateo de la orden: ajusta el costo de las unidades de este
   * lote que siguen en bodega (si el costo landed cambió). Devuelve los ítems prorrateados.
   */
  private reprorateOrderLocally(order: PurchaseOrder, items: PurchaseItem[]): PurchaseItem[] {
    const previousLanded = new Map(order.items.map(it => [it.id, it.totalLandedCostNio || it.unitCostNio || 0]));
    const prorated = prorateExpenses(items, order.expenses || [], order.modality, order.prorationMethod || 'valor');
    prorated.forEach(it => {
      const received = it.quantityReceived || 0;
      if (received <= 0) return;
      const s = this.stock.find(st => st.skuId === it.skuId);
      const onHand = s?.quantityAvailable || 0;
      if (!s || onHand <= 0) return; // lo vendido ya registró su costo
      const delta = (it.totalLandedCostNio || 0) - (previousLanded.get(it.id) || 0);
      if (Math.abs(delta) < 0.005) return;
      const units = Math.min(received, onHand);
      this.setLocalSkuCost(it.skuId, (s.costPriceNio || 0) + (delta * units) / onHand);
    });
    return prorated;
  }

  public async addExpenseToOrder(orderId: string, expense: Omit<ImportExpense, 'id'>): Promise<OperationResult> {
    const order = this.purchaseOrders.find(p => p.id === orderId);
    if (!order) return { success: false, message: 'Orden no encontrada.', sync: 'local' };

    const newExpense: ImportExpense = { ...expense, id: generateEntityId(), purchaseOrderId: orderId };
    order.expenses = [...(order.expenses || []), newExpense];
    order.totalImportExpensesNio = order.expenses.reduce((acc, e) => acc + (e.amountNio || 0), 0);
    order.items = this.reprorateOrderLocally(order, order.items);
    this.saveToStorage();

    const opId = this.enqueue(A.gasto, {
      id: newExpense.id,
      purchase_order_id: orderId,
      concept: newExpense.concept,
      amount_usd: newExpense.amountUsd,
      amount_nio: newExpense.amountNio,
      notes: newExpense.notes,
      items: order.items.map(it => ({
        purchase_item_id: it.id,
        prorated_expense_nio: it.proratedExpenseNio,
        total_landed_cost_nio: it.totalLandedCostNio,
        suggested_sale_price_nio: it.suggestedSalePriceNio,
      })),
    }, `Gasto "${newExpense.concept}" en ${order.orderNumber}`, { orderId });
    return this.outcome(opId, `Gasto registrado y prorrateado en ${order.orderNumber}.`);
  }

  /**
   * Recepción completa o parcial. Cada línea indica cuántas unidades llegaron AHORA y,
   * opcionalmente, el estado del ítem (p. ej. "no_vino"). Se puede llamar varias veces.
   */
  public async receivePurchaseOrder(
    orderId: string,
    lines: { itemId: string; quantityNow: number; status?: ReceptionItemStatus }[],
    notes?: string
  ): Promise<OperationResult> {
    const order = this.purchaseOrders.find(p => p.id === orderId);
    if (!order) return { success: false, message: 'Orden no encontrada.', sync: 'local' };
    if (order.status === 'cancelado' || order.status === 'recibido_completo') {
      return { success: false, message: `La orden ${order.orderNumber} no admite más recepciones.`, sync: 'local' };
    }
    if (lines.some(l => l.quantityNow < 0)) {
      return { success: false, message: 'La cantidad recibida no puede ser negativa.', sync: 'local' };
    }

    const receptionId = generateEntityId();
    const opIdPlaceholder = generateEntityId(); // se reemplaza por el id real de la cola

    // 1) Nuevos estados y cantidades → nuevo prorrateo (lo que no vino no carga gastos)
    const updatedItems: PurchaseItem[] = order.items.map(it => {
      const line = lines.find(l => l.itemId === it.id);
      if (!line) return { ...it };
      const received = (it.quantityReceived || 0) + (line.quantityNow || 0);
      const status: ReceptionItemStatus = line.status
        ?? (received >= it.quantityOrdered ? 'recibido' : it.receptionStatus);
      return { ...it, quantityReceived: received, receptionStatus: status };
    });
    // El ajuste de costo de lo YA recibido usa las cantidades previas
    const prorated = this.reprorateOrderLocally(order, updatedItems.map(it => {
      const line = lines.find(l => l.itemId === it.id);
      return { ...it, quantityReceived: (it.quantityReceived || 0) - (line?.quantityNow || 0) };
    })).map(it => ({ ...it, quantityReceived: updatedItems.find(u => u.id === it.id)!.quantityReceived }));

    // 2) Ingreso de unidades al costo promedio ponderado + kardex provisional
    const movements: KardexMovement[] = [];
    prorated.forEach(it => {
      const line = lines.find(l => l.itemId === it.id);
      const qtyNow = line?.quantityNow || 0;
      if (qtyNow <= 0) return;
      const stockEntry = this.ensureStockEntry(it.skuId, it.skuCode, it.productName);
      const prev = stockEntry.quantityAvailable || 0;
      const landed = it.totalLandedCostNio || it.unitCostNio || 0;
      this.setLocalSkuCost(it.skuId, this.weightedCost(prev, stockEntry.costPriceNio || 0, qtyNow, landed));
      stockEntry.quantityAvailable = prev + qtyNow;
      movements.push(this.newMovement(it.skuId, 'compra_recepcion', qtyNow, prev, prev + qtyNow, order.id,
        `Recepción de orden ${order.orderNumber} (landed C$ ${landed.toFixed(2)})`, opIdPlaceholder));
    });

    order.items = prorated;
    const pendingItems = order.items.filter(it =>
      (it.quantityReceived || 0) < it.quantityOrdered && !['no_vino', 'devuelto', 'cancelado'].includes(it.receptionStatus));
    order.status = pendingItems.length === 0 ? 'recibido_completo' : 'recibido_parcial';
    order.dateReceivedNicaragua = order.dateReceivedNicaragua || new Date().toISOString().split('T')[0];

    const opId = this.enqueue(A.recepcion, {
      reception_id: receptionId,
      order_id: orderId,
      notes,
      items: order.items.map(it => {
        const line = lines.find(l => l.itemId === it.id);
        return {
          purchase_item_id: it.id,
          quantity_received_now: line?.quantityNow || 0,
          reception_status: line?.status,
          prorated_expense_nio: it.proratedExpenseNio,
          total_landed_cost_nio: it.totalLandedCostNio,
          suggested_sale_price_nio: it.suggestedSalePriceNio,
        };
      }),
    }, `Recepción de ${order.orderNumber}`, { orderId });

    movements.forEach(m => this.recordMovement({ ...m, syncOpId: opId || undefined }));
    this.saveToStorage();

    const units = lines.reduce((a, l) => a + (l.quantityNow || 0), 0);
    return this.outcome(opId, `Recepción registrada: ${units} unidad(es) ingresaron a bodega. Orden ${order.status === 'recibido_completo' ? 'completa' : 'con pendientes'}.`);
  }

  /**
   * Consulta bajo demanda las recepciones realizadas (órdenes recibidas completas o parciales).
   * Solo se ejecuta cuando el usuario solicita consultar el historial para no penalizar el rendimiento.
   */
  public async queryCompletedReceptionsOnDemand(params?: {
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    statusFilter?: 'todos' | 'recibido_completo' | 'recibido_parcial';
    limit?: number;
  }): Promise<{ orders: PurchaseOrder[]; source: 'cloud' | 'local' }> {
    const cloudOrders = await SupabaseService.fetchCompletedReceptionsOnDemand(params);
    const byId = new Map<string, PurchaseOrder>();

    // Primero incorporamos las órdenes locales ya recibidas (incluyendo recepciones pendientes de sincronizar)
    for (const localOrd of this.purchaseOrders) {
      const hasReceivedUnits = (localOrd.items || []).some((it) => (it.quantityReceived || 0) > 0);
      const isReceivedStatus =
        localOrd.status === 'recibido_completo' ||
        localOrd.status === 'recibido_parcial' ||
        hasReceivedUnits;
      if (isReceivedStatus) {
        byId.set(localOrd.id, this.enrichOrder(localOrd));
      }
    }

    // Luego fusionamos con los resultados frescos bajo demanda desde Supabase
    if (cloudOrders) {
      for (const remoteOrd of cloudOrders) {
        const local = this.purchaseOrders.find((o) => o.id === remoteOrd.id);
        const merged = this.enrichOrder({
          ...remoteOrd,
          items: remoteOrd.items?.length ? remoteOrd.items : local?.items || [],
          expenses: remoteOrd.expenses?.length ? remoteOrd.expenses : local?.expenses || [],
        });
        byId.set(merged.id, merged);
      }
    }

    let list = Array.from(byId.values());

    // Filtrar por estado
    if (params?.statusFilter && params.statusFilter !== 'todos') {
      list = list.filter((o) => o.status === params.statusFilter);
    }

    // Filtrar por rango de fecha de recepción (o fecha de compra como respaldo)
    if (params?.dateFrom) {
      list = list.filter((o) => (o.dateReceivedNicaragua || o.datePurchased || '') >= params.dateFrom!);
    }
    if (params?.dateTo) {
      list = list.filter((o) => (o.dateReceivedNicaragua || o.datePurchased || '') <= params.dateTo!);
    }

    // Filtrar por término de búsqueda (N° orden, proveedor, tracking o SKU)
    const q = (params?.search || '').trim().toLowerCase();
    if (q) {
      list = list.filter(
        (o) =>
          o.orderNumber.toLowerCase().includes(q) ||
          (o.supplierName || '').toLowerCase().includes(q) ||
          (o.trackingNumber || '').toLowerCase().includes(q) ||
          (o.items || []).some(
            (it) =>
              (it.skuCode || '').toLowerCase().includes(q) ||
              (it.productName || '').toLowerCase().includes(q)
          )
      );
    }

    // Ordenar por fecha de recepción más reciente
    list.sort((a, b) => {
      const dateA = a.dateReceivedNicaragua || a.updatedAt || a.datePurchased || '';
      const dateB = b.dateReceivedNicaragua || b.updatedAt || b.datePurchased || '';
      return dateB.localeCompare(dateA);
    });

    if (params?.limit && params.limit > 0) {
      list = list.slice(0, params.limit);
    }

    return {
      orders: list,
      source: cloudOrders ? 'cloud' : 'local',
    };
  }

  /**
   * Consulta bajo demanda los movimientos de Kardex (compra_recepcion) asociados a una orden recibida.
   */
  public async getReceptionMovementsByOrderOnDemand(orderId: string): Promise<KardexMovement[]> {
    const localMovs = this.kardex
      .filter((m) => m.referenceId === orderId && m.movementType === 'compra_recepcion')
      .map((m) => this.enrichMovement(m));

    const cloudMovs = await SupabaseService.fetchReceptionMovementsByOrder(orderId);
    if (!cloudMovs || cloudMovs.length === 0) {
      return localMovs;
    }

    const byId = new Map<string, KardexMovement>();
    for (const m of localMovs) byId.set(m.id, m);
    for (const m of cloudMovs) byId.set(m.id, this.enrichMovement(m));

    return Array.from(byId.values()).sort((a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || '')
    );
  }

  // ===========================================================================
  // INVENTARIO: DESPAQUETIZADO Y AJUSTES
  // ===========================================================================
  public async unbundlePack(request: UnbundleRequest): Promise<OperationResult> {
    const bundleStock = this.ensureStockEntry(request.bundleSkuId);
    const currBundleQty = this.getAvailableToSell(request.bundleSkuId);
    const bundleCostPriceNio = bundleStock.costPriceNio || this.findSku(request.bundleSkuId)?.sku.costPriceNio || 0;

    const unitStockMap: Record<string, number> = {};
    const unitPrices: Record<string, number> = {};
    request.targetUnitSkus.forEach(u => {
      unitStockMap[u.unitSkuId] = this.stock.find(s => s.skuId === u.unitSkuId)?.quantityAvailable || 0;
      unitPrices[u.unitSkuId] = this.findSku(u.unitSkuId)?.sku.salePriceNio || 0;
    });

    const result = executeUnbundlingCalculation(request, currBundleQty, unitStockMap, bundleCostPriceNio, unitPrices);
    if (!result.isValid) {
      return { success: false, message: result.error || 'Error al desempacar', sync: 'local' };
    }

    const opId = this.enqueue(A.desempaque, {
      id: generateEntityId(),
      bundle_sku_id: request.bundleSkuId,
      bundle_cost_nio: bundleCostPriceNio,
      packs: request.quantityPacksToUnbundle,
      notes: request.notes,
      targets: request.targetUnitSkus.map(u => ({
        unit_sku_id: u.unitSkuId,
        quantity: u.quantityToAdd,
        unit_cost_nio: result.allocatedCostBySku[u.unitSkuId] ?? result.allocatedUnitCostNio,
      })),
    }, `Desempaque de ${request.quantityPacksToUnbundle} paquete(s)`);

    const prevBundle = bundleStock.quantityAvailable;
    bundleStock.quantityAvailable = prevBundle - request.quantityPacksToUnbundle;
    this.recordMovement(this.newMovement(request.bundleSkuId, 'despaquetizado_salida_pack', -request.quantityPacksToUnbundle,
      prevBundle, bundleStock.quantityAvailable, request.bundleSkuId, result.bundleMovement.notes || 'Desempaque', opId));

    result.unitMovements.forEach(m => {
      const uStock = this.ensureStockEntry(m.skuId, m.skuCode, m.productName);
      const prevQty = uStock.quantityAvailable || 0;
      const allocated = result.allocatedCostBySku[m.skuId] ?? result.allocatedUnitCostNio;
      if (allocated > 0) {
        this.setLocalSkuCost(m.skuId, this.weightedCost(prevQty, uStock.costPriceNio || 0, m.quantity, allocated));
      }
      uStock.quantityAvailable = prevQty + m.quantity;
      this.recordMovement(this.newMovement(m.skuId, 'despaquetizado_entrada_unidad', m.quantity, prevQty,
        uStock.quantityAvailable, request.bundleSkuId, m.notes || 'Ingreso por desempaque', opId));
    });

    this.saveToStorage();
    return this.outcome(opId, 'Paquete desempacado; el costo se repartió según el precio de cada prenda.');
  }

  /** Ajuste manual de inventario (conteo, merma, regalía o entrada) con motivo obligatorio */
  public async adjustInventory(input: InventoryAdjustmentInput): Promise<OperationResult> {
    const motivo = (input.motivo || '').trim();
    if (!motivo) return { success: false, message: 'Indique el motivo del ajuste.', sync: 'local' };
    if (!Number.isInteger(input.cantidad) || input.cantidad < 0) {
      return { success: false, message: 'La cantidad debe ser un número entero positivo.', sync: 'local' };
    }

    const entry = this.ensureStockEntry(input.skuId);
    const prev = entry.quantityAvailable || 0;
    let delta: number;
    let type: MovementType;
    switch (input.tipo) {
      case 'conteo':
        delta = input.cantidad - prev;
        type = delta >= 0 ? 'ajuste_positivo' : 'ajuste_negativo';
        if (delta === 0) return { success: false, message: `La existencia contada coincide con la registrada (${prev}).`, sync: 'local' };
        break;
      case 'merma':
      case 'regalia':
        if (input.cantidad <= 0) return { success: false, message: 'La cantidad debe ser mayor que cero.', sync: 'local' };
        if (input.cantidad > prev) return { success: false, message: `Solo hay ${prev} unidades en existencia.`, sync: 'local' };
        delta = -input.cantidad;
        type = input.tipo === 'merma' ? 'ajuste_negativo' : 'regalia_promocion';
        break;
      case 'entrada':
        if (input.cantidad <= 0) return { success: false, message: 'La cantidad debe ser mayor que cero.', sync: 'local' };
        delta = input.cantidad;
        type = 'ajuste_positivo';
        break;
      default:
        return { success: false, message: 'Tipo de ajuste no válido.', sync: 'local' };
    }

    const adjustmentId = generateEntityId();
    const opId = this.enqueue(A.ajuste, {
      id: adjustmentId, sku_id: input.skuId, tipo: input.tipo, cantidad: input.cantidad, motivo,
    }, `Ajuste (${input.tipo}) de ${entry.skuCode}`);

    entry.quantityAvailable = prev + delta;
    this.recordMovement(this.newMovement(input.skuId, type, delta, prev, entry.quantityAvailable, adjustmentId,
      `Ajuste (${input.tipo}): ${motivo}`, opId));
    this.saveToStorage();

    const warning = entry.quantityAvailable < (entry.quantityReserved || 0)
      ? ` Atención: la existencia (${entry.quantityAvailable}) quedó por debajo de lo apartado (${entry.quantityReserved}).`
      : '';
    return this.outcome(opId, `Ajuste registrado: ${entry.skuCode} pasa de ${prev} a ${entry.quantityAvailable}.${warning}`);
  }

  // ===========================================================================
  // VENTAS, PAGOS, DESPACHOS, ANULACIONES Y DEVOLUCIONES
  // ===========================================================================

  /** Número provisional (si hay nube, el definitivo lo asigna la base al sincronizar) */
  private provisionalNumber(prefix: string, existing: string[]): string {
    if (this.cloudEnabled) {
      return `${prefix}PEND-${Date.now().toString(36).toUpperCase().slice(-5)}`;
    }
    let max = 0;
    existing.forEach((n) => {
      const m = (n || '').match(new RegExp(`^${prefix}(\\d+)$`));
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return `${prefix}${String(max + 1).padStart(5, '0')}`;
  }

  private nextReceiptNumber(): string {
    return this.provisionalNumber('REC-', this.invoices.flatMap(i => (i.payments || []).map(p => p.receiptNumber || '')));
  }

  /**
   * Registra una venta. Lanza un Error si es una venta inmediata ("normal") y no hay
   * existencia disponible suficiente (existencia física - apartados), si es de contado y no
   * se paga completa, o si el pago supera el total. Para vender sin existencia se usa la
   * modalidad "pedido", que aparta la mercadería.
   */
  public async addInvoice(
    invoice: Omit<SalesInvoice, 'id' | 'amountPaidNio' | 'balanceDueNio'>
  ): Promise<OperationResult<SalesInvoice>> {
    const resolvedCustomerId = invoice.customerId || WALK_IN_CUSTOMER_ID;
    const isWalkIn = resolvedCustomerId === WALK_IN_CUSTOMER_ID;
    if (isWalkIn && invoice.paymentTerm === 'credito') {
      throw new Error(
        'Para facturar sin datos de cliente (Cliente Invitado) la venta debe ser de Contado. Para Crédito seleccione o registre un cliente.'
      );
    }
    if (isWalkIn) {
      this.getWalkInCustomer();
    }

    const total = invoice.totalConIvaNio || invoice.totalNio;
    const paid = (invoice.payments || []).reduce((acc, p) => acc + (p.amountNio || 0), 0);

    if (paid > total + 0.01) {
      throw new Error(`El pago (C$ ${paid.toFixed(2)}) supera el total de la factura (C$ ${total.toFixed(2)}).`);
    }
    if (invoice.paymentTerm === 'contado' && paid + 0.01 < total) {
      throw new Error('Una venta de contado debe pagarse completa. Para pagar después, use "Crédito".');
    }
    if (invoice.saleType === 'normal') {
      const requested: Record<string, { qty: number; label: string }> = {};
      (invoice.items || []).forEach((item) => {
        const prev = requested[item.skuId];
        requested[item.skuId] = { qty: (prev?.qty || 0) + item.quantity, label: item.skuCode || item.productName || item.skuId };
      });
      const shortages = Object.entries(requested)
        .filter(([skuId, r]) => r.qty > this.getAvailableToSell(skuId))
        .map(([skuId, r]) => `${r.label} (pedido ${r.qty}, disponible ${this.getAvailableToSell(skuId)})`);
      if (shortages.length > 0) {
        throw new Error(`Existencia insuficiente para venta inmediata: ${shortages.join(', ')}.`);
      }
    }

    const id = generateEntityId();
    const invoiceNumber = this.provisionalNumber('FAC-', this.invoices.map(i => i.invoiceNumber));
    const initialPayments: InvoicePayment[] = (invoice.payments || [])
      .filter(p => (p.amountNio || 0) > 0)
      .map(p => ({
        ...p,
        id: p.id && isValidUuid(p.id) ? p.id : generateEntityId(),
        invoiceId: id,
        receiptNumber: this.nextReceiptNumber(),
      }));
    const balance = calculateInvoiceBalance(total, initialPayments);
    const isDispatched = invoice.saleType === 'normal';

    const newInvoice: SalesInvoice = {
      ...invoice,
      customerId: resolvedCustomerId,
      customerName: invoice.customerName || (isWalkIn ? WALK_IN_CUSTOMER.fullName : undefined),
      id,
      invoiceNumber,
      deliveryStatus: invoice.deliveryStatus || (invoice.saleType === 'pedido' ? 'pendiente' : 'entregado'),
      deliveryDate: invoice.deliveryStatus === 'entregado' ? (invoice.deliveryDate || new Date().toISOString().split('T')[0]) : undefined,
      totalConIvaNio: total,
      totalNio: total,
      amountPaidNio: balance.amountPaidNio,
      balanceDueNio: balance.balanceDueNio,
      status: balance.status,
      creditedNio: 0,
      exchangeRate: this.exchangeRate,
      dispatchedAt: isDispatched ? new Date().toISOString() : undefined,
      payments: initialPayments,
      createdAt: new Date().toISOString(),
    };

    const opId = this.enqueue(A.venta, this.buildSalePayload(newInvoice), `Venta a ${newInvoice.customerName || 'cliente'} (C$ ${total.toFixed(2)})`);
    newInvoice.syncOpId = opId || undefined;

    // Existencias: venta inmediata descuenta; pedido aparta
    const perSku = new Map<string, number>();
    (invoice.items || []).forEach(item => perSku.set(item.skuId, (perSku.get(item.skuId) || 0) + item.quantity));
    perSku.forEach((qty, skuId) => {
      const s = this.ensureStockEntry(skuId);
      const prev = s.quantityAvailable;
      if (invoice.saleType === 'normal') {
        s.quantityAvailable = prev - qty;
        this.recordMovement(this.newMovement(skuId, 'venta_factura', -qty, prev, s.quantityAvailable, id,
          `Venta factura ${invoiceNumber}`, opId));
      } else {
        s.quantityReserved = (s.quantityReserved || 0) + qty;
        this.recordMovement(this.newMovement(skuId, 'reserva', qty, prev, prev, id,
          `Apartado para pedido ${invoiceNumber}`, opId));
      }
    });

    this.invoices.unshift(this.enrichInvoice(newInvoice));
    this.saveToStorage();

    const res = await this.outcome(opId, `Factura emitida por C$ ${total.toFixed(2)}.`);
    return { ...res, data: this.invoices.find(i => i.id === id) };
  }

  /** Datos que recibe erp_registrar_venta (se usa al vender y al reenviar una factura atascada) */
  private buildSalePayload(inv: SalesInvoice) {
    const total = inv.totalConIvaNio || inv.totalNio;
    return {
      id: inv.id,
      customer_id: inv.customerId,
      sale_type: inv.saleType,
      payment_term: inv.paymentTerm,
      delivery_status: inv.deliveryStatus,
      delivery_date: inv.deliveryDate,
      tracking_ref: inv.trackingRef,
      issue_date: inv.issueDate,
      due_date: inv.dueDate,
      subtotal_sin_iva_nio: inv.subtotalSinIvaNio,
      subtotal_nio: inv.subtotalNio,
      discount_nio: inv.discountNio,
      iva_rate: inv.ivaRate ?? 0,
      iva_total_nio: inv.ivaTotalNio,
      total_con_iva_nio: total,
      total_nio: total,
      notes: inv.notes,
      exchange_rate: inv.exchangeRate ?? this.exchangeRate,
      items: (inv.items || []).map(it => ({
        id: it.id && isValidUuid(it.id) ? it.id : generateEntityId(),
        sku_id: it.skuId,
        quantity: it.quantity,
        regular_price_sin_iva_nio: it.regularPriceSinIvaNio,
        unit_price_sin_iva_nio: it.unitPriceSinIvaNio,
        promo_price_sin_iva_nio: it.promoPriceSinIvaNio,
        unit_price_nio: it.unitPriceNio,
        iva_amount_nio: it.ivaAmountNio,
        discount_nio: it.discountNio,
        line_total_sin_iva_nio: it.lineTotalSinIvaNio,
        line_total_con_iva_nio: it.lineTotalConIvaNio,
        line_total_nio: it.lineTotalNio,
      })),
      payments: (inv.payments || []).filter(p => (p.amountNio || 0) > 0).map(p => ({
        id: p.id,
        amount_nio: p.amountNio,
        amount_usd: p.amountUsd,
        exchange_rate_applied: p.exchangeRateApplied,
        payment_method: p.paymentMethod,
        reference_number: p.referenceNumber,
        notes: p.notes,
      })),
    };
  }

  /**
   * Botón "Sin sincronizar" de una factura: reintenta su envío y devuelve el motivo real si falla.
   *  - Si su cambio fue rechazado, se reintentan todos los rechazados en orden (cliente + venta).
   *  - Si la factura quedó marcada pero su cambio ya no está en la cola (huérfana), se reenvía:
   *    erp_registrar_venta es idempotente por id, así que no se duplica si ya existía.
   */
  public async retryInvoiceSync(invoiceId: string): Promise<OperationResult> {
    const inv = this.invoices.find((i) => i.id === invoiceId);
    if (!inv) return { success: false, message: 'Factura no encontrada.', sync: 'local' };
    if (!this.cloudEnabled) return { success: false, message: 'La nube no está configurada en este equipo.', sync: 'local' };
    if (!(await SupabaseService.isAuthenticated())) {
      return { success: false, message: 'No hay sesión iniciada: inicie sesión para subir la factura.', sync: 'pending' };
    }

    let opId = inv.syncOpId;
    if (!opId || !this.queue.hasOp(opId)) {
      opId = this.queue.enqueue(A.venta, this.buildSalePayload(inv), `Reenvío de ${inv.invoiceNumber}`);
      inv.syncOpId = opId;
      this.saveToStorage();
    } else {
      this.queue.retryFailed();
    }

    const res = await this.outcome(opId, `Factura ${inv.invoiceNumber} sincronizada.`, undefined, 15_000);
    if (res.sync === 'synced') await this.syncFromSupabase();
    return res;
  }

  public async updateInvoiceDeliveryStatus(
    invoiceId: string,
    deliveryStatus: DeliveryStatus,
    notes?: string,
    trackingRef?: string
  ): Promise<OperationResult> {
    const invoice = this.invoices.find(i => i.id === invoiceId);
    if (!invoice) return { success: false, message: 'Factura no encontrada.', sync: 'local' };
    if (invoice.status === 'anulada') return { success: false, message: `La factura ${invoice.invoiceNumber} está anulada.`, sync: 'local' };
    if (deliveryStatus === 'cancelado') {
      return { success: false, message: 'Para cancelar una venta use "Anular factura": así se devuelve o libera la mercadería.', sync: 'local' };
    }
    const alreadyDispatched = Boolean(invoice.dispatchedAt) || (invoice.saleType === 'normal');
    if (alreadyDispatched && deliveryStatus === 'pendiente') {
      return { success: false, message: 'La mercadería ya salió de bodega; no puede volver a "pendiente".', sync: 'local' };
    }

    const isDispatching = DISPATCH_STATUSES.includes(deliveryStatus) && !alreadyDispatched;
    const opId = this.cloudEnabled ? generateEntityId() : null; // placeholder para movimientos
    const pendingMovements: KardexMovement[] = [];

    if (isDispatching) {
      const missing: string[] = [];
      (invoice.items || []).forEach(item => {
        const s = this.stock.find(st => st.skuId === item.skuId);
        // existencia física sin tomar lo apartado para OTROS pedidos (su propia reserva sí cuenta)
        const reservedForOthers = Math.max(0, (s?.quantityReserved || 0) - item.quantity);
        const available = s ? Math.max(0, s.quantityAvailable - reservedForOthers) : 0;
        if (available < item.quantity) {
          missing.push(`${item.skuCode || item.productName} (requerido ${item.quantity}, disponible ${available})`);
        }
      });
      if (missing.length > 0) {
        return {
          success: false,
          message: `No se puede despachar ${invoice.invoiceNumber}: falta existencia de ${missing.join(', ')}. Reciba primero la mercadería.`,
          sync: 'local',
        };
      }
      (invoice.items || []).forEach(item => {
        const s = this.ensureStockEntry(item.skuId);
        const prev = s.quantityAvailable;
        s.quantityAvailable = prev - item.quantity;
        s.quantityReserved = Math.max(0, (s.quantityReserved || 0) - item.quantity);
        pendingMovements.push(this.newMovement(item.skuId, 'venta_factura', -item.quantity, prev, s.quantityAvailable,
          invoice.id, `Despacho de pedido ${invoice.invoiceNumber} (libera apartado)`, opId));
      });
      invoice.dispatchedAt = new Date().toISOString();
    }

    invoice.deliveryStatus = deliveryStatus;
    if (deliveryStatus === 'entregado' && !invoice.deliveryDate) {
      invoice.deliveryDate = new Date().toISOString().split('T')[0];
    }
    if (trackingRef) invoice.trackingRef = trackingRef;
    if (notes) invoice.notes = invoice.notes ? `${invoice.notes} | ${notes}` : notes;
    invoice.updatedAt = new Date().toISOString();

    const realOpId = this.enqueue(A.despacho, {
      p_invoice_id: invoiceId, p_delivery_status: deliveryStatus, p_notas: notes || null, p_tracking: trackingRef || null,
    }, `Entrega de ${invoice.invoiceNumber}: ${deliveryStatus}`);
    pendingMovements.forEach(m => this.recordMovement({ ...m, syncOpId: realOpId || undefined }));
    this.saveToStorage();

    return this.outcome(realOpId, `Estado de entrega de ${invoice.invoiceNumber} actualizado.`);
  }

  public async registerPayment(input: CreatePaymentInput): Promise<OperationResult> {
    const invoice = this.invoices.find(i => i.id === input.invoiceId);
    if (!invoice) return { success: false, message: 'Factura no encontrada.', sync: 'local' };
    if (invoice.status === 'anulada') {
      return { success: false, message: `La factura ${invoice.invoiceNumber} está anulada; no admite pagos.`, sync: 'local' };
    }
    if (!(input.amountNio > 0)) return { success: false, message: 'El monto debe ser mayor que cero.', sync: 'local' };
    if (input.amountNio > invoice.balanceDueNio + 0.01) {
      return {
        success: false,
        message: `El pago (C$ ${input.amountNio.toFixed(2)}) supera el saldo pendiente (C$ ${invoice.balanceDueNio.toFixed(2)}).`,
        sync: 'local',
      };
    }

    const payment: InvoicePayment = {
      id: generateEntityId(),
      invoiceId: input.invoiceId,
      paymentDate: new Date().toISOString(),
      amountNio: Number(input.amountNio.toFixed(2)),
      amountUsd: input.amountUsd,
      exchangeRateApplied: input.exchangeRateApplied,
      paymentMethod: input.paymentMethod,
      receiptNumber: this.nextReceiptNumber(),
      referenceNumber: input.referenceNumber,
      notes: input.notes,
      createdAt: new Date().toISOString(),
    };

    invoice.payments = [payment, ...(invoice.payments || [])];
    const balance = calculateInvoiceBalance(invoice.totalNio, invoice.payments, invoice.creditedNio || 0);
    invoice.amountPaidNio = balance.amountPaidNio;
    invoice.balanceDueNio = balance.balanceDueNio;
    invoice.status = balance.status;
    invoice.updatedAt = new Date().toISOString();
    this.saveToStorage();

    const opId = this.enqueue(A.pago, {
      id: payment.id,
      invoice_id: payment.invoiceId,
      amount_nio: payment.amountNio,
      amount_usd: payment.amountUsd,
      exchange_rate_applied: payment.exchangeRateApplied,
      payment_method: payment.paymentMethod,
      reference_number: payment.referenceNumber,
      notes: payment.notes,
    }, `Abono de C$ ${payment.amountNio.toFixed(2)} a ${invoice.invoiceNumber}`);

    return this.outcome(opId, `Abono de C$ ${payment.amountNio.toFixed(2)} registrado.`);
  }

  /** Anula una factura: devuelve la mercadería a bodega (o libera el apartado) y deja saldo 0 */
  public async voidInvoice(invoiceId: string, reason: string): Promise<OperationResult> {
    const invoice = this.invoices.find(i => i.id === invoiceId);
    if (!invoice) return { success: false, message: 'Factura no encontrada.', sync: 'local' };
    if (invoice.status === 'anulada') return { success: false, message: 'La factura ya está anulada.', sync: 'local' };
    const motivo = (reason || '').trim();
    if (!motivo) return { success: false, message: 'Indique el motivo de la anulación.', sync: 'local' };

    const dispatched = Boolean(invoice.dispatchedAt) || invoice.saleType === 'normal';
    const returned = this.returnedQuantities(invoice);
    const opId = this.enqueue(A.anulacion, { p_invoice_id: invoiceId, p_motivo: motivo }, `Anulación de ${invoice.invoiceNumber}`);

    const perSku = new Map<string, number>();
    (invoice.items || []).forEach(it => perSku.set(it.skuId, (perSku.get(it.skuId) || 0) + it.quantity));
    perSku.forEach((sold, skuId) => {
      const qty = sold - (returned.get(skuId) || 0);
      if (qty <= 0) return;
      const s = this.ensureStockEntry(skuId);
      const prev = s.quantityAvailable;
      if (dispatched) {
        s.quantityAvailable = prev + qty;
        this.recordMovement(this.newMovement(skuId, 'devolucion', qty, prev, s.quantityAvailable, invoice.id,
          `Anulación de factura ${invoice.invoiceNumber}: ${motivo}`, opId));
      } else {
        s.quantityReserved = Math.max(0, (s.quantityReserved || 0) - qty);
        this.recordMovement(this.newMovement(skuId, 'liberacion_reserva', -qty, prev, prev, invoice.id,
          `Anulación de pedido ${invoice.invoiceNumber}: ${motivo}`, opId));
      }
    });

    invoice.status = 'anulada';
    invoice.voidedAt = new Date().toISOString();
    invoice.voidReason = motivo;
    invoice.balanceDueNio = 0;
    if (invoice.deliveryStatus !== 'entregado') invoice.deliveryStatus = 'cancelado';
    invoice.updatedAt = new Date().toISOString();
    this.saveToStorage();

    const refund = invoice.amountPaidNio > 0
      ? ` El cliente había pagado C$ ${invoice.amountPaidNio.toFixed(2)}: corresponde reembolsarlo.`
      : '';
    return this.outcome(opId, `Factura ${invoice.invoiceNumber} anulada.${refund}`);
  }

  private returnedQuantities(invoice: SalesInvoice): Map<string, number> {
    const map = new Map<string, number>();
    (invoice.creditNotes || []).forEach(cn => (cn.items || []).forEach(ci =>
      map.set(ci.skuId, (map.get(ci.skuId) || 0) + ci.quantity)));
    return map;
  }

  /** Devolución parcial: genera una nota de crédito y reduce el saldo de la factura */
  public async registerReturn(input: ReturnInput): Promise<OperationResult<{ creditAmount: number; refundDue: number }>> {
    const invoice = this.invoices.find(i => i.id === input.invoiceId);
    if (!invoice) return { success: false, message: 'Factura no encontrada.', sync: 'local' };
    if (invoice.status === 'anulada') return { success: false, message: 'La factura está anulada.', sync: 'local' };
    const reason = (input.reason || '').trim();
    if (!reason) return { success: false, message: 'Indique el motivo de la devolución.', sync: 'local' };
    const dispatched = Boolean(invoice.dispatchedAt) || invoice.saleType === 'normal';
    if (!dispatched) {
      return { success: false, message: 'El pedido no ha salido de bodega: anúlelo en lugar de registrar una devolución.', sync: 'local' };
    }
    const lines = input.items.filter(l => l.quantity > 0);
    if (lines.length === 0) return { success: false, message: 'Indique las prendas devueltas.', sync: 'local' };

    const returned = this.returnedQuantities(invoice);
    let creditAmount = 0;
    const creditItems: CreditNote['items'] = [];
    for (const line of lines) {
      const soldLines = invoice.items.filter(it => it.skuId === line.skuId);
      const sold = soldLines.reduce((a, it) => a + it.quantity, 0);
      const already = returned.get(line.skuId) || 0;
      if (line.quantity > sold - already) {
        const code = soldLines[0]?.skuCode || line.skuId;
        return { success: false, message: `${code}: vendido ${sold}, ya devuelto ${already}; no se pueden devolver ${line.quantity}.`, sync: 'local' };
      }
      const lineTotal = soldLines.reduce((a, it) => a + (it.lineTotalNio || 0), 0);
      const amount = Number(((lineTotal / sold) * line.quantity).toFixed(2));
      creditAmount += amount;
      creditItems!.push({ skuId: line.skuId, quantity: line.quantity, amountNio: amount });
    }

    const creditId = generateEntityId();
    const opId = this.enqueue(A.devolucion, {
      id: creditId, invoice_id: invoice.id, reason, restock: input.restock,
      items: lines.map(l => ({ sku_id: l.skuId, quantity: l.quantity })),
    }, `Devolución en ${invoice.invoiceNumber} (C$ ${creditAmount.toFixed(2)})`);

    const creditNote: CreditNote = {
      id: creditId,
      creditNoteNumber: this.provisionalNumber('NC-', this.invoices.flatMap(i => (i.creditNotes || []).map(c => c.creditNoteNumber))),
      invoiceId: invoice.id,
      amountNio: Number(creditAmount.toFixed(2)),
      reason,
      restock: input.restock,
      items: creditItems,
      createdAt: new Date().toISOString(),
    };
    invoice.creditNotes = [...(invoice.creditNotes || []), creditNote];
    invoice.creditedNio = Number(((invoice.creditedNio || 0) + creditAmount).toFixed(2));
    const balance = calculateInvoiceBalance(invoice.totalNio, invoice.payments || [], invoice.creditedNio);
    invoice.amountPaidNio = balance.amountPaidNio;
    invoice.balanceDueNio = balance.balanceDueNio;
    invoice.status = balance.status;
    invoice.updatedAt = new Date().toISOString();

    if (input.restock) {
      lines.forEach(l => {
        const s = this.ensureStockEntry(l.skuId);
        const prev = s.quantityAvailable;
        s.quantityAvailable = prev + l.quantity;
        this.recordMovement(this.newMovement(l.skuId, 'devolucion', l.quantity, prev, s.quantityAvailable, invoice.id,
          `Devolución ${creditNote.creditNoteNumber} de factura ${invoice.invoiceNumber}: ${reason}`, opId));
      });
    }
    this.saveToStorage();

    const refundDue = Math.max(0, invoice.amountPaidNio - (invoice.totalNio - invoice.creditedNio));
    const refundText = refundDue > 0 ? ` Saldo a favor del cliente: C$ ${refundDue.toFixed(2)}.` : '';
    return this.outcome(opId, `Nota de crédito por C$ ${creditAmount.toFixed(2)} registrada.${refundText}`, { creditAmount, refundDue });
  }

  // ===========================================================================
  // CLIENTES
  // ===========================================================================
  /** Cliente genérico de mostrador; se crea en este equipo la primera vez que se usa */
  public getWalkInCustomer(): Customer {
    let walkIn = this.customers.find(c => c.id === WALK_IN_CUSTOMER_ID);
    if (!walkIn) {
      walkIn = { ...WALK_IN_CUSTOMER, createdAt: new Date().toISOString() };
      this.customers.push(walkIn);
      this.saveToStorage();
    }
    return walkIn;
  }

  public isWalkInCustomer(customerId?: string): boolean {
    return customerId === WALK_IN_CUSTOMER_ID;
  }

  /** Días de crédito por defecto al vender a crédito (Configuración) */
  public getDefaultCreditDays(): number {
    const days = Number(this.storeSettings.defaultCreditDays);
    return Number.isFinite(days) && days > 0 ? Math.round(days) : 30;
  }

  public async updateCustomer(customer: Customer): Promise<OperationResult> {
    const idx = this.customers.findIndex(c => c.id === customer.id);
    if (idx === -1) return { success: false, message: 'Cliente no encontrado.', sync: 'local' };
    if (!customer.fullName.trim()) return { success: false, message: 'El nombre es obligatorio.', sync: 'local' };
    const updated: Customer = { ...this.customers[idx], ...customer, fullName: customer.fullName.trim() };
    this.customers[idx] = updated;
    // Las facturas guardan una copia del nombre y teléfono para mostrarlos
    this.invoices = this.invoices.map(inv =>
      inv.customerId === updated.id
        ? { ...inv, customerName: updated.fullName, customerPhone: updated.phoneWhatsapp, customerAddress: updated.address, customerIdentification: updated.identificationNumber }
        : inv
    );
    this.saveToStorage();
    const opId = this.enqueue(A.upsertCustomer, updated, `Cliente "${updated.fullName}"`);
    return this.outcome(opId, `Cliente "${updated.fullName}" actualizado.`, undefined, 5_000);
  }

  public addCustomer(customer: Omit<Customer, 'id'>): Customer {
    const newCust: Customer = {
      ...customer,
      id: generateEntityId(),
      createdAt: new Date().toISOString(),
    };
    this.customers.unshift(newCust);
    this.saveToStorage();
    this.enqueue(A.upsertCustomer, newCust, `Cliente "${newCust.fullName}"`);
    return newCust;
  }
}

export const dataStore = new AppDataStore();
export type { SyncOp, SyncState } from '../sync/syncQueue';
export { CloudError };
