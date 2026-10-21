'use client';
export function PrintLabel() { return <button className="print:hidden" onClick={()=>window.print()}>Imprimir etiqueta</button>; }
