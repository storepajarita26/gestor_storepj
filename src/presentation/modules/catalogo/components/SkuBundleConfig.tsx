'use client';

import React, { useMemo } from 'react';
import { Package, Plus, Trash2, Info, Layers, Sparkles } from 'lucide-react';
import { ProductSku, SkuBundleItem } from '@/domain/catalog/types';
import { dataStore } from '@/infrastructure/repositories/dataStore';

interface SkuBundleConfigProps {
  productId: string;
  currentSkuId?: string;
  currentSkuCode?: string;
  bundleItems: SkuBundleItem[];
  onChange: (items: SkuBundleItem[]) => void;
}

const COMMON_PACK_SIZES = [2, 3, 4, 6, 12];

/**
 * Componente modular para configurar el contenido de un SKU Paquete / Pack.
 * Permite registrar cuántas unidades individuales contiene y a qué SKU(s) unitario(s) equivale.
 */
export function SkuBundleConfig({
  productId,
  currentSkuId,
  currentSkuCode,
  bundleItems,
  onChange,
}: SkuBundleConfigProps) {
  const allProducts = dataStore.getProducts();
  const currentProduct = allProducts.find((p) => p.id === productId);

  // SKUs simples disponibles en el mismo producto (no pueden ser el mismo SKU que se edita)
  const sameProductUnitSkus = useMemo(() => {
    if (!currentProduct?.skus) return [];
    return currentProduct.skus.filter((s) => {
      if (currentSkuId && s.id === currentSkuId) return false;
      return dataStore.resolveSkuType(s, currentProduct) === 'simple';
    });
  }, [currentProduct, currentSkuId]);

  // Otros SKUs simples de todo el catálogo (para combos multiproducto)
  const otherUnitSkus = useMemo(() => {
    return allProducts
      .filter((p) => p.id !== productId)
      .flatMap((p) =>
        (p.skus || [])
          .filter((s) => dataStore.resolveSkuType(s, p) === 'simple')
          .map((s) => ({ ...s, parentProductName: p.name }))
      );
  }, [allProducts, productId]);

  // Si no hay ningún item en bundleItems, inicializar con 1 fila por defecto
  React.useEffect(() => {
    if (bundleItems.length === 0) {
      const defaultUnitId = sameProductUnitSkus[0]?.id || '';
      onChange([
        {
          bundleSkuId: currentSkuId || '',
          unitSkuId: defaultUnitId,
          quantityPerPack: 3,
        },
      ]);
    }
  }, [bundleItems.length, currentSkuId, sameProductUnitSkus, onChange]);

  const totalPieces = bundleItems.reduce(
    (acc, bi) => acc + (Math.max(1, Number(bi.quantityPerPack) || 1)),
    0
  );

  const handleUpdateItem = (
    index: number,
    field: keyof SkuBundleItem,
    val: any
  ) => {
    const next = [...bundleItems];
    next[index] = { ...next[index], [field]: val };
    onChange(next);
  };

  const handleAddRow = () => {
    const nextUnit =
      sameProductUnitSkus.find((s) => !bundleItems.some((bi) => bi.unitSkuId === s.id)) ||
      sameProductUnitSkus[0];
    onChange([
      ...bundleItems,
      {
        bundleSkuId: currentSkuId || '',
        unitSkuId: nextUnit?.id || '',
        quantityPerPack: 1,
      },
    ]);
  };

  const handleRemoveRow = (index: number) => {
    if (bundleItems.length <= 1) return;
    onChange(bundleItems.filter((_, idx) => idx !== index));
  };

  const setSinglePackQuantity = (qty: number) => {
    if (bundleItems.length <= 1) {
      const first = bundleItems[0] || {
        bundleSkuId: currentSkuId || '',
        unitSkuId: sameProductUnitSkus[0]?.id || '',
        quantityPerPack: qty,
      };
      onChange([{ ...first, quantityPerPack: qty }]);
    }
  };

  return (
    <div className="p-3.5 bg-purple-50/80 rounded-xl border border-purple-200 space-y-3">
      {/* Encabezado informativo */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-purple-600/10 flex items-center justify-center text-purple-800 shrink-0">
            <Package className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-purple-950 flex items-center gap-1.5">
              <span>Contenido y Receta del Paquete</span>
              <span className="text-[10px] font-mono bg-purple-200/80 text-purple-950 px-1.5 py-0.2 rounded font-bold">
                {totalPieces} {totalPieces === 1 ? 'unidad' : 'unidades'} / pack
              </span>
            </h4>
            <p className="text-[11px] text-purple-900 leading-tight">
              Indica cuántas prendas individuales contiene este pack y a qué SKU(s) equivale al desempacarlo en Inventario.
            </p>
          </div>
        </div>

        {/* Acceso rápido a cantidades típicas cuando solo hay 1 fila */}
        {bundleItems.length <= 1 && (
          <div className="hidden sm:flex items-center gap-1 shrink-0">
            <span className="text-[10px] font-semibold text-purple-900">Packs comunes:</span>
            {COMMON_PACK_SIZES.map((sz) => {
              const active = (bundleItems[0]?.quantityPerPack || 3) === sz;
              return (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setSinglePackQuantity(sz)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all border ${
                    active
                      ? 'bg-purple-800 text-white border-purple-800 shadow-2xs'
                      : 'bg-white text-purple-950 border-purple-200 hover:bg-purple-100'
                  }`}
                >
                  {sz}x
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Lista de filas de prendas que componen el paquete */}
      <div className="space-y-2">
        {bundleItems.map((item, idx) => {
          return (
            <div
              key={idx}
              className="p-2.5 bg-white rounded-xl border border-purple-200/80 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 text-xs shadow-2xs"
            >
              {/* Selector de SKU Unitario */}
              <div className="flex-1 min-w-0">
                <label className="block text-[10px] font-bold text-ink-muted uppercase tracking-wide mb-1">
                  SKU Individual Resultante {bundleItems.length > 1 ? `#${idx + 1}` : ''}
                </label>
                <select
                  value={item.unitSkuId}
                  onChange={(e) => handleUpdateItem(idx, 'unitSkuId', e.target.value)}
                  className="w-full bg-surface-soft border border-moss/20 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  <option value="">-- Seleccionar SKU unitario individual --</option>
                  {sameProductUnitSkus.length > 0 && (
                    <optgroup label={`Prendas de este mismo producto (${currentProduct?.name || 'Producto'})`}>
                      {sameProductUnitSkus.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.skuCode} — {s.size ? `Talla ${s.size}` : ''} {s.colorName ? `· Color ${s.colorName}` : ''} {s.skuDescription ? `(${s.skuDescription})` : ''}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {otherUnitSkus.length > 0 && (
                    <optgroup label="Prendas de otros productos (para combos mixtos)">
                      {otherUnitSkus.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.skuCode} — {s.parentProductName} ({s.size} {s.colorName})
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {/* Cantidad de prendas de este SKU */}
              <div className="w-full sm:w-36 shrink-0">
                <label className="block text-[10px] font-bold text-ink-muted uppercase tracking-wide mb-1">
                  Unidades en el pack <span className="text-rose-500">*</span>
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      handleUpdateItem(
                        idx,
                        'quantityPerPack',
                        Math.max(1, (Number(item.quantityPerPack) || 1) - 1)
                      )
                    }
                    className="w-7 h-7 rounded-lg bg-surface border border-moss/20 hover:bg-moss/10 font-bold text-ink flex items-center justify-center shrink-0"
                    title="Restar 1 unidad"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min="1"
                    required
                    value={item.quantityPerPack}
                    onChange={(e) =>
                      handleUpdateItem(
                        idx,
                        'quantityPerPack',
                        Math.max(1, parseInt(e.target.value) || 1)
                      )
                    }
                    className="w-full text-center bg-surface-soft border border-moss/20 rounded-lg py-1 text-xs font-extrabold text-purple-950 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      handleUpdateItem(
                        idx,
                        'quantityPerPack',
                        (Number(item.quantityPerPack) || 1) + 1
                      )
                    }
                    className="w-7 h-7 rounded-lg bg-surface border border-moss/20 hover:bg-moss/10 font-bold text-ink flex items-center justify-center shrink-0"
                    title="Sumar 1 unidad"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Botón de eliminar si hay más de 1 fila */}
              {bundleItems.length > 1 && (
                <div className="sm:self-end pt-1 sm:pt-0">
                  <button
                    type="button"
                    onClick={() => handleRemoveRow(idx)}
                    className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                    title="Eliminar fila"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Nota de ayuda cuando aún no hay variantes simples creadas */}
      {sameProductUnitSkus.length === 0 && (
        <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-950 flex items-start gap-2">
          <Info className="w-4 h-4 mt-0.5 text-amber-700 shrink-0" />
          <span>
            Este producto aún no tiene variantes simples registradas. Puedes definir la cantidad que trae el pack ahora (ej. <strong>{totalPieces} unidades</strong>) y luego vincular el SKU individual al crearlo.
          </span>
        </div>
      )}

      {/* Acciones inferiores del bloque */}
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={handleAddRow}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-900 hover:text-purple-950 bg-white border border-purple-200 hover:border-purple-400 px-3 py-1.5 rounded-lg transition-colors shadow-2xs"
        >
          <Plus className="w-3.5 h-3.5 text-purple-700" />
          <span>+ Agregar otra prenda (Combo Mixto)</span>
        </button>

        <span className="text-xs text-purple-950 italic">
          Total por pack: <strong>{totalPieces} prendas</strong>
        </span>
      </div>
    </div>
  );
}
