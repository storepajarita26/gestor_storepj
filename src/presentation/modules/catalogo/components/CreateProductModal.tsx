'use client';

import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Modal } from '@/presentation/components/ui/Modal';
import { Category, ProductSku, ProductType } from '@/domain/catalog/types';
import { dataStore } from '@/infrastructure/repositories/dataStore';
import { HtmlDescriptionEditor } from '@/presentation/components/ui/HtmlDescriptionEditor';

interface CreateProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  exchangeRate: number;
  initialProductCode?: string;
  onSubmit: (data: {
    name: string;
    productCode?: string;
    categoryId?: string;
    subcategoryId?: string;
    description?: string;
    seoDescription?: string;
    descriptionHtml?: string;
    productType: ProductType;
    skus: Omit<ProductSku, 'id' | 'productId'>[];
  }) => void;
}

export function CreateProductModal({
  isOpen,
  onClose,
  categories,
  exchangeRate,
  initialProductCode,
  onSubmit,
}: CreateProductModalProps) {
  const mainCategories = categories.filter((c) => !c.parentId);

  const [name, setName] = useState('');
  const [productCode, setProductCode] = useState(initialProductCode || '');
  const [categoryId, setCategoryId] = useState(mainCategories[0]?.id || '');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [descriptionHtml, setDescriptionHtml] = useState('');

  React.useEffect(() => {
    if (initialProductCode) {
      setProductCode(initialProductCode);
    }
  }, [initialProductCode, isOpen]);
  const [skus, setSkus] = useState<Omit<ProductSku, 'id' | 'productId'>[]>([
    {
      skuCode: '',
      skuDescription: '',
      skuType: 'simple',
      size: 'U',
      colorName: '',
      colorHex: '#000000',
      costPriceUsd: 0,
      costPriceNio: 0,
      salePriceNio: 0,
      mainImageUrl: '',
      isActive: true,
    },
  ]);

  const availableSubcategories = categories.filter((c) => c.parentId === categoryId);

  const handleCategoryChange = (newCatId: string) => {
    setCategoryId(newCatId);
    const subcats = categories.filter((c) => c.parentId === newCatId);
    setSubcategoryId(subcats[0]?.id || '');
  };

  const handleAddSkuRow = () => {
    setSkus([
      ...skus,
      {
        skuCode: '', // lo asigna el sistema al guardar (SKU-00000)
        skuDescription: name ? `${name} - Variante` : '',
        skuType: 'simple',
        size: 'U',
        colorName: '',
        colorHex: '#000000',
        costPriceUsd: 0,
        costPriceNio: 0,
        salePriceNio: 0,
        mainImageUrl: '',
        isActive: true,
      },
    ]);
  };

  const handleRemoveSkuRow = (index: number) => {
    if (skus.length <= 1) return;
    setSkus(skus.filter((_, idx) => idx !== index));
  };

  const handleUpdateSkuRow = (index: number, field: string, value: any) => {
    const updated = [...skus];
    const current = { ...updated[index], [field]: value };

    if (field === 'costPriceUsd') {
      current.costPriceNio = Number((Number(value) * exchangeRate).toFixed(2));
    }

    updated[index] = current;
    setSkus(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || skus.length === 0) return;

    const derivedProductType: ProductType = skus.some((s) => s.skuType === 'paquete') ? 'paquete' : 'simple';

    onSubmit({
      name: name.trim(),
      productCode: productCode.trim().toUpperCase() || undefined,
      categoryId: categoryId || mainCategories[0]?.id,
      subcategoryId: subcategoryId || undefined,
      description,
      seoDescription,
      descriptionHtml,
      productType: derivedProductType,
      skus,
    });

    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Nuevo Producto con Jerarquía y Variantes"
      subtitle="Define categoría, subcategoría y variantes SKU (indicando en cada SKU si es Simple o Paquete)."
      maxWidth="3xl"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Category selection */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-surface-soft rounded-xl border border-moss/10">
          <div>
            <label className="block text-xs font-bold text-ink-muted mb-1">
              Categoría Principal (Nivel 1)
            </label>
            <select
              value={categoryId}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="w-full bg-white border border-moss/20 rounded-xl px-3 py-2 text-xs font-semibold text-ink focus:outline-none focus:ring-1 focus:ring-moss"
            >
              {mainCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-ink-muted mb-1">
              Subcategoría (Nivel 2)
            </label>
            <select
              value={subcategoryId}
              onChange={(e) => setSubcategoryId(e.target.value)}
              className="w-full bg-white border border-moss/20 rounded-xl px-3 py-2 text-xs font-semibold text-ink focus:outline-none focus:ring-1 focus:ring-moss"
            >
              <option value="">-- Sin Subcategoría / General --</option>
              {availableSubcategories.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  ↳ {sc.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Basic Details */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="sm:col-span-1">
            <label className="block text-xs font-bold text-ink-muted mb-1">
              Código de Producto <span className="text-moss font-semibold">(Auto)</span>
            </label>
            <input
              type="text"
              readOnly
              value={productCode}
              className="w-full bg-surface-soft font-mono font-bold text-moss border border-moss/20 rounded-xl px-3 py-2 text-xs cursor-default focus:outline-none"
              placeholder="PRD-00000"
              title="Código correlativo asignado automáticamente"
            />
          </div>

          <div className="sm:col-span-3">
            <label className="block text-xs font-bold text-ink-muted mb-1">
              Nombre del Producto <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-moss"
              placeholder="Ej. Vestido Largo Fiesta Noche"
            />
          </div>
        </div>

        {/* Descripción larga para la web (compartida por todas las variantes) */}
        <div>
          <label className="block text-xs font-bold text-ink-muted mb-1">
            Descripción para la web{' '}
            <span className="font-semibold text-ink-muted/80">(la ven todas las variantes)</span>
          </label>
          <HtmlDescriptionEditor
            value={descriptionHtml}
            onChange={setDescriptionHtml}
            productName={name}
            minHeight={140}
          />
        </div>

        {/* Dynamic SKUs Table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-ink uppercase tracking-wider">
                Variantes Visuales (SKUs)
              </h4>
              <p className="text-[11px] text-ink-muted">
                Define el tipo (Simple o Paquete/Pack) individualmente para cada SKU.
              </p>
            </div>
            <button
              type="button"
              onClick={handleAddSkuRow}
              className="flex items-center gap-1.5 bg-moss/10 hover:bg-moss/20 text-moss text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Añadir Variante</span>
            </button>
          </div>

          <div className="space-y-3 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
            {skus.map((sku, idx) => (
              <div
                key={idx}
                className="p-3 bg-surface rounded-xl border border-moss/10 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center text-xs"
              >
                <div className="sm:col-span-2">
                  <span className="text-[10px] text-ink-muted block">Código SKU</span>
                  <input
                    type="text"
                    readOnly
                    value={dataStore.getNextSkuCode(idx)}
                    className="w-full bg-surface-soft border border-moss/20 rounded-lg px-2 py-1 font-mono font-bold text-xs text-moss cursor-default"
                    title="Código correlativo asignado automáticamente al guardar"
                  />
                </div>

                <div className="sm:col-span-2">
                  <span className="text-[10px] text-ink-muted block">Tipo de SKU</span>
                  <select
                    value={sku.skuType || 'simple'}
                    onChange={(e) => {
                      const nextType = e.target.value;
                      handleUpdateSkuRow(idx, 'skuType', nextType);
                      if (nextType === 'paquete' && (!sku.bundleItems || sku.bundleItems.length === 0)) {
                        handleUpdateSkuRow(idx, 'bundleItems', [{ bundleSkuId: '', unitSkuId: '', quantityPerPack: 3 }]);
                      }
                    }}
                    className={`w-full border rounded-lg px-2 py-1 text-xs font-bold focus:outline-none ${
                      sku.skuType === 'paquete'
                        ? 'bg-purple-50 text-purple-900 border-purple-300'
                        : 'bg-white text-ink border-moss/20'
                    }`}
                  >
                    <option value="simple">Simple (Unidad)</option>
                    <option value="paquete">Paquete / Pack</option>
                  </select>
                  {sku.skuType === 'paquete' && (
                    <div className="mt-1 flex items-center gap-1">
                      <span className="text-[9px] text-purple-900 font-bold">Unids:</span>
                      <input
                        type="number"
                        min="1"
                        value={sku.bundleItems?.[0]?.quantityPerPack || 3}
                        onChange={(e) => {
                          const qty = Math.max(1, parseInt(e.target.value) || 1);
                          handleUpdateSkuRow(idx, 'bundleItems', [{ bundleSkuId: '', unitSkuId: '', quantityPerPack: qty }]);
                        }}
                        className="w-12 bg-purple-50 border border-purple-300 rounded px-1 py-0.5 text-[10px] font-bold text-purple-950 text-center"
                        title="Cantidad de prendas individuales por paquete"
                      />
                    </div>
                  )}
                </div>

                <div className="sm:col-span-2">
                  <span className="text-[10px] text-ink-muted block">Talla</span>
                  <input
                    type="text"
                    value={sku.size || ''}
                    onChange={(e) => handleUpdateSkuRow(idx, 'size', e.target.value)}
                    className="w-full bg-white border border-moss/20 rounded-lg px-2 py-1 text-xs"
                    placeholder="S, M, L..."
                  />
                </div>

                <div className="sm:col-span-3">
                  <span className="text-[10px] text-ink-muted block">Color (Nombre & HEX)</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={sku.colorHex || '#38BDF8'}
                      onChange={(e) => handleUpdateSkuRow(idx, 'colorHex', e.target.value)}
                      className="w-6 h-6 rounded cursor-pointer border border-moss/20 p-0"
                    />
                    <input
                      type="text"
                      value={sku.colorName || ''}
                      onChange={(e) => handleUpdateSkuRow(idx, 'colorName', e.target.value)}
                      className="flex-1 bg-white border border-moss/20 rounded-lg px-2 py-1 text-xs"
                      placeholder="Rosa..."
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <span className="text-[10px] text-ink-muted block">Precio Venta (C$)</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={sku.salePriceNio}
                    onChange={(e) =>
                      handleUpdateSkuRow(idx, 'salePriceNio', parseFloat(e.target.value) || 0)
                    }
                    className="w-full bg-white border border-moss/20 rounded-lg px-2 py-1 font-bold text-moss text-xs"
                  />
                </div>

                <div className="sm:col-span-1 flex justify-center">
                  {skus.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveSkuRow(idx)}
                      className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded"
                      title="Eliminar variante"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Modal Actions */}
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
            className="px-5 py-2 text-xs font-bold text-white bg-moss hover:bg-moss-700 rounded-xl shadow-md transition-all"
          >
            Crear Producto & SKUs
          </button>
        </div>
      </form>
    </Modal>
  );
}
