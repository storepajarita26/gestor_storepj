'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Boxes,
  Plus,
  Search,
  Tag,
  Palette,
  Trash2,
  Image as ImageIcon,
  Settings,
  FolderTree,
} from 'lucide-react';
import { StatusBadge } from '@/presentation/components/ui/StatusBadge';
import { Modal } from '@/presentation/components/ui/Modal';
import { dataStore } from '@/infrastructure/repositories/dataStore';
import { formatNIO } from '@/domain/shared/utils/currencyFormatter';
import { Product, ProductSku, ProductType, Category } from '@/domain/catalog/types';
import { generateSkuCode } from '@/domain/catalog/services/catalogService';

export function CatalogoView() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Selected variant map per product card: { [productId]: selectedSkuId }
  const [selectedSkuByProduct, setSelectedSkuByProduct] = useState<Record<string, string>>({});

  // Form State for new Product + SKUs (with 2-level categories)
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [productType, setProductType] = useState<ProductType>('simple');
  const [skus, setSkus] = useState<Omit<ProductSku, 'id' | 'productId'>[]>([
    {
      skuCode: 'PS-VEST-M-ROS-001',
      skuDescription: 'Vestido Floral - Talla M Rosa',
      size: 'M',
      colorName: 'Rosa Pastel',
      colorHex: '#F472B6',
      costPriceUsd: 6.5,
      costPriceNio: 239.2,
      salePriceNio: 450.0,
      mainImageUrl: 'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?auto=format&fit=crop&w=600&q=80',
      isActive: true,
    },
  ]);

  const refreshData = () => {
    setProducts(dataStore.getProducts());
    setCategories(dataStore.getCategories());
  };

  useEffect(() => {
    refreshData();
    const unsub = dataStore.subscribe(refreshData);
    return unsub;
  }, []);

  const mainCategories = categories.filter((c) => !c.parentId);
  const availableSubcategories = categories.filter((c) => c.parentId === categoryId);

  const handleOpenCreateModal = () => {
    const defaultCat = mainCategories[0]?.id || '';
    setCategoryId(defaultCat);
    const subcats = categories.filter((c) => c.parentId === defaultCat);
    setSubcategoryId(subcats[0]?.id || '');
    setIsModalOpen(true);
  };

  const handleCategoryChange = (newCatId: string) => {
    setCategoryId(newCatId);
    const subcats = categories.filter((c) => c.parentId === newCatId);
    setSubcategoryId(subcats[0]?.id || '');
  };

  const handleAddSkuRow = () => {
    const code = generateSkuCode(name || 'ITEM', 'L', 'Negro');
    setSkus([
      ...skus,
      {
        skuCode: code,
        skuDescription: `${name || 'Producto'} - Variante L`,
        size: 'L',
        colorName: 'Negro',
        colorHex: '#30342B',
        costPriceUsd: 5.0,
        costPriceNio: 184.0,
        salePriceNio: 350.0,
        mainImageUrl: '',
        isActive: true,
      },
    ]);
  };

  const handleCreateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || skus.length === 0) return;

    const cat = categories.find((c) => c.id === categoryId);
    const subcat = categories.find((c) => c.id === subcategoryId);

    dataStore.addProduct({
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      categoryId: categoryId || mainCategories[0]?.id,
      categoryName: cat?.name || 'General',
      subcategoryId: subcategoryId || undefined,
      subcategoryName: subcat?.name || undefined,
      description,
      seoDescription,
      productType,
      isFeatured: false,
      isActive: true,
      skus: skus as any,
    });

    setIsModalOpen(false);
    setName('');
    setDescription('');
    setSeoDescription('');
  };

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.skus.some((s) => s.skuCode.toLowerCase().includes(searchTerm.toLowerCase()) || (s.colorName || '').toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesCat =
      selectedCategoryFilter === 'all' ||
      p.categoryId === selectedCategoryFilter ||
      p.subcategoryId === selectedCategoryFilter;

    return matchesSearch && matchesCat;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink tracking-tight flex items-center gap-2">
            <Boxes className="w-5 h-5 text-moss" />
            Administración del Catálogo & Variantes por SKU
          </h1>
          <p className="text-xs text-ink-muted">
            Jerarquía en 2 niveles (Categorías & Subcategorías), imágenes por variante y códigos de color HEX.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/configuracion"
            className="flex items-center gap-1.5 bg-surface hover:bg-surface-soft border border-moss/20 text-ink text-xs font-bold px-3.5 py-2.5 rounded-xl transition-all shadow-xs"
            title="Configurar Categorías y Subcategorías"
          >
            <FolderTree className="w-4 h-4 text-moss" />
            <span>Gestionar Categorías</span>
          </Link>

          <button
            onClick={handleOpenCreateModal}
            className="flex items-center gap-2 bg-moss hover:bg-moss-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-md shadow-moss/20"
          >
            <Plus className="w-4 h-4 text-mustard" />
            <span>Crear Nuevo Producto</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="erp-card p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 bg-surface border border-moss/15 rounded-xl px-3 py-2 w-full sm:w-72 shadow-xs">
          <Search className="w-4 h-4 text-ink-muted" />
          <input
            type="text"
            placeholder="Buscar por producto, SKU, color..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent text-xs text-ink placeholder-ink-muted focus:outline-none w-full"
          />
        </div>

        <div className="flex items-center gap-2 text-xs">
          <Tag className="w-3.5 h-3.5 text-ink-muted" />
          <span className="text-ink-muted font-medium">Filtrar por Categoría:</span>
          <select
            value={selectedCategoryFilter}
            onChange={(e) => setSelectedCategoryFilter(e.target.value)}
            className="bg-surface border border-moss/15 text-ink rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-moss"
          >
            <option value="all">Todas las categorías y subcategorías</option>
            {mainCategories.map((mainCat) => {
              const subcats = categories.filter((c) => c.parentId === mainCat.id);
              return (
                <optgroup key={mainCat.id} label={`📁 ${mainCat.name}`}>
                  <option value={mainCat.id}>{mainCat.name} (Todo)</option>
                  {subcats.map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      &nbsp;&nbsp;↳ {sub.name}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </div>
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredProducts.map((prod) => {
          const activeSkuId = selectedSkuByProduct[prod.id] || prod.skus[0]?.id;
          const currentSku = prod.skus.find((s) => s.id === activeSkuId) || prod.skus[0];
          const displayImage = currentSku?.mainImageUrl || prod.skus.find((s) => s.mainImageUrl)?.mainImageUrl;

          return (
            <div
              key={prod.id}
              className="erp-card rounded-2xl overflow-hidden hover:border-moss/30 transition-all flex flex-col justify-between shadow-xs"
            >
              <div>
                {/* Variant Image Preview */}
                <div className="relative w-full h-48 bg-surface-soft border-b border-moss/10 overflow-hidden flex items-center justify-center">
                  {displayImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={displayImage}
                      alt={prod.name}
                      className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-ink-muted p-4">
                      <ImageIcon className="w-10 h-10 stroke-1 text-moss/40 mb-1" />
                      <span className="text-[11px] font-medium">Sin imagen cargada</span>
                    </div>
                  )}

                  {/* Badges Over Image */}
                  <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-bold bg-white/90 backdrop-blur-xs text-ink px-2 py-0.5 rounded-md shadow-xs border border-moss/15">
                      {prod.categoryName} {prod.subcategoryName ? `› ${prod.subcategoryName}` : ''}
                    </span>
                    <StatusBadge status={prod.productType} />
                  </div>

                  {currentSku?.salePriceNio && (
                    <div className="absolute bottom-2.5 right-2.5 bg-moss text-white px-2.5 py-1 rounded-lg font-bold text-xs shadow-md">
                      {formatNIO(currentSku.salePriceNio)}
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-4">
                  <h3 className="font-bold text-sm text-ink line-clamp-1">{prod.name}</h3>
                  <p className="text-xs text-ink-muted mt-0.5 line-clamp-1">{prod.description || 'Sin descripción'}</p>

                  {/* Variant Selector (Color Balls & Tallas) */}
                  <div className="mt-3 pt-3 border-t border-moss/10">
                    <div className="flex items-center justify-between text-[11px] text-ink-muted mb-2 font-medium">
                      <span>Variantes ({prod.skus.length}):</span>
                      <span className="font-bold text-ink">
                        {currentSku?.size ? `Talla ${currentSku.size}` : ''} {currentSku?.colorName ? `• ${currentSku.colorName}` : ''}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {prod.skus.map((sku) => {
                        const isSelected = sku.id === currentSku?.id;
                        return (
                          <button
                            key={sku.id}
                            onClick={() => setSelectedSkuByProduct({ ...selectedSkuByProduct, [prod.id]: sku.id })}
                            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border transition-all ${
                              isSelected
                                ? 'bg-mustard/30 border-mustard text-moss-950 shadow-xs'
                                : 'bg-surface border-moss/15 text-ink hover:bg-surface-soft'
                            }`}
                            title={`Talla: ${sku.size} | Color: ${sku.colorName}`}
                          >
                            {sku.colorHex && (
                              <span
                                className="w-3 h-3 rounded-full border border-moss/30 shadow-xs inline-block"
                                style={{ backgroundColor: sku.colorHex }}
                              />
                            )}
                            <span>{sku.size || sku.colorName || 'UNI'}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Active SKU Details */}
                    {currentSku && (
                      <div className="mt-3 p-2.5 bg-surface rounded-xl border border-moss/10 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-mono text-[10px] text-ink-muted block">{currentSku.skuCode}</span>
                          <span className="text-ink font-semibold">{currentSku.skuDescription}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-ink-muted block">Costo Base</span>
                          <span className="font-bold text-ink-muted">{formatNIO(currentSku.costPriceNio)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Card Footer */}
              <div className="px-4 py-3 bg-surface-soft border-t border-moss/10 flex items-center justify-between text-xs text-ink-muted">
                <span className="font-mono text-[10px]">{prod.slug}</span>
                <button
                  onClick={() => dataStore.deleteProduct(prod.id)}
                  className="text-ink-muted hover:text-rose-600 p-1 transition-colors"
                  title="Eliminar producto del catálogo"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Crear Producto con Categoría y Subcategoría (2 Niveles) */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Crear Nuevo Producto en Catálogo"
        subtitle="Selecciona Categoría (N1), Subcategoría (N2) y agrega las variantes con imagen y color."
        maxWidth="3xl"
      >
        <form onSubmit={handleCreateProduct} className="space-y-4">
          <div>
            <label className="text-[11px] font-bold text-ink-muted block mb-1">Nombre del Producto *</label>
            <input
              type="text"
              required
              placeholder="Ej: Vestido Casual Floral Bohemio"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-moss"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-ink-muted block mb-1">Categoría Principal (Nivel 1) *</label>
              <select
                value={categoryId}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-moss"
              >
                {mainCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-ink-muted block mb-1">Subcategoría (Nivel 2)</label>
              <select
                value={subcategoryId}
                onChange={(e) => setSubcategoryId(e.target.value)}
                className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-moss"
              >
                <option value="">-- Sin subcategoría específica --</option>
                {availableSubcategories.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-ink-muted block mb-1">Tipo de Producto</label>
              <select
                value={productType}
                onChange={(e) => setProductType(e.target.value as ProductType)}
                className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-moss"
              >
                <option value="simple">Producto Simple (Venta individual)</option>
                <option value="paquete">Producto Paquete (Se desempaca a unidades)</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold text-ink-muted block mb-1">Descripción SEO</label>
              <input
                type="text"
                placeholder="Texto para búsqueda y catálogo web"
                value={seoDescription}
                onChange={(e) => setSeoDescription(e.target.value)}
                className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-moss"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-ink-muted block mb-1">Descripción General</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-moss"
              placeholder="Detalles de tela, ajuste, cuidados..."
            />
          </div>

          {/* SKUs Section with Image URL */}
          <div className="pt-2 border-t border-moss/10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-ink">Variantes de Color & Talla (con Imagen por Variante)</span>
              <button
                type="button"
                onClick={handleAddSkuRow}
                className="text-xs text-moss hover:text-moss-800 font-bold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Agregar Otra Variante
              </button>
            </div>

            <div className="space-y-3">
              {skus.map((sku, idx) => (
                <div key={idx} className="bg-surface p-3.5 rounded-xl border border-moss/15 space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-6 gap-2 items-center">
                    <div className="sm:col-span-2">
                      <label className="text-[10px] font-bold text-ink-muted block mb-0.5">Descripción Variante</label>
                      <input
                        type="text"
                        placeholder="Ej: Vestido Rosa Talla M"
                        value={sku.skuDescription}
                        onChange={(e) => {
                          const updated = [...skus];
                          updated[idx].skuDescription = e.target.value;
                          setSkus(updated);
                        }}
                        className="w-full bg-white border border-moss/15 rounded-lg px-2 py-1.5 text-xs text-ink"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-ink-muted block mb-0.5">Talla</label>
                      <input
                        type="text"
                        placeholder="S, M, L..."
                        value={sku.size}
                        onChange={(e) => {
                          const updated = [...skus];
                          updated[idx].size = e.target.value;
                          setSkus(updated);
                        }}
                        className="w-full bg-white border border-moss/15 rounded-lg px-2 py-1.5 text-xs text-ink text-center"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-ink-muted block mb-0.5">Color & Pelotita</label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="color"
                          value={sku.colorHex || '#30342B'}
                          onChange={(e) => {
                            const updated = [...skus];
                            updated[idx].colorHex = e.target.value;
                            setSkus(updated);
                          }}
                          className="w-7 h-7 rounded border border-moss/30 bg-transparent cursor-pointer"
                          title="Color HEX para el catálogo"
                        />
                        <input
                          type="text"
                          placeholder="Rosa"
                          value={sku.colorName}
                          onChange={(e) => {
                            const updated = [...skus];
                            updated[idx].colorName = e.target.value;
                            setSkus(updated);
                          }}
                          className="w-full bg-white border border-moss/15 rounded-lg px-2 py-1.5 text-xs text-ink"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-ink-muted block mb-0.5">Precio Venta (C$)</label>
                      <input
                        type="number"
                        placeholder="C$ 450"
                        value={sku.salePriceNio}
                        onChange={(e) => {
                          const updated = [...skus];
                          updated[idx].salePriceNio = parseFloat(e.target.value) || 0;
                          setSkus(updated);
                        }}
                        className="w-full bg-white border border-moss/15 rounded-lg px-2 py-1.5 text-xs text-ink text-right font-bold text-moss-800"
                      />
                    </div>
                    <div className="flex justify-end pt-3">
                      {skus.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setSkus(skus.filter((_, i) => i !== idx))}
                          className="p-1 text-ink-muted hover:text-rose-600"
                          title="Eliminar variante"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* URL de Imagen de esta Variante */}
                  <div className="flex items-center gap-2 pt-1 border-t border-moss/10">
                    <ImageIcon className="w-4 h-4 text-moss shrink-0" />
                    <input
                      type="url"
                      placeholder="URL de imagen (ej: https://img.shein.com/...)"
                      value={sku.mainImageUrl || ''}
                      onChange={(e) => {
                        const updated = [...skus];
                        updated[idx].mainImageUrl = e.target.value;
                        setSkus(updated);
                      }}
                      className="w-full bg-white border border-moss/15 rounded-lg px-2.5 py-1 text-xs text-ink placeholder-ink-muted"
                    />
                    {sku.mainImageUrl && (
                      <div className="w-8 h-8 rounded-lg overflow-hidden border border-moss/20 shrink-0 bg-surface-soft">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={sku.mainImageUrl} alt="preview" className="w-full h-full object-cover" />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-moss/10 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-ink-muted hover:bg-surface"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-bold bg-moss hover:bg-moss-700 text-white shadow-md shadow-moss/20"
            >
              Guardar en Catálogo
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
