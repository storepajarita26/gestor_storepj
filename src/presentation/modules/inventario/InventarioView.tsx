'use client';

import React, { useState, useEffect } from 'react';
import {
  Warehouse,
  Boxes,
  Layers,
  History,
  Search,
} from 'lucide-react';
import { Modal } from '@/presentation/components/ui/Modal';
import { dataStore } from '@/infrastructure/repositories/dataStore';
import { formatNIO } from '@/domain/shared/utils/currencyFormatter';
import { StockLevel, KardexMovement, UnbundleRequest } from '@/domain/inventory/types';
import { ProductSku } from '@/domain/catalog/types';

export function InventarioView() {
  const [stockList, setStockList] = useState<StockLevel[]>([]);
  const [kardexList, setKardexList] = useState<KardexMovement[]>([]);
  const [skus, setSkus] = useState<ProductSku[]>([]);
  const [activeTab, setActiveTab] = useState<'stock' | 'kardex'>('stock');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Unbundling Modal
  const [isUnbundleOpen, setIsUnbundleOpen] = useState(false);
  const [selectedBundleSku, setSelectedBundleSku] = useState<string>('');
  const [packsToUnbundle, setPacksToUnbundle] = useState<number>(1);
  const [targetUnits, setTargetUnits] = useState<{ skuId: string; quantity: number }[]>([]);
  const [unbundleFeedback, setUnbundleFeedback] = useState<{ msg: string; err: boolean } | null>(null);

  const refreshData = () => {
    setStockList(dataStore.getStock());
    setKardexList(dataStore.getKardex());
    setSkus(dataStore.getAllSkus());
  };

  useEffect(() => {
    refreshData();
    const unsub = dataStore.subscribe(refreshData);
    return unsub;
  }, []);

  const handleOpenUnbundleModal = (bundleSku?: StockLevel) => {
    const defaultBundleId = bundleSku?.skuId || skus.find(s => s.skuCode.includes('PACK'))?.id || skus[0]?.id || '';
    setSelectedBundleSku(defaultBundleId);
    setPacksToUnbundle(1);
    
    // Default 3 unit items target
    const unitSkus = skus.filter(s => s.id !== defaultBundleId);
    setTargetUnits(unitSkus.slice(0, 3).map(u => ({ skuId: u.id, quantity: 1 })));
    setUnbundleFeedback(null);
    setIsUnbundleOpen(true);
  };

  const handleExecuteUnbundle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBundleSku || targetUnits.length === 0) return;

    const request: UnbundleRequest = {
      bundleSkuId: selectedBundleSku,
      quantityPacksToUnbundle: packsToUnbundle,
      targetUnitSkus: targetUnits.map(tu => {
        const found = skus.find(s => s.id === tu.skuId);
        return {
          unitSkuId: tu.skuId,
          unitSkuCode: found?.skuCode,
          unitSkuName: found?.skuDescription,
          quantityToAdd: tu.quantity * packsToUnbundle,
        };
      }),
    };

    const res = dataStore.unbundlePack(request);
    if (res.success) {
      setIsUnbundleOpen(false);
    } else {
      setUnbundleFeedback({ msg: res.message, err: true });
    }
  };

  const filteredStock = stockList.filter(
    s =>
      s.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.skuCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.colorName || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink tracking-tight flex items-center gap-2">
            <Warehouse className="w-5 h-5 text-moss" />
            Control de Inventario, Kardex & Desempaque
          </h1>
          <p className="text-xs text-ink-muted">
            Monitoreo de existencias físicas disponibles, historial de movimientos y asistente de despaquetizado.
          </p>
        </div>

        <button
          onClick={() => handleOpenUnbundleModal()}
          className="flex items-center gap-2 bg-moss hover:bg-moss-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-md shadow-moss/20"
        >
          <Layers className="w-4 h-4 text-mustard" />
          <span>Transformar Paquete a Unidades</span>
        </button>
      </div>

      {/* Tabs and Search */}
      <div className="erp-card p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('stock')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'stock'
                ? 'bg-moss text-white shadow-sm'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <Boxes className="w-4 h-4" />
            <span>Existencias Actuales</span>
          </button>
          <button
            onClick={() => setActiveTab('kardex')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'kardex'
                ? 'bg-moss text-white shadow-sm'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Movimientos Kardex ({kardexList.length})</span>
          </button>
        </div>

        <div className="flex items-center gap-2 bg-surface border border-moss/15 rounded-xl px-3 py-2 w-full sm:w-72 shadow-xs">
          <Search className="w-4 h-4 text-ink-muted" />
          <input
            type="text"
            placeholder="Buscar por SKU, producto o color..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent text-xs text-ink placeholder-ink-muted focus:outline-none w-full"
          />
        </div>
      </div>

      {/* Main Content: Stock Table or Kardex */}
      {activeTab === 'stock' ? (
        <div className="erp-card rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-soft text-ink-muted border-b border-moss/10 font-bold">
                <tr>
                  <th className="p-4">SKU / Producto</th>
                  <th className="p-4 text-center">Talla</th>
                  <th className="p-4 text-center">Color</th>
                  <th className="p-4 text-right">Costo Unit. (C$)</th>
                  <th className="p-4 text-right">Precio Venta (C$)</th>
                  <th className="p-4 text-center font-bold text-ink">Disponible</th>
                  <th className="p-4 text-right">Valuación Total</th>
                  <th className="p-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-moss/10 text-ink">
                {filteredStock.map((item) => (
                  <tr key={item.skuId} className="hover:bg-surface transition-colors">
                    <td className="p-4">
                      <p className="font-bold text-ink">{item.productName}</p>
                      <span className="font-mono text-[11px] text-ink-muted">{item.skuCode}</span>
                    </td>
                    <td className="p-4 text-center">
                      <span className="bg-surface border border-moss/15 text-ink px-2 py-0.5 rounded text-[11px] font-bold">
                        {item.size || 'Única'}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {item.colorHex && (
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-moss/30 shadow-xs"
                            style={{ backgroundColor: item.colorHex }}
                          />
                        )}
                        <span className="font-medium">{item.colorName || 'N/A'}</span>
                      </div>
                    </td>
                    <td className="p-4 text-right font-medium">{formatNIO(item.costPriceNio)}</td>
                    <td className="p-4 text-right font-bold text-moss-800">{formatNIO(item.salePriceNio)}</td>
                    <td className="p-4 text-center">
                      <span
                        className={`font-bold px-2.5 py-1 rounded-full text-xs ${
                          item.quantityAvailable > 5
                            ? 'bg-emerald-600/10 text-emerald-800 border border-emerald-600/25'
                            : item.quantityAvailable > 0
                            ? 'bg-amber-500/10 text-amber-900 border border-amber-500/30'
                            : 'bg-rose-500/10 text-rose-800 border border-rose-500/20'
                        }`}
                      >
                        {item.quantityAvailable} unids.
                      </span>
                    </td>
                    <td className="p-4 text-right font-bold text-ink">
                      {formatNIO(item.quantityAvailable * (item.costPriceNio || 0))}
                    </td>
                    <td className="p-4 text-center">
                      {item.skuCode.includes('PACK') || item.productName.toLowerCase().includes('pack') ? (
                        <button
                          onClick={() => handleOpenUnbundleModal(item)}
                          className="bg-mustard hover:bg-mustard-300 text-moss-950 px-2.5 py-1 rounded-lg text-[11px] font-bold shadow-xs transition-all"
                        >
                          Desempacar
                        </button>
                      ) : (
                        <span className="text-ink-muted text-[11px]">Unidad Simple</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Kardex Ledger */
        <div className="erp-card rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-soft text-ink-muted border-b border-moss/10 font-bold">
                <tr>
                  <th className="p-4">Fecha / Hora</th>
                  <th className="p-4">SKU / Producto</th>
                  <th className="p-4">Tipo de Movimiento</th>
                  <th className="p-4 text-center">Cantidad</th>
                  <th className="p-4 text-center">Stock Ant.</th>
                  <th className="p-4 text-center">Nuevo Stock</th>
                  <th className="p-4">Detalle / Notas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-moss/10 text-ink">
                {kardexList.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-ink-muted">
                      No hay registros en el Kardex todavía.
                    </td>
                  </tr>
                ) : (
                  kardexList.map((kdx) => (
                    <tr key={kdx.id} className="hover:bg-surface transition-colors">
                      <td className="p-4 font-mono text-ink-muted text-[11px]">
                        {new Date(kdx.createdAt).toLocaleString('es-NI')}
                      </td>
                      <td className="p-4 font-medium text-ink">
                        <p className="font-bold">{kdx.productName || 'Producto'}</p>
                        <span className="font-mono text-[10px] text-ink-muted">{kdx.skuCode}</span>
                      </td>
                      <td className="p-4">
                        <span className="bg-surface border border-moss/15 text-ink px-2 py-0.5 rounded text-[11px]">
                          {kdx.movementType.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className={`p-4 text-center font-bold ${kdx.quantity > 0 ? 'text-emerald-800' : 'text-rose-700'}`}>
                        {kdx.quantity > 0 ? `+${kdx.quantity}` : kdx.quantity}
                      </td>
                      <td className="p-4 text-center font-mono">{kdx.previousStock}</td>
                      <td className="p-4 text-center font-mono font-bold text-ink">{kdx.newStock}</td>
                      <td className="p-4 text-ink-muted text-[11px]">{kdx.notes || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Despaquetizado */}
      <Modal
        isOpen={isUnbundleOpen}
        onClose={() => setIsUnbundleOpen(false)}
        title="Asistente de Despaquetización (Combo/Pack -> Unidades)"
        subtitle="Convierte un paquete de prendas en sus SKUs unitarios individuales actualizando el Kardex."
        maxWidth="2xl"
      >
        <form onSubmit={handleExecuteUnbundle} className="space-y-4">
          {unbundleFeedback && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-800 text-xs">
              {unbundleFeedback.msg}
            </div>
          )}

          <div>
            <label className="text-[11px] font-bold text-ink-muted block mb-1">Paquete a Desempacar *</label>
            <select
              value={selectedBundleSku}
              onChange={(e) => setSelectedBundleSku(e.target.value)}
              className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-moss"
            >
              {stockList.map((s) => (
                <option key={s.skuId} value={s.skuId}>
                  {s.productName} ({s.skuCode}) - Disp: {s.quantityAvailable}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-bold text-ink-muted block mb-1">Cantidad de Paquetes a Romper *</label>
            <input
              type="number"
              min="1"
              value={packsToUnbundle}
              onChange={(e) => setPacksToUnbundle(parseInt(e.target.value) || 1)}
              className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-moss"
            />
          </div>

          <div className="pt-2 border-t border-moss/10">
            <span className="text-xs font-bold text-ink block mb-2">
              SKUs Unitarios Resultantes (por cada paquete):
            </span>
            <div className="space-y-2">
              {targetUnits.map((u, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-surface p-2 rounded-xl border border-moss/15">
                  <select
                    value={u.skuId}
                    onChange={(e) => {
                      const updated = [...targetUnits];
                      updated[idx].skuId = e.target.value;
                      setTargetUnits(updated);
                    }}
                    className="flex-1 bg-white border border-moss/15 rounded-lg px-2 py-1.5 text-xs text-ink"
                  >
                    {skus.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.skuDescription} ({s.skuCode})
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-ink-muted">x</span>
                  <input
                    type="number"
                    min="1"
                    value={u.quantity}
                    onChange={(e) => {
                      const updated = [...targetUnits];
                      updated[idx].quantity = parseInt(e.target.value) || 1;
                      setTargetUnits(updated);
                    }}
                    className="w-16 bg-white border border-moss/15 rounded-lg px-2 py-1.5 text-xs text-ink text-center"
                  />
                  <span className="text-xs text-ink-muted">unids</span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-moss/10 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsUnbundleOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-ink-muted hover:bg-surface"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-bold bg-moss hover:bg-moss-700 text-white shadow-md shadow-moss/20"
            >
              Ejecutar Transformación
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
