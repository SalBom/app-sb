// src/components/MediaUploadAdminModal.tsx
// Subida por lotes a Firebase (solo ADMIN, solo web): fotos de producto, fichas
// técnicas y manuales. El SKU sale del nombre del archivo; el backend lo compara
// con Odoo y arma la ruta exacta que después lee la app:
//   Fotos   → products/{SKU}/{SKU}.webp  y  {SKU}_1..9.webp
//   Ficha   → fichas_tecnicas/{SKU}.webp
//   Manual  → manuales/{SKU}.pdf
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ActivityIndicator, TextInput, ScrollView, Image, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import axios from 'axios';
import { API_URL } from '../config';
import { getCuitFromStorage } from '../utils/authStorage';
import useIsDesktopWeb from '../hooks/useIsDesktopWeb';

type Tipo = 'fotos' | 'ficha' | 'manual';
type Estado = 'ok' | 'corregido' | 'no_encontrado' | 'ambiguo' | 'duplicado' | 'error';
type Analisis = { sku: string; slot: number; destino: string; existe: boolean; estado: Estado; mensaje: string };
type Fila = {
  id: string;
  file: any; // File del navegador
  nombre: string;
  preview: string | null;
  skuManual: string | null; // null = se toma del nombre del archivo
  slotManual: number | null;
  analisis: Analisis | null;
  subida: 'pendiente' | 'subiendo' | 'ok' | 'error';
  subidaMsg: string;
};

const TIPOS: { key: Tipo; label: string; icon: any; accept: string; exts: string[]; ayuda: string }[] = [
  {
    key: 'fotos', label: 'Fotos del producto', icon: 'image', accept: 'image/*',
    exts: ['.webp', '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tif', '.tiff'],
    ayuda: 'SKU.jpg es la foto principal · SKU_1.jpg … SKU_9.jpg son las extra (hasta 9). Se convierten a WEBP.',
  },
  {
    key: 'ficha', label: 'Ficha técnica', icon: 'file-text', accept: 'image/*',
    exts: ['.webp', '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tif', '.tiff'],
    ayuda: 'SKU.jpg (una imagen por producto). Se convierte a WEBP. Si es PDF, exportala como imagen.',
  },
  {
    key: 'manual', label: 'Manual (PDF)', icon: 'book-open', accept: 'application/pdf,.pdf',
    exts: ['.pdf'],
    ayuda: 'SKU.pdf (un PDF por producto).',
  },
];

const ESTADOS: Record<Estado, { label: string; color: string; bg: string }> = {
  ok: { label: 'OK', color: '#15803D', bg: '#DCFCE7' },
  corregido: { label: 'SKU corregido', color: '#1D4ED8', bg: '#DBEAFE' },
  no_encontrado: { label: 'No está en Odoo', color: '#B45309', bg: '#FEF3C7' },
  ambiguo: { label: 'SKU ambiguo', color: '#B91C1C', bg: '#FEE2E2' },
  duplicado: { label: 'Duplicado', color: '#B91C1C', bg: '#FEE2E2' },
  error: { label: 'Error', color: '#B91C1C', bg: '#FEE2E2' },
};

const extDe = (nombre: string) => {
  const i = nombre.lastIndexOf('.');
  return i >= 0 ? nombre.slice(i).toLowerCase() : '';
};
// Fotos extra admitidas por producto (igual que _MEDIA_MAX_EXTRAS en el backend).
const MAX_EXTRAS = 9;
const esBasura = (nombre: string) => nombre.startsWith('.') || /^(thumbs\.db|desktop\.ini)$/i.test(nombre);
let _seq = 0;

// Recorre carpetas soltadas con drag & drop (API webkitGetAsEntry de Chrome/Edge/Firefox).
const leerEntrada = (entry: any): Promise<any[]> => new Promise((resolve) => {
  if (!entry) return resolve([]);
  if (entry.isFile) return entry.file((f: any) => resolve([f]), () => resolve([]));
  if (!entry.isDirectory) return resolve([]);
  const reader = entry.createReader();
  const todos: any[] = [];
  const leerTanda = () => reader.readEntries(async (entries: any[]) => {
    if (!entries.length) {
      const hijos = await Promise.all(todos.map(leerEntrada));
      return resolve(hijos.flat());
    }
    todos.push(...entries);
    leerTanda(); // readEntries devuelve de a 100: hay que llamar hasta que venga vacío
  }, () => resolve([]));
  leerTanda();
});

const MediaUploadAdminModal = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
  const isDesktopWeb = useIsDesktopWeb();
  const [tipo, setTipo] = useState<Tipo>('fotos');
  const [filas, setFilas] = useState<Fila[]>([]);
  const [estadoFb, setEstadoFb] = useState<{ ok: boolean; error?: string } | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [incluirNoEncontrados, setIncluirNoEncontrados] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);

  const filasRef = useRef<Fila[]>([]);
  filasRef.current = filas;
  const tipoRef = useRef<Tipo>(tipo);
  tipoRef.current = tipo;
  const analisisSeq = useRef(0);
  const debounce = useRef<any>(null);

  const cfg = TIPOS.find(t => t.key === tipo)!;

  const liberarPreviews = (lista: Fila[]) => {
    lista.forEach(f => { if (f.preview) try { URL.revokeObjectURL(f.preview); } catch {} });
  };

  useEffect(() => {
    if (!visible) return;
    setError(''); setAviso('');
    (async () => {
      try {
        const cuit = await getCuitFromStorage();
        const res = await axios.get(`${API_URL}/admin/media/estado`, { params: { cuit } });
        setEstadoFb({ ok: !!res.data?.ok, error: res.data?.error });
      } catch (e: any) {
        setEstadoFb({ ok: false, error: e?.response?.data?.error || 'No se pudo consultar el servidor.' });
      }
    })();
  }, [visible]);

  // Al cerrar, soltamos las vistas previas (object URLs) para no dejar memoria tomada.
  useEffect(() => () => liberarPreviews(filasRef.current), []);

  const analizar = useCallback(async (lista: Fila[]) => {
    if (!lista.length) return;
    const seq = ++analisisSeq.current;
    setAnalizando(true);
    try {
      const cuit = await getCuitFromStorage();
      const res = await axios.post(`${API_URL}/admin/media/analizar`, {
        cuit,
        tipo: tipoRef.current,
        archivos: lista.map(f => ({
          nombre: f.nombre,
          ...(f.skuManual ? { sku: f.skuManual, slot: f.slotManual ?? 0 } : {}),
        })),
      });
      if (seq !== analisisSeq.current) return; // llegó una respuesta más nueva
      const items: Analisis[] = res.data?.items || [];
      const porId = new Map(lista.map((f, i) => [f.id, items[i]]));
      setFilas(prev => prev.map(f => (porId.has(f.id) ? { ...f, analisis: porId.get(f.id) || null } : f)));
      if (res.data?.firebase_ok === false) setError(`No pude revisar qué archivos ya existen: ${res.data.firebase_error}`);
      else if (res.data?.catalogo_ok === false) setAviso('No pude leer los SKUs de Odoo: no se verifica si existen.');
    } catch (e: any) {
      if (seq === analisisSeq.current) setError(e?.response?.data?.error || 'No se pudieron analizar los archivos.');
    } finally {
      if (seq === analisisSeq.current) setAnalizando(false);
    }
  }, []);

  const reanalizarPronto = (lista: Fila[]) => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => analizar(lista), 450);
  };

  const agregarArchivos = useCallback((archivos: any[]) => {
    const t = TIPOS.find(x => x.key === tipoRef.current)!;
    const validos: any[] = [];
    let ignorados = 0;
    for (const f of archivos) {
      if (!f?.name || esBasura(f.name)) continue;
      if (t.exts.includes(extDe(f.name))) validos.push(f);
      else ignorados++;
    }
    setError('');
    setAviso(ignorados
      ? `Se ignoraron ${ignorados} archivo(s) que no son ${t.key === 'manual' ? 'PDF' : 'imágenes'}.`
      : '');
    if (!validos.length) return;

    const yaEstan = new Set(filasRef.current.map(f => `${f.nombre}|${f.file?.size}`));
    const nuevas: Fila[] = validos
      .filter(f => !yaEstan.has(`${f.name}|${f.size}`))
      .map(f => ({
        id: `m${++_seq}`,
        file: f,
        nombre: f.name,
        preview: t.key === 'manual' ? null : URL.createObjectURL(f),
        skuManual: null,
        slotManual: null,
        analisis: null,
        subida: 'pendiente',
        subidaMsg: '',
      }));
    const lista = [...filasRef.current, ...nuevas];
    setFilas(lista);
    analizar(lista);
  }, [analizar]);

  const agregarRef = useRef(agregarArchivos);
  agregarRef.current = agregarArchivos;

  const abrirSelector = (carpeta: boolean) => {
    if (typeof document === 'undefined') return;
    const input = document.createElement('input') as any;
    input.type = 'file';
    input.multiple = true;
    if (carpeta) input.setAttribute('webkitdirectory', '');
    else input.accept = cfg.accept;
    input.onchange = () => agregarRef.current(Array.from(input.files || []));
    input.click();
  };

  // Zona de arrastre: en react-native-web el ref de un View es el elemento del DOM.
  const quitarListeners = useRef<(() => void) | null>(null);
  const zonaRef = useCallback((node: any) => {
    quitarListeners.current?.();
    quitarListeners.current = null;
    if (!node || typeof node.addEventListener !== 'function') return;
    const over = (e: any) => { e.preventDefault(); setArrastrando(true); };
    const leave = (e: any) => { e.preventDefault(); setArrastrando(false); };
    const drop = async (e: any) => {
      e.preventDefault();
      setArrastrando(false);
      const items = Array.from(e.dataTransfer?.items || []) as any[];
      const entradas = items.map(it => it.webkitGetAsEntry?.()).filter(Boolean);
      const archivos = entradas.length
        ? (await Promise.all(entradas.map(leerEntrada))).flat()
        : Array.from(e.dataTransfer?.files || []);
      agregarRef.current(archivos);
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

  const cambiarTipo = (nuevo: Tipo) => {
    if (nuevo === tipo || subiendo) return;
    if (filas.length && typeof window !== 'undefined'
      && !window.confirm('Cambiar el tipo vacía la lista de archivos elegidos. ¿Seguir?')) return;
    liberarPreviews(filas);
    setFilas([]);
    setAviso(''); setError('');
    setTipo(nuevo);
  };

  const editarFila = (id: string, cambios: Partial<Fila>) => {
    const lista = filasRef.current.map(f => {
      if (f.id !== id) return f;
      const base = { ...f, ...cambios, subida: 'pendiente' as const, subidaMsg: '' };
      // Al corregir una parte a mano, la otra queda fija en lo que ya se había detectado.
      if (base.skuManual === null && cambios.slotManual !== undefined) base.skuManual = f.analisis?.sku || '';
      if (base.slotManual === null && cambios.skuManual !== undefined) base.slotManual = f.analisis?.slot ?? 0;
      return base;
    });
    setFilas(lista);
    reanalizarPronto(lista);
  };

  const quitarFila = (id: string) => {
    const fila = filasRef.current.find(f => f.id === id);
    if (fila) liberarPreviews([fila]);
    const lista = filasRef.current.filter(f => f.id !== id);
    setFilas(lista);
    // Sacar un duplicado puede destrabar al otro: volvemos a analizar.
    if (lista.length) reanalizarPronto(lista);
  };

  const limpiar = () => {
    if (subiendo) return;
    liberarPreviews(filas);
    setFilas([]);
    setAviso(''); setError('');
  };

  const subible = (f: Fila) => {
    const e = f.analisis?.estado;
    if (!e || f.subida === 'ok') return false;
    return e === 'ok' || e === 'corregido' || (e === 'no_encontrado' && incluirNoEncontrados);
  };

  const resumen = useMemo(() => {
    const r = { listos: 0, reemplazan: 0, problemas: 0, noEncontrados: 0, subidos: 0, fallidos: 0 };
    for (const f of filas) {
      if (f.subida === 'ok') { r.subidos++; continue; }
      if (f.subida === 'error') r.fallidos++;
      const e = f.analisis?.estado;
      if (e === 'no_encontrado') r.noEncontrados++;
      if (subible(f)) { r.listos++; if (f.analisis?.existe) r.reemplazan++; }
      else if (e && e !== 'no_encontrado') r.problemas++;
    }
    return r;
  }, [filas, incluirNoEncontrados]);

  const subirTodo = async () => {
    const pendientes = filasRef.current.filter(subible);
    if (!pendientes.length || subiendo) return;
    if (resumen.reemplazan && typeof window !== 'undefined'
      && !window.confirm(`${resumen.reemplazan} archivo(s) van a reemplazar lo que ya está en Firebase. ¿Seguir?`)) return;

    setSubiendo(true);
    setError('');
    const cuit = await getCuitFromStorage();
    const marcar = (id: string, cambios: Partial<Fila>) =>
      setFilas(prev => prev.map(f => (f.id === id ? { ...f, ...cambios } : f)));

    // De a uno: así se ve el avance y un error no tira abajo el lote entero.
    for (const f of pendientes) {
      marcar(f.id, { subida: 'subiendo', subidaMsg: '' });
      try {
        const fd = new FormData();
        fd.append('cuit', cuit || '');
        fd.append('tipo', tipo);
        fd.append('sku', f.analisis!.sku);
        fd.append('slot', String(f.analisis!.slot || 0));
        fd.append('archivo', f.file, f.nombre);
        await axios.post(`${API_URL}/admin/media/subir`, fd, { timeout: 180000 });
        marcar(f.id, { subida: 'ok', subidaMsg: '' });
      } catch (e: any) {
        marcar(f.id, { subida: 'error', subidaMsg: e?.response?.data?.error || 'No se pudo subir.' });
      }
    }
    setSubiendo(false);
  };

  const cerrar = () => {
    if (subiendo) return;
    onClose();
  };

  if (Platform.OS !== 'web') return null;

  const etiquetaSlot = (n: number) => (n === 0 ? 'Principal' : `Extra ${n}`);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={cerrar}>
      <Pressable style={s.backdrop} onPress={cerrar} />
      <View style={[s.wrap, isDesktopWeb ? s.wrapDesktop : null]} pointerEvents="box-none">
        <View style={[s.card, isDesktopWeb ? s.cardDesktop : s.cardMobile]}>
          <View style={s.header}>
            <Feather name="upload-cloud" size={18} color="#1C9BD8" />
            <Text style={s.title} numberOfLines={1}>Subir imágenes y documentos a Firebase</Text>
            <Pressable onPress={cerrar} hitSlop={8} disabled={subiendo}>
              <Feather name="x" size={20} color={subiendo ? '#D1D5DB' : '#6B7280'} />
            </Pressable>
          </View>

          <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
            {estadoFb && !estadoFb.ok && (
              <View style={s.errBanner}>
                <Feather name="alert-triangle" size={14} color="#B91C1C" />
                <Text style={s.errText}>
                  El servidor todavía no puede escribir en Firebase: {estadoFb.error}
                </Text>
              </View>
            )}

            {/* 1. Qué se sube */}
            <Text style={s.paso}>1. ¿QUÉ VAS A SUBIR?</Text>
            <View style={s.tipos}>
              {TIPOS.map(t => {
                const activo = t.key === tipo;
                return (
                  <Pressable key={t.key} onPress={() => cambiarTipo(t.key)} disabled={subiendo}
                    style={[s.tipoBtn, activo && s.tipoBtnActivo]}>
                    <Feather name={t.icon} size={16} color={activo ? '#FFFFFF' : '#2B2B2B'} />
                    <Text style={[s.tipoText, activo && s.tipoTextActivo]}>{t.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={s.ayuda}>
              <Feather name="info" size={13} color="#1C9BD8" />
              <Text style={s.ayudaText}>
                El nombre del archivo tiene que ser el SKU. {cfg.ayuda}
              </Text>
            </View>

            {/* 2. Archivos */}
            <Text style={s.paso}>2. ELEGÍ LOS ARCHIVOS</Text>
            <View ref={zonaRef} style={[s.zona, arrastrando && s.zonaActiva]}>
              <Feather name="upload" size={26} color={arrastrando ? '#1C9BD8' : '#9CA3AF'} />
              <Text style={s.zonaText}>Arrastrá archivos o carpetas acá</Text>
              <View style={s.zonaBtns}>
                <Pressable style={s.zonaBtn} onPress={() => abrirSelector(false)} disabled={subiendo}>
                  <Text style={s.zonaBtnText}>Elegir archivos</Text>
                </Pressable>
                <Pressable style={s.zonaBtn} onPress={() => abrirSelector(true)} disabled={subiendo}>
                  <Text style={s.zonaBtnText}>Elegir carpeta</Text>
                </Pressable>
              </View>
            </View>

            {!!aviso && (
              <View style={s.avisoBanner}>
                <Feather name="info" size={14} color="#B45309" />
                <Text style={s.avisoText}>{aviso}</Text>
              </View>
            )}
            {!!error && (
              <View style={s.errBanner}>
                <Feather name="alert-triangle" size={14} color="#B91C1C" />
                <Text style={s.errText}>{error}</Text>
              </View>
            )}

            {/* 3. Revisión */}
            {filas.length > 0 && (
              <>
                <View style={s.listaHeader}>
                  <Text style={s.paso}>3. REVISÁ ANTES DE SUBIR ({filas.length})</Text>
                  {analizando && <ActivityIndicator size="small" color="#1C9BD8" />}
                  <View style={{ flex: 1 }} />
                  <Pressable onPress={limpiar} disabled={subiendo}>
                    <Text style={s.linkText}>Vaciar lista</Text>
                  </Pressable>
                </View>

                {filas.map(f => {
                  const a = f.analisis;
                  const est = a ? ESTADOS[a.estado] : null;
                  const slot = f.slotManual ?? a?.slot ?? 0;
                  return (
                    <View key={f.id} style={[s.fila, !isDesktopWeb && s.filaMobile]}>
                      <View style={s.thumb}>
                        {f.preview
                          ? <Image source={{ uri: f.preview }} style={s.thumbImg} resizeMode="cover" />
                          : <Feather name="file-text" size={22} color="#D32F2F" />}
                      </View>

                      <View style={s.filaInfo}>
                        <Text style={s.filaNombre} numberOfLines={1}>{f.nombre}</Text>
                        <View style={s.filaEdit}>
                          <TextInput
                            style={s.skuInput}
                            value={f.skuManual ?? a?.sku ?? ''}
                            placeholder="SKU"
                            placeholderTextColor="#9CA3AF"
                            onChangeText={(t) => editarFila(f.id, { skuManual: t })}
                            editable={!subiendo && f.subida !== 'ok'}
                            autoCapitalize="characters"
                          />
                          {tipo === 'fotos' && (
                            <View style={s.slots}>
                              {/* Principal + hasta MAX_EXTRAS fotos: con botones para cada número
                                  no entraban, así que el número se escribe (0 = principal). */}
                              <Pressable disabled={subiendo || f.subida === 'ok'}
                                onPress={() => editarFila(f.id, { slotManual: 0 })}
                                style={[s.slotBtn, slot === 0 && s.slotBtnActivo]}>
                                <Text style={[s.slotText, slot === 0 && s.slotTextActivo]}>P</Text>
                              </Pressable>
                              <TextInput
                                style={s.slotInput}
                                value={slot === 0 ? '' : String(slot)}
                                placeholder="N°"
                                placeholderTextColor="#9CA3AF"
                                onChangeText={(t) => {
                                  const n = parseInt(t.replace(/[^0-9]/g, ''), 10);
                                  editarFila(f.id, { slotManual: Number.isNaN(n) ? 0 : Math.min(n, MAX_EXTRAS) });
                                }}
                                editable={!subiendo && f.subida !== 'ok'}
                                keyboardType="number-pad"
                                maxLength={1}
                              />
                            </View>
                          )}
                        </View>
                        {a?.destino ? (
                          <Text style={s.destino} numberOfLines={1}>
                            {tipo === 'fotos' ? `${etiquetaSlot(slot)} · ` : ''}{a.destino}
                          </Text>
                        ) : null}
                        {!!(f.subidaMsg || a?.mensaje) && (
                          <Text style={[s.filaMsg, f.subida === 'error' && { color: '#B91C1C' }]}>
                            {f.subidaMsg || a?.mensaje}
                          </Text>
                        )}
                      </View>

                      <View style={s.filaEstado}>
                        {f.subida === 'subiendo' ? (
                          <ActivityIndicator size="small" color="#1C9BD8" />
                        ) : f.subida === 'ok' ? (
                          <View style={[s.chip, { backgroundColor: '#DCFCE7' }]}>
                            <Feather name="check" size={12} color="#15803D" />
                            <Text style={[s.chipText, { color: '#15803D' }]}>Subido</Text>
                          </View>
                        ) : f.subida === 'error' ? (
                          <View style={[s.chip, { backgroundColor: '#FEE2E2' }]}>
                            <Text style={[s.chipText, { color: '#B91C1C' }]}>Falló</Text>
                          </View>
                        ) : est ? (
                          <>
                            <View style={[s.chip, { backgroundColor: est.bg }]}>
                              <Text style={[s.chipText, { color: est.color }]}>{est.label}</Text>
                            </View>
                            {a && ['ok', 'corregido', 'no_encontrado'].includes(a.estado) && (
                              <Text style={[s.nuevoText, a.existe && { color: '#B45309' }]}>
                                {a.existe ? 'Reemplaza' : 'Nuevo'}
                              </Text>
                            )}
                          </>
                        ) : (
                          <ActivityIndicator size="small" color="#D1D5DB" />
                        )}
                      </View>

                      <Pressable onPress={() => quitarFila(f.id)} disabled={subiendo} hitSlop={6} style={s.quitar}>
                        <Feather name="x" size={16} color="#9CA3AF" />
                      </Pressable>
                    </View>
                  );
                })}
              </>
            )}
          </ScrollView>

          <View style={s.footer}>
            {resumen.noEncontrados > 0 && (
              <Pressable style={s.checkRow} onPress={() => setIncluirNoEncontrados(v => !v)} disabled={subiendo}>
                <Feather name={incluirNoEncontrados ? 'check-square' : 'square'} size={16} color="#B45309" />
                <Text style={s.checkText}>
                  Subir también los {resumen.noEncontrados} archivo(s) con SKU que no está en Odoo
                </Text>
              </Pressable>
            )}
            {filas.length > 0 && (
              <Text style={s.resumen}>
                {resumen.listos} para subir
                {resumen.reemplazan ? ` (${resumen.reemplazan} reemplazan)` : ''}
                {resumen.problemas ? ` · ${resumen.problemas} con problemas` : ''}
                {resumen.subidos ? ` · ${resumen.subidos} subidos` : ''}
                {resumen.fallidos ? ` · ${resumen.fallidos} fallaron` : ''}
              </Text>
            )}
            {resumen.subidos > 0 && !subiendo && (
              <Text style={s.cacheText}>Si reemplazaste fotos, la app puede tardar unos minutos en mostrar las nuevas.</Text>
            )}
            <View style={s.footerBtns}>
              <Pressable style={s.close} onPress={cerrar} disabled={subiendo}>
                <Text style={s.closeText}>Cerrar</Text>
              </Pressable>
              <Pressable
                style={[s.subirBtn, (!resumen.listos || subiendo || analizando) && s.subirBtnOff]}
                onPress={subirTodo}
                disabled={!resumen.listos || subiendo || analizando}
              >
                {subiendo
                  ? <ActivityIndicator size="small" color="#FFFFFF" />
                  : <Feather name="upload-cloud" size={16} color="#FFFFFF" />}
                <Text style={s.subirText}>
                  {subiendo ? 'Subiendo…'
                    : !resumen.listos ? 'Subir archivos'
                    : `Subir ${resumen.listos} archivo${resumen.listos === 1 ? '' : 's'}`}
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
  cardDesktop: { width: 860, maxWidth: '100%', maxHeight: '92%', borderRadius: 16 },
  cardMobile: { flex: 1 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  title: { flex: 1, fontFamily: 'BarlowCondensed-Bold', fontSize: 17, color: '#2B2B2B' },

  body: { paddingHorizontal: 18, paddingTop: 14 },
  paso: { fontFamily: 'BarlowCondensed-Bold', fontSize: 13, color: '#8A8A8A', letterSpacing: 0.8, marginBottom: 8, marginTop: 6 },

  tipos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  tipoBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, height: 40, borderRadius: 999, borderWidth: 1, borderColor: '#D3D6DB', backgroundColor: '#FFFFFF' },
  tipoBtnActivo: { backgroundColor: '#1C9BD8', borderColor: '#1C9BD8' },
  tipoText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 15, color: '#2B2B2B' },
  tipoTextActivo: { color: '#FFFFFF' },

  ayuda: { flexDirection: 'row', gap: 8, backgroundColor: '#EAF6FC', borderRadius: 10, padding: 10, marginBottom: 14 },
  ayudaText: { flex: 1, fontFamily: 'Rubik', fontSize: 12, color: '#1E3A4C', lineHeight: 17 },

  zona: { borderWidth: 2, borderStyle: 'dashed', borderColor: '#D3D6DB', borderRadius: 14, paddingVertical: 22, alignItems: 'center', gap: 8, backgroundColor: '#FAFAFA', marginBottom: 12 },
  zonaActiva: { borderColor: '#1C9BD8', backgroundColor: '#EAF6FC' },
  zonaText: { fontFamily: 'Rubik', fontSize: 13, color: '#6B7280' },
  zonaBtns: { flexDirection: 'row', gap: 8, marginTop: 4 },
  zonaBtn: { paddingHorizontal: 14, height: 36, borderRadius: 999, borderWidth: 1, borderColor: '#1C9BD8', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  zonaBtnText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 14, color: '#1C9BD8' },

  avisoBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF3C7', borderRadius: 10, padding: 10, marginBottom: 10 },
  avisoText: { flex: 1, fontFamily: 'Rubik', fontSize: 12, color: '#92400E', lineHeight: 16 },
  errBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5', borderRadius: 10, padding: 10, marginBottom: 12 },
  errText: { flex: 1, fontFamily: 'Rubik', fontSize: 12, color: '#B91C1C', lineHeight: 16 },

  listaHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  linkText: { fontFamily: 'Rubik', fontSize: 12, color: '#6B7280', textDecorationLine: 'underline', marginBottom: 8 },

  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  filaMobile: { alignItems: 'flex-start' },
  thumb: { width: 52, height: 52, borderRadius: 8, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  thumbImg: { width: 52, height: 52 },
  filaInfo: { flex: 1, minWidth: 0 },
  filaNombre: { fontFamily: 'Rubik', fontSize: 12, color: '#6B7280', marginBottom: 4 },
  filaEdit: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  skuInput: { width: 170, height: 34, borderWidth: 1, borderColor: '#D3D6DB', borderRadius: 8, paddingHorizontal: 10, fontFamily: 'BarlowCondensed-Bold', fontSize: 15, color: '#2B2B2B', backgroundColor: '#FFFFFF' },
  slots: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  slotInput: { width: 42, height: 30, borderWidth: 1, borderColor: '#D3D6DB', borderRadius: 6, textAlign: 'center', fontFamily: 'BarlowCondensed-Bold', fontSize: 13, color: '#2B2B2B', backgroundColor: '#FFFFFF' },
  slotBtn: { width: 30, height: 30, borderRadius: 6, borderWidth: 1, borderColor: '#D3D6DB', alignItems: 'center', justifyContent: 'center' },
  slotBtnActivo: { backgroundColor: '#2B2B2B', borderColor: '#2B2B2B' },
  slotText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 13, color: '#2B2B2B' },
  slotTextActivo: { color: '#FFFFFF' },
  destino: { fontFamily: 'Rubik', fontSize: 11, color: '#9CA3AF', marginTop: 4 },
  filaMsg: { fontFamily: 'Rubik', fontSize: 11, color: '#6B7280', marginTop: 2 },

  filaEstado: { width: 118, alignItems: 'flex-end', gap: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  chipText: { fontFamily: 'Rubik', fontSize: 11, fontWeight: '600' },
  nuevoText: { fontFamily: 'Rubik', fontSize: 11, color: '#6B7280' },
  quitar: { padding: 4 },

  footer: { paddingHorizontal: 18, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#F0F0F0', gap: 8 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkText: { flex: 1, fontFamily: 'Rubik', fontSize: 12, color: '#92400E' },
  resumen: { fontFamily: 'Rubik', fontSize: 12, color: '#4B5563' },
  cacheText: { fontFamily: 'Rubik', fontSize: 11, color: '#9CA3AF' },
  footerBtns: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  close: { height: 44, paddingHorizontal: 22, borderRadius: 999, borderWidth: 1, borderColor: '#D3D6DB', alignItems: 'center', justifyContent: 'center' },
  closeText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 15, color: '#2B2B2B' },
  subirBtn: { height: 44, paddingHorizontal: 22, borderRadius: 999, backgroundColor: '#1C9BD8', flexDirection: 'row', alignItems: 'center', gap: 8 },
  subirBtnOff: { backgroundColor: '#A7D8F0' },
  subirText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 15, color: '#FFFFFF' },
});

export default MediaUploadAdminModal;
