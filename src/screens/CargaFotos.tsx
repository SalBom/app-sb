// src/screens/CargaFotos.tsx
// Página pública para que quien saca las fotos de los repuestos las suba desde
// el celular, sin usuario ni app: abre el link que le mandaron
// (/carga-fotos?k=LLAVE), busca el repuesto, le saca las fotos que quiera y
// anota cuántas unidades contó.
//
// Todo el trabajo pesado pasa ACÁ, en el teléfono de esa persona:
//   - se achica cada foto antes de mandarla (una foto de celular son 8-12 MB y
//     con señal mala eso no sube nunca);
//   - se le saca el fondo con @imgly/background-removal, que corre en el propio
//     navegador: sin API, sin costo por foto (el mismo que usa el Home).
// El backend solo las pasa a .webp y las guarda en Firebase con el nombre del SKU.
//
// El stock que anota NO toca Odoo: queda guardado como "lo que contó Fulano tal
// día" para que el admin lo mire y decida. Esta pantalla no mueve stock.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, ScrollView,
  ActivityIndicator, Image, Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import axios from 'axios';
import { API_URL } from '../config';
import { removeBackground } from '../utils/removeBg';

const LADO_MAX = 2000;        // igual que el tope del backend
const MAX_EN_COLA = 10;       // principal + 9 extras es lo que admite un producto

type Producto = { id: number; sku: string; nombre: string; precio?: number | null };
type EstadoFoto = 'procesando' | 'lista' | 'subiendo' | 'subida' | 'error';
type Foto = {
  id: string;
  blob: Blob | null;
  url: string | null;
  estado: EstadoFoto;
  fondoQuitado: boolean;
  mensaje: string;
  principal?: boolean;
};
type Resumen = { sku: string; nombre: string; fotos: number; conteo: number | null };

const leerLlave = () => {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('k') || '';
};

const plata = (n?: number | null) =>
  n == null ? null : n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Achica la foto y la devuelve como blob, para que suba rápido desde el celular. */
const achicar = (file: any): Promise<Blob> => new Promise((resolve) => {
  const url = URL.createObjectURL(file);
  const img = new window.Image();
  img.onload = () => {
    const escala = Math.min(1, LADO_MAX / Math.max(img.width, img.height));
    if (escala === 1) { URL.revokeObjectURL(url); return resolve(file); }
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(img.width * escala);
    lienzo.height = Math.round(img.height * escala);
    lienzo.getContext('2d')!.drawImage(img, 0, 0, lienzo.width, lienzo.height);
    lienzo.toBlob((b) => { URL.revokeObjectURL(url); resolve(b || file); }, 'image/jpeg', 0.92);
  };
  // Si el navegador no puede abrirla (ej. HEIC de iPhone), que siga de largo:
  // el backend avisa con un mensaje claro.
  img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
  img.src = url;
});

let _seq = 0;

export default function CargaFotos() {
  const [llave] = useState(leerLlave);
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'invalido'>('cargando');
  const [etiqueta, setEtiqueta] = useState('');
  const [error, setError] = useState('');

  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<Producto[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [aMano, setAMano] = useState('');
  const [modoAMano, setModoAMano] = useState(false);

  const [elegido, setElegido] = useState<Producto | null>(null);
  const [infoSku, setInfoSku] = useState<{ fotos: number; en_odoo: boolean; precio?: number | null } | null>(null);

  const [sinFondo, setSinFondo] = useState(true);
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [subiendo, setSubiendo] = useState(false);

  const [conteo, setConteo] = useState('');
  const [guardandoConteo, setGuardandoConteo] = useState(false);
  const [conteoGuardado, setConteoGuardado] = useState<number | null>(null);

  const [resumen, setResumen] = useState<Resumen[]>([]);

  const debounce = useRef<any>(null);
  const fotosRef = useRef<Foto[]>([]);
  fotosRef.current = fotos;

  useEffect(() => {
    if (!llave) { setEstado('invalido'); setError('El link está incompleto. Pedí uno nuevo.'); return; }
    axios.get(`${API_URL}/carga-fotos/estado`, { params: { k: llave } })
      .then((r) => { setEstado('ok'); setEtiqueta(r.data?.etiqueta || ''); })
      .catch((e) => {
        setEstado('invalido');
        setError(e?.response?.data?.error || 'No se pudo abrir el link. Probá de nuevo.');
      });
  }, [llave]);

  // Al salir, soltamos las vistas previas.
  useEffect(() => () => {
    fotosRef.current.forEach(f => { if (f.url) try { URL.revokeObjectURL(f.url); } catch {} });
  }, []);

  const buscar = useCallback((texto: string) => {
    setBusqueda(texto);
    clearTimeout(debounce.current);
    if (texto.trim().length < 2) { setResultados([]); return; }
    setBuscando(true);
    debounce.current = setTimeout(async () => {
      try {
        const r = await axios.get(`${API_URL}/carga-fotos/productos`, { params: { k: llave, q: texto.trim() } });
        setResultados(r.data?.items || []);
      } catch {
        setResultados([]);
      } finally {
        setBuscando(false);
      }
    }, 400);
  }, [llave]);

  const limpiarFotos = () => {
    fotosRef.current.forEach(f => { if (f.url) try { URL.revokeObjectURL(f.url); } catch {} });
    setFotos([]);
  };

  const elegir = async (p: Producto) => {
    setElegido(p); setResultados([]); setBusqueda(''); setInfoSku(null); setError('');
    setModoAMano(false); setAMano('');
    limpiarFotos(); setConteo(''); setConteoGuardado(null);
    try {
      const r = await axios.get(`${API_URL}/carga-fotos/producto`, { params: { k: llave, sku: p.sku } });
      setInfoSku({ fotos: r.data?.fotos || 0, en_odoo: r.data?.en_odoo !== false, precio: r.data?.precio });
    } catch { /* si falla, el backend igual resuelve el lugar al subir */ }
  };

  const volverABuscar = () => {
    setElegido(null); setInfoSku(null); setError('');
    limpiarFotos(); setConteo(''); setConteoGuardado(null);
  };

  const marcar = (id: string, cambios: Partial<Foto>) =>
    setFotos(prev => prev.map(f => (f.id === id ? { ...f, ...cambios } : f)));

  /** Prepara una foto: la achica y, si corresponde, le saca el fondo. */
  const procesar = async (id: string, file: any) => {
    try {
      const chica = await achicar(file);
      let blob: Blob = chica;
      let fondoQuitado = false;
      if (sinFondo) {
        const entrada = URL.createObjectURL(chica);
        const salida = await removeBackground(entrada);
        // removeBackground devuelve la MISMA url si no pudo: así sabemos si salió.
        if (salida !== entrada) {
          blob = await (await fetch(salida)).blob();
          fondoQuitado = true;
          try { URL.revokeObjectURL(salida); } catch {}
        }
        try { URL.revokeObjectURL(entrada); } catch {}
      }
      marcar(id, {
        blob, url: URL.createObjectURL(blob), estado: 'lista', fondoQuitado,
        mensaje: sinFondo && !fondoQuitado ? 'Sin recortar' : '',
      });
    } catch {
      marcar(id, { estado: 'error', mensaje: 'No se pudo preparar' });
    }
  };

  const agregarArchivos = async (lista: any[]) => {
    const libres = MAX_EN_COLA - fotosRef.current.length;
    if (libres <= 0) { setError(`Ya tenés ${MAX_EN_COLA} fotos en la lista. Subí esas primero.`); return; }
    const archivos = lista.slice(0, libres);
    if (lista.length > libres) setError(`Agregué ${libres}: más de ${MAX_EN_COLA} juntas no entran.`);
    else setError('');

    const nuevas: Foto[] = archivos.map(() => ({
      id: `f${++_seq}`, blob: null, url: null, estado: 'procesando' as EstadoFoto,
      fondoQuitado: false, mensaje: '',
    }));
    setFotos(prev => [...prev, ...nuevas]);
    // De a una: sacar el fondo es pesado y en el celular hacerlo en paralelo lo cuelga.
    for (let i = 0; i < archivos.length; i++) await procesar(nuevas[i].id, archivos[i]);
  };

  const abrirSelector = (camara: boolean) => {
    if (typeof document === 'undefined') return;
    const input = document.createElement('input') as any;
    input.type = 'file';
    input.accept = 'image/*';
    if (camara) input.capture = 'environment';   // abre la cámara de atrás
    else input.multiple = true;                  // de la galería, varias juntas
    input.onchange = () => agregarArchivos(Array.from(input.files || []));
    input.click();
  };

  const quitarFoto = (id: string) => {
    const f = fotosRef.current.find(x => x.id === id);
    if (f?.url) try { URL.revokeObjectURL(f.url); } catch {}
    setFotos(prev => prev.filter(x => x.id !== id));
  };

  const subirTodas = async () => {
    const pendientes = fotosRef.current.filter(f => f.estado === 'lista' && f.blob);
    if (!pendientes.length || subiendo || !elegido) return;
    setSubiendo(true); setError('');
    let subidas = 0;
    for (const f of pendientes) {
      marcar(f.id, { estado: 'subiendo' });
      try {
        const fd = new FormData();
        fd.append('k', llave);
        fd.append('sku', elegido.sku);
        fd.append('archivo', f.blob!, `${elegido.sku}.png`);
        const r = await axios.post(`${API_URL}/carga-fotos/subir`, fd, { timeout: 120000 });
        marcar(f.id, { estado: 'subida', principal: !!r.data?.principal, mensaje: '' });
        setInfoSku(i => ({ fotos: r.data?.fotos ?? ((i?.fotos || 0) + 1), en_odoo: i?.en_odoo !== false, precio: i?.precio }));
        subidas++;
      } catch (e: any) {
        marcar(f.id, { estado: 'error', mensaje: e?.response?.data?.error || 'No se pudo subir' });
      }
    }
    setSubiendo(false);
    if (subidas) sumarAlResumen(elegido, subidas, null);
  };

  const sumarAlResumen = (p: Producto, masFotos: number, nuevoConteo: number | null) => {
    setResumen(prev => {
      const i = prev.findIndex(r => r.sku === p.sku);
      if (i < 0) return [{ sku: p.sku, nombre: p.nombre, fotos: masFotos, conteo: nuevoConteo }, ...prev];
      const copia = [...prev];
      copia[i] = {
        ...copia[i],
        fotos: copia[i].fotos + masFotos,
        conteo: nuevoConteo != null ? nuevoConteo : copia[i].conteo,
      };
      return copia;
    });
  };

  const guardarConteo = async () => {
    if (!elegido || guardandoConteo) return;
    const n = parseFloat(conteo.replace(',', '.'));
    if (!isFinite(n) || n < 0) { setError('Poné un número en el stock contado.'); return; }
    setGuardandoConteo(true); setError('');
    try {
      await axios.post(`${API_URL}/carga-fotos/conteo`, { k: llave, sku: elegido.sku, cantidad: n });
      setConteoGuardado(n);
      sumarAlResumen(elegido, 0, n);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudo guardar el conteo.');
    } finally {
      setGuardandoConteo(false);
    }
  };

  if (Platform.OS !== 'web') return null;

  if (estado === 'cargando') {
    return <View style={s.centro}><ActivityIndicator size="large" color="#1C9BD8" /></View>;
  }

  if (estado === 'invalido') {
    return (
      <View style={s.centro}>
        <View style={s.cartelIcono}><Feather name="alert-triangle" size={28} color="#B45309" /></View>
        <Text style={s.cartelTitulo}>No se puede usar este link</Text>
        <Text style={s.cartelTexto}>{error}</Text>
      </View>
    );
  }

  const listas = fotos.filter(f => f.estado === 'lista').length;
  const procesando = fotos.some(f => f.estado === 'procesando');
  const subidasAcumuladas = resumen.reduce((a, r) => a + r.fotos, 0);

  return (
    <View style={s.pantalla}>
      {/* Barra de arriba: siempre visible, para saber dónde está parado */}
      <View style={s.barra}>
        <View style={s.barraIcono}><Feather name="camera" size={16} color="#FFFFFF" /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.barraTitulo}>CARGA DE REPUESTOS</Text>
          <Text style={s.barraSub}>
            {etiqueta ? `${etiqueta} · ` : ''}
            {subidasAcumuladas ? `${subidasAcumuladas} foto${subidasAcumuladas === 1 ? '' : 's'} subidas` : 'Sal-Bom'}
          </Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.contenido} keyboardShouldPersistTaps="handled">
        {!elegido ? (
          <View style={s.tarjeta}>
            <View style={s.pasoFila}>
              <View style={s.pasoNum}><Text style={s.pasoNumText}>1</Text></View>
              <Text style={s.pasoTitulo}>¿De qué repuesto es?</Text>
            </View>

            <View style={s.buscador}>
              <Feather name="search" size={18} color="#9CA3AF" />
              <TextInput
                style={s.buscadorInput}
                value={busqueda}
                onChangeText={buscar}
                placeholder="Nombre o código"
                placeholderTextColor="#9CA3AF"
                autoCorrect={false}
              />
              {buscando && <ActivityIndicator size="small" color="#1C9BD8" />}
            </View>

            {resultados.map((p) => (
              <Pressable key={p.id || p.sku} style={s.resultado} onPress={() => elegir(p)}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.resultadoSku}>{p.sku}</Text>
                  <Text style={s.resultadoNombre} numberOfLines={2}>{p.nombre}</Text>
                </View>
                <Feather name="chevron-right" size={20} color="#C9CDD2" />
              </Pressable>
            ))}

            {busqueda.trim().length >= 2 && !buscando && !resultados.length && (
              <Text style={s.vacio}>No encontré nada con eso. Probá con el código.</Text>
            )}

            {/* Salida de emergencia: un repuesto recién dado de alta puede tardar
                unos minutos en aparecer en el buscador. */}
            {!modoAMano ? (
              <Pressable onPress={() => setModoAMano(true)} style={s.aManoLink}>
                <Feather name="edit-3" size={14} color="#1C9BD8" />
                <Text style={s.aManoLinkText}>No lo encuentro · escribir el código a mano</Text>
              </Pressable>
            ) : (
              <View style={s.aManoCaja}>
                <Text style={s.campoLabel}>Código del repuesto</Text>
                <TextInput
                  style={s.aManoInput}
                  value={aMano}
                  onChangeText={(t) => setAMano(t.toUpperCase().trim())}
                  placeholder="Ej: RP-CARB-52"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
                <View style={s.aManoBotones}>
                  <Pressable onPress={() => { setModoAMano(false); setAMano(''); }}>
                    <Text style={s.aManoCancelar}>Cancelar</Text>
                  </Pressable>
                  <Pressable
                    style={[s.btnChico, !aMano && s.btnOff]}
                    disabled={!aMano}
                    onPress={() => elegir({ id: 0, sku: aMano, nombre: 'Código escrito a mano' })}>
                    <Text style={s.btnChicoText}>Usar este código</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        ) : (
          <>
            {/* Repuesto elegido */}
            <View style={s.tarjetaElegido}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.elegidoSku}>{elegido.sku}</Text>
                <Text style={s.elegidoNombre} numberOfLines={2}>{elegido.nombre}</Text>
                <View style={s.chips}>
                  {plata(infoSku?.precio ?? elegido.precio) && (
                    <View style={s.chip}>
                      <Text style={s.chipText}>$ {plata(infoSku?.precio ?? elegido.precio)}</Text>
                    </View>
                  )}
                  <View style={s.chip}>
                    <Feather name="image" size={11} color="#4B5563" />
                    <Text style={s.chipText}>
                      {infoSku ? (infoSku.fotos === 0 ? 'Sin fotos' : `${infoSku.fotos} cargada${infoSku.fotos === 1 ? '' : 's'}`) : '…'}
                    </Text>
                  </View>
                </View>
              </View>
              <Pressable onPress={volverABuscar} hitSlop={10} style={s.cambiarBtn}>
                <Feather name="refresh-cw" size={13} color="#1C9BD8" />
                <Text style={s.cambiar}>Cambiar</Text>
              </Pressable>
            </View>

            {!!infoSku && !infoSku.en_odoo && (
              <View style={s.avisoBanner}>
                <Feather name="info" size={16} color="#B45309" />
                <Text style={s.avisoText}>
                  Ese código todavía no está en el sistema. Se guarda igual y aparece cuando lo den de alta.
                </Text>
              </View>
            )}

            {/* Fotos */}
            <View style={s.tarjeta}>
              <View style={s.pasoFila}>
                <View style={s.pasoNum}><Text style={s.pasoNumText}>2</Text></View>
                <Text style={s.pasoTitulo}>Fotos</Text>
                {fotos.length > 0 && <Text style={s.pasoContador}>{fotos.length}</Text>}
              </View>

              {fotos.length > 0 && (
                <View style={s.grilla}>
                  {fotos.map((f) => (
                    <View key={f.id} style={s.celda}>
                      {f.url
                        ? <Image source={{ uri: f.url }} style={s.miniatura} resizeMode="contain" />
                        : <View style={[s.miniatura, s.miniaturaVacia]}><ActivityIndicator size="small" color="#1C9BD8" /></View>}

                      {f.estado === 'subida' && (
                        <View style={[s.sello, { backgroundColor: '#15803D' }]}>
                          <Feather name="check" size={11} color="#FFFFFF" />
                          <Text style={s.selloText}>{f.principal ? 'Principal' : 'Subida'}</Text>
                        </View>
                      )}
                      {f.estado === 'subiendo' && (
                        <View style={[s.sello, { backgroundColor: '#1C9BD8' }]}>
                          <Text style={s.selloText}>Subiendo…</Text>
                        </View>
                      )}
                      {f.estado === 'error' && (
                        <View style={[s.sello, { backgroundColor: '#B91C1C' }]}>
                          <Text style={s.selloText} numberOfLines={1}>{f.mensaje || 'Error'}</Text>
                        </View>
                      )}
                      {f.estado === 'lista' && !!f.mensaje && (
                        <View style={[s.sello, { backgroundColor: '#B45309' }]}>
                          <Text style={s.selloText}>{f.mensaje}</Text>
                        </View>
                      )}
                      {f.estado === 'lista' && !f.mensaje && f.fondoQuitado && (
                        <View style={[s.sello, { backgroundColor: 'rgba(43,43,43,0.75)' }]}>
                          <Feather name="scissors" size={11} color="#FFFFFF" />
                          <Text style={s.selloText}>Recortada</Text>
                        </View>
                      )}

                      {f.estado !== 'subida' && f.estado !== 'subiendo' && (
                        <Pressable style={s.quitar} onPress={() => quitarFoto(f.id)} hitSlop={6}>
                          <Feather name="x" size={13} color="#FFFFFF" />
                        </Pressable>
                      )}
                    </View>
                  ))}
                </View>
              )}

              {procesando && (
                <View style={s.procesando}>
                  <ActivityIndicator size="small" color="#1C9BD8" />
                  <Text style={s.procesandoText}>
                    Preparando las fotos{sinFondo ? ' y sacando el fondo' : ''}… puede tardar un rato
                  </Text>
                </View>
              )}

              <View style={s.botonera}>
                <Pressable style={s.btnSecundario} onPress={() => abrirSelector(true)} disabled={subiendo}>
                  <Feather name="camera" size={18} color="#1C9BD8" />
                  <Text style={s.btnSecundarioText}>Sacar foto</Text>
                </Pressable>
                <Pressable style={s.btnSecundario} onPress={() => abrirSelector(false)} disabled={subiendo}>
                  <Feather name="image" size={18} color="#1C9BD8" />
                  <Text style={s.btnSecundarioText}>Elegir fotos</Text>
                </Pressable>
              </View>

              <Pressable style={s.check} onPress={() => setSinFondo(v => !v)} disabled={subiendo}>
                <Feather name={sinFondo ? 'check-square' : 'square'} size={20} color="#1C9BD8" />
                <View style={{ flex: 1 }}>
                  <Text style={s.checkText}>Sacarle el fondo automáticamente</Text>
                  <Text style={s.checkAyuda}>Tarda unos segundos por foto. Si el fondo ya es blanco, destildalo.</Text>
                </View>
              </Pressable>

              {listas > 0 && (
                <Pressable style={[s.btnPrincipal, subiendo && s.btnOff]} onPress={subirTodas} disabled={subiendo}>
                  {subiendo
                    ? <ActivityIndicator size="small" color="#FFFFFF" />
                    : <Feather name="upload" size={19} color="#FFFFFF" />}
                  <Text style={s.btnPrincipalText}>
                    {subiendo ? 'Subiendo…' : `Subir ${listas} foto${listas === 1 ? '' : 's'}`}
                  </Text>
                </Pressable>
              )}
            </View>

            {/* Stock contado */}
            <View style={s.tarjeta}>
              <View style={s.pasoFila}>
                <View style={s.pasoNum}><Text style={s.pasoNumText}>3</Text></View>
                <Text style={s.pasoTitulo}>Stock contado</Text>
                <Text style={s.opcional}>opcional</Text>
              </View>
              <Text style={s.stockAyuda}>
                ¿Cuántas unidades contaste? Queda anotado para que lo revise Sal-Bom. No cambia el stock del sistema.
              </Text>
              <View style={s.stockFila}>
                <TextInput
                  style={s.stockInput}
                  value={conteo}
                  onChangeText={(t) => { setConteo(t); setConteoGuardado(null); }}
                  placeholder="0"
                  placeholderTextColor="#C9CDD2"
                  keyboardType="numeric"
                  inputMode="decimal"
                />
                <Pressable
                  style={[s.btnChico, (!conteo || guardandoConteo) && s.btnOff]}
                  onPress={guardarConteo}
                  disabled={!conteo || guardandoConteo}>
                  {guardandoConteo
                    ? <ActivityIndicator size="small" color="#FFFFFF" />
                    : <Text style={s.btnChicoText}>Anotar</Text>}
                </Pressable>
              </View>
              {conteoGuardado != null && (
                <View style={s.okFila}>
                  <Feather name="check-circle" size={15} color="#15803D" />
                  <Text style={s.okText}>Anotado: {conteoGuardado} unidades</Text>
                </View>
              )}
            </View>

            <Pressable style={s.siguiente} onPress={volverABuscar} disabled={subiendo}>
              <Feather name="arrow-right-circle" size={18} color="#1C9BD8" />
              <Text style={s.siguienteText}>Pasar al siguiente repuesto</Text>
            </Pressable>
          </>
        )}

        {!!error && (
          <View style={s.errBanner}>
            <Feather name="alert-triangle" size={16} color="#B91C1C" />
            <Text style={s.errText}>{error}</Text>
          </View>
        )}

        {/* Lo que lleva hecho, para que no pierda la cuenta */}
        {resumen.length > 0 && (
          <View style={s.tarjeta}>
            <View style={s.pasoFila}>
              <Feather name="list" size={16} color="#8A8A8A" />
              <Text style={s.pasoTitulo}>Lo que llevás cargado</Text>
              <Text style={s.pasoContador}>{resumen.length}</Text>
            </View>
            {resumen.map((r) => (
              <View key={r.sku} style={s.resumenFila}>
                <Feather name="check-circle" size={16} color="#15803D" />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.resumenSku}>{r.sku}</Text>
                  <Text style={s.resumenNombre} numberOfLines={1}>{r.nombre}</Text>
                </View>
                <Text style={s.resumenDato}>
                  {r.fotos ? `${r.fotos} foto${r.fotos === 1 ? '' : 's'}` : 'sin fotos'}
                  {r.conteo != null ? ` · ${r.conteo} u.` : ''}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: '#F4F6F8' },
  // Pensado para un celular en la mano: columna angosta y centrada.
  contenido: { padding: 14, paddingBottom: 60, maxWidth: 560, width: '100%', alignSelf: 'center' },

  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32, backgroundColor: '#F4F6F8' },
  cartelIcono: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' },
  cartelTitulo: { fontFamily: 'BarlowCondensed-Bold', fontSize: 22, color: '#2B2B2B', textAlign: 'center' },
  cartelTexto: { fontFamily: 'Rubik', fontSize: 14, color: '#6B7280', textAlign: 'center', maxWidth: 300, lineHeight: 20 },

  barra: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#2B2B2B', paddingHorizontal: 18, paddingTop: 16, paddingBottom: 14 },
  barraIcono: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#1C9BD8', alignItems: 'center', justifyContent: 'center' },
  barraTitulo: { fontFamily: 'BarlowCondensed-Bold', fontSize: 17, color: '#FFFFFF', letterSpacing: 0.5 },
  barraSub: { fontFamily: 'Rubik', fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 1 },

  tarjeta: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#ECEFF2' },
  pasoFila: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  pasoNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#EAF6FC', alignItems: 'center', justifyContent: 'center' },
  pasoNumText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 14, color: '#1C9BD8' },
  pasoTitulo: { flex: 1, fontFamily: 'BarlowCondensed-Bold', fontSize: 18, color: '#2B2B2B' },
  pasoContador: { fontFamily: 'Rubik', fontSize: 12, color: '#9CA3AF' },
  opcional: { fontFamily: 'Rubik', fontSize: 11, color: '#9CA3AF', fontStyle: 'italic' },

  buscador: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 52, paddingHorizontal: 14, borderWidth: 1, borderColor: '#DCE1E6', borderRadius: 12, backgroundColor: '#FBFCFD' },
  buscadorInput: { flex: 1, fontFamily: 'Rubik', fontSize: 16, color: '#2B2B2B', outlineStyle: 'none' } as any,
  resultado: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  resultadoSku: { fontFamily: 'BarlowCondensed-Bold', fontSize: 16, color: '#1C9BD8' },
  resultadoNombre: { fontFamily: 'Rubik', fontSize: 13, color: '#2B2B2B', marginTop: 2 },
  vacio: { fontFamily: 'Rubik', fontSize: 13, color: '#9CA3AF', marginTop: 16, textAlign: 'center' },

  aManoLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  aManoLinkText: { fontFamily: 'Rubik', fontSize: 13, color: '#1C9BD8', textDecorationLine: 'underline' },
  aManoCaja: { backgroundColor: '#F7F9FA', borderRadius: 12, padding: 14, marginTop: 12, gap: 6 },
  campoLabel: { fontFamily: 'Rubik', fontSize: 11, color: '#6B7280' },
  aManoInput: { height: 48, borderWidth: 1, borderColor: '#DCE1E6', borderRadius: 10, paddingHorizontal: 12, fontFamily: 'BarlowCondensed-Bold', fontSize: 18, color: '#2B2B2B', backgroundColor: '#FFFFFF' },
  aManoBotones: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 16, marginTop: 6 },
  aManoCancelar: { fontFamily: 'Rubik', fontSize: 13, color: '#6B7280' },

  tarjetaElegido: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: '#1C9BD8', borderWidth: 1, borderColor: '#ECEFF2' },
  elegidoSku: { fontFamily: 'BarlowCondensed-Bold', fontSize: 20, color: '#1C9BD8', letterSpacing: 0.3 },
  elegidoNombre: { fontFamily: 'Rubik', fontSize: 13, color: '#2B2B2B', marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#F1F4F6', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontFamily: 'Rubik', fontSize: 11, color: '#4B5563' },
  cambiarBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cambiar: { fontFamily: 'Rubik', fontSize: 12, color: '#1C9BD8' },

  grilla: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  celda: { width: 96, height: 96, borderRadius: 12, overflow: 'hidden', backgroundColor: '#F7F9FA', borderWidth: 1, borderColor: '#ECEFF2' },
  miniatura: { width: '100%', height: '100%' },
  miniaturaVacia: { alignItems: 'center', justifyContent: 'center' },
  sello: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 3 },
  selloText: { fontFamily: 'Rubik', fontSize: 9, color: '#FFFFFF' },
  quitar: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(43,43,43,0.7)', alignItems: 'center', justifyContent: 'center' },

  procesando: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#EAF6FC', borderRadius: 10, padding: 10, marginBottom: 12 },
  procesandoText: { flex: 1, fontFamily: 'Rubik', fontSize: 12, color: '#1E3A4C' },

  botonera: { flexDirection: 'row', gap: 10 },
  btnSecundario: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 12, borderWidth: 1.5, borderColor: '#1C9BD8', backgroundColor: '#FFFFFF' },
  btnSecundarioText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 15, color: '#1C9BD8' },

  check: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 14 },
  checkText: { fontFamily: 'Rubik', fontSize: 14, color: '#2B2B2B' },
  checkAyuda: { fontFamily: 'Rubik', fontSize: 11, color: '#9CA3AF', marginTop: 2, lineHeight: 15 },

  btnPrincipal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 56, borderRadius: 14, backgroundColor: '#1C9BD8' },
  btnPrincipalText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 18, color: '#FFFFFF', letterSpacing: 0.3 },
  btnOff: { opacity: 0.55 },
  btnChico: { height: 48, paddingHorizontal: 22, borderRadius: 12, backgroundColor: '#1C9BD8', alignItems: 'center', justifyContent: 'center' },
  btnChicoText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 15, color: '#FFFFFF' },

  stockAyuda: { fontFamily: 'Rubik', fontSize: 12, color: '#6B7280', lineHeight: 17, marginBottom: 12 },
  stockFila: { flexDirection: 'row', gap: 10 },
  stockInput: { flex: 1, height: 48, borderWidth: 1, borderColor: '#DCE1E6', borderRadius: 12, paddingHorizontal: 14, fontFamily: 'BarlowCondensed-Bold', fontSize: 20, color: '#2B2B2B', backgroundColor: '#FBFCFD' },
  okFila: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  okText: { fontFamily: 'Rubik', fontSize: 13, color: '#15803D' },

  siguiente: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  siguienteText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 15, color: '#1C9BD8' },

  avisoBanner: { flexDirection: 'row', gap: 8, backgroundColor: '#FEF3C7', borderRadius: 12, padding: 12, marginBottom: 12 },
  avisoText: { flex: 1, fontFamily: 'Rubik', fontSize: 12, color: '#92400E', lineHeight: 17 },
  errBanner: { flexDirection: 'row', gap: 8, backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5', borderRadius: 12, padding: 12, marginBottom: 12 },
  errText: { flex: 1, fontFamily: 'Rubik', fontSize: 12, color: '#B91C1C', lineHeight: 17 },

  resumenFila: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  resumenSku: { fontFamily: 'BarlowCondensed-Bold', fontSize: 15, color: '#2B2B2B' },
  resumenNombre: { fontFamily: 'Rubik', fontSize: 11, color: '#9CA3AF' },
  resumenDato: { fontFamily: 'Rubik', fontSize: 11, color: '#6B7280' },
});
