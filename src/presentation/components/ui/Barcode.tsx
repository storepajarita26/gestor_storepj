import React from 'react';
import { canEncodeCode128, encodeCode128 } from '@/domain/catalog/services/barcode128';

interface BarcodeProps {
  value: string;
  /** Alto de las barras en módulos (el ancho se ajusta al contenedor) */
  height?: number;
  className?: string;
}

/** Código de barras Code 128 en SVG (se imprime nítido a cualquier tamaño) */
export function Barcode({ value, height = 40, className }: BarcodeProps) {
  if (!canEncodeCode128(value)) return null;
  const widths = encodeCode128(value);
  const quiet = 10;
  const total = widths.reduce((a, b) => a + b, 0) + quiet * 2;
  let x = quiet;
  const bars: React.ReactNode[] = [];
  widths.forEach((w, i) => {
    if (i % 2 === 0) bars.push(<rect key={i} x={x} y={0} width={w} height={height} />);
    x += w;
  });
  return (
    <svg
      viewBox={`0 0 ${total} ${height}`}
      preserveAspectRatio="none"
      className={className}
      role="img"
      aria-label={`Código de barras ${value}`}
      shapeRendering="crispEdges"
    >
      <rect x={0} y={0} width={total} height={height} fill="#fff" />
      <g fill="#000">{bars}</g>
    </svg>
  );
}
