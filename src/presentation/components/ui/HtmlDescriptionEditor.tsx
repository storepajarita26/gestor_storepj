'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bold, Italic, List, ListOrdered, Heading3, Heading4, Pilcrow, Eraser, Code2, Eye, Wand2 } from 'lucide-react';
import {
  sanitizeDescriptionHtml,
  descriptionHtmlToText,
  descriptionTemplate,
} from '@/domain/catalog/services/htmlDescription';

interface HtmlDescriptionEditorProps {
  value: string;
  onChange: (html: string) => void;
  /** Nombre del producto: se usa en la plantilla sugerida */
  productName?: string;
  placeholder?: string;
  minHeight?: number;
}

type Mode = 'visual' | 'code';

/**
 * Editor de la descripción larga de la web. Lo que se ve es lo que se publica:
 * barra con títulos, negrita, cursiva y listas; modo "Código HTML" para pegar
 * HTML ya hecho (por ejemplo, generado con IA). Siempre guarda HTML limpio.
 */
export function HtmlDescriptionEditor({
  value,
  onChange,
  productName = '',
  placeholder = 'Escribe la descripción que verá el cliente en la web…',
  minHeight = 180,
}: HtmlDescriptionEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef<string>('');
  const [mode, setMode] = useState<Mode>('visual');
  const [code, setCode] = useState(value);
  const [isEmpty, setIsEmpty] = useState(!value.trim());

  // Carga el valor que llega desde afuera (abrir el modal, otro producto, plantilla)
  useEffect(() => {
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    if (editorRef.current) editorRef.current.innerHTML = value;
    setCode(value);
    setIsEmpty(!value.trim());
  }, [value]);

  const emit = useCallback(
    (html: string) => {
      const clean = sanitizeDescriptionHtml(html);
      lastEmitted.current = clean;
      setIsEmpty(!clean);
      onChange(clean);
      return clean;
    },
    [onChange]
  );

  const handleInput = () => {
    if (editorRef.current) emit(editorRef.current.innerHTML);
  };

  // Al salir del editor se normaliza lo escrito (quita estilos, etiquetas vacías, etc.)
  const handleBlur = () => {
    if (!editorRef.current) return;
    const clean = emit(editorRef.current.innerHTML);
    if (editorRef.current.innerHTML !== clean) editorRef.current.innerHTML = clean;
  };

  const exec = (command: string, arg?: string) => {
    editorRef.current?.focus();
    try {
      document.execCommand('defaultParagraphSeparator', false, 'p');
      document.execCommand(command, false, arg);
    } catch {
      /* navegador sin soporte: no hace nada */
    }
    handleInput();
  };

  // Pegar: desde Word/Docs/web se limpia; si se pega código HTML como texto, se interpreta
  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    const source = html || text;
    const clean = sanitizeDescriptionHtml(source);
    if (!clean) return;
    try {
      document.execCommand('insertHTML', false, clean);
    } catch {
      if (editorRef.current) editorRef.current.innerHTML += clean;
    }
    handleInput();
  };

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    if (next === 'code') {
      setCode(value);
    } else {
      const clean = emit(code);
      setCode(clean);
      // el div se vuelve a montar: cargar el contenido al siguiente render
      requestAnimationFrame(() => {
        if (editorRef.current) editorRef.current.innerHTML = clean;
      });
    }
    setMode(next);
  };

  const applyTemplate = () => {
    const tpl = descriptionTemplate(productName);
    const clean = emit(tpl);
    setCode(clean);
    if (editorRef.current) editorRef.current.innerHTML = clean;
  };

  const clearAll = () => {
    emit('');
    setCode('');
    if (editorRef.current) editorRef.current.innerHTML = '';
  };

  const words = descriptionHtmlToText(value).split(/\s+/).filter(Boolean).length;

  const tools: { icon: React.ElementType; label: string; run: () => void }[] = [
    { icon: Heading3, label: 'Título', run: () => exec('formatBlock', '<h3>') },
    { icon: Heading4, label: 'Subtítulo (ej. "Ideal para:")', run: () => exec('formatBlock', '<h4>') },
    { icon: Pilcrow, label: 'Párrafo normal', run: () => exec('formatBlock', '<p>') },
    { icon: Bold, label: 'Negrita (Ctrl+B)', run: () => exec('bold') },
    { icon: Italic, label: 'Cursiva (Ctrl+I)', run: () => exec('italic') },
    { icon: List, label: 'Viñetas', run: () => exec('insertUnorderedList') },
    { icon: ListOrdered, label: 'Lista numerada', run: () => exec('insertOrderedList') },
    { icon: Eraser, label: 'Quitar formato del texto seleccionado', run: () => exec('removeFormat') },
  ];

  return (
    <div className="rounded-xl border border-moss/20 bg-white overflow-hidden focus-within:ring-2 focus-within:ring-moss">
      {/* Barra */}
      <div className="flex flex-wrap items-center gap-0.5 px-1.5 py-1 border-b border-moss/10 bg-surface-soft/70">
        {mode === 'visual' &&
          tools.map(({ icon: Icon, label, run }) => (
            <button
              key={label}
              type="button"
              title={label}
              aria-label={label}
              // mousedown + preventDefault: no perder la selección del texto
              onMouseDown={(e) => {
                e.preventDefault();
                run();
              }}
              className="p-1.5 rounded-md text-ink-muted hover:text-moss hover:bg-white transition-colors"
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
        {mode === 'code' && (
          <span className="px-1.5 text-[10px] font-semibold text-ink-muted">
            Pega o edita el HTML. Al volver a la vista visual se limpia automáticamente.
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {isEmpty && mode === 'visual' && (
            <button
              type="button"
              onClick={applyTemplate}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold text-moss hover:bg-white"
              title="Insertar una estructura sugerida para completar"
            >
              <Wand2 className="w-3 h-3" /> Plantilla
            </button>
          )}
          <button
            type="button"
            onClick={() => switchMode(mode === 'visual' ? 'code' : 'visual')}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold text-ink-muted hover:text-moss hover:bg-white"
            title={mode === 'visual' ? 'Ver / pegar código HTML' : 'Volver a la vista visual'}
          >
            {mode === 'visual' ? <Code2 className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {mode === 'visual' ? 'Código HTML' : 'Vista visual'}
          </button>
        </div>
      </div>

      {/* Área de edición */}
      {mode === 'visual' ? (
        <div className="relative">
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-label="Descripción para la web"
            data-placeholder={placeholder}
            data-empty={isEmpty ? 'true' : 'false'}
            onInput={handleInput}
            onBlur={handleBlur}
            onPaste={handlePaste}
            className="rich-desc px-3 py-2.5 overflow-y-auto"
            style={{ minHeight, maxHeight: 420 }}
          />
        </div>
      ) : (
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onBlur={() => emit(code)}
          spellCheck={false}
          className="block w-full px-3 py-2.5 font-mono text-[11px] text-ink focus:outline-none resize-y"
          style={{ minHeight }}
          placeholder="<p><strong>Blusa…</strong> …</p>"
        />
      )}

      <div className="flex items-center justify-between px-3 py-1 border-t border-moss/10 text-[10px] text-ink-muted">
        <span>{words} {words === 1 ? 'palabra' : 'palabras'}</span>
        {!isEmpty && (
          <button type="button" onClick={clearAll} className="font-semibold hover:text-rose-600">
            Borrar todo
          </button>
        )}
      </div>
    </div>
  );
}
