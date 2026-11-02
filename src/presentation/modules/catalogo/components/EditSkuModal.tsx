'use client';

import React, { useState, useEffect } from 'react';
import { Copy, Check, Plus, AlertCircle, Layers } from 'lucide-react';
import { Modal } from '@/presentation/components/ui/Modal';
import { Product, ProductSku, SkuType, SkuBundleItem } from '@/domain/catalog/types';
import { dataStore } from '@/infrastructure/repositories/dataStore';
import { useToast } from '@/presentation/components/ui/Toast';
import { SkuDescriptionOverride } from './SkuDescriptionOverride';
import { SkuBundleConfig } from './SkuBundleConfig';

interface EditSkuModalProps {
  isOpen: boolean;
  onClose: () => void;
  sku: ProductSku | null;
  productName?: string;
  product?: Product | null;
  onSelectSku?: (sku: ProductSku) => void;
  onOpenCreateSku?: (product: Product) => void;
}

const COMMON_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', 'Única'];
const PRESET_COLORS = [
  { name: 'Negro', hex: '#1E293B' },
  { name: 'Blanco', hex: '#F8FAFC' },
  { name: 'Rosa Pastel', hex: '#F472B6' },
  { name: 'Rojo Carmesí', hex: '#EF4444' },
  { name: 'Azul Real', hex: '#2563EB' },
  { name: 'Verde Esmeralda', hex: '#10B981' },
  { name: 'Beige / Nude', hex: '#F5E6D3' },
  { name: 'Dorado / Amarillo', hex: '#FBBF24' },
];

export function EditSkuModal({
  isOpen,
  onClose,
  sku,
  productName,
  product,
  onSelectSku,
  onOpenCreateSku,
}: EditSkuModalProps) {
  const toast = useToast();
  const exchangeRate = dataStore.getExchangeRate();

  const [skuType, setSkuType] = useState<SkuType>('simple');
  const [bundleItems, setBundleItems] = useState<SkuBundleItem[]>([]);
  const [skuCode, setSkuCode] = useState('');
  const [skuDescription, setSkuDescription] = useState('');
  const [descriptionHtml, setDescriptionHtml] = useState('');
  const [size, setSize] = useState('M');
  const [colorName, setColorName] = useState('');
  const [colorHex, setColorHex] = useState('#38BDF8');
  const [costPriceUsd, setCostPriceUsd] = useState<number>(0);
  const [costPriceNio, setCostPriceNio] = useState<number>(0);
  const [salePriceNio, setSalePriceNio] = useState<number>(0);
  const [promoPriceNio, setPromoPriceNio] = useState<string>('');
  const [mainImageUrl, setMainImageUrl] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedProductId, setCopiedProductId] = useState(false);
  const [copiedSkuId, setCopiedSkuId] = useState(false);

  useEffect(() => {
    if (sku) {
      setSkuCode(sku.skuCode || '');
      setSkuType(dataStore.resolveSkuType(sku, product || undefined));
      setBundleItems(sku.bundleItems ? [...sku.bundleItems] : []);
      setSkuDescription(sku.skuDescription || '');
      setDescriptionHtml(sku.descriptionHtml || '');
      setSize(sku.size || 'M');
      setColorName(sku.colorName || '');
      setColorHex(sku.colorHex || '#38BDF8');
      setCostPriceUsd(sku.costPriceUsd || 0);
      setCostPriceNio(sku.costPriceNio || 0);
      setSalePriceNio(sku.salePriceNio || 0);
      setPromoPriceNio(sku.promoPriceNio ? String(sku.promoPriceNio) : '');
      setMainImageUrl(sku.mainImageUrl || '');
      setIsActive(sku.isActive ?? true);
    }
  }, [sku, product]);

  const handleCostUsdChange = (val: number) => {
    setCostPriceUsd(val);
    setCostPriceNio(Number((val * exchangeRate).toFixed(2)));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sku) return;
    if (!skuCode.trim()) {
      toast.error('El código SKU es obligatorio.');
      return;
    }

    const updatedSku: ProductSku = {
      ...sku,
      skuCode: skuCode.trim(),
      skuType,
      bundleItems: skuType === 'paquete' ? bundleItems : [],
      skuDescription: skuDescription.trim() || `${product?.name || productName || 'Producto'} - ${size} ${colorName}`.trim(),
      size,
      colorName: colorName.trim(),
      colorHex,
      costPriceUsd: Number(costPriceUsd) || 0,
      costPriceNio: Number(costPriceNio) || 0,
      salePriceNio: Number(salePriceNio) || 0,
      promoPriceNio: promoPriceNio ? Number(promoPriceNio) : undefined,
      mainImageUrl: mainImageUrl.trim(),
      descriptionHtml: descriptionHtml || undefined,
      isActive,
    };

    setIsSaving(true);
    try {
      const res = await dataStore.updateSku(updatedSku);

      if (res.success) {
        toast.success(res.message, 'SKU Actualizado');
        onClose();
      } else {
        toast.error(res.message, 'Error al actualizar');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error al conectar con la base de datos');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = (text: string, type: 'prod' | 'sku') => {
    navigator.clipboard.writeText(text);
    if (type === 'prod') {
      setCopiedProductId(true);
      toast.info('Código de Producto copiado');
      setTimeout(() => setCopiedProductId(false), 2000);
    } else {
      setCopiedSkuId(true);
      toast.info('ID de Variante SKU copiado');
      setTimeout(() => setCopiedSkuId(false), 2000);
    }
  };

  const associatedSkus = product?.skus || [];

  if (!sku) return null;

  const productCodeDisplay = product?.productCode || 'PRD-XXXXX';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Editar Variante SKU: ${sku.skuCode}`}
      subtitle={`Producto: ${product?.name || productName || 'General'} (${productCodeDisplay})`}
      maxWidth="2xl"
    >
      <div className="space-y-5 text-ink">
        {/* Banner de Identificadores (Código de Producto PRD-XXXXX y SKU ID) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 bg-surface-soft rounded-xl border border-moss/15 text-xs">
          {/* Código de Producto Padre */}
          <div className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-moss/20">
            <div className="min-w-0 pr-2">
              <span className="block text-[10px] uppercase tracking-wider font-bold text-moss">
                Código Producto Padre (Catálogo)
              </span>
              <span
                className="font-mono text-sm font-extrabold text-moss truncate block mt-0.5 select-all"
                title={product?.productCode || 'No asignado'}
              >
                {product?.productCode || 'PRD-PENDIENTE'}
              </span>
            </div>
            {product?.productCode && (
              <button
                type="button"
                onClick={() => handleCopy(product.productCode!, 'prod')}
                className="flex items-center gap-1 px-2 py-1 bg-moss/10 hover:bg-moss text-moss hover:text-white rounded-lg text-xs font-bold transition-all shrink-0"
                title="Copiar Código de Producto"
              >
                {copiedProductId ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Código / ID de Variante SKU */}
          <div className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-moss/20">
            <div className="min-w-0 pr-2">
              <span className="block text-[10px] uppercase tracking-wider font-bold text-ink-muted">
                Código de Variante SKU
              </span>
              <span className="font-mono text-xs font-bold text-ink truncate block mt-0.5 select-all" title={sku.skuCode}>
                {sku.skuCode}
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleCopy(sku.skuCode, 'sku')}
              className="p-1.5 hover:bg-surface rounded text-ink-muted hover:text-moss transition-colors shrink-0"
              title="Copiar Código SKU"
            >
              {copiedSkuId ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Variantes Asociadas de este Producto */}
        {product && associatedSkus.length > 0 && (
          <div className="p-3 bg-white rounded-xl border border-moss/15 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-moss" />
                <span className="text-xs font-bold text-ink">
                  Variantes Asociadas a este Producto ({associatedSkus.length})
                </span>
              </div>
              {onOpenCreateSku && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenCreateSku(product);
                  }}
                  className="flex items-center gap-1 text-[11px] font-bold text-moss hover:text-moss-700 hover:underline"
                >
                  <Plus className="w-3 h-3 text-mustard" />
                  + Nuevo SKU
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto custom-scrollbar pt-1">
              {associatedSkus.map((s) => {
                const isCurrent = s.id === sku.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      if (!isCurrent && onSelectSku) {
                        onSelectSku(s);
                      }
                    }}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all border ${
                      isCurrent
                        ? 'bg-moss text-white border-moss shadow-xs'
                        : 'bg-surface-soft text-ink border-moss/15 hover:bg-surface'
                    } ${!s.isActive ? 'opacity-55' : ''}`}
                    title={`${s.skuCode} - ${s.size} ${s.colorName} (${s.isActive ? 'Activo' : 'Inactivo'})`}
                  >
                    {s.colorHex && (
                      <span
                        className="w-2.5 h-2.5 rounded-full border border-black/20 shrink-0"
                        style={{ backgroundColor: s.colorHex }}
                      />
                    )}
                    <span>{s.size || 'U'}</span>
                    <span className="font-mono text-[10px] opacity-80">{s.skuCode}</span>
                    {isCurrent && <span className="text-[10px]">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-5">
        {/* Row 0: Tipo de Variante SKU (Simple vs Paquete/Bundle) */}
        <div className="p-3 bg-surface-soft/80 rounded-xl border border-moss/15 space-y-1.5">
          <label className="block text-xs font-bold text-ink">
            Tipo de Variante SKU ({sku.skuCode})
          </label>
          <p className="text-[11px] text-ink-muted leading-tight">
            Define si esta variante SKU específica es una pieza individual o un paquete multipieza desempacable en inventario.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => setSkuType('simple')}
              className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all border text-left ${
                skuType === 'simple'
                  ? 'bg-sky-950 text-sky-200 border-sky-400/40 shadow-sm'
                  : 'bg-white text-ink-muted border-moss/15 hover:bg-surface hover:text-ink'
              }`}
            >
              <span>Simple (Unidad individual)</span>
              {skuType === 'simple' && <span className="text-[11px]">✓</span>}
            </button>

            <button
              type="button"
              onClick={() => setSkuType('paquete')}
              className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all border text-left ${
                skuType === 'paquete'
                  ? 'bg-purple-950 text-purple-200 border-purple-400/40 shadow-sm'
                  : 'bg-white text-ink-muted border-moss/15 hover:bg-surface hover:text-ink'
              }`}
            >
              <span>Paquete / Pack (Desempacable)</span>
              {skuType === 'paquete' && <span className="text-[11px]">✓</span>}
            </button>
          </div>
        </div>

        {/* Configuración de Contenido y Unidades del Pack */}
        {skuType === 'paquete' && (product?.id || sku.productId) && (
          <SkuBundleConfig
            productId={product?.id || sku.productId}
            currentSkuId={sku.id}
            currentSkuCode={skuCode}
            bundleItems={bundleItems}
            onChange={setBundleItems}
          />
        )}

        {/* Row 1: Code & Description */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-ink-muted mb-1">
              Código SKU <span className="text-moss font-semibold">(no editable)</span>
            </label>
            <input
              type="text"
              readOnly
              value={skuCode}
              className="w-full bg-surface-soft border border-moss/20 rounded-xl px-3 py-2 text-xs font-mono font-bold text-moss cursor-default focus:outline-none"
              title="El código correlativo SKU-00000 lo asigna el sistema"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-ink-muted mb-1">
              Descripción de Variante
            </label>
            <input
              type="text"
              value={skuDescription}
              onChange={(e) => setSkuDescription(e.target.value)}
              className="w-full bg-white border border-moss/20 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-moss"
              placeholder="Ej. Blusa Seda - Talla M Roja"
            />
          </div>
        </div>

        {/* Row 2: Size & Color */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 bg-surface-soft/60 rounded-xl border border-moss/10">
          <div>
            <label className="block text-xs font-bold text-ink-muted mb-1.5">Talla</label>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_SIZES.map((sz) => (
                <button
                  type="button"
                  key={sz}
                  onClick={() => setSize(sz)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    size === sz
                      ? 'bg-moss text-white shadow-sm'
                      : 'bg-white border border-moss/15 text-ink hover:bg-surface'
                  }`}
                >
                  {sz}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-ink-muted mb-1.5">Color & Muestra HEX</label>
            <div className="flex items-center gap-2 mb-2">
              <input
                type="color"
                value={colorHex}
                onChange={(e) => setColorHex(e.target.value)}
                className="w-8 h-8 rounded-lg border border-moss/20 cursor-pointer p-0.5"
                title="Elegir color exacto"
              />
              <input
                type="text"
                value={colorName}
                onChange={(e) => setColorName(e.target.value)}
                className="flex-1 bg-white border border-moss/20 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-moss"
                placeholder="Nombre (ej. Rosa Pastel)"
              />
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {PRESET_COLORS.map((pc) => (
                <button
                  key={pc.name}
                  type="button"
                  onClick={() => {
                    setColorName(pc.name);
                    setColorHex(pc.hex);
                  }}
                  className="w-5 h-5 rounded-full border border-black/10 shadow-xs hover:scale-110 transition-transform"
                  style={{ backgroundColor: pc.hex }}
                  title={pc.name}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Row 3: Prices & Costs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-ink-muted mb-1">Costo Base (USD)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={costPriceUsd}
              onChange={(e) => handleCostUsdChange(parseFloat(e.target.value) || 0)}
              className="w-full bg-white border border-moss/20 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-moss"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-ink-muted mb-1">Costo Landed (NIO)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={costPriceNio}
              onChange={(e) => setCostPriceNio(parseFloat(e.target.value) || 0)}
              className="w-full bg-white border border-moss/20 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-moss"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-ink-muted mb-1">
              Precio Venta (C$) <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              value={salePriceNio}
              onChange={(e) => setSalePriceNio(parseFloat(e.target.value) || 0)}
              className="w-full bg-white border border-moss/20 rounded-xl px-3 py-2 text-xs font-bold text-moss focus:outline-none focus:ring-1 focus:ring-moss"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-ink-muted mb-1">Precio Oferta (C$)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={promoPriceNio}
              onChange={(e) => setPromoPriceNio(e.target.value)}
              className="w-full bg-white border border-moss/20 rounded-xl px-3 py-2 text-xs text-amber-700 font-semibold focus:outline-none focus:ring-1 focus:ring-moss"
              placeholder="Opcional"
            />
          </div>
        </div>

        {/* Descripción para la web: hereda la del producto salvo que se personalice */}
        <div>
          <label className="block text-xs font-bold text-ink-muted mb-1">Descripción para la web</label>
          <SkuDescriptionOverride
            value={descriptionHtml}
            onChange={setDescriptionHtml}
            productHtml={product?.descriptionHtml}
            productName={product?.name || productName}
          />
        </div>

        {/* Row 4: Image & Status */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-ink-muted mb-1">URL Foto Principal</label>
            <input
              type="url"
              value={mainImageUrl}
              onChange={(e) => setMainImageUrl(e.target.value)}
              className="w-full bg-white border border-moss/20 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-moss"
              placeholder="https://images.unsplash.com/..."
            />
          </div>

          <div className="pt-5">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4 h-4 text-moss rounded focus:ring-moss cursor-pointer"
              />
              <span className="text-xs font-bold text-ink">SKU Activo para Venta</span>
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-moss/10">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-ink-muted hover:text-ink hover:bg-surface rounded-xl transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className={`px-5 py-2 text-xs font-bold text-white rounded-xl shadow-md transition-all flex items-center gap-2 ${
              isSaving ? 'bg-moss/70 cursor-not-allowed' : 'bg-moss hover:bg-moss-700'
            }`}
          >
            {isSaving ? (
              <>
                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Guardando…</span>
              </>
            ) : (
              <span>Guardar Cambios</span>
            )}
          </button>
        </div>
      </form>
    </div>
  </Modal>
  );
}
