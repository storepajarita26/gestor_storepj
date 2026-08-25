import { Category, Product, ProductSku } from '@/domain/catalog/types';
import { PurchaseOrder, PurchaseItem, ImportExpense } from '@/domain/procurement/types';
import { StockLevel, KardexMovement, UnbundleRequest } from '@/domain/inventory/types';
import { Customer, SalesInvoice, InvoicePayment, CreatePaymentInput } from '@/domain/sales/types';
import { prorateExpenses } from '@/domain/procurement/services/prorationService';
import { executeUnbundlingCalculation } from '@/domain/inventory/services/unbundlingService';
import { calculateInvoiceBalance } from '@/domain/sales/services/invoicingService';
import {
  INITIAL_CATEGORIES,
  INITIAL_CUSTOMERS,
  INITIAL_INVOICES,
  INITIAL_PRODUCTS,
  INITIAL_PURCHASE_ORDERS,
  INITIAL_STOCK,
} from './mockSeedData';

class AppDataStore {
  private categories: Category[] = [];
  private products: Product[] = [];
  private purchaseOrders: PurchaseOrder[] = [];
  private customers: Customer[] = [];
  private invoices: SalesInvoice[] = [];
  private stock: StockLevel[] = [];
  private kardex: KardexMovement[] = [];
  private exchangeRate: number = 36.80;
  private listeners: Set<() => void> = new Set();
  private isInitialized = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.loadFromStorage();
    } else {
      this.initDefaults();
    }
  }

  private initDefaults() {
    this.categories = [...INITIAL_CATEGORIES];
    this.products = [...INITIAL_PRODUCTS];
    this.purchaseOrders = [...INITIAL_PURCHASE_ORDERS];
    this.customers = [...INITIAL_CUSTOMERS];
    this.invoices = [...INITIAL_INVOICES];
    this.stock = [...INITIAL_STOCK];
    this.isInitialized = true;
  }

  private saveToStorage() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('ps_categories', JSON.stringify(this.categories));
      localStorage.setItem('ps_products', JSON.stringify(this.products));
      localStorage.setItem('ps_purchases', JSON.stringify(this.purchaseOrders));
      localStorage.setItem('ps_customers', JSON.stringify(this.customers));
      localStorage.setItem('ps_invoices', JSON.stringify(this.invoices));
      localStorage.setItem('ps_stock', JSON.stringify(this.stock));
      localStorage.setItem('ps_kardex', JSON.stringify(this.kardex));
      localStorage.setItem('ps_exchange_rate', JSON.stringify(this.exchangeRate));
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
    this.notify();
  }

  private loadFromStorage() {
    try {
      const storedCats = localStorage.getItem('ps_categories');
      const storedProds = localStorage.getItem('ps_products');
      const storedPurchases = localStorage.getItem('ps_purchases');
      const storedCusts = localStorage.getItem('ps_customers');
      const storedInvs = localStorage.getItem('ps_invoices');
      const storedStock = localStorage.getItem('ps_stock');
      const storedKardex = localStorage.getItem('ps_kardex');
      const storedRate = localStorage.getItem('ps_exchange_rate');

      this.categories = storedCats ? JSON.parse(storedCats) : [...INITIAL_CATEGORIES];
      this.products = storedProds ? JSON.parse(storedProds) : [...INITIAL_PRODUCTS];
      this.purchaseOrders = storedPurchases ? JSON.parse(storedPurchases) : [...INITIAL_PURCHASE_ORDERS];
      this.customers = storedCusts ? JSON.parse(storedCusts) : [...INITIAL_CUSTOMERS];
      this.invoices = storedInvs ? JSON.parse(storedInvs) : [...INITIAL_INVOICES];
      this.stock = storedStock ? JSON.parse(storedStock) : [...INITIAL_STOCK];
      this.kardex = storedKardex ? JSON.parse(storedKardex) : [];
      this.exchangeRate = storedRate ? JSON.parse(storedRate) : 36.80;
    } catch {
      this.initDefaults();
    }
    this.isInitialized = true;
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

  // --- GETTERS GENERALES ---
  public getCategories(): Category[] { return this.categories; }
  public getProducts(): Product[] { return this.products; }
  public getAllSkus(): ProductSku[] {
    return this.products.flatMap(p => p.skus || []);
  }
  public getPurchaseOrders(): PurchaseOrder[] { return this.purchaseOrders; }
  public getCustomers(): Customer[] { return this.customers; }
  public getInvoices(): SalesInvoice[] { return this.invoices; }
  public getStock(): StockLevel[] { return this.stock; }
  public getKardex(): KardexMovement[] { return this.kardex; }
  public getExchangeRate(): number { return this.exchangeRate; }

  // --- CATEGORIES CRUD (2 NIVELES) ---
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
    const id = cat.parentId ? `sub-${Date.now()}` : `cat-${Date.now()}`;
    const parent = cat.parentId ? this.categories.find(c => c.id === cat.parentId) : undefined;
    const newCategory: Category = {
      ...cat,
      id,
      parentName: parent?.name,
      slug: cat.slug || cat.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
    };
    this.categories.push(newCategory);
    this.saveToStorage();
    return newCategory;
  }

  public updateCategory(cat: Category) {
    const idx = this.categories.findIndex(c => c.id === cat.id);
    if (idx !== -1) {
      this.categories[idx] = cat;
      this.saveToStorage();
    }
  }

  public deleteCategory(id: string) {
    // Eliminar la categoría y sus subcategorías si es padre
    this.categories = this.categories.filter(c => c.id !== id && c.parentId !== id);
    this.saveToStorage();
  }

  // --- RATE ---
  public setExchangeRate(rate: number) {
    this.exchangeRate = rate;
    this.saveToStorage();
  }

  // --- CATALOG CRUD ---
  public addProduct(product: Omit<Product, 'id'>): Product {
    const id = `prod-${Date.now()}`;
    const newProduct: Product = {
      ...product,
      id,
      skus: (product.skus || []).map((s, idx) => ({
        ...s,
        id: `sku-${Date.now()}-${idx}`,
        productId: id,
      })),
    };
    this.products.unshift(newProduct);
    
    // Add default stock records
    newProduct.skus.forEach(sku => {
      this.stock.push({
        skuId: sku.id,
        skuCode: sku.skuCode,
        productName: newProduct.name,
        skuDescription: sku.skuDescription,
        size: sku.size,
        colorName: sku.colorName,
        colorHex: sku.colorHex,
        costPriceNio: sku.costPriceNio,
        salePriceNio: sku.salePriceNio,
        quantityAvailable: 0,
        quantityReserved: 0,
      });
    });

    this.saveToStorage();
    return newProduct;
  }

  public updateProduct(product: Product) {
    const idx = this.products.findIndex(p => p.id === product.id);
    if (idx !== -1) {
      this.products[idx] = product;
      this.saveToStorage();
    }
  }

  public deleteProduct(id: string) {
    this.products = this.products.filter(p => p.id !== id);
    this.saveToStorage();
  }

  // --- PURCHASES & PRORRATION ---
  public addPurchaseOrder(order: Omit<PurchaseOrder, 'id'>): PurchaseOrder {
    const id = `po-${Date.now()}`;
    const proratedItems = prorateExpenses(order.items || [], order.expenses || [], order.modality);
    
    const newOrder: PurchaseOrder = {
      ...order,
      id,
      items: proratedItems.map(it => ({ ...it, id: it.id || `pi-${Date.now()}-${Math.random()}` })),
      datePurchased: order.datePurchased || new Date().toISOString().split('T')[0],
      status: order.status || 'comprado',
    };

    this.purchaseOrders.unshift(newOrder);
    this.saveToStorage();
    return newOrder;
  }

  public updatePurchaseOrder(order: PurchaseOrder) {
    const proratedItems = prorateExpenses(order.items || [], order.expenses || [], order.modality);
    const updatedOrder = { ...order, items: proratedItems };
    const idx = this.purchaseOrders.findIndex(p => p.id === order.id);
    if (idx !== -1) {
      this.purchaseOrders[idx] = updatedOrder;
      this.saveToStorage();
    }
  }

  public addExpenseToOrder(orderId: string, expense: Omit<ImportExpense, 'id'>) {
    const order = this.purchaseOrders.find(p => p.id === orderId);
    if (!order) return;

    const newExpense: ImportExpense = {
      ...expense,
      id: `exp-${Date.now()}-${Math.random().toString().slice(2, 6)}`,
      purchaseOrderId: orderId,
    };

    order.expenses = [...(order.expenses || []), newExpense];
    order.totalImportExpensesNio = order.expenses.reduce((acc, e) => acc + (e.amountNio || 0), 0);

    // Recalcular prorrateo automático
    order.items = prorateExpenses(order.items, order.expenses, order.modality);

    // Actualizar costo landed en stock si ya fue recibido
    if (order.status === 'recibido_completo' || order.status === 'recibido_parcial') {
      order.items.forEach(it => {
        const s = this.stock.find(st => st.skuId === it.skuId);
        if (s && it.totalLandedCostNio > 0) {
          s.costPriceNio = it.totalLandedCostNio;
        }
      });
    }

    this.saveToStorage();
  }

  public receivePurchaseOrder(orderId: string, receivedItems: { skuId: string; quantityReceived: number; status: any }[]) {
    const order = this.purchaseOrders.find(p => p.id === orderId);
    if (!order) return;

    receivedItems.forEach(rcv => {
      const item = order.items.find(i => i.skuId === rcv.skuId);
      if (item) {
        item.quantityReceived = rcv.quantityReceived;
        item.receptionStatus = rcv.status;

        if (rcv.status === 'recibido' && rcv.quantityReceived > 0) {
          // Aumentar inventario físico
          const stockEntry = this.stock.find(s => s.skuId === rcv.skuId);
          const prev = stockEntry ? stockEntry.quantityAvailable : 0;
          const newQty = prev + rcv.quantityReceived;
          if (stockEntry) {
            stockEntry.quantityAvailable = newQty;
            stockEntry.costPriceNio = item.totalLandedCostNio || stockEntry.costPriceNio;
          }
          // Registrar Kardex
          this.kardex.unshift({
            id: `kdx-${Date.now()}-${Math.random()}`,
            skuId: rcv.skuId,
            skuCode: item.skuCode,
            productName: item.productName,
            movementType: 'compra_recepcion',
            quantity: rcv.quantityReceived,
            previousStock: prev,
            newStock: newQty,
            referenceId: order.id,
            notes: `Recepción de orden ${order.orderNumber}`,
            createdAt: new Date().toISOString(),
          });
        }
      }
    });

    order.status = 'recibido_completo';
    order.dateReceivedNicaragua = new Date().toISOString().split('T')[0];
    this.saveToStorage();
  }

  // --- UNBUNDLING ---
  public unbundlePack(request: UnbundleRequest): { success: boolean; message: string } {
    const bundleStock = this.stock.find(s => s.skuId === request.bundleSkuId);
    const currBundleQty = bundleStock ? bundleStock.quantityAvailable : 0;

    const unitStockMap: Record<string, number> = {};
    request.targetUnitSkus.forEach(u => {
      const uStock = this.stock.find(s => s.skuId === u.unitSkuId);
      unitStockMap[u.unitSkuId] = uStock ? uStock.quantityAvailable : 0;
    });

    const result = executeUnbundlingCalculation(request, currBundleQty, unitStockMap);
    if (!result.isValid) {
      return { success: false, message: result.error || 'Error al desempacar' };
    }

    // Update bundle stock
    if (bundleStock) {
      bundleStock.quantityAvailable = result.bundleMovement.newStock;
    }
    this.kardex.unshift({
      ...result.bundleMovement,
      id: `kdx-${Date.now()}-pack`,
      createdAt: new Date().toISOString(),
    });

    // Update units stock
    result.unitMovements.forEach(m => {
      const uStock = this.stock.find(s => s.skuId === m.skuId);
      if (uStock) {
        uStock.quantityAvailable = m.newStock;
      }
      this.kardex.unshift({
        ...m,
        id: `kdx-${Date.now()}-${m.skuId}`,
        createdAt: new Date().toISOString(),
      });
    });

    this.saveToStorage();
    return { success: true, message: 'Paquete transformado a unidades exitosamente.' };
  }

  // --- INVOICES & PAYMENTS ---
  public addInvoice(invoice: Omit<SalesInvoice, 'id' | 'amountPaidNio' | 'balanceDueNio'>): SalesInvoice {
    const id = `inv-${Date.now()}`;
    const initialPayments = invoice.payments || [];
    const totalToBalance = invoice.totalConIvaNio || invoice.totalNio;
    const balance = calculateInvoiceBalance(totalToBalance, initialPayments);

    const newInvoice: SalesInvoice = {
      ...invoice,
      id,
      totalConIvaNio: totalToBalance,
      totalNio: totalToBalance,
      amountPaidNio: balance.amountPaidNio,
      balanceDueNio: balance.balanceDueNio,
      status: balance.status,
      payments: initialPayments,
    };

    // Descontar inventario por venta
    (invoice.items || []).forEach(item => {
      const s = this.stock.find(st => st.skuId === item.skuId);
      if (s) {
        const prev = s.quantityAvailable;
        s.quantityAvailable = Math.max(0, s.quantityAvailable - item.quantity);
        this.kardex.unshift({
          id: `kdx-sale-${Date.now()}`,
          skuId: item.skuId,
          skuCode: item.skuCode,
          productName: item.productName,
          movementType: 'venta_factura',
          quantity: -item.quantity,
          previousStock: prev,
          newStock: s.quantityAvailable,
          referenceId: id,
          notes: `Venta factura ${invoice.invoiceNumber}`,
          createdAt: new Date().toISOString(),
        });
      }
    });

    this.invoices.unshift(newInvoice);
    this.saveToStorage();
    return newInvoice;
  }

  public registerPayment(input: CreatePaymentInput): { success: boolean; message: string } {
    const invoice = this.invoices.find(i => i.id === input.invoiceId);
    if (!invoice) return { success: false, message: 'Factura no encontrada.' };

    const payment: InvoicePayment = {
      id: `pay-${Date.now()}`,
      invoiceId: input.invoiceId,
      paymentDate: new Date().toISOString(),
      amountNio: input.amountNio,
      amountUsd: input.amountUsd,
      paymentMethod: input.paymentMethod,
      receiptNumber: input.receiptNumber || `REC-${Date.now().toString().slice(-4)}`,
      referenceNumber: input.referenceNumber,
      notes: input.notes,
      createdAt: new Date().toISOString(),
    };

    invoice.payments.unshift(payment);
    const balance = calculateInvoiceBalance(invoice.totalNio, invoice.payments);
    invoice.amountPaidNio = balance.amountPaidNio;
    invoice.balanceDueNio = balance.balanceDueNio;
    invoice.status = balance.status;
    invoice.updatedAt = new Date().toISOString();

    this.saveToStorage();
    return { success: true, message: 'Abono registrado con éxito.' };
  }

  public addCustomer(customer: Omit<Customer, 'id'>): Customer {
    const newCust: Customer = {
      ...customer,
      id: `cust-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    this.customers.unshift(newCust);
    this.saveToStorage();
    return newCust;
  }
}

export const dataStore = new AppDataStore();
