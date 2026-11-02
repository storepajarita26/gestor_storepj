'use client';

import React, { useEffect, useState } from 'react';
import { PenLine, Undo2 } from 'lucide-react';
import { HtmlDescriptionEditor } from '@/presentation/components/ui/HtmlDescriptionEditor';
import { descriptionHtmlToText } from '@/domain/catalog/services/htmlDescription';

interface SkuDescriptionOverrideProps {
  /** HTML propio de la variante ('' = usa el del producto) */
  value: string;
  onChange: (html: string) => void;
  /** HTML del producto padre (lo que la web muestra si la variante no tiene uno propio) */
  productHtml?: string;
  productName?: string;
}

/**
 * Descripción web de una variante. Por defecto hereda la del producto; solo se escribe
 * una propia cuando la variante es realmente distinta (otro diseño, otra tela, etc.).
 */
export function SkuDescriptionOverride({ value, onChange, productHtml = '', productName }: SkuDescriptionOverrideProps) {
  const [custom, setCustom] = useState(Boolean(value.trim()));

  useEffect(() => {
    if (value.trim()) setCustom(true);
  }, [value]);

  const productText = descriptionHtmlToText(productHtml);

  if (!custom) {
    return (
      <div className="rounded-xl border border-dashed border-moss/25 bg-surface-soft/60 p-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-bold text-ink">Usa la descripción del producto</span>
          <button
            type="button"
            onClick={() => {
              setCustom(true);
              onChange(productHtml); // se parte del texto del producto para ajustarlo
            }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-moss/20 text-[11px] font-bold text-moss hover:bg-moss hover:text-white transition-colors"
          >
            <PenLine className="w-3 h-3" /> Escribir una propia
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-ink-muted line-clamp-2">
          {productText || 'El producto todavía no tiene descripción para la web. Agrégala en "Editar producto".'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10px]">
        <span className="font-semibold text-amber-700">
          Esta variante muestra su propia descripción en lugar de la del producto.
        </span>
        <button
          type="button"
          onClick={() => {
            setCustom(false);
            onChange('');
          }}
          className="flex items-center gap-1 font-bold text-ink-muted hover:text-moss"
        >
          <Undo2 className="w-3 h-3" /> Usar la del producto
        </button>
      </div>
      <HtmlDescriptionEditor value={value} onChange={onChange} productName={productName} minHeight={140} />
    </div>
  );
}
