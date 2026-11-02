'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Copy, Check, AlertCircle, Search, ChevronDown, X } from 'lucide-react';
import { Modal } from '@/presentation/components/ui/Modal';
import { Product, ProductSku, SkuType, SkuBundleItem } from '@/domain/catalog/types';
import { dataStore } from '@/infrastructure/repositories/dataStore';
import { SkuDescriptionOverride } from './SkuDescriptionOverride';
import { SkuBundleConfig } from './SkuBundleConfig';
import { formatNIO, formatUSD } from '@/domain/shared/utils/currencyFormatter';
import { useToast } from '@/presentation/components/ui/Toast';

interface CreateSkuModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  defaultProductId?: string;
  onSkuCreated?: (newSku: ProductSku, product: Product) => void;
}

const COMMON_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', 'Única'];
const PRESET_COLORS = [
  { name: 'Negro', hex: '#000000' },
  { name: 'Blanco', hex: '#FFFFFF' },
  { name: 'Rojo', hex: '#EF4444' },
  { name: 'Azul Marino', hex: '#1E3A8A' },
  { name: 'Rosa Pastel', hex: '#F472B6' },
  { name: 'Beige / Crema', hex: '#F5EBE0' },
  { name: 'Verde Oliva', hex: '#3F6212' },
  { name: 'Gris Melange', hex: '#9CA3AF' },
];

export function CreateSkuModal({
  isOpen,
  onClose,
  products,
  defaultProductId,
  onSkuCreated,
}: CreateSkuModalProps) {
  const toast = useToast();
  const exchangeRate = dataStore.getExchangeRate();

  const [selectedProductId, setSelectedProductId] = useState(defaultProductId || products[0]?.id || '');
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [skuCode, setSkuCode] = useState('');
  const [skuType, setSkuType] = useState<SkuType>('simple');
  const [bundleItems, setBundleItems] = useState<SkuBundleItem[]>([]);
  const [skuDescription, setSkuDescription] = useState('');
  const [descriptionHtml, setDescriptionHtml] = useState('');
  // true cuando el usuario escribió la descripción a mano: ya no se reemplaza automáticamente
  const [descTouched, setDescTouched] = useState(false);
  const [size, setSize] = useState('M');
  const [customSize, setCustomSize] = useState('');
  const [colorName, setColorName] = useState('Negro');
  const [colorHex, setColorHex] = useState('#000000');
  const [costPriceUsd, setCostPriceUsd] = useState<number>(0);
  const [costPriceNio, setCostPriceNio] = useState<number>(0);
  const [salePriceNio, setSalePriceNio] = useState<number>(0);
  const [promoPriceNio, setPromoPriceNio] = useState<string>('');
  const [mainImageUrl, setMainImageUrl] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  const selectedProduct = products.find((p) => p.id === selectedProductId) || products[0];

  // Cerrar dropdown si se hace clic afuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsProductDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Lista de productos filtrados para búsqueda rápida
  const filteredProducts = useMemo(() => {
    if (!productSearchTerm.trim()) return products;
    const query = productSearchTerm.toLowerCase();
    return products.filter((p) => {
      const nameMatch = p.name.toLowerCase().includes(query);
      const codeMatch = (p.productCode || '').toLowerCase().includes(query);
      const catMatch = (p.categoryName || '').toLowerCase().includes(query);
      return nameMatch || codeMatch || catMatch;
    });
  }, [products, productSearchTerm]);

  useEffect(() => {
    if (defaultProductId) {
      setSelectedProductId(defaultProductId);
    } else if (products.length > 0 && !selectedProductId) {
      setSelectedProductId(products[0].id);
    }
  }, [defaultProductId, products]);

  // El código SKU es correlativo (SKU-00000) y lo asigna el sistema al abrir el formulario
  useEffect(() => {
    if (isOpen) {
      setSkuCode(dataStore.getNextSkuCode());
      setSkuType('simple');
      setBundleItems([]);
      setDescTouched(false);
      setDescriptionHtml('');
    }
  }, [isOpen]);

  // Descripción sugerida (producto - talla color) mientras el usuario no la haya escrito a mano
  useEffect(() => {
    if (selectedProduct && isOpen && !descTouched) {
      const activeSize = customSize.trim() || size;
      setSkuDescription(`${selectedProduct.name} - ${activeSize} ${colorName}`.trim());
    }
  }, [selectedProductId, selectedProduct?.name, size, customSize, colorName, isOpen, descTouched]);

  const handleCopyProductId = () => {
    const codeToCopy = selectedProduct?.productCode || selectedProduct?.id;
    if (codeToCopy) {
      navigator.clipboard.writeText(codeToCopy);
      setCopiedId(true);
      toast.info('Código de Producto copiado al portapapeles');
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const handleCostUsdChange = (val: number) => {
    setCostPriceUsd(val);
    setCostPriceNio(Number((val * exchangeRate).toFixed(2)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) {
      toast.error('Debes seleccionar un producto para vincular el SKU.');
      return;
    }
    if (!skuCode.trim()) {
      toast.error('El código SKU es obligatorio.');
      return;
    }

    const finalSize = customSize.trim() || size;
    const finalDesc = skuDescription.trim() || `${selectedProduct.name} - ${finalSize} ${colorName}`.trim();

    setIsSaving(true);
    try {
      const res = await dataStore.addSku(selectedProduct.id, {
        skuCode: skuCode.trim().toUpperCase(),
        skuType,
        bundleItems: skuType === 'paquete' ? bundleItems : undefined,
        skuDescription: finalDesc,
        size: finalSize,
        colorName: colorName.trim(),
        colorHex,
        costPriceUsd: Number(costPriceUsd) || 0,
        costPriceNio: Number(costPriceNio) || 0,
        salePriceNio: Number(salePriceNio) || 0,
        promoPriceNio: promoPriceNio ? Number(promoPriceNio) : undefined,
        mainImageUrl: mainImageUrl.trim() || selectedProduct.skus?.[0]?.mainImageUrl || '',
        descriptionHtml: descriptionHtml || undefined,
        isActive,
      });

      if (res.success && res.sku) {
        toast.success(res.message, 'SKU Creado');
        if (onSkuCreated) {
          onSkuCreated(res.sku, selectedProduct);
        }
        onClose();
      } else {
        toast.error(res.message, 'Error al crear SKU');
      }
    } catch (err: any) {
      toast.error(err.message || 'No se pudo guardar la variante.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Nuevo SKU / Variante de Inventario"
      subtitle="Crea y asocia una nueva talla, color o presentación a un producto existente"
      maxWidth="2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-ink">
        {/* Selector de Producto y Visualización de ID */}
        <div className="p-3 bg-surface-soft rounded-xl border border-moss/15 space-y-2">
          <label className="block text-xs font-bold text-ink-muted">
            Producto Padre al que pertenece el SKU <span className="text-rose-500">*</span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Buscador & Selector Desplegable de Producto */}
            <div className="relative" ref={dropdownRef}>
              <div
                onClick={() => setIsProductDropdownOpen((prev) => !prev)}
                className="w-full bg-white border border-moss/20 hover:border-moss/40 rounded-xl px-3 py-2 text-xs font-bold text-ink cursor-pointer flex items-center justify-between shadow-2xs transition-all"
              >
                <div className="flex items-center gap-2 truncate pr-1">
                  {selectedProduct?.productCode && (
                    <span className="font-mono text-[10px] font-extrabold text-moss bg-moss/10 px-1.5 py-0.5 rounded border border-moss/20 shrink-0">
                      {selectedProduct.productCode}
                    </span>
                  )}
                  <span className="truncate">{selectedProduct?.name || 'Selecciona un producto'}</span>
                </div>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-ink-muted transition-transform shrink-0 ${
                    isProductDropdownOpen ? 'rotate-180 text-moss' : ''
                  }`}
                />
              </div>

              {/* Menú Desplegable con Campo de Búsqueda Rápida */}
              {isProductDropdownOpen && (
                <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-moss/25 rounded-xl shadow-xl z-50 overflow-hidden flex flex-col max-h-64 animate-in fade-in zoom-in-95 duration-100">
                  {/* Input de filtro dentro del dropdown */}
                  <div className="p-2 border-b border-moss/10 bg-surface-soft/60">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-ink-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        autoFocus
                        value={productSearchTerm}
                        onChange={(e) => setProductSearchTerm(e.target.value)}
                        placeholder="Buscar por nombre o código (ej. PRD-00005)..."
                        className="w-full bg-white border border-moss/20 rounded-lg pl-8 pr-7 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-moss placeholder:text-ink-muted/70"
                        onClick={(e) => e.stopPropagation()}
                      />
                      {productSearchTerm && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setProductSearchTerm('');
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink p-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Lista de productos filtrados */}
                  <div className="overflow-y-auto custom-scrollbar divide-y divide-moss/5 max-h-48">
                    {filteredProducts.length > 0 ? (
                      filteredProducts.map((p) => {
                        const isSelected = p.id === selectedProductId;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setSelectedProductId(p.id);
                              setIsProductDropdownOpen(false);
                              setProductSearchTerm('');
                            }}
                            className={`w-full text-left px-3 py-2 flex items-center justify-between text-xs transition-colors ${
                              isSelected
                                ? 'bg-moss/10 font-bold text-moss'
                                : 'hover:bg-surface text-ink'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate pr-2">
                              <span className="font-mono text-[10px] font-bold text-moss bg-moss/10 px-1.5 py-0.5 rounded border border-moss/15 shrink-0">
                                {p.productCode || 'PRD-?'}
                              </span>
                              <span className="truncate">{p.name}</span>
                            </div>
                            <span className="text-[10px] text-ink-muted shrink-0 font-medium">
                              {p.skus?.length || 0} var.
                            </span>
                          </button>
                        );
                      })
                    ) : (
                      <div className="p-4 text-center text-xs text-ink-muted italic">
                        No se encontraron productos coincidentes
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Tarjeta de Código de Producto */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-white border border-moss/20 rounded-xl shadow-xs">
              <div className="space-y-0.5 overflow-hidden pr-2">
                <span className="text-[10px] uppercase font-bold text-moss block">Código Producto (Catálogo)</span>
                <span className="font-mono text-sm font-extrabold text-moss truncate block select-all" title={selectedProduct?.productCode || selectedProduct?.id}>
                  {selectedProduct?.productCode || 'PRD-PENDIENTE'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCopyProductId}
                className="shrink-0 p-1.5 rounded-lg border border-moss/15 text-moss hover:bg-moss/10 transition-colors"
                title="Copiar Código de Producto"
              >
                {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Selector de Tipo de Variante SKU (Simple vs Paquete/Pack) */}
        <div className="p-3 bg-surface-soft/80 rounded-xl border border-moss/15 space-y-1.5">
          <label className="block text-xs font-bold text-ink">
            Tipo de Variante SKU <span className="text-rose-500">*</span>
          </label>
          <p className="text-[11px] text-ink-muted leading-tight">
            Define si este SKU específico es una prenda unitaria o un paquete multipieza que podrá desempacarse en inventario.
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
        {skuType === 'paquete' && selectedProduct && (
          <SkuBundleConfig
            productId={selectedProduct.id}
            currentSkuCode={skuCode}
            bundleItems={bundleItems}
            onChange={setBundleItems}
          />
        )}

        {/* Código SKU y Generación Automática */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-ink-muted mb-1">
              Código SKU <span className="text-moss font-semibold">(Automático)</span>
            </label>
            <input
              type="text"
              readOnly
              value={skuCode}
              className="w-full bg-surface-soft border border-moss/20 rounded-xl px-3 py-2 text-xs font-mono font-bold text-moss cursor-default focus:outline-none"
              title="Código correlativo asignado automáticamente"
            />
            <p className="text-[10px] text-ink-muted mt-1">
              Se asigna automáticamente (SKU-00000). Si otro equipo tomó este número, se usará el siguiente libre.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-ink-muted mb-1">Talla</label>
            <div className="flex items-center gap-1.5">
              <select
                value={size}
                onChange={(e) => {
                  setSize(e.target.value);
                  setCustomSize('');
                }}
                className="w-full bg-white border border-moss/20 rounded-xl px-2.5 py-2 text-xs font-bold text-ink focus:outline-none focus:ring-2 focus:ring-moss"
              >
                {COMMON_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
                <option value="OTRA">Otra (Escribir)...</option>
              </select>
            </div>
          </div>
        </div>

        {size === 'OTRA' && (
          <div>
            <label className="block text-xs font-bold text-ink-muted mb-1">Especificar Talla Personalizada</label>
            <input
              type="text"
              value={customSize}
              onChange={(e) => setCustomSize(e.target.value)}
              placeholder="Ej. 34B, 38, 2-3 Años..."
              className="w-full bg-white border border-moss/20 rounded-xl px-3 py-2 text-xs font-bold text-ink"
            />
          </div>
        )}

        {/* Descripción de la variante (sugerida; editable) */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-bold text-ink-muted">Descripción de la Variante</label>
            {descTouched && (
              <button
                type="button"
                onClick={() => setDescTouched(false)}
                className="text-[10px] font-semibold text-moss hover:underline"
                title="Volver a la descripción sugerida (producto - talla color)"
              >
                Usar sugerida
              </button>
            )}
          </div>
          <input
            type="text"
            value={skuDescription}
            onChange={(e) => {
              setSkuDescription(e.target.value);
              setDescTouched(true);
            }}
            placeholder="Ej. Vestido Largo Fiesta - M Negro"
            className="w-full bg-white border border-moss/20 rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-moss"
          />
        </div>

        {/* Color y Paleta Preset */}
        <div className="p-3 bg-surface-soft rounded-xl border border-moss/10 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-ink">Color de la Prenda</label>
            <div className="flex items-center gap-2">
              <span
                className="w-4 h-4 rounded-full border border-black/30 shadow-xs"
                style={{ backgroundColor: colorHex }}
              />
              <span className="text-xs font-mono font-bold text-ink-muted">{colorHex}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
            <div>
              <input
                type="text"
                value={colorName}
                onChange={(e) => setColorName(e.target.value)}
                placeholder="Nombre del color (Ej: Rojo Carmesí)"
                className="w-full bg-white border border-moss/20 rounded-xl px-3 py-1.5 text-xs text-ink font-semibold"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="color"
                value={colorHex}
                onChange={(e) => setColorHex(e.target.value)}
                className="w-9 h-8 rounded-xl border border-moss/20 cursor-pointer bg-white p-0.5"
                title="Elegir tono exacto"
              />
              <div className="flex flex-wrap gap-1">
                {PRESET_COLORS.map((pc) => (
                  <button
                    key={pc.name}
                    type="button"
                    onClick={() => {
                      setColorName(pc.name);
                      setColorHex(pc.hex);
                    }}
                    className="w-5 h-5 rounded-full border border-black/20 hover:scale-115 transition-transform"
                    style={{ backgroundColor: pc.hex }}
                    title={pc.name}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Precios y Costos */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-3 bg-white rounded-xl border border-moss/15">
          <div>
            <label className="block text-[11px] font-bold text-ink-muted mb-1">Costo Compra USD</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={costPriceUsd || ''}
              onChange={(e) => handleCostUsdChange(parseFloat(e.target.value) || 0)}
              className="w-full bg-surface-soft border border-moss/20 rounded-xl px-3 py-2 text-xs font-bold text-ink"
              placeholder="0.00"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-ink-muted mb-1">Costo Landed NIO</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={costPriceNio || ''}
              onChange={(e) => setCostPriceNio(parseFloat(e.target.value) || 0)}
              className="w-full bg-surface-soft border border-moss/20 rounded-xl px-3 py-2 text-xs font-bold text-ink"
              placeholder="0.00"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-moss mb-1">Precio Venta NIO *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              value={salePriceNio || ''}
              onChange={(e) => setSalePriceNio(parseFloat(e.target.value) || 0)}
              className="w-full bg-white border border-moss/30 rounded-xl px-3 py-2 text-xs font-extrabold text-moss focus:ring-2 focus:ring-moss"
              placeholder="0.00"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-amber-700 mb-1">Precio Oferta NIO</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={promoPriceNio}
              onChange={(e) => setPromoPriceNio(e.target.value)}
              className="w-full bg-white border border-moss/20 rounded-xl px-3 py-2 text-xs text-amber-700 font-semibold"
              placeholder="Opcional"
            />
          </div>
        </div>

        {/* Descripción para la web: hereda la del producto salvo que se personalice */}
        <div>
          <label className="block text-xs font-bold text-ink-muted mb-1">Descripción para la web</label>
          <SkuDescriptionOverride
            key={selectedProduct?.id || 'none'}
            value={descriptionHtml}
            onChange={setDescriptionHtml}
            productHtml={selectedProduct?.descriptionHtml}
            productName={selectedProduct?.name}
          />
        </div>

        {/* Imagen de la variante & Activo para Venta */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-ink-muted mb-1">URL Foto de Variante (Opcional)</label>
            <input
              type="url"
              value={mainImageUrl}
              onChange={(e) => setMainImageUrl(e.target.value)}
              placeholder="https://images.unsplash.com/..."
              className="w-full bg-white border border-moss/20 rounded-xl px-3 py-2 text-xs text-ink"
            />
          </div>

          <div className="pt-4">
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

        {/* Botones de Acción */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-moss/10">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-ink-muted hover:bg-surface rounded-xl transition-colors"
          >
            Cancelar
          </button>

          <button
            type="submit"
            disabled={isSaving}
            className={`px-5 py-2 text-xs font-bold text-white rounded-xl shadow-md transition-all flex items-center gap-2 ${
              isSaving ? 'bg-moss/70 cursor-not-allowed' : 'bg-moss hover:bg-moss-700 shadow-moss/20'
            }`}
          >
            {isSaving ? (
              <>
                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Guardando…</span>
              </>
            ) : (
              <span>Crear Variante SKU</span>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
