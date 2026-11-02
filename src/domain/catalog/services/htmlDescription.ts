/**
 * Descripción larga en HTML (ficha de la web: "Detalles que debes saber").
 *
 * Solo se guarda un HTML pequeño y seguro: títulos, párrafos, negrita, cursiva y listas.
 * Todo lo demás (estilos, scripts, enlaces, comentarios, atributos) se quita, para que la
 * web pueda mostrarlo tal cual sin riesgo y con su propio diseño.
 *
 * Regla de la web: la variante usa su HTML propio si lo tiene; si no, el del producto.
 */

/** Etiquetas permitidas → etiqueta con la que se guardan */
const TAG_MAP: Record<string, string> = {
  h1: 'h2', // el h1 de la página es el nombre del producto
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  h5: 'h4',
  h6: 'h4',
  p: 'p',
  strong: 'strong',
  b: 'strong',
  em: 'em',
  i: 'em',
  ul: 'ul',
  ol: 'ol',
  li: 'li',
  br: 'br',
};

/** Contenedores que se reemplazan por su contenido (div de Word/Docs, span de estilos, etc.) */
const BLOCK_AS_PARAGRAPH = new Set(['div', 'section', 'article', 'blockquote']);
/** Se eliminan con todo su contenido */
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'head', 'title', 'meta', 'link', 'svg', 'img', 'video', 'audio', 'form', 'input', 'button', 'select', 'textarea']);

function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function serialize(node: Node): string {
  if (node.nodeType === 3 /* TEXT */) {
    return escapeText((node.textContent || '').replace(/ /g, ' '));
  }
  if (node.nodeType !== 1 /* ELEMENT */) return ''; // comentarios, etc.

  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (DROP_WITH_CONTENT.has(tag)) return '';

  const inner = Array.from(el.childNodes).map(serialize).join('');

  if (BLOCK_AS_PARAGRAPH.has(tag)) {
    // Si ya trae bloques adentro, se dejan; si es texto suelto, se vuelve párrafo
    return /<(h2|h3|h4|p|ul|ol)>/.test(inner) ? inner : inner.trim() ? `<p>${inner}</p>` : '';
  }

  const mapped = TAG_MAP[tag];
  if (!mapped) return inner; // span, a, font, u, etc.: se queda solo el texto
  if (mapped === 'br') return '<br>';
  if (!inner.replace(/<br>/g, '').trim()) return ''; // etiquetas vacías
  return `<${mapped}>${inner}</${mapped}>`;
}

/** Envuelve en <p> el texto suelto que quedó fuera de un bloque */
function wrapLooseInline(html: string): string {
  const parts = html.split(/(<\/?(?:h2|h3|h4|p|ul|ol|li)>)/);
  let depth = 0;
  let out = '';
  let loose = '';
  const flush = () => {
    if (loose.replace(/<br>/g, '').trim()) out += `<p>${loose.trim()}</p>`;
    loose = '';
  };
  for (const part of parts) {
    const m = /^<(\/?)(h2|h3|h4|p|ul|ol|li)>$/.exec(part);
    if (m) {
      if (!m[1] && depth === 0) flush();
      depth += m[1] ? -1 : 1;
      out += part;
    } else if (depth === 0) {
      loose += part;
    } else {
      out += part;
    }
  }
  flush();
  return out;
}

/**
 * Limpia un HTML (pegado, escrito o importado) dejando solo las etiquetas permitidas.
 * Funciona en el navegador (usa DOMParser). En el servidor devuelve el texto escapado.
 */
export function sanitizeDescriptionHtml(raw: string | undefined | null): string {
  const input = (raw || '').trim();
  if (!input) return '';

  if (typeof DOMParser === 'undefined') {
    return `<p>${escapeText(input.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())}</p>`;
  }

  // Texto plano (sin etiquetas): cada línea en blanco separa un párrafo
  const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(input);
  const source = looksLikeHtml
    ? input
    : input
        .split(/\n\s*\n/)
        .map((block) => `<p>${escapeText(block.trim()).replace(/\n/g, '<br>')}</p>`)
        .join('');

  const doc = new DOMParser().parseFromString(`<body>${source}</body>`, 'text/html');
  let html = Array.from(doc.body.childNodes).map(serialize).join('');

  html = wrapLooseInline(html)
    .replace(/\s+/g, ' ')
    .replace(/<p>\s*(<br>\s*)*<\/p>/g, '')
    .replace(/(<br>\s*){3,}/g, '<br><br>')
    .replace(/\s*(<\/?(?:h2|h3|h4|p|ul|ol|li)>)\s*/g, '$1')
    .trim();

  // Saltos de línea entre bloques para que el HTML guardado sea legible
  return html.replace(/(<\/(?:h2|h3|h4|p|ul|ol)>)(?=<)/g, '$1\n').replace(/(<\/li>)(?=<li>)/g, '$1\n');
}

/** Texto sin etiquetas (para contar palabras, búsquedas o vistas cortas) */
export function descriptionHtmlToText(html: string | undefined | null): string {
  return (html || '')
    .replace(/<\/(h2|h3|h4|p|li)>/g, '$&\n')
    .replace(/<br>/g, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

/** HTML que corresponde a una variante: el suyo si lo tiene, si no el del producto */
export function effectiveDescriptionHtml(
  product: { descriptionHtml?: string } | undefined | null,
  sku?: { descriptionHtml?: string } | null
): string {
  return (sku?.descriptionHtml || '').trim() || (product?.descriptionHtml || '').trim();
}

/** Estructura sugerida (como la ficha anterior de la web) para empezar a escribir */
export function descriptionTemplate(productName: string): string {
  const name = escapeText(productName.trim() || 'Nombre de la prenda');
  return [
    `<p><strong>${name}</strong> que aporta un toque … a tu look.</p>`,
    '<p>Describe el diseño, la tela y lo que hace especial a la prenda.</p>',
    '<ul><li>Característica 1</li><li>Característica 2</li><li>Característica 3</li></ul>',
    '<h4>Ideal para:</h4>',
    '<ul><li>Ocasión 1</li><li>Ocasión 2</li></ul>',
  ].join('\n');
}
