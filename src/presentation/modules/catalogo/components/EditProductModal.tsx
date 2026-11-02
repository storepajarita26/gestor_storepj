'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Copy, Check } from 'lucide-react';
import { Modal } from '@/presentation/components/ui/Modal';
import { HtmlDescriptionEditor } from '@/presentation/components/ui/HtmlDescriptionEditor';
import { Product, Category, ProductType } from '@/domain/catalog/types';

interface EditProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  categories: Category[];
  onSave: (product: Product) => Promise<void> | void;
}

export function EditProductModal({
  isOpen,
  onClose,
  product,
  categories,
  onSave,
}: EditProductModalProps) {
  const mainCategories = categories.filter((c) => !c.parentId);

  const [name, setName] = useState('');
  const [productCode, setProductCode] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [productType, setProductType] = useState<ProductType>('simple');
  const [description, setDescription] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [descriptionHtml, setDescriptionHtml] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isFeatured, setIsFeatured] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const displayCode = product?.productCode || 'Sin código';

  const handleCopyProductCode = () => {
    if (product?.productCode) {
      navigator.clipboard.writeText(product.productCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleCopyProductId = () => {
    if (product?.id) {
      navigator.clipboard.writeText(product.id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  useEffect(() => {
    if (product) {
      setName(product.name || '');
      setProductCode(product.productCode || '');
      setCategoryId(product.categoryId || '');
      setSubcategoryId(product.subcategoryId || '');
      setProductType(product.productType || 'simple');
      setDescription(product.description || '');
      setSeoDescription(product.seoDescription || '');
      setDescriptionHtml(product.descriptionHtml || '');
      setIsActive(product.isActive ?? true);
      setIsFeatured(product.isFeatured ?? false);
    }
  }, [product]);

  // Subcategorías según la categoría seleccionada
  const availableSubcategories = useMemo(() => {
    if (!categoryId) return [];
    return categories.filter((c) => c.parentId === categoryId);
  }, [categories, categoryId]);

  const handleCategoryChange = (newCatId: string) => {
    setCategoryId(newCatId);
    const subcats = categories.filter((c) => c.parentId === newCatId);
    setSubcategoryId(subcats[0]?.id || '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product || !name.trim()) return;

    setIsSaving(true);
    try {
      await onSave({
        ...product,
        name: name.trim(),
        productCode: productCode.trim().toUpperCase() || undefined,
        categoryId: categoryId || undefined,
        subcategoryId: subcategoryId || undefined,
        productType,
        description: description.trim(),
        seoDescription: seoDescription.trim(),
        descriptionHtml: descriptionHtml || undefined,
        isActive,
        isFeatured,
        updatedAt: new Date().toISOString(),
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  if (!product) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Editar Producto: ${product.name}`}
      subtitle={`Código: ${product.productCode || 'PRD-XXXXX'} • ${product.skus?.length || 0} variantes vinculadas`}
      maxWidth="2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5 text-ink">
        {/* Banner de Identificación del Producto (Código de Catálogo PRD-XXXXX y UUID) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-surface-soft rounded-xl border border-moss/15 text-xs">
          {/* Código de Catálogo Principal (PRD-00001) */}
          <div className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-moss/20">
            <div>
              <span className="block text-[10px] uppercase tracking-wider font-bold text-moss">
                Código de Producto (Catálogo)
              </span>
              <span className="font-mono text-sm font-extrabold text-moss block mt-0.5 select-all">
                {product.productCode || 'PRD-PENDIENTE'}
              </span>
            </div>
            {product.productCode && (
              <button
                type="button"
                onClick={handleCopyProductCode}
                className="flex items-center gap-1 px-2.5 py-1 bg-moss/10 hover:bg-moss text-moss hover:text-white rounded-lg text-xs font-bold transition-all"
                title="Copiar Código de Producto"
              >
                {copiedCode ? (
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

          {/* ID de Base de Datos (UUID) */}
          <div className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-moss/20">
            <div className="min-w-0 pr-2">
              <span className="block text-[10px] uppercase tracking-wider font-bold text-ink-muted">
                ID en Base de Datos (UUID)
              </span>
              <span className="font-mono text-[11px] font-bold text-ink-muted block mt-0.5 truncate select-all" title={product.id}>
                {product.id}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopyProductId}
              className="p-1.5 hover:bg-surface rounded text-ink-muted hover:text-moss transition-colors shrink-0"
              title="Copiar UUID de Base de Datos"
            >
              {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Row 1: Nombre */}
        <div>
          <label className="block text-xs font-bold text-ink-muted mb-1">
            Nombre del Producto <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-white border border-moss/20 rounded-xl px-3 py-2 text-xs font-bold text-ink focus:outline-none focus:ring-2 focus:ring-moss"
            placeholder="Ej. Vestido Largo Fiesta Noche"
          />
        </div>

        {/* Row 2: Jerarquía de Categorías (Nivel 1 y Nivel 2) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 bg-surface-soft/80 rounded-xl border border-moss/10">
          <div>
            <label className="block text-xs font-bold text-ink-muted mb-1">
              Categoría Principal (Nivel 1)
            </label>
            <select
              value={categoryId}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="w-full bg-white border border-moss/20 rounded-xl px-3 py-2 text-xs font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-moss"
            >
              <option value="">-- Sin Categoría --</option>
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
              className="w-full bg-white border border-moss/20 rounded-xl px-3 py-2 text-xs font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-moss"
            >
              <option value="">-- Sin Subcategoría / General --</option>
              {availableSubcategories.map((sc: Category) => (
                <option key={sc.id} value={sc.id}>
                  ↳ {sc.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Nota informativa: el tipo Simple o Paquete ahora se define en cada SKU */}
        <div className="px-3 py-2 bg-surface-soft/70 rounded-xl border border-moss/10 text-[11px] text-ink-muted">
          El tipo <strong>Simple (Unidad)</strong> o <strong>Paquete / Pack (Desempacable)</strong> se configura individualmente dentro de cada variante <strong>SKU</strong>.
        </div>

        {/* Row 4: Descripción larga para la web (HTML) */}
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <label className="block text-xs font-bold text-ink-muted">Descripción para la web</label>
            <span className="text-[10px] text-ink-muted">
              {(() => {
                const own = (product.skus || []).filter((s) => (s.descriptionHtml || '').trim()).length;
                return own > 0
                  ? `${own} de ${product.skus.length} variantes usan una descripción propia`
                  : 'La usan todas las variantes';
              })()}
            </span>
          </div>
          <HtmlDescriptionEditor
            value={descriptionHtml}
            onChange={setDescriptionHtml}
            productName={name}
          />
        </div>

        {/* Row 4b: Descripción corta (texto simple, para búsquedas internas) */}
        <div>
          <label className="block text-xs font-bold text-ink-muted mb-1">
            Descripción corta (interna)
          </label>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-white border border-moss/20 rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-moss"
            placeholder="Descripción comercial o características del producto..."
          />
        </div>

        {/* Row 5: SEO / Referencia */}
        <div>
          <label className="block text-xs font-bold text-ink-muted mb-1">
            Descripción SEO / Palabras Clave
          </label>
          <input
            type="text"
            value={seoDescription}
            onChange={(e) => setSeoDescription(e.target.value)}
            className="w-full bg-white border border-moss/20 rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-moss"
            placeholder="Palabras clave para motores de búsqueda..."
          />
        </div>

        {/* Row 6: Toggles de Estado */}
        <div className="flex flex-wrap items-center gap-6 pt-2 border-t border-moss/10">
          <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-ink">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 rounded text-moss focus:ring-moss border-moss/30"
            />
            <span>Producto Activo en Tienda</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-ink">
            <input
              type="checkbox"
              checked={isFeatured}
              onChange={(e) => setIsFeatured(e.target.checked)}
              className="w-4 h-4 rounded text-moss focus:ring-moss border-moss/30"
            />
            <span>Producto Destacado</span>
          </label>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-moss/10">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-ink-muted hover:bg-surface transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className={`text-white px-5 py-2 rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 ${
              isSaving ? 'bg-moss/70 cursor-not-allowed' : 'bg-moss hover:bg-moss-700 shadow-moss/20'
            }`}
          >
            {isSaving ? (
              <>
                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Guardando…</span>
              </>
            ) : (
              <span>Guardar Cambios del Producto</span>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
