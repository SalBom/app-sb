// src/screens/CargaFotos.tsx
// Página pública para que quien saca las fotos las suba desde el celular, sin
// usuario ni app: abre el link que le mandaron (/carga-fotos?k=LLAVE), busca el
// repuesto, saca la foto y se sube sola.
//
// Todo el trabajo pesado pasa ACÁ, en el teléfono de esa persona:
//   - se achica la foto antes de mandarla (una foto de celular son 8-12 MB y
//     con señal mala eso no sube nunca);
//   - se le saca el fondo con @imgly/background-removal, que corre en el propio
//     navegador: sin API, sin costo por foto (es el mismo que usa el Home).
// El backend solo la pasa a .webp y la guarda en Firebase con el nombre del SKU.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, ScrollView,
  ActivityIndicator, Image, Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import axios from 'axios';
import { API_URL } from '../config';
import { removeBackground } from '../utils/removeBg';

const LADO_MAX = 2000;   // igual que el tope del backend: más grande no sirve de nada

type Producto = { id: number; sku: string; nombre: string };
type Subida = { sku: string; nombre: string; principal: boolean; cuando: number };

const leerLlave = () => {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('k') || '';
};

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

export default function CargaFotos() {
  const [llave] = useState(leerLlave);
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'invalido'>('cargando');
  const [etiqueta, setEtiqueta] = useState('');
  const [error, setError] = useState('');

  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<Producto[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [elegido, setElegido] = useState<Producto | null>(null);
  const [infoSku, setInfoSku] = useState<{ fotos: number; en_odoo: boolean } | null>(null);
  const [aMano, setAMano] = useState('');          // código escrito a mano
  const [modoAMano, setModoAMano] = useState(false);

  const [sinFondo, setSinFondo] = useState(true);
  const [preparando, setPreparando] = useState('');
  const [foto, setFoto] = useState<{ blob: Blob; url: string; fondoQuitado: boolean } | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [hechas, setHechas] = useState<Subida[]>([]);

  const debounce = useRef<any>(null);
  const fotoRef = useRef<typeof foto>(null);
  fotoRef.current = foto;

  useEffect(() => {
    if (!llave) { setEstado('invalido'); setError('El link está incompleto. Pedí uno nuevo.'); return; }
    axios.get(`${API_URL}/carga-fotos/estado`, { params: { k: llave } })
      .then((r) => { setEstado('ok'); setEtiqueta(r.data?.etiqueta || ''); })
      .catch((e) => {
        setEstado('invalido');
        setError(e?.response?.data?.error || 'No se pudo abrir el link. Probá de nuevo.');
      });
  }, [llave]);

  // Al salir, soltamos la vista previa.
  useEffect(() => () => { if (fotoRef.current) try { URL.revokeObjectURL(fotoRef.current.url); } catch {} }, []);

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

  const elegir = async (p: Producto) => {
    setElegido(p); setResultados([]); setBusqueda(''); setInfoSku(null); setError('');
    setModoAMano(false); setAMano('');
    try {
      const r = await axios.get(`${API_URL}/carga-fotos/producto`, { params: { k: llave, sku: p.sku } });
      setInfoSku({ fotos: r.data?.fotos || 0, en_odoo: r.data?.en_odoo !== false });
    } catch { /* si falla, el backend igual resuelve el lugar al subir */ }
  };

  const limpiarFoto = () => {
    if (foto) try { URL.revokeObjectURL(foto.url); } catch {}
    setFoto(null);
  };

  const tomarFoto = () => {
    if (typeof document === 'undefined') return;
    const input = document.createElement('input') as any;
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';   // en el celular abre la cámara de atrás
    input.onchange = async () => {
      const file = (input.files || [])[0];
      if (!file) return;
      limpiarFoto(); setError('');
      try {
        setPreparando('Preparando la foto…');
        const chica = await achicar(file);
        let blob = chica;
        let fondoQuitado = false;

        if (sinFondo) {
          setPreparando('Sacando el fondo… (la primera vez tarda un poco)');
          const entrada = URL.createObjectURL(chica);
          const salida = await removeBackground(entrada);
          // removeBackground devuelve la MISMA url si no pudo: así sabemos si salió.
          if (salida !== entrada) {
            blob = await (await fetch(salida)).blob();
            fondoQuitado = true;
            try { URL.revokeObjectURL(salida); } catch {}
          }
          try { URL.revokeObjectURL(entrada); } catch {}
          if (!fondoQuitado) setError('No se pudo sacar el fondo. Se sube la foto como está.');
        }
        setFoto({ blob, url: URL.createObjectURL(blob), fondoQuitado });
      } catch {
        setError('No se pudo preparar la foto. Probá sacarla de nuevo.');
      } finally {
        setPreparando('');
      }
    };
    input.click();
  };

  const subir = async () => {
    if (!foto || !elegido || subiendo) return;
    setSubiendo(true); setError('');
    try {
      const fd = new FormData();
      fd.append('k', llave);
      fd.append('sku', elegido.sku);
      fd.append('archivo', foto.blob, `${elegido.sku}.png`);
      const r = await axios.post(`${API_URL}/carga-fotos/subir`, fd, { timeout: 120000 });
      setHechas((prev) => [{
        sku: elegido.sku, nombre: elegido.nombre,
        principal: !!r.data?.principal, cuando: Date.now(),
      }, ...prev]);
      setInfoSku((i) => ({ fotos: r.data?.fotos ?? ((i?.fotos || 0) + 1), en_odoo: i?.en_odoo !== false }));
      limpiarFoto();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudo subir. Fijate la señal y probá de nuevo.');
    } finally {
      setSubiendo(false);
    }
  };

  if (Platform.OS !== 'web') return null;

  if (estado === 'cargando') {
    return (
      <View style={s.centro}>
        <ActivityIndicator size="large" color="#1C9BD8" />
      </View>
    );
  }

  if (estado === 'invalido') {
    return (
      <View style={s.centro}>
        <Feather name="alert-triangle" size={34} color="#B45309" />
        <Text style={s.cartelTitulo}>No se puede usar este link</Text>
        <Text style={s.cartelTexto}>{error}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={s.pantalla} contentContainerStyle={s.contenido} keyboardShouldPersistTaps="handled">
      <Text style={s.titulo}>FOTOS DE REPUESTOS</Text>
      <Text style={s.bajada}>
        {etiqueta ? `Hola ${etiqueta}. ` : ''}Buscá el repuesto, sacale la foto y se sube sola.
      </Text>

      {/* 1. Qué repuesto */}
      {!elegido ? (
        <>
          <Text style={s.paso}>1. ¿DE QUÉ REPUESTO ES?</Text>
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
            <Pressable key={p.id} style={s.resultado} onPress={() => elegir(p)}>
              <View style={{ flex: 1 }}>
                <Text style={s.resultadoSku}>{p.sku}</Text>
                <Text style={s.resultadoNombre} numberOfLines={2}>{p.nombre}</Text>
              </View>
              <Feather name="chevron-right" size={20} color="#B5B5B5" />
            </Pressable>
          ))}
          {busqueda.trim().length >= 2 && !buscando && !resultados.length && (
            <Text style={s.vacio}>No encontré nada con eso. Probá con el código.</Text>
          )}

          {/* Salida de emergencia: un repuesto recién dado de alta puede tardar
              unos minutos en aparecer en el buscador. Con el código a mano se
              puede sacar la foto igual; se guarda y aparece cuando el sistema
              se ponga al día. */}
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
                  style={[s.aManoUsar, !aMano && s.aManoUsarOff]}
                  disabled={!aMano}
                  onPress={() => elegir({ id: 0, sku: aMano, nombre: 'Código escrito a mano' })}>
                  <Text style={s.aManoUsarText}>Usar este código</Text>
                </Pressable>
              </View>
            </View>
          )}
        </>
      ) : (
        <>
          <View style={s.elegido}>
            <View style={{ flex: 1 }}>
              <Text style={s.elegidoSku}>{elegido.sku}</Text>
              <Text style={s.elegidoNombre} numberOfLines={2}>{elegido.nombre}</Text>
              {!!infoSku && (
                <Text style={s.elegidoInfo}>
                  {infoSku.fotos === 0 ? 'Todavía no tiene fotos'
                    : `Ya tiene ${infoSku.fotos} foto${infoSku.fotos === 1 ? '' : 's'}`}
                </Text>
              )}
            </View>
            <Pressable onPress={() => { setElegido(null); limpiarFoto(); setInfoSku(null); setError(''); }} hitSlop={10}>
              <Text style={s.cambiar}>Cambiar</Text>
            </Pressable>
          </View>

          {/* 2. La foto */}
          <Text style={s.paso}>2. SACÁ LA FOTO</Text>

          <Pressable style={s.check} onPress={() => setSinFondo((v) => !v)}>
            <Feather name={sinFondo ? 'check-square' : 'square'} size={20} color="#1C9BD8" />
            <Text style={s.checkText}>Sacarle el fondo automáticamente</Text>
          </Pressable>

          {!foto ? (
            <Pressable style={[s.botonGrande, !!preparando && s.botonGrandeOff]} onPress={tomarFoto} disabled={!!preparando}>
              {preparando
                ? <ActivityIndicator size="small" color="#FFFFFF" />
                : <Feather name="camera" size={22} color="#FFFFFF" />}
              <Text style={s.botonGrandeText}>{preparando || 'Sacar la foto'}</Text>
            </Pressable>
          ) : (
            <>
              <View style={s.previewMarco}>
                <Image source={{ uri: foto.url }} style={s.preview} resizeMode="contain" />
              </View>
              <Text style={s.previewPie}>
                {foto.fondoQuitado ? 'Fondo quitado · así se va a ver en la web' : 'Se sube tal cual está'}
              </Text>
              <Pressable style={[s.botonGrande, subiendo && s.botonGrandeOff]} onPress={subir} disabled={subiendo}>
                {subiendo
                  ? <ActivityIndicator size="small" color="#FFFFFF" />
                  : <Feather name="upload" size={22} color="#FFFFFF" />}
                <Text style={s.botonGrandeText}>{subiendo ? 'Subiendo…' : 'Subir esta foto'}</Text>
              </Pressable>
              <Pressable style={s.botonLiviano} onPress={tomarFoto} disabled={subiendo}>
                <Text style={s.botonLivianoText}>Sacar otra</Text>
              </Pressable>
            </>
          )}

          {!!infoSku && !infoSku.en_odoo && (
            <View style={s.avisoBanner}>
              <Feather name="info" size={16} color="#B45309" />
              <Text style={s.avisoText}>
                Ese código todavía no está en el sistema. La foto se guarda igual y aparece
                cuando lo den de alta.
              </Text>
            </View>
          )}
        </>
      )}

      {!!error && (
        <View style={s.errBanner}>
          <Feather name="alert-triangle" size={16} color="#B91C1C" />
          <Text style={s.errText}>{error}</Text>
        </View>
      )}

      {/* Lo que ya subió, para que no pierda la cuenta */}
      {hechas.length > 0 && (
        <>
          <Text style={s.paso}>SUBIDAS ({hechas.length})</Text>
          {hechas.map((h) => (
            <View key={`${h.sku}-${h.cuando}`} style={s.subida}>
              <Feather name="check-circle" size={18} color="#15803D" />
              <View style={{ flex: 1 }}>
                <Text style={s.subidaSku}>{h.sku}</Text>
                <Text style={s.subidaNombre} numberOfLines={1}>{h.nombre}</Text>
              </View>
              <Text style={s.subidaTipo}>{h.principal ? 'Principal' : 'Extra'}</Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: '#FFFFFF' },
  // Pensado para un celular en la mano: columna angosta y centrada.
  contenido: { padding: 20, paddingBottom: 60, maxWidth: 520, width: '100%', alignSelf: 'center' },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32, backgroundColor: '#FFFFFF' },
  cartelTitulo: { fontFamily: 'BarlowCondensed-Bold', fontSize: 22, color: '#2B2B2B', textAlign: 'center' },
  cartelTexto: { fontFamily: 'Rubik', fontSize: 14, color: '#6B7280', textAlign: 'center' },

  titulo: { fontFamily: 'BarlowCondensed-Bold', fontSize: 30, color: '#2B2B2B', letterSpacing: 0.5 },
  bajada: { fontFamily: 'Rubik', fontSize: 14, color: '#6B7280', marginTop: 4, marginBottom: 22, lineHeight: 20 },
  paso: { fontFamily: 'BarlowCondensed-Bold', fontSize: 13, color: '#8A8A8A', letterSpacing: 0.8, marginTop: 22, marginBottom: 10 },

  buscador: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 52, paddingHorizontal: 14, borderWidth: 1, borderColor: '#D3D6DB', borderRadius: 12, backgroundColor: '#FFFFFF' },
  buscadorInput: { flex: 1, fontFamily: 'Rubik', fontSize: 16, color: '#2B2B2B', outlineStyle: 'none' } as any,
  resultado: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  resultadoSku: { fontFamily: 'BarlowCondensed-Bold', fontSize: 16, color: '#1C9BD8' },
  resultadoNombre: { fontFamily: 'Rubik', fontSize: 14, color: '#2B2B2B', marginTop: 2 },
  vacio: { fontFamily: 'Rubik', fontSize: 13, color: '#9CA3AF', marginTop: 14, textAlign: 'center' },

  aManoLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 18 },
  aManoLinkText: { fontFamily: 'Rubik', fontSize: 13, color: '#1C9BD8', textDecorationLine: 'underline' },
  aManoCaja: { backgroundColor: '#F9FAFB', borderRadius: 12, padding: 14, marginTop: 16, gap: 6 },
  campoLabel: { fontFamily: 'Rubik', fontSize: 11, color: '#6B7280' },
  aManoInput: { height: 48, borderWidth: 1, borderColor: '#D3D6DB', borderRadius: 10, paddingHorizontal: 12, fontFamily: 'BarlowCondensed-Bold', fontSize: 18, color: '#2B2B2B', backgroundColor: '#FFFFFF' },
  aManoBotones: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 16, marginTop: 6 },
  aManoCancelar: { fontFamily: 'Rubik', fontSize: 13, color: '#6B7280' },
  aManoUsar: { height: 42, paddingHorizontal: 18, borderRadius: 999, backgroundColor: '#1C9BD8', alignItems: 'center', justifyContent: 'center' },
  aManoUsarOff: { backgroundColor: '#A7D8F0' },
  aManoUsarText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 15, color: '#FFFFFF' },

  elegido: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: '#EAF6FC', borderRadius: 12, padding: 14, marginTop: 6 },
  elegidoSku: { fontFamily: 'BarlowCondensed-Bold', fontSize: 18, color: '#1C9BD8' },
  elegidoNombre: { fontFamily: 'Rubik', fontSize: 14, color: '#2B2B2B', marginTop: 2 },
  elegidoInfo: { fontFamily: 'Rubik', fontSize: 12, color: '#6B7280', marginTop: 6 },
  cambiar: { fontFamily: 'Rubik', fontSize: 13, color: '#1C9BD8', textDecorationLine: 'underline' },

  check: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, marginBottom: 8 },
  checkText: { fontFamily: 'Rubik', fontSize: 15, color: '#2B2B2B' },

  botonGrande: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 58, borderRadius: 14, backgroundColor: '#1C9BD8', marginTop: 6 },
  botonGrandeOff: { backgroundColor: '#A7D8F0' },
  botonGrandeText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 18, color: '#FFFFFF', letterSpacing: 0.3 },
  botonLiviano: { height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  botonLivianoText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 15, color: '#1C9BD8' },

  // Cuadros para que se note la transparencia de la foto recortada.
  previewMarco: { height: 300, borderRadius: 14, borderWidth: 1, borderColor: '#ECECEC', backgroundColor: '#F9FAFB', overflow: 'hidden', marginTop: 6 },
  preview: { width: '100%', height: '100%' },
  previewPie: { fontFamily: 'Rubik', fontSize: 12, color: '#6B7280', textAlign: 'center', marginTop: 8 },

  avisoBanner: { flexDirection: 'row', gap: 8, backgroundColor: '#FEF3C7', borderRadius: 10, padding: 12, marginTop: 14 },
  avisoText: { flex: 1, fontFamily: 'Rubik', fontSize: 13, color: '#92400E', lineHeight: 18 },
  errBanner: { flexDirection: 'row', gap: 8, backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5', borderRadius: 10, padding: 12, marginTop: 14 },
  errText: { flex: 1, fontFamily: 'Rubik', fontSize: 13, color: '#B91C1C', lineHeight: 18 },

  subida: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  subidaSku: { fontFamily: 'BarlowCondensed-Bold', fontSize: 15, color: '#2B2B2B' },
  subidaNombre: { fontFamily: 'Rubik', fontSize: 12, color: '#6B7280' },
  subidaTipo: { fontFamily: 'Rubik', fontSize: 11, color: '#9CA3AF' },
});
