'use client';

import React, { useState, useEffect } from 'react';
import {
  Settings,
  DollarSign,
  FolderTree,
  Sliders,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  Layers,
  Store,
  Tag,
  ArrowRight,
} from 'lucide-react';
import { Modal } from '@/presentation/components/ui/Modal';
import { dataStore } from '@/infrastructure/repositories/dataStore';
import { Category } from '@/domain/catalog/types';
import { formatNIO } from '@/domain/shared/utils/currencyFormatter';

export function ConfiguracionView() {
  const [activeTab, setActiveTab] = useState<'tasa' | 'categorias' | 'pricing' | 'tienda'>('tasa');
  
  // Currency Rate State
  const [exchangeRate, setExchangeRate] = useState<number>(36.80);
  const [rateInput, setRateInput] = useState<string>('36.80');
  const [rateSavedMessage, setRateSavedMessage] = useState(false);

  // Categories State
  const [categories, setCategories] = useState<Category[]>([]);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [categoryLevel, setCategoryLevel] = useState<'1' | '2'>('1');
  const [selectedParentId, setSelectedParentId] = useState<string>('');
  const [categoryName, setCategoryName] = useState('');
  const [categoryDescription, setCategoryDescription] = useState('');

  const refreshData = () => {
    const rate = dataStore.getExchangeRate();
    setExchangeRate(rate);
    setRateInput(rate.toString());
    setCategories(dataStore.getCategories());
  };

  useEffect(() => {
    refreshData();
    const unsub = dataStore.subscribe(refreshData);
    return unsub;
  }, []);

  const handleSaveRate = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(rateInput);
    if (!isNaN(parsed) && parsed > 0) {
      dataStore.setExchangeRate(parsed);
      setRateSavedMessage(true);
      setTimeout(() => setRateSavedMessage(false), 3000);
    }
  };

  const mainCategories = categories.filter((c) => !c.parentId);

  const handleOpenCategoryModal = (level: '1' | '2', parentId?: string) => {
    setCategoryLevel(level);
    setSelectedParentId(parentId || mainCategories[0]?.id || '');
    setCategoryName('');
    setCategoryDescription('');
    setIsCategoryModalOpen(true);
  };

  const handleSaveCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryName.trim()) return;

    dataStore.addCategory({
      name: categoryName.trim(),
      slug: categoryName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      parentId: categoryLevel === '2' ? selectedParentId : undefined,
      description: categoryDescription,
      isActive: true,
      displayOrder: categories.length + 1,
    });

    setIsCategoryModalOpen(false);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-ink tracking-tight flex items-center gap-2">
          <Settings className="w-5 h-5 text-moss" />
          Configuración Global del Sistema ERP
        </h1>
        <p className="text-xs text-ink-muted">
          Ajuste centralizado de tasa de cambio USD/NIO, jerarquía de 2 niveles de categorías, reglas de pricing y parámetros de la tienda.
        </p>
      </div>

      {/* Tabs Menu */}
      <div className="erp-card p-2 rounded-2xl flex flex-wrap items-center gap-2">
        <button
          onClick={() => setActiveTab('tasa')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'tasa'
              ? 'bg-moss text-white shadow-sm'
              : 'text-ink-muted hover:text-ink hover:bg-surface'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          <span>Tasa de Cambio Oficial</span>
        </button>

        <button
          onClick={() => setActiveTab('categorias')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'categorias'
              ? 'bg-moss text-white shadow-sm'
              : 'text-ink-muted hover:text-ink hover:bg-surface'
          }`}
        >
          <FolderTree className="w-4 h-4" />
          <span>Categorías & Subcategorías</span>
        </button>

        <button
          onClick={() => setActiveTab('pricing')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'pricing'
              ? 'bg-moss text-white shadow-sm'
              : 'text-ink-muted hover:text-ink hover:bg-surface'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Reglas de Pricing & Márgenes</span>
        </button>

        <button
          onClick={() => setActiveTab('tienda')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'tienda'
              ? 'bg-moss text-white shadow-sm'
              : 'text-ink-muted hover:text-ink hover:bg-surface'
          }`}
        >
          <Store className="w-4 h-4" />
          <span>Datos de la Tienda</span>
        </button>
      </div>

      {/* TAB 1: TASA DE CAMBIO */}
      {activeTab === 'tasa' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="erp-card p-6 md:col-span-2 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-moss/10">
              <div>
                <h3 className="font-bold text-sm text-ink">Tasa de Cambio Oficial (USD &rarr; NIO Córdobas)</h3>
                <p className="text-xs text-ink-muted">Afecta automáticamente las compras en Shein/Amazon, prorrateo y conversiones en todo el ERP.</p>
              </div>
              <span className="bg-mustard/30 text-moss-950 px-2.5 py-1 rounded-full text-xs font-bold border border-mustard/50">
                Tasa Activa
              </span>
            </div>

            <form onSubmit={handleSaveRate} className="space-y-4 pt-2">
              <div>
                <label className="text-xs font-bold text-ink-muted block mb-1">
                  Valor Actual: 1.00 USD equivale a:
                </label>
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-2.5 text-xs font-bold text-moss">C$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      required
                      value={rateInput}
                      onChange={(e) => setRateInput(e.target.value)}
                      className="w-full bg-surface border border-moss/20 rounded-xl pl-9 pr-3 py-2 text-sm text-ink font-bold focus:outline-none focus:border-moss"
                    />
                  </div>
                  <button
                    type="submit"
                    className="bg-moss hover:bg-moss-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition-all shadow-md shadow-moss/20"
                  >
                    Actualizar Tasa
                  </button>
                </div>
              </div>

              {rateSavedMessage && (
                <div className="p-3 bg-emerald-600/10 border border-emerald-600/20 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Tasa de cambio actualizada a C$ {exchangeRate.toFixed(2)} exitosamente.</span>
                </div>
              )}
            </form>

            <div className="p-4 bg-surface rounded-xl border border-moss/10 text-xs space-y-2 text-ink">
              <span className="font-bold block text-moss">Ejemplo de Conversión en Tiempo Real:</span>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-white p-2.5 rounded-lg border border-moss/10 shadow-xs">
                  <span className="text-[10px] text-ink-muted block font-medium">US$ 10.00 en Shein</span>
                  <strong className="text-xs text-ink">{formatNIO(10 * exchangeRate)}</strong>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-moss/10 shadow-xs">
                  <span className="text-[10px] text-ink-muted block font-medium">US$ 50.00 en Amazon</span>
                  <strong className="text-xs text-ink">{formatNIO(50 * exchangeRate)}</strong>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-moss/10 shadow-xs">
                  <span className="text-[10px] text-ink-muted block font-medium">US$ 100.00 Lote</span>
                  <strong className="text-xs text-ink">{formatNIO(100 * exchangeRate)}</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="erp-card p-6 flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-sm text-ink pb-2 border-b border-moss/10">Historial & Vigencia</h3>
              <p className="text-xs text-ink-muted mt-2">
                La tasa establecida se utiliza como base para la conversión de todos los pedidos importados y costos prorrateados.
              </p>
              <div className="mt-4 space-y-2 text-xs">
                <div className="flex justify-between py-1.5 border-b border-moss/10">
                  <span className="text-ink-muted">Última Modificación:</span>
                  <span className="font-bold text-ink">Hoy en vivo</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-moss/10">
                  <span className="text-ink-muted">Tasa Activa:</span>
                  <span className="font-extrabold text-moss">C$ {exchangeRate.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-ink-muted">Moneda Local:</span>
                  <span className="font-bold text-ink">NIO (Córdobas)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CATEGORÍAS & SUBCATEGORÍAS */}
      {activeTab === 'categorias' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-sm text-ink">Estructura Jerárquica de Categorías (Nivel 1 y Nivel 2)</h3>
              <p className="text-xs text-ink-muted">Organiza el catálogo en Categorías Principales y Subcategorías para una navegación intuitiva de los clientes.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleOpenCategoryModal('1')}
                className="flex items-center gap-1.5 bg-moss hover:bg-moss-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-all shadow-sm"
              >
                <Plus className="w-3.5 h-3.5 text-mustard" />
                <span>+ Nueva Categoría Principal (N1)</span>
              </button>
              <button
                onClick={() => handleOpenCategoryModal('2')}
                className="flex items-center gap-1.5 bg-surface hover:bg-surface-soft border border-moss/20 text-ink text-xs font-bold px-3.5 py-2 rounded-xl transition-all shadow-xs"
              >
                <Plus className="w-3.5 h-3.5 text-moss" />
                <span>+ Nueva Subcategoría (N2)</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {mainCategories.map((mainCat) => {
              const subcats = categories.filter((c) => c.parentId === mainCat.id);

              return (
                <div key={mainCat.id} className="erp-card p-5 space-y-3">
                  <div className="flex items-start justify-between pb-3 border-b border-moss/10">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-extrabold uppercase bg-moss/10 text-moss px-2 py-0.5 rounded border border-moss/20">
                          Nivel 1 Principal
                        </span>
                        <h4 className="font-bold text-sm text-ink">{mainCat.name}</h4>
                      </div>
                      <p className="text-xs text-ink-muted mt-1">{mainCat.description || 'Sin descripción'}</p>
                    </div>

                    <button
                      onClick={() => dataStore.deleteCategory(mainCat.id)}
                      className="text-ink-muted hover:text-rose-600 p-1 transition-colors"
                      title="Eliminar categoría y subcategorías"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Subcategorías asociadas */}
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-bold text-ink-muted mb-2">
                      <span>Subcategorías ({subcats.length}):</span>
                      <button
                        onClick={() => handleOpenCategoryModal('2', mainCat.id)}
                        className="text-moss hover:underline font-bold text-[10px] flex items-center gap-0.5"
                      >
                        <Plus className="w-3 h-3" /> Agregar Subcategoría
                      </button>
                    </div>

                    {subcats.length === 0 ? (
                      <p className="text-xs text-ink-muted italic py-1">No tiene subcategorías asociadas.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {subcats.map((sub) => (
                          <div
                            key={sub.id}
                            className="bg-surface border border-moss/15 px-2.5 py-1 rounded-lg text-xs flex items-center gap-1.5 shadow-xs"
                          >
                            <span className="font-bold text-ink">{sub.name}</span>
                            <button
                              onClick={() => dataStore.deleteCategory(sub.id)}
                              className="text-ink-muted hover:text-rose-600 ml-1"
                              title="Eliminar subcategoría"
                            >
                              &times;
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: PRICING */}
      {activeTab === 'pricing' && (
        <div className="erp-card p-6 space-y-4">
          <h3 className="font-bold text-sm text-ink pb-2 border-b border-moss/10">Reglas de Margen Comercial y Pricing Sugerido</h3>
          <p className="text-xs text-ink-muted">
            Fórmulas aplicadas de forma pura en el motor de prorrateo para sugerir el precio de venta final al recibir un lote:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="bg-surface p-4 rounded-xl border border-moss/15 shadow-xs">
              <span className="text-[10px] font-bold uppercase text-moss block mb-1">Regla 1: Productos Livianos / Accesorios</span>
              <h4 className="font-extrabold text-sm text-ink">Costo Landed &lt; C$ 100</h4>
              <p className="text-xs text-ink-muted mt-1">Margen comercial sugerido:</p>
              <p className="text-xl font-extrabold text-moss mt-1">40% de Ganancia</p>
              <span className="text-[10px] text-ink-muted font-mono mt-1 block">Precio = Costo / 0.60</span>
            </div>

            <div className="bg-surface p-4 rounded-xl border border-moss/15 shadow-xs">
              <span className="text-[10px] font-bold uppercase text-moss block mb-1">Regla 2: Vestidos, Conjuntos & Gadgets</span>
              <h4 className="font-extrabold text-sm text-ink">Costo Landed &ge; C$ 100</h4>
              <p className="text-xs text-ink-muted mt-1">Margen comercial sugerido:</p>
              <p className="text-xl font-extrabold text-moss mt-1">30% de Ganancia</p>
              <span className="text-[10px] text-ink-muted font-mono mt-1 block">Precio = Costo / 0.70</span>
            </div>

            <div className="bg-surface p-4 rounded-xl border border-moss/15 shadow-xs">
              <span className="text-[10px] font-bold uppercase text-purple-800 block mb-1">Regla 3: Compras Bajo Pedido</span>
              <h4 className="font-extrabold text-sm text-ink">Modalidad Especial</h4>
              <p className="text-xs text-ink-muted mt-1">Margen acordado con cliente:</p>
              <p className="text-xl font-extrabold text-purple-800 mt-1">25% de Ganancia</p>
              <span className="text-[10px] text-ink-muted font-mono mt-1 block">Precio = Costo / 0.75</span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: DATOS TIENDA */}
      {activeTab === 'tienda' && (
        <div className="erp-card p-6 space-y-4 max-w-2xl">
          <h3 className="font-bold text-sm text-ink pb-2 border-b border-moss/10">Información del Negocio</h3>
          <div className="space-y-3 text-xs">
            <div>
              <label className="font-bold text-ink-muted block mb-1">Nombre Comercial de la Tienda</label>
              <input
                type="text"
                defaultValue="Pajarita Store"
                className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-ink font-bold"
              />
            </div>
            <div>
              <label className="font-bold text-ink-muted block mb-1">WhatsApp de Atención & Pedidos</label>
              <input
                type="text"
                defaultValue="+505 8899-7766"
                className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-ink font-bold"
              />
            </div>
            <div>
              <label className="font-bold text-ink-muted block mb-1">Ubicación / Ciudad Central</label>
              <input
                type="text"
                defaultValue="Managua, Nicaragua"
                className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-ink"
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal Crear / Editar Categoría */}
      <Modal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        title={categoryLevel === '1' ? 'Crear Categoría Principal (Nivel 1)' : 'Crear Subcategoría (Nivel 2)'}
        subtitle={categoryLevel === '1' ? 'Ej: Ropa Dama, Ropa Caballero, Accesorios' : 'Ej: Vestidos, Blusas, Fundas iPhone'}
        maxWidth="md"
      >
        <form onSubmit={handleSaveCategory} className="space-y-4">
          {categoryLevel === '2' && (
            <div>
              <label className="text-[11px] font-bold text-ink-muted block mb-1">Categoría Padre (Nivel 1) *</label>
              <select
                value={selectedParentId}
                onChange={(e) => setSelectedParentId(e.target.value)}
                className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-moss"
              >
                {mainCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-[11px] font-bold text-ink-muted block mb-1">Nombre de la Categoría *</label>
            <input
              type="text"
              required
              placeholder={categoryLevel === '1' ? 'Ej: Calzado & Zapatos' : 'Ej: Sandalias'}
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-moss"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-ink-muted block mb-1">Descripción (Opcional)</label>
            <input
              type="text"
              placeholder="Detalles para el catálogo..."
              value={categoryDescription}
              onChange={(e) => setCategoryDescription(e.target.value)}
              className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-xs text-ink"
            />
          </div>

          <div className="pt-4 border-t border-moss/10 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsCategoryModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-ink-muted hover:bg-surface"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-bold bg-moss hover:bg-moss-700 text-white shadow-md shadow-moss/20"
            >
              Guardar Categoría
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
