import {
  ProductInquiry,
  CreateInquiryInput,
  UpdateInquiryInput,
  ProductInquiryStatus,
  ProductInquiryPlatform,
} from '@/domain/productInquiries/types';
import {
  calculateTotalCost,
  calculateEstimatedSalePrice,
  detectPlatformFromUrl,
  extractSkuFromUrl,
} from '@/domain/productInquiries/services/inquiryCalculator';
import { supabase, isSupabaseConfigured } from '@/infrastructure/supabase/client';
import { SupabaseService } from '@/infrastructure/supabase/supabaseSyncService';

const STORAGE_KEY = 'ps_product_inquiries';

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function isValidUuid(id?: string): boolean {
  if (!id) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

interface ProductInquiryRow {
  id: string;
  customer_name: string;
  customer_phone?: string | null;
  platform: string;
  product_url: string;
  product_title?: string | null;
  sku_id: string;
  price_usd: number;
  shipping_cost_usd: number;
  total_cost_usd: number;
  estimated_sale_price_usd: number;
  final_sale_price_nio: number;
  final_sale_price_usd: number;
  notes?: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

function mapRowToInquiry(row: ProductInquiryRow): ProductInquiry {
  return {
    id: row.id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone || undefined,
    platform: (row.platform as ProductInquiryPlatform) || 'otro',
    productUrl: row.product_url,
    productTitle: row.product_title || undefined,
    skuId: row.sku_id || 'SIN-SKU',
    priceUsd: Number(row.price_usd) || 0,
    shippingCostUsd: Number(row.shipping_cost_usd) || 0,
    totalCostUsd: Number(row.total_cost_usd) || 0,
    estimatedSalePriceUsd: Number(row.estimated_sale_price_usd) || 0,
    finalSalePriceNio: Number(row.final_sale_price_nio) || 0,
    finalSalePriceUsd: Number(row.final_sale_price_usd) || 0,
    notes: row.notes || undefined,
    status: (row.status as ProductInquiryStatus) || 'pendiente',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapInquiryToRow(item: ProductInquiry): ProductInquiryRow {
  return {
    id: item.id,
    customer_name: item.customerName,
    customer_phone: item.customerPhone || null,
    platform: item.platform,
    product_url: item.productUrl,
    product_title: item.productTitle || null,
    sku_id: item.skuId,
    price_usd: item.priceUsd,
    shipping_cost_usd: item.shippingCostUsd,
    total_cost_usd: item.totalCostUsd,
    estimated_sale_price_usd: item.estimatedSalePriceUsd,
    final_sale_price_nio: item.finalSalePriceNio,
    final_sale_price_usd: item.finalSalePriceUsd,
    notes: item.notes || null,
    status: item.status,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}

const INITIAL_MOCK_INQUIRIES: ProductInquiry[] = [
  {
    id: 'a0000000-0000-4000-8000-000000000001',
    customerName: 'Valeria Mendoza',
    customerPhone: '+505 8899 1234',
    platform: 'shein',
    productUrl: 'https://us.shein.com/Floral-Print-Tie-Front-Dress-p-18492041.html',
    productTitle: 'Vestido Floral Tie Front Casual',
    skuId: '18492041',
    priceUsd: 14.50,
    shippingCostUsd: 2.50,
    totalCostUsd: 17.00,
    estimatedSalePriceUsd: 21.25,
    finalSalePriceNio: 810.00,
    finalSalePriceUsd: 22.01,
    notes: 'Talla M - Color Azul Marino con flores blancas',
    status: 'cotizado',
    createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 3).toISOString(),
  },
  {
    id: 'a0000000-0000-4000-8000-000000000002',
    customerName: 'Sofia Castillo',
    customerPhone: '+505 8432 5678',
    platform: 'shein',
    productUrl: 'https://us.shein.com/High-Waist-Straight-Leg-Jeans-p-24901834.html',
    productTitle: 'Jeans Tiro Alto Recto Denim Clásico',
    skuId: '24901834',
    priceUsd: 22.00,
    shippingCostUsd: 3.00,
    totalCostUsd: 25.00,
    estimatedSalePriceUsd: 31.25,
    finalSalePriceNio: 1180.00,
    finalSalePriceUsd: 32.07,
    notes: 'Talla L - Consultó si le llega antes del 15 del mes',
    status: 'pendiente',
    createdAt: new Date(Date.now() - 3600000 * 18).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 18).toISOString(),
  },
  {
    id: 'a0000000-0000-4000-8000-000000000003',
    customerName: 'Ana Lucía Morales',
    customerPhone: '+505 8123 9900',
    platform: 'amazon',
    productUrl: 'https://www.amazon.com/dp/B08N5WRWNW',
    productTitle: 'Bolso Cruzado de Cuero Sintético Minimalista',
    skuId: 'B08N5WRWNW',
    priceUsd: 28.99,
    shippingCostUsd: 4.50,
    totalCostUsd: 33.49,
    estimatedSalePriceUsd: 41.86,
    finalSalePriceNio: 1550.00,
    finalSalePriceUsd: 42.12,
    notes: 'Color Beige / Crema - Ya confirmó que lo quiere pedir',
    status: 'aceptado',
    createdAt: new Date(Date.now() - 3600000 * 48).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 24).toISOString(),
  },
];

class InquiryStore {
  private inquiries: ProductInquiry[] = [];
  private listeners: Set<() => void> = new Set();
  private initialized = false;
  private isSyncingWithCloud = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.load();
      if (SupabaseService.isConnected()) {
        this.syncFromSupabase();
      }
    }
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.inquiries = parsed.map((item: any) => ({
            ...item,
            id: isValidUuid(item.id) ? item.id : generateUuid(),
            finalSalePriceNio:
              item.finalSalePriceNio !== undefined
                ? Number(item.finalSalePriceNio)
                : Number(((item.finalSalePriceUsd || 0) * 36.80).toFixed(2)),
          }));
          this.initialized = true;
          return;
        }
      }
      this.inquiries = INITIAL_MOCK_INQUIRIES;
      this.save();
      this.initialized = true;
    } catch (e) {
      console.warn('Error loading inquiries from localStorage:', e);
      this.inquiries = INITIAL_MOCK_INQUIRIES;
      this.initialized = true;
    }
  }

  private save(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.inquiries));
    } catch (e) {
      console.error('Error saving inquiries to localStorage:', e);
    }
  }

  private notify(): void {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        console.error('InquiryStore listener error:', e);
      }
    });
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public async syncFromSupabase(): Promise<void> {
    if (!SupabaseService.isConnected() || !supabase || this.isSyncingWithCloud) return;
    this.isSyncingWithCloud = true;

    try {
      const { data, error } = await supabase
        .from('product_inquiries')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        // Si la tabla aún no se ha creado en Supabase (ej. falta ejecutar la migración), no bloquea la app
        console.info('Supabase product_inquiries info:', error.message);
        return;
      }

      if (data && Array.isArray(data)) {
        if (data.length > 0) {
          const cloudInquiries = (data as ProductInquiryRow[]).map(mapRowToInquiry);
          // Mezclar: tomar los de la nube y mantener cualquier local pendiente si aplica
          this.inquiries = cloudInquiries;
          this.save();
          this.notify();
        }
      }
    } catch (e) {
      console.warn('Excepción al sincronizar product_inquiries con Supabase:', e);
    } finally {
      this.isSyncingWithCloud = false;
    }
  }

  public getAll(): ProductInquiry[] {
    if (!this.initialized && typeof window !== 'undefined') {
      this.load();
    }
    return [...this.inquiries];
  }

  public getById(id: string): ProductInquiry | undefined {
    return this.inquiries.find((item) => item.id === id);
  }

  public create(input: CreateInquiryInput): ProductInquiry {
    if (!this.initialized && typeof window !== 'undefined') {
      this.load();
    }

    const priceUsd = Number(input.priceUsd) || 0;
    const shippingCostUsd = Number(input.shippingCostUsd) || 0;
    const totalCostUsd = calculateTotalCost(priceUsd, shippingCostUsd);
    const estimatedSalePriceUsd = calculateEstimatedSalePrice(totalCostUsd);

    const platform = input.platform || detectPlatformFromUrl(input.productUrl);
    const skuId = input.skuId?.trim() || extractSkuFromUrl(input.productUrl) || 'SIN-SKU';

    const rate = input.exchangeRate && input.exchangeRate > 0 ? input.exchangeRate : 36.80;

    let finalSalePriceNio: number;
    let finalSalePriceUsd: number;

    if (
      input.finalSalePriceNio !== undefined &&
      !isNaN(Number(input.finalSalePriceNio)) &&
      Number(input.finalSalePriceNio) > 0
    ) {
      finalSalePriceNio = Number(input.finalSalePriceNio);
      finalSalePriceUsd = Number((finalSalePriceNio / rate).toFixed(2));
    } else if (
      input.finalSalePriceUsd !== undefined &&
      !isNaN(Number(input.finalSalePriceUsd)) &&
      Number(input.finalSalePriceUsd) > 0
    ) {
      finalSalePriceUsd = Number(input.finalSalePriceUsd);
      finalSalePriceNio = Number((finalSalePriceUsd * rate).toFixed(2));
    } else {
      finalSalePriceUsd = estimatedSalePriceUsd;
      finalSalePriceNio = Number((estimatedSalePriceUsd * rate).toFixed(2));
    }

    const now = new Date().toISOString();

    const newInquiry: ProductInquiry = {
      id: generateUuid(),
      customerName: input.customerName.trim(),
      customerPhone: input.customerPhone?.trim(),
      platform,
      productUrl: input.productUrl.trim(),
      productTitle: input.productTitle?.trim() || undefined,
      skuId,
      priceUsd,
      shippingCostUsd,
      totalCostUsd,
      estimatedSalePriceUsd,
      finalSalePriceNio,
      finalSalePriceUsd,
      notes: input.notes?.trim() || undefined,
      status: input.status || 'pendiente',
      createdAt: now,
      updatedAt: now,
    };

    this.inquiries.unshift(newInquiry);
    this.save();
    this.notify();

    // Sincronizar hacia Supabase de forma asíncrona
    if (SupabaseService.isConnected() && supabase) {
      const row = mapInquiryToRow(newInquiry);
      supabase
        .from('product_inquiries')
        .insert([row])
        .then(
          ({ error }) => {
            if (error) {
              console.warn('Error al enviar consulta a Supabase (se mantiene local):', error.message);
            }
          },
          (err: unknown) => {
            console.warn('Fallo de red al enviar consulta a Supabase:', err);
          }
        );
    }

    return newInquiry;
  }

  public update(id: string, input: UpdateInquiryInput): ProductInquiry {
    if (!this.initialized && typeof window !== 'undefined') {
      this.load();
    }

    const index = this.inquiries.findIndex((item) => item.id === id);
    if (index === -1) {
      throw new Error(`Consulta con id ${id} no encontrada`);
    }

    const current = this.inquiries[index];

    const priceUsd = input.priceUsd !== undefined ? Number(input.priceUsd) : current.priceUsd;
    const shippingCostUsd =
      input.shippingCostUsd !== undefined ? Number(input.shippingCostUsd) : current.shippingCostUsd;
    const totalCostUsd = calculateTotalCost(priceUsd, shippingCostUsd);
    const estimatedSalePriceUsd = calculateEstimatedSalePrice(totalCostUsd);

    const productUrl = input.productUrl !== undefined ? input.productUrl.trim() : current.productUrl;
    const platform =
      input.platform || (input.productUrl ? detectPlatformFromUrl(input.productUrl) : current.platform);

    const skuId =
      input.skuId !== undefined
        ? input.skuId.trim()
        : input.productUrl
        ? extractSkuFromUrl(input.productUrl) || current.skuId
        : current.skuId;

    const rate = input.exchangeRate && input.exchangeRate > 0 ? input.exchangeRate : 36.80;

    let finalSalePriceNio =
      current.finalSalePriceNio !== undefined
        ? current.finalSalePriceNio
        : Number(((current.finalSalePriceUsd || 0) * rate).toFixed(2));
    let finalSalePriceUsd = current.finalSalePriceUsd;

    if (input.finalSalePriceNio !== undefined && !isNaN(Number(input.finalSalePriceNio))) {
      finalSalePriceNio = Number(input.finalSalePriceNio);
      finalSalePriceUsd = rate > 0 ? Number((finalSalePriceNio / rate).toFixed(2)) : 0;
    } else if (input.finalSalePriceUsd !== undefined && !isNaN(Number(input.finalSalePriceUsd))) {
      finalSalePriceUsd = Number(input.finalSalePriceUsd);
      finalSalePriceNio = Number((finalSalePriceUsd * rate).toFixed(2));
    }

    const updated: ProductInquiry = {
      ...current,
      customerName: input.customerName !== undefined ? input.customerName.trim() : current.customerName,
      customerPhone: input.customerPhone !== undefined ? input.customerPhone?.trim() : current.customerPhone,
      platform,
      productUrl,
      productTitle: input.productTitle !== undefined ? input.productTitle?.trim() : current.productTitle,
      skuId: skuId || 'SIN-SKU',
      priceUsd,
      shippingCostUsd,
      totalCostUsd,
      estimatedSalePriceUsd,
      finalSalePriceNio,
      finalSalePriceUsd,
      notes: input.notes !== undefined ? input.notes?.trim() : current.notes,
      status: input.status !== undefined ? input.status : current.status,
      updatedAt: new Date().toISOString(),
    };

    this.inquiries[index] = updated;
    this.save();
    this.notify();

    // Sincronizar actualización hacia Supabase
    if (SupabaseService.isConnected() && supabase) {
      const row = mapInquiryToRow(updated);
      supabase
        .from('product_inquiries')
        .update(row)
        .eq('id', id)
        .then(
          ({ error }) => {
            if (error) {
              console.warn('Error al actualizar consulta en Supabase:', error.message);
            }
          },
          (err: unknown) => {
            console.warn('Fallo de red al actualizar en Supabase:', err);
          }
        );
    }

    return updated;
  }

  public updateStatus(id: string, status: ProductInquiryStatus): boolean {
    const item = this.getById(id);
    if (!item) return false;
    this.update(id, { status });
    return true;
  }

  public delete(id: string): boolean {
    if (!this.initialized && typeof window !== 'undefined') {
      this.load();
    }

    const initialLength = this.inquiries.length;
    this.inquiries = this.inquiries.filter((item) => item.id !== id);

    if (this.inquiries.length !== initialLength) {
      this.save();
      this.notify();

      // Sincronizar eliminación hacia Supabase
      if (SupabaseService.isConnected() && supabase) {
        supabase
          .from('product_inquiries')
          .delete()
          .eq('id', id)
          .then(
            ({ error }) => {
              if (error) {
                console.warn('Error al eliminar consulta en Supabase:', error.message);
              }
            },
            (err: unknown) => {
              console.warn('Fallo de red al eliminar en Supabase:', err);
            }
          );
      }

      return true;
    }
    return false;
  }
}

export const inquiryStore = new InquiryStore();
