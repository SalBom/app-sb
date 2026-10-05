// src/components/OfertasPdfAdminModal.tsx
// Carga de ofertas a partir del PDF de la marca (solo ADMIN, solo web).
//
// El folleto que se manda a los clientes trae por hoja el código del producto,
// el precio contado y el PRECIO A PLAZO. Acá se elige el PDF, la IA del backend
// lo lee hoja por hoja, se cruzan los códigos contra Odoo y queda todo en una
// lista para revisar. Lo que se da de alta en la Tarifa 70 es el precio A PLAZO.
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ActivityIndicator, TextInput, ScrollView, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import axios from 'axios';
import { API_URL } from '../config';
import { getCuitFromStorage } from '../utils/authStorage';
import useIsDesktopWeb from '../hooks/useIsDesktopWeb';

// Tiene que coincidir con _OFERTAS_PAGINAS_POR_LOTE del backend: son las hojas
// que entran en un pedido sin pasarse del tiempo máximo del servidor.
const PAGINAS_POR_TANDA = 4;
const DE_A_CUANTAS_SE_CREAN = 10;

type Estado = 'ok' | 'corregido' | 'no_encontrado' | 'ambiguo' | 'sin_precio' | 'error';
type Existente = { id: number; precio: number; min: number; desde: string | null; hasta: string | null };

type Item = {
  id: string;
  pagina: number;
  sku_pdf: string;
  nombre_pdf: string;
  sku: string;
  producto_id: number | null;
  producto: string;
  precio_contado: number | null;
  precio_plazo: number | null;
  iva: number | null;
  estado: Estado;
  mensaje: string;
  existente: Existente | null;
  incluir: boolean;
  precioTexto: string;
  skuTexto: string;
  resultado: 'pendiente' | 'creando' | 'ok' | 'error';
  resultadoMsg: string;
};

const ESTADOS: Record<Estado, { label: string; color: string; bg: string }> = {
  ok: { label: 'OK', color: '#15803D', bg: '#DCFCE7' },
  corregido: { label: 'SKU corregido', color: '#1D4ED8', bg: '#DBEAFE' },
  sin_precio: { label: 'Falta el precio', color: '#B45309', bg: '#FEF3C7' },
  no_encontrado: { label: 'No está en Odoo', color: '#B45309', bg: '#FEF3C7' },
  ambiguo: { label: 'Código ambiguo', color: '#B91C1C', bg: '#FEE2E2' },
  error: { label: 'Error', color: '#B91C1C', bg: '#FEE2E2' },
};

const plata = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// El IVA se escribe como en el folleto: 21% y 10,5%, sin decimales de más.
const porcentaje = (n: number | null | undefined) =>
  n == null ? '' : String(n).replace('.', ',');

const aNumero = (txt: string) => {
  const limpio = (txt || '').replace(/[^0-9,.]/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(limpio);
  return isFinite(n) && n > 0 ? n : null;
};

const hoyISO = () => new Date().toISOString().slice(0, 10);
const finDeMes = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
};

/** "2026-10-31" + hora → el formato que espera Odoo, en UTC (igual que en Nueva promo). */
const aOdoo = (iso: string, fin: boolean) => {
  const [a, m, d] = (iso || '').split('-').map(Number);
  if (!a || !m || !d) return '';
  const f = fin ? new Date(a, m - 1, d, 23, 59, 0) : new Date(a, m - 1, d, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${f.getUTCFullYear()}-${p(f.getUTCMonth() + 1)}-${p(f.getUTCDate())} ` +
         `${p(f.getUTCHours())}:${p(f.getUTCMinutes())}:00`;
};

const fechaCorta = (s: string | null) => (s ? s.slice(8, 10) + '/' + s.slice(5, 7) : '—');

// Input de fecha del navegador: en web es el calendario nativo, mucho más
// cómodo que escribir la fecha a mano.
const InputFecha = ({ valor, onChange, disabled }: { valor: string; onChange: (v: string) => void; disabled?: boolean }) =>
  React.createElement('input', {
    type: 'date', value: valor, disabled,
    onChange: (e: any) => onChange(e.target.value),
    style: {
      height: 38, border: '1px solid #D3D6DB', borderRadius: 8, padding: '0 10px',
      fontFamily: 'Rubik, sans-serif', fontSize: 13, color: '#2B2B2B',
      background: disabled ? '#F3F4F6' : '#FFFFFF',
    },
  });

let _seq = 0;

const OfertasPdfAdminModal = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
  const isDesktopWeb = useIsDesktopWeb();

  const [archivo, setArchivo] = useState<any>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [leyendo, setLeyendo] = useState(false);
  const [progreso, setProgreso] = useState<{ hecho: number; total: number } | null>(null);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [arrastrando, setArrastrando] = useState(false);
  const [soloProblemas, setSoloProblemas] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);

  const [desde, setDesde] = useState(hoyISO());
  const [hasta, setHasta] = useState(finDeMes());
  const [minQty, setMinQty] = useState('1');
  const [reemplazar, setReemplazar] = useState(true);
  const [vigenciaPdf, setVigenciaPdf] = useState<{ desde: string | null; hasta: string | null }>({ desde: null, hasta: null });

  const itemsRef = useRef<Item[]>([]);
  itemsRef.current = items;
  const cancelar = useRef(false);

  const limpiar = () => {
    setItems([]); setError(''); setAviso(''); setProgreso(null);
    setVigenciaPdf({ desde: null, hasta: null });
  };

  const tomarArchivo = (f: any) => {
    if (!f) return;
    if (!/\.pdf$/i.test(f.name || '')) { setError('Tiene que ser un PDF.'); return; }
    limpiar();
    setArchivo(f);
  };

  const abrirSelector = () => {
    if (typeof document === 'undefined') return;
    const input = document.createElement('input') as any;
    input.type = 'file';
    input.accept = 'application/pdf,.pdf';
    input.onchange = () => tomarArchivo((input.files || [])[0]);
    input.click();
  };

  // Zona de arrastre: en react-native-web el ref de un View es el nodo del DOM.
  const quitarListeners = useRef<(() => void) | null>(null);
  const zonaRef = useCallback((node: any) => {
    quitarListeners.current?.();
    quitarListeners.current = null;
    if (!node || typeof node.addEventListener !== 'function') return;
    const over = (e: any) => { e.preventDefault(); setArrastrando(true); };
    const leave = (e: any) => { e.preventDefault(); setArrastrando(false); };
    const drop = (e: any) => {
      e.preventDefault(); setArrastrando(false);
      tomarArchivo((e.dataTransfer?.files || [])[0]);
    };
    node.addEventListener('dragover', over);
    node.addEventListener('dragleave', leave);
    node.addEventListener('drop', drop);
    quitarListeners.current = () => {
      node.removeEventListener('dragover', over);
      node.removeEventListener('dragleave', leave);
      node.removeEventListener('drop', drop);
    };
  }, []);

  const aItem = (d: any): Item => ({
    id: `o${++_seq}`,
    pagina: d.pagina || 0,
    sku_pdf: d.sku_pdf || '',
    nombre_pdf: d.nombre_pdf || '',
    sku: d.sku || '',
    producto_id: d.producto_id ?? null,
    producto: d.producto || '',
    precio_contado: d.precio_contado ?? null,
    precio_plazo: d.precio_plazo ?? null,
    iva: d.iva ?? null,
    estado: (d.estado || 'error') as Estado,
    mensaje: d.mensaje || '',
    existente: d.existente || null,
    incluir: !!d.producto_id && d.precio_plazo != null,
    precioTexto: d.precio_plazo != null ? d.precio_plazo.toFixed(2).replace('.', ',') : '',
    skuTexto: d.sku || d.sku_pdf || '',
    resultado: 'pendiente',
    resultadoMsg: '',
  });

  const leerPdf = async () => {
    if (!archivo || leyendo) return;
    cancelar.current = false;
    setLeyendo(true); setItems([]); setError(''); setAviso('');
    setProgreso({ hecho: 0, total: 0 });
    try {
      const cuit = await getCuitFromStorage();
      let pagina = 1;
      let total = 0;
      const fallos: number[] = [];
      do {
        const fd = new FormData();
        fd.append('cuit', cuit || '');
        fd.append('archivo', archivo, archivo.name);
        fd.append('desde', String(pagina));
        fd.append('hasta', String(pagina + PAGINAS_POR_TANDA - 1));
        const res = await axios.post(`${API_URL}/admin/ofertas-pdf/analizar`, fd, { timeout: 180000 });
        const data = res.data || {};
        total = data.total_paginas || 0;

        if (data.catalogo_ok === false) setAviso('No se pudo leer el catálogo de Odoo: revisá los códigos a mano.');
        (data.errores || []).forEach((e: any) => fallos.push(e.pagina));
        if (data.vigencia?.desde || data.vigencia?.hasta) {
          setVigenciaPdf(v => ({ desde: v.desde || data.vigencia.desde, hasta: v.hasta || data.vigencia.hasta }));
          if (data.vigencia.desde) setDesde(d => (d === hoyISO() ? data.vigencia.desde : d));
          if (data.vigencia.hasta) setHasta(h => (h === finDeMes() ? data.vigencia.hasta : h));
        }
        const nuevos = (data.items || []).map(aItem);
        if (nuevos.length) setItems(prev => [...prev, ...nuevos]);

        pagina += PAGINAS_POR_TANDA;
        setProgreso({ hecho: Math.min(pagina - 1, total), total });
      } while (pagina <= total && !cancelar.current);

      if (fallos.length) setAviso(`No se pudieron leer las hojas: ${fallos.join(', ')}. Probá de nuevo o cargá esos productos a mano.`);
      else if (cancelar.current) setAviso('Lectura cortada: quedaron hojas sin leer.');
      else if (!itemsRef.current.length) setAviso('No se encontró ninguna oferta en el PDF.');
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudo leer el PDF.');
    } finally {
      setLeyendo(false);
      setProgreso(null);
    }
  };

  const editar = (id: string, cambios: Partial<Item>) =>
    setItems(prev => prev.map(i => (i.id === id ? { ...i, ...cambios } : i)));

  // Si la fila no se podía cargar porque faltaba el precio y el admin lo escribe,
  // se marca sola: tener que acordarse de tildarla también es una trampa.
  const editarPrecio = (item: Item, texto: string) =>
    editar(item.id, {
      precioTexto: texto,
      incluir: item.incluir || (!!item.producto_id && !aNumero(item.precioTexto) && !!aNumero(texto)),
      estado: item.estado === 'sin_precio' && aNumero(texto) ? 'ok' : item.estado,
    });

  // Al corregir un código a mano, se vuelve a buscar en Odoo.
  const rebuscarSku = async (item: Item) => {
    const sku = item.skuTexto.trim();
    if (!sku || sku === item.sku) return;
    try {
      const cuit = await getCuitFromStorage();
      const res = await axios.post(`${API_URL}/admin/ofertas-pdf/resolver`, { cuit, skus: [sku] });
      const r = (res.data?.items || [])[0];
      if (!r) return;
      editar(item.id, {
        sku: r.sku, producto_id: r.producto_id, producto: r.producto,
        existente: r.existente || null,
        estado: (r.producto_id && !aNumero(item.precioTexto)) ? 'sin_precio' : r.estado,
        mensaje: r.mensaje || '',
        incluir: !!r.producto_id && !!aNumero(item.precioTexto),
        skuTexto: r.sku || sku,
      });
    } catch {
      setError('No se pudo buscar ese código en Odoo.');
    }
  };

  const listas = useMemo(
    () => items.filter(i => i.incluir && i.producto_id && aNumero(i.precioTexto) && i.resultado !== 'ok'),
    [items]
  );
  const resumen = useMemo(() => {
    const r = { total: items.length, listas: 0, pisan: 0, problemas: 0, creadas: 0, fallidas: 0 };
    for (const i of items) {
      if (i.resultado === 'ok') { r.creadas++; continue; }
      if (i.resultado === 'error') r.fallidas++;
      const lista = i.incluir && i.producto_id && aNumero(i.precioTexto);
      if (lista) { r.listas++; if (i.existente) r.pisan++; }
      // "Problema" = no se puede cargar. Una fila destildada a propósito no lo es.
      else if (!i.producto_id || !aNumero(i.precioTexto)) r.problemas++;
    }
    return r;
  }, [items]);

  const darDeAlta = async () => {
    if (!listas.length || creando) return;
    if (!desde || !hasta) { setError('Poné desde y hasta cuándo valen las ofertas.'); return; }
    if (desde > hasta) { setError('La fecha de inicio es posterior a la de fin.'); return; }
    if (typeof window !== 'undefined') {
      const pisan = reemplazar && resumen.pisan
        ? `\n\n${resumen.pisan} producto(s) ya tenían una oferta cargada: se borra la anterior y queda la nueva.`
        : '';
      if (!window.confirm(`Se van a dar de alta ${listas.length} oferta(s) en la Tarifa General, del ${fechaCorta(desde)} al ${fechaCorta(hasta)}.${pisan}\n\n¿Seguimos?`)) return;
    }

    setCreando(true); setError(''); setAviso('');
    const cuit = await getCuitFromStorage();
    const dIni = aOdoo(desde, false);
    const dFin = aOdoo(hasta, true);
    const min = parseInt(minQty, 10) || 0;

    try {
      for (let i = 0; i < listas.length; i += DE_A_CUANTAS_SE_CREAN) {
        const tanda = listas.slice(i, i + DE_A_CUANTAS_SE_CREAN);
        setItems(prev => prev.map(x => (tanda.some(t => t.id === x.id) ? { ...x, resultado: 'creando' } : x)));
        const res = await axios.post(`${API_URL}/admin/ofertas-pdf/crear`, {
          cuit,
          items: tanda.map(t => ({
            product_id: t.producto_id,
            price: aNumero(t.precioTexto),
            min_qty: min,
            date_start: dIni,
            date_end: dFin,
            reemplazar_id: reemplazar && t.existente ? t.existente.id : null,
          })),
        }, { timeout: 180000 });
        const salida = res.data?.resultados || [];
        setItems(prev => prev.map(x => {
          const pos = tanda.findIndex(t => t.id === x.id);
          if (pos < 0) return x;
          const r = salida[pos];
          return r?.ok
            ? { ...x, resultado: 'ok', resultadoMsg: '', existente: null }
            : { ...x, resultado: 'error', resultadoMsg: r?.error || 'No se pudo dar de alta.' };
        }));
      }
      setAviso('Listo. Si querés que los precios se vean en la app ahora mismo, tocá "Actualizar la app".');
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Falló la carga de ofertas.');
      setItems(prev => prev.map(x => (x.resultado === 'creando' ? { ...x, resultado: 'pendiente' } : x)));
    } finally {
      setCreando(false);
    }
  };

  const actualizarApp = async () => {
    setSincronizando(true); setError('');
    try {
      await axios.post(`${API_URL}/admin/sync-offers`, {}, { timeout: 180000 });
      setAviso('Ofertas actualizadas en la app.');
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudo actualizar la app. Se actualiza igual sola en unos minutos.');
    } finally {
      setSincronizando(false);
    }
  };

  const cerrar = () => {
    if (leyendo || creando) return;
    onClose();
  };

  if (Platform.OS !== 'web') return null;

  const visibles = soloProblemas
    ? items.filter(i => i.resultado !== 'ok' && (!i.producto_id || !aNumero(i.precioTexto)))
    : items;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={cerrar}>
      <Pressable style={s.backdrop} onPress={cerrar} />
      <View style={[s.wrap, isDesktopWeb ? s.wrapDesktop : null]} pointerEvents="box-none">
        <View style={[s.card, isDesktopWeb ? s.cardDesktop : s.cardMobile]}>
          <View style={s.header}>
            <Feather name="tag" size={18} color="#1C9BD8" />
            <Text style={s.title} numberOfLines={1}>Cargar ofertas desde el PDF</Text>
            <Pressable onPress={cerrar} hitSlop={8} disabled={leyendo || creando}>
              <Feather name="x" size={20} color={leyendo || creando ? '#D1D5DB' : '#6B7280'} />
            </Pressable>
          </View>

          <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
            {/* 1. El PDF */}
            <Text style={s.paso}>1. ELEGÍ EL PDF DE OFERTAS</Text>
            <View ref={zonaRef} style={[s.zona, arrastrando && s.zonaActiva]}>
              <Feather name="file-text" size={26} color={arrastrando ? '#1C9BD8' : '#9CA3AF'} />
              <Text style={s.zonaText}>
                {archivo ? `${archivo.name} · ${(archivo.size / 1048576).toFixed(1)} MB` : 'Arrastrá el PDF acá'}
              </Text>
              <View style={s.zonaBtns}>
                <Pressable style={s.zonaBtn} onPress={abrirSelector} disabled={leyendo || creando}>
                  <Text style={s.zonaBtnText}>{archivo ? 'Cambiar PDF' : 'Elegir PDF'}</Text>
                </Pressable>
                {!!archivo && (
                  <Pressable style={[s.zonaBtn, s.zonaBtnFuerte]} onPress={leerPdf} disabled={leyendo || creando}>
                    {leyendo
                      ? <ActivityIndicator size="small" color="#FFFFFF" />
                      : <Text style={[s.zonaBtnText, { color: '#FFFFFF' }]}>Leer el PDF</Text>}
                  </Pressable>
                )}
              </View>
              {leyendo && (
                <View style={s.progreso}>
                  <Text style={s.progresoText}>
                    {progreso?.total
                      ? `Leyendo hoja ${Math.min(progreso.hecho + 1, progreso.total)} de ${progreso.total}…`
                      : 'Abriendo el PDF…'}
                    {items.length ? `  ·  ${items.length} oferta(s) encontradas` : ''}
                  </Text>
                  <Pressable onPress={() => { cancelar.current = true; }}>
                    <Text style={s.linkText}>Cortar</Text>
                  </Pressable>
                </View>
              )}
            </View>
            <View style={s.ayuda}>
              <Feather name="info" size={13} color="#1C9BD8" />
              <Text style={s.ayudaText}>
                Se carga el PRECIO A PLAZO de cada producto en la Tarifa General. El código del
                folleto se busca en Odoo; lo que no cierre lo podés corregir antes de dar de alta.
              </Text>
            </View>

            {!!aviso && (
              <View style={s.avisoBanner}>
                <Feather name="info" size={14} color="#B45309" />
                <Text style={s.avisoText}>{aviso}</Text>
                {resumen.creadas > 0 && (
                  <Pressable style={s.accionBtn} onPress={actualizarApp} disabled={sincronizando}>
                    {sincronizando
                      ? <ActivityIndicator size="small" color="#FFFFFF" />
                      : <Text style={s.accionBtnText}>Actualizar la app</Text>}
                  </Pressable>
                )}
              </View>
            )}
            {!!error && (
              <View style={s.errBanner}>
                <Feather name="alert-triangle" size={14} color="#B91C1C" />
                <Text style={s.errText}>{error}</Text>
              </View>
            )}

            {items.length > 0 && (
              <>
                {/* 2. Condiciones */}
                <Text style={s.paso}>2. CÓMO SE CARGAN</Text>
                <View style={s.condiciones}>
                  <View style={s.campo}>
                    <Text style={s.campoLabel}>Desde</Text>
                    <InputFecha valor={desde} onChange={setDesde} disabled={creando} />
                  </View>
                  <View style={s.campo}>
                    <Text style={s.campoLabel}>Hasta</Text>
                    <InputFecha valor={hasta} onChange={setHasta} disabled={creando} />
                  </View>
                  <View style={s.campo}>
                    <Text style={s.campoLabel}>Cantidad mínima</Text>
                    <TextInput style={s.minInput} value={minQty} onChangeText={setMinQty}
                      keyboardType="numeric" editable={!creando} />
                  </View>
                  <Pressable style={s.check} onPress={() => setReemplazar(v => !v)} disabled={creando}>
                    <Feather name={reemplazar ? 'check-square' : 'square'} size={18} color="#1C9BD8" />
                    <Text style={s.checkText}>Reemplazar la oferta anterior del producto</Text>
                  </Pressable>
                </View>
                {(vigenciaPdf.desde || vigenciaPdf.hasta) && (
                  <Text style={s.vigenciaText}>
                    En el PDF dice: vigencia {fechaCorta(vigenciaPdf.desde)} a {fechaCorta(vigenciaPdf.hasta)}.
                  </Text>
                )}

                {/* 3. Revisión */}
                <View style={s.listaHeader}>
                  <Text style={s.paso}>3. REVISÁ ANTES DE DAR DE ALTA ({items.length})</Text>
                  <View style={{ flex: 1 }} />
                  {resumen.problemas > 0 && (
                    <Pressable onPress={() => setSoloProblemas(v => !v)}>
                      <Text style={s.linkText}>
                        {soloProblemas ? `Ver las ${items.length}` : `Ver solo las ${resumen.problemas} con problema`}
                      </Text>
                    </Pressable>
                  )}
                  <Pressable onPress={limpiar} disabled={leyendo || creando}>
                    <Text style={s.linkText}>Vaciar</Text>
                  </Pressable>
                </View>

                {visibles.map(item => {
                  const est = ESTADOS[item.estado] || ESTADOS.error;
                  const precioOk = !!aNumero(item.precioTexto);
                  const puede = !!item.producto_id && precioOk;
                  return (
                    <View key={item.id} style={s.fila}>
                      <Pressable style={s.filaCheck} disabled={!puede || creando}
                        onPress={() => editar(item.id, { incluir: !item.incluir })}>
                        <Feather
                          name={item.resultado === 'ok' ? 'check-circle' : (item.incluir && puede ? 'check-square' : 'square')}
                          size={18}
                          color={item.resultado === 'ok' ? '#15803D' : (puede ? '#1C9BD8' : '#D1D5DB')} />
                      </Pressable>

                      <View style={s.filaInfo}>
                        <View style={s.filaTitulo}>
                          <Text style={s.filaPagina}>Hoja {item.pagina}</Text>
                          {item.producto_id ? (
                            <Text style={s.filaProducto} numberOfLines={1}>{item.producto}</Text>
                          ) : (
                            <TextInput
                              style={s.skuInput}
                              value={item.skuTexto}
                              onChangeText={t => editar(item.id, { skuTexto: t.toUpperCase() })}
                              onBlur={() => rebuscarSku(item)}
                              onSubmitEditing={() => rebuscarSku(item)}
                              placeholder="Código"
                              editable={!creando}
                            />
                          )}
                        </View>
                        <Text style={s.filaDetalle} numberOfLines={1}>
                          {item.nombre_pdf || item.sku_pdf}
                          {item.precio_contado != null ? `  ·  contado USD ${plata(item.precio_contado)}` : ''}
                          {item.iva != null ? `  ·  IVA ${porcentaje(item.iva)}%` : ''}
                        </Text>
                        {!!item.mensaje && <Text style={s.filaMsg}>{item.mensaje}</Text>}
                        {!!item.existente && item.resultado !== 'ok' && (
                          <Text style={s.filaExistente}>
                            Ya tiene una oferta de USD {plata(item.existente.precio)}
                            {item.existente.hasta ? ` hasta el ${fechaCorta(item.existente.hasta)}` : ''}
                            {reemplazar ? ' · se reemplaza' : ' · queda la vieja también'}
                          </Text>
                        )}
                        {item.resultado === 'error' && <Text style={s.filaError}>{item.resultadoMsg}</Text>}
                      </View>

                      <View style={s.filaPrecio}>
                        <Text style={s.precioLabel}>A plazo USD</Text>
                        <TextInput
                          style={[s.precioInput, !precioOk && s.precioInputMal]}
                          value={item.precioTexto}
                          onChangeText={t => editarPrecio(item, t)}
                          placeholder="0,00"
                          editable={!creando && item.resultado !== 'ok'}
                        />
                      </View>

                      <View style={s.filaEstado}>
                        {item.resultado === 'creando' ? (
                          <ActivityIndicator size="small" color="#1C9BD8" />
                        ) : item.resultado === 'ok' ? (
                          <View style={[s.chip, { backgroundColor: '#DCFCE7' }]}>
                            <Text style={[s.chipText, { color: '#15803D' }]}>Dada de alta</Text>
                          </View>
                        ) : (
                          <View style={[s.chip, { backgroundColor: est.bg }]}>
                            <Text style={[s.chipText, { color: est.color }]}>{est.label}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </>
            )}
          </ScrollView>

          <View style={s.footer}>
            <Text style={s.resumen}>
              {items.length
                ? `${resumen.listas} lista(s) para cargar` +
                  (resumen.pisan ? ` · ${resumen.pisan} pisan una oferta vigente` : '') +
                  (resumen.problemas ? ` · ${resumen.problemas} con problema` : '') +
                  (resumen.creadas ? ` · ${resumen.creadas} ya cargadas` : '') +
                  (resumen.fallidas ? ` · ${resumen.fallidas} fallaron` : '')
                : 'Elegí el PDF de ofertas y tocá "Leer el PDF".'}
            </Text>
            <View style={s.footerBtns}>
              <Pressable style={s.close} onPress={cerrar} disabled={leyendo || creando}>
                <Text style={s.closeText}>Cerrar</Text>
              </Pressable>
              <Pressable
                style={[s.altaBtn, (!listas.length || creando) && s.altaBtnOff]}
                onPress={darDeAlta}
                disabled={!listas.length || creando}>
                {creando && <ActivityIndicator size="small" color="#FFFFFF" />}
                <Text style={s.altaText}>
                  {creando ? 'Dando de alta…'
                    : !listas.length ? 'Dar de alta'
                    : `Dar de alta ${listas.length} oferta${listas.length === 1 ? '' : 's'}`}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const s = StyleSheet.create({
  backdrop: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)' },
  wrap: { flex: 1 },
  wrapDesktop: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#FFFFFF', overflow: 'hidden' },
  cardDesktop: { width: 980, maxWidth: '100%', maxHeight: '92%', borderRadius: 16 },
  cardMobile: { flex: 1 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  title: { flex: 1, fontFamily: 'BarlowCondensed-Bold', fontSize: 17, color: '#2B2B2B' },

  body: { paddingHorizontal: 18, paddingTop: 14 },
  paso: { fontFamily: 'BarlowCondensed-Bold', fontSize: 13, color: '#8A8A8A', letterSpacing: 0.8, marginBottom: 8, marginTop: 6 },

  zona: { borderWidth: 2, borderStyle: 'dashed', borderColor: '#D3D6DB', borderRadius: 14, paddingVertical: 20, alignItems: 'center', gap: 8, backgroundColor: '#FAFAFA', marginBottom: 12 },
  zonaActiva: { borderColor: '#1C9BD8', backgroundColor: '#EAF6FC' },
  zonaText: { fontFamily: 'Rubik', fontSize: 13, color: '#6B7280' },
  zonaBtns: { flexDirection: 'row', gap: 8, marginTop: 4 },
  zonaBtn: { paddingHorizontal: 16, height: 38, borderRadius: 999, borderWidth: 1, borderColor: '#1C9BD8', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  zonaBtnFuerte: { backgroundColor: '#1C9BD8' },
  zonaBtnText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 14, color: '#1C9BD8' },
  progreso: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  progresoText: { fontFamily: 'Rubik', fontSize: 12, color: '#1C9BD8' },

  ayuda: { flexDirection: 'row', gap: 8, backgroundColor: '#EAF6FC', borderRadius: 10, padding: 10, marginBottom: 12 },
  ayudaText: { flex: 1, fontFamily: 'Rubik', fontSize: 12, color: '#1E3A4C', lineHeight: 17 },

  avisoBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF3C7', borderRadius: 10, padding: 10, marginBottom: 10 },
  avisoText: { flex: 1, fontFamily: 'Rubik', fontSize: 12, color: '#92400E', lineHeight: 16 },
  accionBtn: { paddingHorizontal: 12, height: 30, borderRadius: 999, backgroundColor: '#B45309', alignItems: 'center', justifyContent: 'center' },
  accionBtnText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 13, color: '#FFFFFF' },
  errBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5', borderRadius: 10, padding: 10, marginBottom: 12 },
  errText: { flex: 1, fontFamily: 'Rubik', fontSize: 12, color: '#B91C1C', lineHeight: 16 },

  condiciones: { flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap', gap: 14, marginBottom: 6 },
  campo: { gap: 4 },
  campoLabel: { fontFamily: 'Rubik', fontSize: 11, color: '#6B7280' },
  minInput: { width: 90, height: 38, borderWidth: 1, borderColor: '#D3D6DB', borderRadius: 8, paddingHorizontal: 10, fontFamily: 'Rubik', fontSize: 13, color: '#2B2B2B', backgroundColor: '#FFFFFF' },
  check: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 38 },
  checkText: { fontFamily: 'Rubik', fontSize: 12, color: '#4B5563' },
  vigenciaText: { fontFamily: 'Rubik', fontSize: 11, color: '#9CA3AF', marginBottom: 4 },

  listaHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  linkText: { fontFamily: 'Rubik', fontSize: 12, color: '#6B7280', textDecorationLine: 'underline', marginBottom: 8 },

  fila: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  filaCheck: { padding: 2 },
  filaInfo: { flex: 1, minWidth: 0 },
  filaTitulo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  filaPagina: { fontFamily: 'Rubik', fontSize: 11, color: '#9CA3AF' },
  filaProducto: { flex: 1, fontFamily: 'BarlowCondensed-Bold', fontSize: 15, color: '#2B2B2B' },
  skuInput: { width: 160, height: 32, borderWidth: 1, borderColor: '#D3D6DB', borderRadius: 8, paddingHorizontal: 10, fontFamily: 'BarlowCondensed-Bold', fontSize: 14, color: '#2B2B2B', backgroundColor: '#FFFFFF' },
  filaDetalle: { fontFamily: 'Rubik', fontSize: 11, color: '#6B7280', marginTop: 2 },
  filaMsg: { fontFamily: 'Rubik', fontSize: 11, color: '#1D4ED8', marginTop: 2 },
  filaExistente: { fontFamily: 'Rubik', fontSize: 11, color: '#B45309', marginTop: 2 },
  filaError: { fontFamily: 'Rubik', fontSize: 11, color: '#B91C1C', marginTop: 2 },

  filaPrecio: { alignItems: 'flex-end', gap: 2 },
  precioLabel: { fontFamily: 'Rubik', fontSize: 10, color: '#9CA3AF' },
  precioInput: { width: 104, height: 34, borderWidth: 1, borderColor: '#D3D6DB', borderRadius: 8, paddingHorizontal: 10, textAlign: 'right', fontFamily: 'BarlowCondensed-Bold', fontSize: 16, color: '#2B2B2B', backgroundColor: '#FFFFFF' },
  precioInputMal: { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },

  filaEstado: { width: 110, alignItems: 'flex-end' },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  chipText: { fontFamily: 'Rubik', fontSize: 11, fontWeight: '600' },

  footer: { paddingHorizontal: 18, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#F0F0F0', gap: 8 },
  resumen: { fontFamily: 'Rubik', fontSize: 12, color: '#4B5563' },
  footerBtns: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  close: { height: 44, paddingHorizontal: 22, borderRadius: 999, borderWidth: 1, borderColor: '#D3D6DB', alignItems: 'center', justifyContent: 'center' },
  closeText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 15, color: '#2B2B2B' },
  altaBtn: { height: 44, paddingHorizontal: 22, borderRadius: 999, backgroundColor: '#1C9BD8', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  altaBtnOff: { backgroundColor: '#A7D8F0' },
  altaText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 15, color: '#FFFFFF' },
});

export default OfertasPdfAdminModal;
