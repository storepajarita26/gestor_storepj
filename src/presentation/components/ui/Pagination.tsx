'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onItemsPerPageChange?: (items: number) => void;
}

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  pageSizeOptions,
  onPageChange,
  onItemsPerPageChange,
}: PaginationProps) {
  if (totalItems <= 0) return null;

  const startIdx = Math.min((currentPage - 1) * itemsPerPage + 1, totalItems);
  const endIdx = Math.min(currentPage * itemsPerPage, totalItems);

  // Opciones disponibles para "Mostrar por página", garantizando que itemsPerPage siempre exista en la lista
  const options = React.useMemo(() => {
    const baseOptions = pageSizeOptions && pageSizeOptions.length > 0 ? pageSizeOptions : [5, 10, 20, 50];
    const uniqueOptions = new Set([...baseOptions, itemsPerPage]);
    return Array.from(uniqueOptions).sort((a, b) => a - b);
  }, [pageSizeOptions, itemsPerPage]);

  // Generate visible page numbers
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 4) {
        pages.push(1, 2, 3, 4, 5, '...', totalPages);
      } else if (currentPage >= totalPages - 3) {
        pages.push(1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
      }
    }
    return pages;
  };

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-white/60 border-t border-moss/10 rounded-b-2xl text-xs text-ink-muted select-none">
      {/* Items count & Per Page Selector */}
      <div className="flex items-center gap-3">
        <span>
          Mostrando <strong className="text-ink font-bold">{startIdx}</strong> -{' '}
          <strong className="text-ink font-bold">{endIdx}</strong> de{' '}
          <strong className="text-ink font-bold">{totalItems}</strong> registros
        </span>

        {onItemsPerPageChange && (
          <div className="flex items-center gap-1.5 ml-2 border-l border-moss/10 pl-3">
            <span className="font-medium text-ink-muted">Mostrar:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                onItemsPerPageChange(Number(e.target.value));
                onPageChange(1);
              }}
              className="bg-white border border-moss/20 rounded-lg px-2 py-1 text-xs text-ink font-semibold focus:outline-none focus:ring-1 focus:ring-moss cursor-pointer shadow-xs"
            >
              {options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt} por pág.
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="p-1.5 rounded-lg border border-moss/15 bg-white text-ink hover:bg-surface disabled:opacity-40 disabled:pointer-events-none transition-colors"
            title="Página anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1">
            {getPageNumbers().map((p, idx) => {
              if (p === '...') {
                return (
                  <span key={`dots-${idx}`} className="px-2 text-ink-muted">
                    ...
                  </span>
                );
              }

              const isCurrent = p === currentPage;
              return (
                <button
                  key={`page-${p}`}
                  onClick={() => onPageChange(Number(p))}
                  className={`w-7 h-7 rounded-lg font-bold transition-all text-xs flex items-center justify-center ${
                    isCurrent
                      ? 'bg-moss text-white shadow-sm'
                      : 'border border-transparent hover:border-moss/20 hover:bg-white text-ink'
                  }`}
                >
                  {p}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="p-1.5 rounded-lg border border-moss/15 bg-white text-ink hover:bg-surface disabled:opacity-40 disabled:pointer-events-none transition-colors"
            title="Página siguiente"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
