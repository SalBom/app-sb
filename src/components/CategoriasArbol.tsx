// src/components/CategoriasArbol.tsx
// Selector de categorías agrupado por categoría padre, con buscador.
//  - Sin búsqueda: árbol plegable (tocar un padre lo despliega; adentro está
//    "Ver todo" para filtrar por el padre completo).
//  - Con búsqueda: lista plana de coincidencias con su ruta ("Bombas › Sumergibles"),
//    así se distinguen las categorías que se llaman igual en distintos padres.
// Se usa en la barra lateral de escritorio (variant="sidebar", fondo azul) y en el
// modal del celular (variant="modal", fondo blanco).
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

export type CategoriaNodo = {
  id: number;
  name: string;
  complete_name?: string;
  parent_id?: number | null;
  cantidad?: number;
};

type Props = {
  categorias: CategoriaNodo[];
  seleccionada: string;              // id como string, '' = ninguna
  onSelect: (id: string) => void;    // '' para limpiar
  variant: 'sidebar' | 'modal';
};

const normalizar = (s: string) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

export default function CategoriasArbol({ categorias, seleccionada, onSelect, variant }: Props) {
  const [busqueda, setBusqueda] = useState('');
  const [abiertos, setAbiertos] = useState<Set<number>>(new Set());
  const t = variant === 'sidebar' ? sb : md;
  const col = variant === 'sidebar' ? COLORES_SIDEBAR : COLORES_MODAL;

  const arbol = useMemo(() => {
    const porId = new Map<number, CategoriaNodo>();
    categorias.forEach(c => porId.set(c.id, c));
    const hijos = new Map<number | null, CategoriaNodo[]>();
    categorias.forEach(c => {
      const p = c.parent_id != null && porId.has(c.parent_id) ? c.parent_id : null;
      if (!hijos.has(p)) hijos.set(p, []);
      hijos.get(p)!.push(c);
    });
    hijos.forEach(lista => lista.sort((a, b) => a.name.localeCompare(b.name, 'es')));

    // Si todo cuelga de una sola raíz genérica ("Todos", "All"…), la salteamos:
    // no aporta nada y obligaría a desplegar un nivel más.
    const ocultos = new Set<number>();
    let raices = hijos.get(null) || [];
    while (raices.length === 1 && (hijos.get(raices[0].id) || []).length > 0) {
      ocultos.add(raices[0].id);
      raices = hijos.get(raices[0].id) || [];
    }

    const ruta = (c: CategoriaNodo): string[] => {
      const partes: string[] = [];
      let actual: CategoriaNodo | undefined = c;
      const vistos = new Set<number>();
      while (actual && !ocultos.has(actual.id) && !vistos.has(actual.id)) {
        vistos.add(actual.id);
        partes.unshift(actual.name);
        actual = actual.parent_id != null ? porId.get(actual.parent_id) : undefined;
      }
      return partes;
    };
    return { porId, hijos, raices, ocultos, ruta };
  }, [categorias]);

  // Al abrir con una categoría ya elegida, desplegamos sus padres para que se vea.
  useEffect(() => {
    const sel = arbol.porId.get(Number(seleccionada));
    if (!sel) return;
    setAbiertos(prev => {
      const next = new Set(prev);
      let p = sel.parent_id;
      const vistos = new Set<number>();
      while (p != null && !vistos.has(p)) { vistos.add(p); next.add(p); p = arbol.porId.get(p)?.parent_id ?? null; }
      return next;
    });
  }, [seleccionada, arbol]);

  const toggle = (id: number) => setAbiertos(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const resultados = useMemo(() => {
    const q = normalizar(busqueda);
    if (!q) return null;
    const palabras = q.split(/\s+/);
    return categorias
      .filter(c => !arbol.ocultos.has(c.id))
      .map(c => ({ c, ruta: arbol.ruta(c) }))
      .filter(({ ruta }) => { const txt = normalizar(ruta.join(' ')); return palabras.every(p => txt.includes(p)); })
      // Primero las que coinciden en su propio nombre, después por ruta.
      .sort((a, b) => {
        const an = normalizar(a.c.name).includes(q) ? 0 : 1;
        const bn = normalizar(b.c.name).includes(q) ? 0 : 1;
        return an - bn || a.ruta.join(' ').localeCompare(b.ruta.join(' '), 'es');
      })
      .slice(0, 60);
  }, [busqueda, categorias, arbol]);

  const Cantidad = ({ n }: { n?: number }) =>
    n ? <Text style={t.cantidad}>{n}</Text> : null;

  const renderNodo = (c: CategoriaNodo, nivel: number): React.ReactNode => {
    const hijos = arbol.hijos.get(c.id) || [];
    const activo = String(c.id) === seleccionada;
    if (!hijos.length) {
      return (
        <Pressable key={c.id} onPress={() => onSelect(activo ? '' : String(c.id))}
          style={[t.fila, { paddingLeft: 4 + nivel * 14 }, activo && t.filaActiva]}>
          {/* Hueco del ancho de la flecha: alinea las hojas con los nombres de los padres. */}
          <View style={{ width: 14 }} />
          <Text style={[t.texto, activo && t.textoActivo]} numberOfLines={2}>{c.name}</Text>
          <Cantidad n={c.cantidad} />
        </Pressable>
      );
    }
    const abierto = abiertos.has(c.id);
    return (
      <View key={c.id}>
        <Pressable onPress={() => toggle(c.id)} style={[t.fila, { paddingLeft: 4 + nivel * 14 }]}>
          <Feather name={abierto ? 'chevron-down' : 'chevron-right'} size={14} color={col.icono} />
          <Text style={[t.texto, t.textoPadre]} numberOfLines={2}>{c.name}</Text>
          <Cantidad n={c.cantidad} />
        </Pressable>
        {abierto && (
          <View>
            <Pressable onPress={() => onSelect(activo ? '' : String(c.id))}
              style={[t.fila, { paddingLeft: 4 + (nivel + 1) * 14 }, activo && t.filaActiva]}>
              <Text style={[t.texto, t.textoVerTodo, activo && t.textoActivo]} numberOfLines={1}>
                Ver todo en {c.name}
              </Text>
            </Pressable>
            {hijos.map(h => renderNodo(h, nivel + 1))}
          </View>
        )}
      </View>
    );
  };

  return (
    <View>
      <View style={t.buscador}>
        <Feather name="search" size={14} color={col.icono} />
        <TextInput
          style={t.input}
          value={busqueda}
          onChangeText={setBusqueda}
          placeholder="Buscar categoría"
          placeholderTextColor={col.placeholder}
          autoCorrect={false}
        />
        {!!busqueda && (
          <Pressable onPress={() => setBusqueda('')} hitSlop={8}>
            <Feather name="x" size={14} color={col.icono} />
          </Pressable>
        )}
      </View>

      {!!seleccionada && !resultados && (
        <Pressable onPress={() => onSelect('')} style={t.limpiar}>
          <Feather name="x-circle" size={13} color={col.icono} />
          <Text style={t.limpiarText}>Quitar filtro de categoría</Text>
        </Pressable>
      )}

      {resultados ? (
        resultados.length === 0 ? (
          <Text style={t.vacio}>No hay categorías con “{busqueda.trim()}”.</Text>
        ) : (
          resultados.map(({ c, ruta }) => {
            const activo = String(c.id) === seleccionada;
            return (
              <Pressable key={c.id} onPress={() => { onSelect(String(c.id)); setBusqueda(''); }}
                style={[t.fila, activo && t.filaActiva]}>
                <View style={{ flex: 1 }}>
                  <Text style={[t.texto, activo && t.textoActivo]} numberOfLines={2}>{c.name}</Text>
                  {ruta.length > 1 && (
                    <Text style={t.ruta} numberOfLines={1}>{ruta.slice(0, -1).join(' › ')}</Text>
                  )}
                </View>
                <Cantidad n={c.cantidad} />
              </Pressable>
            );
          })
        )
      ) : (
        arbol.raices.map(c => renderNodo(c, 0))
      )}
    </View>
  );
}

const COLORES_SIDEBAR = { icono: 'rgba(255,255,255,0.85)', placeholder: 'rgba(255,255,255,0.6)' };
const COLORES_MODAL = { icono: '#6B7280', placeholder: '#9CA3AF' };

const base = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingRight: 4, borderRadius: 6 },
  buscador: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 36, borderRadius: 8, paddingHorizontal: 10, marginBottom: 10 },
  input: { flex: 1, height: 36, fontFamily: 'Rubik', fontSize: 13, outlineStyle: 'none' } as any,
  limpiar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, marginBottom: 6 },
});

// Barra lateral de escritorio (fondo azul).
const sb = StyleSheet.create({
  ...base,
  filaActiva: { backgroundColor: 'rgba(255,255,255,0.18)' },
  texto: { flex: 1, fontFamily: 'Rubik', fontSize: 13, color: 'rgba(255,255,255,0.88)' },
  textoPadre: { fontWeight: '600', color: '#FFFFFF' },
  textoVerTodo: { fontStyle: 'italic' },
  textoActivo: { fontWeight: '700', color: '#FFFFFF' },
  cantidad: { fontFamily: 'Rubik', fontSize: 11, color: 'rgba(255,255,255,0.65)' },
  ruta: { fontFamily: 'Rubik', fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 1 },
  buscador: { ...base.buscador, backgroundColor: 'rgba(255,255,255,0.16)' },
  input: { ...base.input, color: '#FFFFFF' },
  limpiarText: { fontFamily: 'Rubik', fontSize: 12, color: '#FFFFFF', textDecorationLine: 'underline' },
  vacio: { fontFamily: 'Rubik', fontSize: 12, color: 'rgba(255,255,255,0.8)', paddingVertical: 6 },
});

// Modal del celular (fondo blanco).
const md = StyleSheet.create({
  ...base,
  fila: { ...base.fila, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EEF0F2', borderRadius: 0 },
  filaActiva: { backgroundColor: '#EAF6FC' },
  texto: { flex: 1, fontFamily: 'BarlowCondensed-SemiBold', fontSize: 16, color: '#374151' },
  textoPadre: { fontFamily: 'BarlowCondensed-Bold', color: '#1F2937' },
  textoVerTodo: { color: '#139EDB' },
  textoActivo: { color: '#139EDB', fontFamily: 'BarlowCondensed-Bold' },
  cantidad: { fontFamily: 'Rubik', fontSize: 11, color: '#9CA3AF' },
  ruta: { fontFamily: 'Rubik', fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  buscador: { ...base.buscador, backgroundColor: '#F3F4F6', height: 40 },
  input: { ...base.input, height: 40, color: '#111827', fontSize: 14 },
  limpiarText: { fontFamily: 'Rubik', fontSize: 12, color: '#6B7280', textDecorationLine: 'underline' },
  vacio: { fontFamily: 'Rubik', fontSize: 13, color: '#9CA3AF', paddingVertical: 10, textAlign: 'center' },
});
