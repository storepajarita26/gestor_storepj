'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useDeepLink } from '@/presentation/hooks/useDeepLink';
import { dataStore } from '@/infrastructure/repositories/dataStore';
import { Product, ProductSku, Category, ProductType } from '@/domain/catalog/types';
import { StockLevel } from '@/domain/inventory/types';
import { ConfirmDialog } from '@/presentation/components/ui/ConfirmDialog';
import { useToast } from '@/presentation/components/ui/Toast';
import { Pagination } from '@/presentation/components/ui/Pagination';
import { exportCatalogToCsv } from '@/domain/shared/utils/exportUtils';
import { ProductFiltersBar, CatalogSortOption } from './components/ProductFiltersBar';
import { ProductCard } from './components/ProductCard';
import { SkuCard } from './components/SkuCard';
import { CreateProductModal } from './components/CreateProductModal';
import { CreateSkuModal } from './components/CreateSkuModal';
import { EditSkuModal } from './components/EditSkuModal';
import { EditProductModal } from './components/EditProductModal';
import { LabelsModal } from './components/LabelsModal';
import { useAuth } from '@/presentation/context/AuthContext';

export function CatalogoView() {
  const toast = useToast();
  // Sin sesión el catálogo es de solo lectura: sin costos, sin edición y solo artículos activos
  const { canManage } = useAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stockList, setStockList] = useState<StockLevel[]>([]);
  const [exchangeRate, setExchangeRate] = useState<number>(36.80);

  // View Mode: Por Producto o Por SKU
  const [viewMode, setViewMode] = useState<'producto' | 'sku'>('producto');

  // Ordenamiento (por defecto fecha de creación más reciente)
  const [sortBy, setSortBy] = useState<CatalogSortOption>('created_desc');

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  // Búsqueda global: ?q=<texto> llega ya filtrado
  useDeepLink('q', (q) => setSearchTerm(q));
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('all');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(12);

  // Modals State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreateSkuModalOpen, setIsCreateSkuModalOpen] = useState(false);
  const [selectedProductForNewSku, setSelectedProductForNewSku] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingSkuState, setEditingSkuState] = useState<{
    sku: ProductSku | null;
    product: Product | null;
  }>({
    sku: null,
    product: null,
  });

  const refreshData = () => {
    setProducts(dataStore.getProducts());
    setCategories(dataStore.getCategories());
    setStockList(dataStore.getStock());
    setExchangeRate(dataStore.getExchangeRate());
  };

  useEffect(() => {
    refreshData();
    const unsub = dataStore.subscribe(refreshData);
    return unsub;
  }, []);

  // Map stock by SKU ID for fast O(1) lookup
  const stockMap = useMemo(() => {
    const map: Record<string, StockLevel> = {};
    stockList.forEach((s) => {
      map[s.skuId] = s;
    });
    return map;
  }, [stockList]);

  // Productos visibles: el público solo ve productos y variantes activos
  const visibleProducts = useMemo(() => {
    if (canManage) return products;
    return products
      .filter((p) => p.isActive)
      .map((p) => ({ ...p, skus: (p.skus || []).filter((s) => s.isActive) }))
      .filter((p) => p.skus.length > 0);
  }, [products, canManage]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return visibleProducts.filter((p) => {
      // Category filter
      if (selectedCategory !== 'all' && p.categoryId !== selectedCategory) {
        return false;
      }
      // Subcategory filter
      if (selectedSubcategory !== 'all' && p.subcategoryId !== selectedSubcategory) {
        return false;
      }
      // Search filter
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchesName = p.name.toLowerCase().includes(query);
        const matchesCode = (p.productCode || '').toLowerCase().includes(query);
        const matchesDesc = (p.description || '').toLowerCase().includes(query);
        const matchesSku = (p.skus || []).some(
          (s) =>
            s.skuCode.toLowerCase().includes(query) ||
            (s.colorName || '').toLowerCase().includes(query) ||
            (s.size || '').toLowerCase().includes(query)
        );
        return matchesName || matchesCode || matchesDesc || matchesSku;
      }

      return true;
    });
  }, [visibleProducts, selectedCategory, selectedSubcategory, searchTerm]);

  // Flattened all SKUs with their parent product
  const allProductSkus = useMemo(() => {
    return visibleProducts.flatMap((p) => (p.skus || []).map((s) => ({ sku: s, product: p })));
  }, [visibleProducts]);

  // Filtered SKUs
  const filteredSkus = useMemo(() => {
    return allProductSkus.filter(({ sku, product }) => {
      if (selectedCategory !== 'all' && product.categoryId !== selectedCategory) return false;
      if (selectedSubcategory !== 'all' && product.subcategoryId !== selectedSubcategory) return false;
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchesName = product.name.toLowerCase().includes(query);
        const matchesProductCode = (product.productCode || '').toLowerCase().includes(query);
        const matchesSkuCode = sku.skuCode.toLowerCase().includes(query);
        const matchesSkuDesc = (sku.skuDescription || '').toLowerCase().includes(query);
        const matchesColor = (sku.colorName || '').toLowerCase().includes(query);
        const matchesSize = (sku.size || '').toLowerCase().includes(query);
        return matchesName || matchesProductCode || matchesSkuCode || matchesSkuDesc || matchesColor || matchesSize;
      }
      return true;
    });
  }, [allProductSkus, selectedCategory, selectedSubcategory, searchTerm]);

  // Sorted Products based on selected sort option (default: creation date descending)
  const sortedProducts = useMemo(() => {
    return [...filteredProducts].sort((a, b) => {
      if (sortBy === 'created_desc') {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (timeB !== timeA) return timeB - timeA;
        return (b.productCode || b.id || '').localeCompare(a.productCode || a.id || '');
      }
      if (sortBy === 'created_asc') {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (timeA !== timeB) return timeA - timeB;
        return (a.productCode || a.id || '').localeCompare(b.productCode || b.id || '');
      }
      if (sortBy === 'name_asc') {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === 'name_desc') {
        return b.name.localeCompare(a.name);
      }
      if (sortBy === 'code_asc') {
        return (a.productCode || '').localeCompare(b.productCode || '', undefined, { numeric: true });
      }
      return 0;
    });
  }, [filteredProducts, sortBy]);

  // Sorted SKUs based on selected sort option (default: creation date descending)
  const sortedSkus = useMemo(() => {
    return [...filteredSkus].sort((a, b) => {
      if (sortBy === 'created_desc') {
        const timeA = a.sku.createdAt
          ? new Date(a.sku.createdAt).getTime()
          : (a.product.createdAt ? new Date(a.product.createdAt).getTime() : 0);
        const timeB = b.sku.createdAt
          ? new Date(b.sku.createdAt).getTime()
          : (b.product.createdAt ? new Date(b.product.createdAt).getTime() : 0);
        if (timeB !== timeA) return timeB - timeA;
        return (b.sku.skuCode || '').localeCompare(a.sku.skuCode || '', undefined, { numeric: true });
      }
      if (sortBy === 'created_asc') {
        const timeA = a.sku.createdAt
          ? new Date(a.sku.createdAt).getTime()
          : (a.product.createdAt ? new Date(a.product.createdAt).getTime() : 0);
        const timeB = b.sku.createdAt
          ? new Date(b.sku.createdAt).getTime()
          : (b.product.createdAt ? new Date(b.product.createdAt).getTime() : 0);
        if (timeA !== timeB) return timeA - timeB;
        return (a.sku.skuCode || '').localeCompare(b.sku.skuCode || '', undefined, { numeric: true });
      }
      if (sortBy === 'name_asc') {
        const cmp = a.product.name.localeCompare(b.product.name);
        return cmp !== 0 ? cmp : (a.sku.skuCode || '').localeCompare(b.sku.skuCode || '', undefined, { numeric: true });
      }
      if (sortBy === 'name_desc') {
        const cmp = b.product.name.localeCompare(a.product.name);
        return cmp !== 0 ? cmp : (b.sku.skuCode || '').localeCompare(a.sku.skuCode || '', undefined, { numeric: true });
      }
      if (sortBy === 'code_asc') {
        return (a.sku.skuCode || '').localeCompare(b.sku.skuCode || '', undefined, { numeric: true });
      }
      return 0;
    });
  }, [filteredSkus, sortBy]);

  // Paginated calculations based on active view mode
  const totalItems = viewMode === 'producto' ? sortedProducts.length : sortedSkus.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedProducts.slice(start, start + itemsPerPage);
  }, [sortedProducts, currentPage, itemsPerPage]);

  const paginatedSkus = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedSkus.slice(start, start + itemsPerPage);
  }, [sortedSkus, currentPage, itemsPerPage]);

  const handleCreateProduct = (data: {
    name: string;
    productCode?: string;
    categoryId?: string;
    subcategoryId?: string;
    description?: string;
    seoDescription?: string;
    descriptionHtml?: string;
    productType: ProductType;
    skus: Omit<ProductSku, 'id' | 'productId'>[];
  }) => {
    const cat = categories.find((c) => c.id === data.categoryId);
    const subcat = categories.find((c) => c.id === data.subcategoryId);

    const created = dataStore.addProduct({
      name: data.name,
      productCode: data.productCode,
      slug: data.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      categoryId: data.categoryId,
      categoryName: cat?.name || 'General',
      subcategoryId: data.subcategoryId,
      subcategoryName: subcat?.name,
      description: data.description,
      seoDescription: data.seoDescription,
      descriptionHtml: data.descriptionHtml || undefined,
      productType: data.productType,
      isFeatured: false,
      isActive: true,
      skus: data.skus as any,
    });

    toast.success(`Producto "${created.name}" (${created.productCode}) creado con éxito.`, 'Catálogo Actualizado');
  };

  const handleSaveProduct = async (updated: Product) => {
    const res = await dataStore.updateProduct(updated);
    if (res.success) {
      toast.success(res.message || `Producto "${updated.name}" actualizado.`, 'Producto Actualizado');
    } else {
      toast.warning(res.message || 'Actualizado localmente', 'Aviso');
    }
    setEditingProduct(null);
  };

  // Borrado con confirmación (muestra lo que se pierde) y "Deshacer" durante unos segundos
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const deleteImpact = productToDelete ? dataStore.getProductDeleteImpact(productToDelete.id) : null;
  const hasSales = Boolean(deleteImpact && deleteImpact.salesLines > 0);

  const handleDeleteProduct = (productId: string) => {
    setProductToDelete(products.find((p) => p.id === productId) || null);
  };

  const confirmDeleteProduct = async () => {
    const product = productToDelete;
    setProductToDelete(null);
    if (!product) return;
    if (hasSales) {
      // Con ventas registradas no se borra: se desactiva (deja de mostrarse y venderse)
      const res = await dataStore.updateProduct({ ...product, isActive: false });
      if (res.success) toast.success(`"${product.name}" quedó inactivo: ya no aparece para vender.`, 'Producto desactivado');
      else toast.warning(res.message || 'Se guardó en este equipo.', 'Producto desactivado en este equipo');
      return;
    }
    const handle = dataStore.deleteProduct(product.id);
    if (!handle) return;
    toast.show({
      type: 'info',
      title: 'Producto eliminado',
      message: `"${product.name}" y sus variantes se eliminaron.`,
      duration: dataStore.getUndoWindowMs(),
      action: {
        label: 'Deshacer',
        onClick: () => {
          if (dataStore.undoDelete(handle.token)) toast.success(`"${product.name}" se restauró.`);
          else toast.warning('Ya no se puede deshacer: el borrado se envió a la nube.');
        },
      },
    });
  };

  const handleExportCatalog = () => {
    exportCatalogToCsv(products);
    toast.info('Archivo Excel del catálogo descargado correctamente.');
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Filters & Actions Bar */}
      <ProductFiltersBar
        searchTerm={searchTerm}
        onSearchChange={(term) => {
          setSearchTerm(term);
          setCurrentPage(1);
        }}
        categories={categories}
        selectedCategory={selectedCategory}
        onCategoryChange={(catId) => {
          setSelectedCategory(catId);
          setCurrentPage(1);
        }}
        selectedSubcategory={selectedSubcategory}
        onSubcategoryChange={(subcatId) => {
          setSelectedSubcategory(subcatId);
          setCurrentPage(1);
        }}
        viewMode={viewMode}
        onViewModeChange={(mode) => {
          setViewMode(mode);
          setCurrentPage(1);
        }}
        sortBy={sortBy}
        onSortChange={(sort) => {
          setSortBy(sort);
          setCurrentPage(1);
        }}
        productsCount={filteredProducts.length}
        skusCount={filteredSkus.length}
        onOpenCreateModal={() => setIsCreateModalOpen(true)}
        onOpenCreateSkuModal={() => {
          setSelectedProductForNewSku(null);
          setIsCreateSkuModalOpen(true);
        }}
        onExportCatalog={handleExportCatalog}
        onPrintLabels={canManage ? () => setLabelsOpen(true) : undefined}
        canManage={canManage}
      />

      {/* Grid Content */}
      {totalItems > 0 ? (
        <div className="space-y-4">
          {viewMode === 'producto' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {paginatedProducts.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  stockMap={stockMap}
                  exchangeRate={exchangeRate}
                  canManage={canManage}
                  onEditSku={(sku, prod) => setEditingSkuState({ sku, product: prod })}
                  onEditProduct={(prod) => setEditingProduct(prod)}
                  onDeleteProduct={handleDeleteProduct}
                  onAddSku={(prod) => {
                    setSelectedProductForNewSku(prod);
                    setIsCreateSkuModalOpen(true);
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {paginatedSkus.map(({ sku, product }) => (
                <SkuCard
                  key={sku.id}
                  sku={sku}
                  product={product}
                  stockLevel={stockMap[sku.id]}
                  exchangeRate={exchangeRate}
                  canManage={canManage}
                  onEditSku={(s, p) => setEditingSkuState({ sku: s, product: p })}
                  onEditProduct={(p) => setEditingProduct(p)}
                  onDeleteProduct={handleDeleteProduct}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={itemsPerPage}
            pageSizeOptions={[4, 8, 12, 24, 48]}
            onPageChange={setCurrentPage}
            onItemsPerPageChange={(newCount) => {
              setItemsPerPage(newCount);
              setCurrentPage(1);
            }}
          />
        </div>
      ) : (
        <div className="erp-card p-12 text-center border border-dashed border-moss/20 bg-white/50 space-y-3">
          <div className="w-12 h-12 rounded-full bg-moss/10 text-moss flex items-center justify-center mx-auto text-xl font-bold">
            0
          </div>
          <h3 className="font-bold text-sm text-ink">No se encontraron resultados</h3>
          <p className="text-xs text-ink-muted max-w-sm mx-auto">
            {searchTerm || selectedCategory !== 'all'
              ? 'Intenta ajustar los filtros de búsqueda o categoría.'
              : canManage
                ? 'Aún no has registrado productos en el catálogo. Pulsa "Nuevo Producto" para comenzar.'
                : 'Pronto publicaremos nuevos productos en el catálogo.'}
          </p>
        </div>
      )}

      {/* Create Product Modal */}
      <CreateProductModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        categories={categories}
        exchangeRate={exchangeRate}
        initialProductCode={dataStore.getNextProductCode()}
        onSubmit={handleCreateProduct}
      />

      {/* Create SKU Modal */}
      <CreateSkuModal
        isOpen={isCreateSkuModalOpen}
        onClose={() => {
          setIsCreateSkuModalOpen(false);
          setSelectedProductForNewSku(null);
        }}
        products={products}
        defaultProductId={selectedProductForNewSku?.id}
        onSkuCreated={(newSku, prod) => {
          // Si deseamos abrir de inmediato la edición o simplemente refrescar
          setEditingSkuState({ sku: newSku, product: prod });
        }}
      />

      {/* Edit SKU Modal */}
      <EditSkuModal
        isOpen={Boolean(editingSkuState.sku)}
        onClose={() => setEditingSkuState({ sku: null, product: null })}
        sku={editingSkuState.sku}
        product={editingSkuState.product}
        productName={editingSkuState.product?.name}
        onSelectSku={(s) => setEditingSkuState((prev) => ({ ...prev, sku: s }))}
        onOpenCreateSku={(prod) => {
          setEditingSkuState({ sku: null, product: null });
          setSelectedProductForNewSku(prod);
          setIsCreateSkuModalOpen(true);
        }}
      />

      {/* Edit Product Modal */}
      <EditProductModal
        isOpen={Boolean(editingProduct)}
        onClose={() => setEditingProduct(null)}
        product={editingProduct}
        categories={categories}
        onSave={handleSaveProduct}
      />
      <LabelsModal isOpen={labelsOpen} onClose={() => setLabelsOpen(false)} products={products} />

      <ConfirmDialog
        isOpen={Boolean(productToDelete)}
        title={hasSales ? '¿Desactivar el producto?' : '¿Eliminar el producto?'}
        confirmLabel={hasSales ? 'Desactivar' : 'Eliminar'}
        tone={hasSales ? 'default' : 'danger'}
        onCancel={() => setProductToDelete(null)}
        onConfirm={confirmDeleteProduct}
      >
        <p>
          <strong>{productToDelete?.name}</strong>
          {productToDelete?.productCode ? ` (${productToDelete.productCode})` : ''}
        </p>
        {deleteImpact && (
          <ul className="list-disc pl-5 text-ink-muted">
            <li>{deleteImpact.skus} variante(s)</li>
            <li>{deleteImpact.unitsInStock} unidad(es) en bodega</li>
            <li>{deleteImpact.salesLines} línea(s) en facturas</li>
          </ul>
        )}
        {hasSales ? (
          <p>
            Tiene ventas registradas, por eso no se puede eliminar sin perder el historial. Se desactivará: deja de
            mostrarse en el catálogo y en el punto de venta, y puede reactivarlo cuando quiera.
          </p>
        ) : (
          <p>Se eliminará con todas sus variantes. Tendrá unos segundos para deshacerlo.</p>
        )}
      </ConfirmDialog>
    </div>
  );
}
