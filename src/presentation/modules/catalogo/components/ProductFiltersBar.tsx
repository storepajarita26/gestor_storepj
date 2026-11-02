'use client';

import React from 'react';
import { Search, Plus, Download, FolderTree, X, LayoutGrid, Layers, Tag, ArrowUpDown } from 'lucide-react';
import { Category } from '@/domain/catalog/types';

export type CatalogSortOption = 'created_desc' | 'created_asc' | 'name_asc' | 'name_desc' | 'code_asc';

interface ProductFiltersBarProps {
  searchTerm: string;
  onSearchChange: (term: string) => void;
  categories: Category[];
  selectedCategory: string;
  onCategoryChange: (catId: string) => void;
  selectedSubcategory: string;
  onSubcategoryChange: (subcatId: string) => void;
  viewMode: 'producto' | 'sku';
  onViewModeChange: (mode: 'producto' | 'sku') => void;
  sortBy: CatalogSortOption;
  onSortChange: (sort: CatalogSortOption) => void;
  productsCount: number;
  skusCount: number;
  onOpenCreateModal: () => void;
  onOpenCreateSkuModal?: () => void;
  onExportCatalog: () => void;
  /** Abre la impresión de etiquetas con código de barras */
  onPrintLabels?: () => void;
  /** Sin permisos de administración se ocultan exportar y crear */
  canManage?: boolean;
}

export function ProductFiltersBar({
  searchTerm,
  onSearchChange,
  categories,
  selectedCategory,
  onCategoryChange,
  selectedSubcategory,
  onSubcategoryChange,
  viewMode,
  onViewModeChange,
  sortBy,
  onSortChange,
  productsCount,
  skusCount,
  onOpenCreateModal,
  onOpenCreateSkuModal,
  onExportCatalog,
  onPrintLabels,
  canManage = true,
}: ProductFiltersBarProps) {
  const mainCategories = categories.filter((c) => !c.parentId);
  const availableSubcategories = categories.filter(
    (c) => selectedCategory !== 'all' && c.parentId === selectedCategory
  );

  return (
    <div className="space-y-4">
      {/* Top action row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-4">

        {canManage && (
        <div className="flex items-center gap-2.5">
          <button
            onClick={onExportCatalog}
            className="flex items-center gap-1.5 bg-white hover:bg-surface border border-moss/20 text-ink text-xs font-bold px-3.5 py-2 rounded-xl transition-all shadow-xs"
            title="Descargar catálogo con variantes en Excel CSV"
          >
            <Download className="w-4 h-4 text-moss" />
            <span className="hidden sm:inline">Exportar Excel</span>
          </button>

          {onPrintLabels && (
            <button
              onClick={onPrintLabels}
              className="flex items-center gap-1.5 bg-white hover:bg-surface border border-moss/20 text-ink text-xs font-bold px-3.5 py-2 rounded-xl transition-all shadow-xs"
              title="Imprimir etiquetas con código de barras"
            >
              <Tag className="w-4 h-4 text-moss" />
              <span className="hidden sm:inline">Etiquetas</span>
            </button>
          )}

          {onOpenCreateSkuModal && (
            <button
              onClick={onOpenCreateSkuModal}
              className="flex items-center gap-1.5 bg-white hover:bg-surface border border-moss/20 text-moss text-xs font-bold px-3.5 py-2 rounded-xl transition-all shadow-xs"
              title="Crear una nueva variante SKU"
            >
              <Plus className="w-4 h-4 text-moss" />
              <span>Nuevo SKU</span>
            </button>
          )}

          <button
            onClick={onOpenCreateModal}
            className="flex items-center gap-2 bg-moss hover:bg-moss-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-md shadow-moss/20"
          >
            <Plus className="w-4 h-4 text-mustard" />
            <span>Nuevo Producto</span>
          </button>
        </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="erp-card p-3 sm:p-4 border border-moss/15 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar por nombre, SKU, color o código..."
            className="w-full bg-surface border border-moss/15 rounded-xl pl-9 pr-8 py-2 text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-moss"
          />
          {searchTerm && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-ink-muted hover:text-ink"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Category Filters & View Switcher */}
        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Switcher */}
          <div className="flex items-center bg-surface p-1 rounded-xl border border-moss/15 shrink-0">
            <button
              type="button"
              onClick={() => onViewModeChange('producto')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'producto'
                  ? 'bg-white text-moss shadow-xs border border-moss/20'
                  : 'text-ink-muted hover:text-ink'
              }`}
              title="Ver catálogo agrupado por Producto"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Por Producto</span>
              <span className="text-[10px] opacity-75 font-mono">({productsCount})</span>
            </button>

            <button
              type="button"
              onClick={() => onViewModeChange('sku')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'sku'
                  ? 'bg-white text-moss shadow-xs border border-moss/20'
                  : 'text-ink-muted hover:text-ink'
              }`}
              title="Ver catálogo desglosado por cada SKU individual"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Por SKU</span>
              <span className="text-[10px] opacity-75 font-mono">({skusCount})</span>
            </button>
          </div>

          {/* Main Category */}
          <select
            value={selectedCategory}
            onChange={(e) => {
              onCategoryChange(e.target.value);
              onSubcategoryChange('all');
            }}
            className="bg-surface border border-moss/20 rounded-xl px-3 py-2 text-xs font-semibold text-ink focus:outline-none focus:ring-1 focus:ring-moss"
          >
            <option value="all">Todas las Categorías</option>
            {mainCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {/* Subcategory (if available) */}
          {availableSubcategories.length > 0 && (
            <select
              value={selectedSubcategory}
              onChange={(e) => onSubcategoryChange(e.target.value)}
              className="bg-surface border border-moss/20 rounded-xl px-3 py-2 text-xs font-semibold text-ink focus:outline-none focus:ring-1 focus:ring-moss"
            >
              <option value="all">Todas las Subcategorías</option>
              {availableSubcategories.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  ↳ {sc.name}
                </option>
              ))}
            </select>
          )}

          {/* Sort Selector */}
          <div className="flex items-center gap-1.5 bg-surface border border-moss/20 rounded-xl px-2.5 py-1.5">
            <ArrowUpDown className="w-3.5 h-3.5 text-moss shrink-0" />
            <select
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value as CatalogSortOption)}
              className="bg-transparent text-xs font-semibold text-ink focus:outline-none cursor-pointer pr-1"
              title="Ordenar catálogo"
            >
              <option value="created_desc">Más recientes (Creación ↓)</option>
              <option value="created_asc">Más antiguos (Creación ↑)</option>
              <option value="name_asc">Nombre (A - Z)</option>
              <option value="name_desc">Nombre (Z - A)</option>
              <option value="code_asc">Código correlativo</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
