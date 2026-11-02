'use client';

import React, { useState, useEffect } from 'react';
import { useDeepLink } from '@/presentation/hooks/useDeepLink';
import {
  Boxes,
  Layers,
  History,
  Search,
  Plus,
  Trash2,
  Info,
  Package,
} from 'lucide-react';
import { Modal } from '@/presentation/components/ui/Modal';
import { dataStore } from '@/infrastructure/repositories/dataStore';
import { formatNIO } from '@/domain/shared/utils/currencyFormatter';
import { StockLevel, KardexMovement, UnbundleRequest, InventoryAdjustmentInput, MovementType } from '@/domain/inventory/types';
import { ProductSku } from '@/domain/catalog/types';
import { useToast } from '@/presentation/components/ui/Toast';
import { AdjustmentModal } from './components/AdjustmentModal';
import { BundleSkuSearchSelect } from './components/BundleSkuSearchSelect';

/** Miniatura visual para cada línea de SKU con respaldo en caso de no tener imagen */
function SkuThumbnail({ src, alt, size = 'md' }: { src?: string; alt: string; size?: 'sm' | 'md' }) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  const boxClass = size === 'sm' ? 'w-10 h-10 rounded-lg' : 'w-11 h-11 rounded-xl';
  const iconClass = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';

  return (
    <div
      className={`${boxClass} bg-surface border border-moss/15 overflow-hidden shrink-0 flex items-center justify-center shadow-2xs`}
    >
      {src && !hasError ? (
        <img
          src={src}
          alt={alt}
          className="w-full h-full object-cover object-center"
          onError={() => setHasError(true)}
        />
      ) : (
        <Package className={`${iconClass} text-ink-muted/50`} aria-hidden="true" />
      )}
    </div>
  );
}

/** Nombre legible de cada tipo de movimiento de kardex */
const MOVEMENT_LABELS: Record<MovementType, string> = {
  compra_recepcion: 'Recepción de compra',
  venta_factura: 'Venta / despacho',
  despaquetizado_salida_pack: 'Desempaque (sale paquete)',
  despaquetizado_entrada_unidad: 'Desempaque (entra unidad)',
  ajuste_positivo: 'Ajuste (+)',
  ajuste_negativo: 'Ajuste (−)',
  regalia_promocion: 'Regalía / promoción',
  devolucion: 'Devolución / anulación',
  reserva: 'Apartado para pedido',
  liberacion_reserva: 'Apartado liberado',
};

export function InventarioView() {
  const [stockList, setStockList] = useState<StockLevel[]>([]);
  const [kardexList, setKardexList] = useState<KardexMovement[]>([]);
  const [skus, setSkus] = useState<ProductSku[]>([]);
  const [activeTab, setActiveTab] = useState<'stock' | 'kardex'>('stock');
  const [searchTerm, setSearchTerm] = useState('');
  // Búsqueda global: ?q=<texto> llega ya filtrado
  useDeepLink('q', (q) => setSearchTerm(q));
  
  // Unbundling Modal
  const [isUnbundleOpen, setIsUnbundleOpen] = useState(false);
  const [selectedBundleSku, setSelectedBundleSku] = useState<string>('');
  const [packsToUnbundle, setPacksToUnbundle] = useState<number>(1);
  const [targetUnits, setTargetUnits] = useState<{ skuId: string; quantity: number }[]>([]);
  const [unbundleFeedback, setUnbundleFeedback] = useState<{ msg: string; err: boolean } | null>(null);
  const [adjustStock, setAdjustStock] = useState<StockLevel | null>(null);
  const [bundleSkuIds, setBundleSkuIds] = useState<Set<string>>(new Set());
  const toast = useToast();

  const notifyResult = (res: { success: boolean; message: string; sync: string }, title: string) => {
    if (!res.success) toast.error(res.message, title);
    else if (res.sync === 'pending') toast.warning(res.message, title);
    else toast.success(res.message, title);
  };

  const handleAdjust = async (input: InventoryAdjustmentInput) => {
    const res = await dataStore.adjustInventory(input);
    notifyResult(res, res.success ? 'Ajuste registrado' : 'Ajuste no registrado');
    return res.success;
  };

  const refreshData = () => {
    setStockList(dataStore.getStock());
    setKardexList(dataStore.getKardex());
    const allSkus = dataStore.getAllSkus();
    setSkus(allSkus);
    // SKUs tipo "paquete" configurados a nivel de SKU
    setBundleSkuIds(
      new Set(allSkus.filter((s) => dataStore.isBundleSku(s)).map((s) => s.id))
    );
  };

  useEffect(() => {
    refreshData();
    const unsub = dataStore.subscribe(refreshData);
    return unsub;
  }, []);

  const bundleStockList = stockList.filter((s) => bundleSkuIds.has(s.skuId));
  const unitCandidateSkus = skus.filter(
    (s) => s.id !== selectedBundleSku && !bundleSkuIds.has(s.id)
  );
  const targetSkuOptions =
    unitCandidateSkus.length > 0
      ? unitCandidateSkus
      : skus.filter((s) => s.id !== selectedBundleSku);

  const buildDefaultTargetUnits = (
    bundleSkuId: string
  ): { skuId: string; quantity: number }[] => {
    const bundleObj = skus.find((s) => s.id === bundleSkuId);
    if (bundleObj?.bundleItems && bundleObj.bundleItems.length > 0) {
      const validMapped = bundleObj.bundleItems
        .filter((bi) => bi.unitSkuId && skus.some((s) => s.id === bi.unitSkuId))
        .map((bi) => ({
          skuId: bi.unitSkuId,
          quantity: Math.max(1, bi.quantityPerPack || 1),
        }));
      if (validMapped.length > 0) return validMapped;
    }
    const definedQuantity = bundleObj?.bundleItems?.[0]?.quantityPerPack || 1;
    const sameProductUnit = bundleObj
      ? skus.find(
          (s) =>
            s.productId === bundleObj.productId &&
            s.id !== bundleSkuId &&
            !bundleSkuIds.has(s.id)
        )
      : undefined;
    const fallbackUnit =
      sameProductUnit ||
      skus.find((s) => s.id !== bundleSkuId && !bundleSkuIds.has(s.id)) ||
      skus.find((s) => s.id !== bundleSkuId);
    return fallbackUnit ? [{ skuId: fallbackUnit.id, quantity: Math.max(1, definedQuantity) }] : [];
  };

  const handleOpenUnbundleModal = (bundleSku?: StockLevel) => {
    const defaultBundleId =
      bundleSku?.skuId ||
      bundleStockList[0]?.skuId ||
      skus.find((s) => bundleSkuIds.has(s.id))?.id ||
      '';
    setSelectedBundleSku(defaultBundleId);
    setPacksToUnbundle(1);
    setTargetUnits(defaultBundleId ? buildDefaultTargetUnits(defaultBundleId) : []);
    setUnbundleFeedback(null);
    setIsUnbundleOpen(true);
  };

  const handleAddTargetUnit = () => {
    const available =
      targetSkuOptions.find((s) => !targetUnits.some((tu) => tu.skuId === s.id)) ||
      targetSkuOptions[0];
    if (available) {
      setTargetUnits([...targetUnits, { skuId: available.id, quantity: 1 }]);
    }
  };

  const handleRemoveTargetUnit = (index: number) => {
    if (targetUnits.length > 1) {
      setTargetUnits(targetUnits.filter((_, idx) => idx !== index));
    }
  };

  const selectedBundle = stockList.find(s => s.skuId === selectedBundleSku);
  const bundleCostPrice = selectedBundle?.costPriceNio || skus.find(s => s.id === selectedBundleSku)?.costPriceNio || 0;
  const totalUnitsPerPack = targetUnits.reduce((acc, u) => acc + (Number(u.quantity) || 0), 0);
  const totalUnitsProduced = totalUnitsPerPack * packsToUnbundle;
  const allocatedUnitCost = totalUnitsProduced > 0 
    ? ((bundleCostPrice * packsToUnbundle) / totalUnitsProduced) 
    : 0;

  const handleExecuteUnbundle = async (e: React.FormEvent) => {
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

    const res = await dataStore.unbundlePack(request);
    if (res.success) {
      notifyResult(res, 'Paquete desempacado');
      setIsUnbundleOpen(false);
    } else {
      setUnbundleFeedback({ msg: res.message, err: true });
    }
  };

  const query = searchTerm.trim().toLowerCase();

  const filteredStock = stockList.filter(
    (s) =>
      !query ||
      s.skuCode.toLowerCase().includes(query) ||
      (s.skuDescription || '').toLowerCase().includes(query) ||
      (s.colorName || '').toLowerCase().includes(query) ||
      (s.size || '').toLowerCase().includes(query)
  );

  const filteredKardex = kardexList.filter(
    (k) =>
      !query ||
      (k.skuCode || '').toLowerCase().includes(query) ||
      (k.skuDescription || '').toLowerCase().includes(query) ||
      (k.notes || '').toLowerCase().includes(query)
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-4">

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
            <span>Existencias por SKU ({stockList.length})</span>
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
            placeholder="Buscar por código SKU, descripción o color..."
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
                  <th className="p-4">SKU</th>
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
                {filteredStock.map((item) => {
                  const skuLabel =
                    item.skuDescription && item.skuDescription !== item.skuCode
                      ? item.skuDescription
                      : '';
                  return (
                    <tr key={item.skuId} className="hover:bg-surface transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <SkuThumbnail src={item.mainImageUrl} alt={item.skuCode} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono text-xs font-extrabold text-moss bg-moss/10 px-2 py-0.5 rounded border border-moss/20 inline-block">
                                {item.skuCode}
                              </span>
                              {bundleSkuIds.has(item.skuId) && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-mustard/25 text-moss-900 border border-mustard/50 px-1.5 py-0.5 rounded">
                                  <Layers className="w-2.5 h-2.5" />
                                  PACK
                                </span>
                              )}
                            </div>
                            {skuLabel && (
                              <p
                                className="text-xs font-semibold text-ink mt-1 truncate max-w-xs"
                                title={skuLabel}
                              >
                                {skuLabel}
                              </p>
                            )}
                          </div>
                        </div>
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
                        {(item.quantityReserved || 0) > 0 && (
                          <span className="block text-[11px] text-ink-muted mt-1">
                            {item.quantityReserved} apartada(s) · {Math.max(0, item.quantityAvailable - item.quantityReserved)} libres
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-right font-bold text-ink">
                        {formatNIO(item.quantityAvailable * (item.costPriceNio || 0))}
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {bundleSkuIds.has(item.skuId) && (
                            <button
                              onClick={() => handleOpenUnbundleModal(item)}
                              className="bg-mustard hover:bg-mustard-300 text-moss-950 px-2.5 py-1 rounded-lg text-[11px] font-bold shadow-xs transition-all"
                            >
                              Desempacar
                            </button>
                          )}
                          <button
                            onClick={() => setAdjustStock(item)}
                            className="bg-white hover:bg-surface border border-moss/20 text-ink px-2.5 py-1 rounded-lg text-[11px] font-bold shadow-xs transition-all"
                            title="Conteo físico, merma, regalía o entrada"
                          >
                            Ajustar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
                  <th className="p-4">SKU</th>
                  <th className="p-4">Tipo de Movimiento</th>
                  <th className="p-4 text-center">Cantidad</th>
                  <th className="p-4 text-center">Stock Ant.</th>
                  <th className="p-4 text-center">Nuevo Stock</th>
                  <th className="p-4">Detalle / Notas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-moss/10 text-ink">
                {filteredKardex.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-ink-muted">
                      No hay registros en el Kardex todavía.
                    </td>
                  </tr>
                ) : (
                  filteredKardex.map((kdx) => {
                    const skuLabel =
                      kdx.skuDescription && kdx.skuDescription !== kdx.skuCode
                        ? kdx.skuDescription
                        : '';
                    return (
                      <tr key={kdx.id} className="hover:bg-surface transition-colors">
                        <td className="p-4 font-mono text-ink-muted text-[11px]">
                          {new Date(kdx.createdAt).toLocaleString('es-NI')}
                        </td>
                        <td className="p-4 font-medium text-ink">
                          <div className="flex items-center gap-3">
                            <SkuThumbnail src={kdx.mainImageUrl} alt={kdx.skuCode || 'SKU'} size="sm" />
                            <div className="min-w-0">
                              <span className="font-mono text-xs font-extrabold text-moss bg-moss/10 px-2 py-0.5 rounded border border-moss/20 inline-block">
                                {kdx.skuCode || 'SKU'}
                              </span>
                              {skuLabel && (
                                <p
                                  className="text-[11px] font-semibold text-ink mt-0.5 truncate max-w-xs"
                                  title={skuLabel}
                                >
                                  {skuLabel}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <span className="bg-surface border border-moss/15 text-ink px-2 py-0.5 rounded text-[11px]">
                            {MOVEMENT_LABELS[kdx.movementType] || kdx.movementType.replace(/_/g, ' ')}
                          </span>
                          {kdx.syncOpId && (
                            <span className="block text-[10px] text-amber-700 font-semibold mt-0.5">Provisional · sin sincronizar</span>
                          )}
                        </td>
                        <td className={`p-4 text-center font-bold ${kdx.quantity > 0 ? 'text-emerald-800' : 'text-rose-700'}`}>
                          {kdx.quantity > 0 ? `+${kdx.quantity}` : kdx.quantity}
                        </td>
                        <td className="p-4 text-center font-mono">{kdx.previousStock}</td>
                        <td className="p-4 text-center font-mono font-bold text-ink">{kdx.newStock}</td>
                        <td className="p-4 text-ink-muted text-[11px]">{kdx.notes || '-'}</td>
                      </tr>
                    );
                  })
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
        subtitle="Convierte un SKU paquete en sus SKUs unitarios individuales actualizando el Kardex y transfiriendo el costo unitario exacto."
        maxWidth="2xl"
      >
        <form onSubmit={handleExecuteUnbundle} className="space-y-4">
          {unbundleFeedback && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-800 text-xs">
              {unbundleFeedback.msg}
            </div>
          )}

          {bundleStockList.length === 0 ? (
            <div className="p-4 bg-amber-500/10 border border-amber-500/25 rounded-xl text-amber-900 text-xs space-y-1">
              <p className="font-bold">No hay SKUs configurados como Paquete / Pack</p>
              <p className="text-[11px] text-ink-muted">
                Para desempacar una variante, ve al módulo de <strong>Catálogo</strong>, edita o crea el SKU que representa la bolsa/pack y márcalo como <strong>Paquete / Pack (Desempacable)</strong>.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 relative z-30">
              <div className="sm:col-span-2">
                <label className="text-[11px] font-bold text-ink-muted block mb-1">SKU Paquete a Desempacar *</label>
                <BundleSkuSearchSelect
                  bundleStockList={bundleStockList}
                  selectedBundleSku={selectedBundleSku}
                  onSelectBundleSku={(nextBundleId) => {
                    setSelectedBundleSku(nextBundleId);
                    setTargetUnits(buildDefaultTargetUnits(nextBundleId));
                  }}
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-ink-muted block mb-1">Packs a Romper *</label>
                <input
                  type="number"
                  min="1"
                  value={packsToUnbundle}
                  onChange={(e) => setPacksToUnbundle(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full bg-surface border border-moss/20 rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-moss"
                />
              </div>
            </div>
          )}

          {/* Resumen Financiero del Despiece con Alta Legibilidad */}
          <div className="bg-emerald-50/70 border border-emerald-300/80 rounded-xl p-3.5 space-y-2.5 shadow-2xs">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-emerald-800 shrink-0" />
              <span className="text-xs font-bold text-emerald-950 tracking-tight">
                Prorrateo Financiero de Costo Landed
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2.5 text-center text-xs">
              <div className="bg-white p-2.5 rounded-xl border border-emerald-200/80 shadow-2xs">
                <span className="text-[11px] font-semibold text-slate-600 block">Costo Unitario Pack</span>
                <span className="text-sm font-extrabold text-slate-900 mt-0.5 block">{formatNIO(bundleCostPrice)}</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-emerald-200/80 shadow-2xs">
                <span className="text-[11px] font-semibold text-slate-600 block">Prendas Producidas</span>
                <span className="text-sm font-extrabold text-slate-900 mt-0.5 block">{totalUnitsProduced} unids</span>
              </div>
              <div className="bg-emerald-800 text-white p-2.5 rounded-xl border border-emerald-900 shadow-xs">
                <span className="text-[11px] text-emerald-100 font-semibold block">Costo promedio / prenda</span>
                <span className="text-sm font-black text-white mt-0.5 block">{formatNIO(allocatedUnitCost)}</span>
              </div>
            </div>
            <p className="text-[11px] text-emerald-950 bg-white/80 border border-emerald-200/70 p-2.5 rounded-lg leading-relaxed shadow-2xs">
              El valor total de los paquetes (<strong className="font-extrabold text-emerald-950">{formatNIO(bundleCostPrice * packsToUnbundle)}</strong>) se reparte entre las prendas según su precio de venta: la que se vende más cara absorbe más costo. El total no cambia.
            </p>
          </div>

          <div className="pt-2 border-t border-moss/10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-ink">
                SKUs Unitarios Resultantes (por cada paquete):
              </span>
              <button
                type="button"
                onClick={handleAddTargetUnit}
                disabled={targetSkuOptions.length === 0}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-moss hover:text-moss-700 bg-moss/10 hover:bg-moss/20 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Agregar SKU
              </button>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
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
                    {targetSkuOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.skuCode} — {s.skuDescription}
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
                      updated[idx].quantity = Math.max(1, parseInt(e.target.value) || 1);
                      setTargetUnits(updated);
                    }}
                    className="w-16 bg-white border border-moss/15 rounded-lg px-2 py-1.5 text-xs text-ink text-center font-medium"
                  />
                  <span className="text-xs text-ink-muted">unids</span>
                  {targetUnits.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveTargetUnit(idx)}
                      className="p-1.5 text-ink-muted hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      title="Eliminar fila"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
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
              disabled={!selectedBundleSku || totalUnitsProduced <= 0}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-moss hover:bg-moss-700 disabled:opacity-50 text-white shadow-md shadow-moss/20"
            >
              Ejecutar Transformación
            </button>
          </div>
        </form>
      </Modal>
      <AdjustmentModal stock={adjustStock} onClose={() => setAdjustStock(null)} onConfirm={handleAdjust} />
    </div>
  );
}
