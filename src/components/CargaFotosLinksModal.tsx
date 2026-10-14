// src/components/CargaFotosLinksModal.tsx
// Links para que alguien de afuera suba fotos de productos desde el celular
// (solo ADMIN, solo web). Se genera un link con una llave adentro, se le manda
// por WhatsApp a quien saca las fotos y listo: no necesita usuario ni app.
//
// La llave es un secreto: cualquiera que tenga el link puede subir fotos. Por
// eso vence sola y se puede dar de baja desde acá en cualquier momento.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ActivityIndicator, TextInput, ScrollView, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import axios from 'axios';
import { API_URL } from '../config';
import { getCuitFromStorage } from '../utils/authStorage';
import useIsDesktopWeb from '../hooks/useIsDesktopWeb';

type Link = {
  token: string;
  etiqueta: string;
  creado: string | null;
  vence: string | null;
  activo: boolean;
  vencido: boolean;
  subidas: number;
  ultima: string | null;
};

type Conteo = {
  id: number;
  sku: string;
  nombre: string;
  precio: number | null;
  contado: number;
  sistema: number | null;
  quien: string;
  cuando: string | null;
  en_odoo: boolean;
};

const fecha = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

const cuando = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${fecha(iso)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const num = (n: number | null | undefined) =>
  n == null ? '—' : Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 });

const urlDe = (token: string) =>
  typeof window === 'undefined' ? '' : `${window.location.origin}/carga-fotos?k=${token}`;

const CargaFotosLinksModal = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
  const isDesktopWeb = useIsDesktopWeb();
  const [links, setLinks] = useState<Link[]>([]);
  const [cargando, setCargando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [etiqueta, setEtiqueta] = useState('');
  const [dias, setDias] = useState('30');
  const [error, setError] = useState('');
  const [copiado, setCopiado] = useState('');
  const [solapa, setSolapa] = useState<'links' | 'conteos'>('links');
  const [conteos, setConteos] = useState<Conteo[]>([]);
  const [cargandoConteos, setCargandoConteos] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try {
      const cuit = await getCuitFromStorage();
      const r = await axios.get(`${API_URL}/admin/carga-fotos/links`, { params: { cuit } });
      setLinks(r.data?.items || []);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudieron cargar los links.');
    } finally {
      setCargando(false);
    }
  }, []);

  const cargarConteos = useCallback(async () => {
    setCargandoConteos(true); setError('');
    try {
      const cuit = await getCuitFromStorage();
      const r = await axios.get(`${API_URL}/admin/carga-fotos/conteos`, { params: { cuit } });
      setConteos(r.data?.items || []);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudieron cargar los conteos.');
    } finally {
      setCargandoConteos(false);
    }
  }, []);

  useEffect(() => { if (visible) cargar(); }, [visible, cargar]);
  useEffect(() => { if (visible && solapa === 'conteos') cargarConteos(); }, [visible, solapa, cargarConteos]);

  const crear = async () => {
    if (creando) return;
    setCreando(true); setError('');
    try {
      const cuit = await getCuitFromStorage();
      const r = await axios.post(`${API_URL}/admin/carga-fotos/links`, {
        cuit, etiqueta: etiqueta.trim(), dias: parseInt(dias, 10) || 30,
      });
      setEtiqueta('');
      await cargar();
      if (r.data?.token) copiar(r.data.token);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudo crear el link.');
    } finally {
      setCreando(false);
    }
  };

  const copiar = async (token: string) => {
    const url = urlDe(token);
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(token);
      setTimeout(() => setCopiado((t) => (t === token ? '' : t)), 2500);
    } catch {
      // Navegador sin permiso para el portapapeles: que lo copie a mano.
      if (typeof window !== 'undefined') window.prompt('Copiá el link:', url);
    }
  };

  const darDeBaja = async (link: Link) => {
    if (typeof window !== 'undefined'
      && !window.confirm(`Dar de baja el link de "${link.etiqueta || 'sin nombre'}"? Deja de funcionar al toque.`)) return;
    try {
      const cuit = await getCuitFromStorage();
      await axios.delete(`${API_URL}/admin/carga-fotos/links/${link.token}`, { params: { cuit } });
      cargar();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudo dar de baja.');
    }
  };

  if (Platform.OS !== 'web') return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={[s.wrap, isDesktopWeb ? s.wrapDesktop : null]} pointerEvents="box-none">
        <View style={[s.card, isDesktopWeb ? s.cardDesktop : s.cardMobile]}>
          <View style={s.header}>
            <Feather name="camera" size={18} color="#1C9BD8" />
            <Text style={s.title} numberOfLines={1}>Carga de fotos y stock</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Feather name="x" size={20} color="#6B7280" />
            </Pressable>
          </View>

          <View style={s.solapas}>
            {([['links', 'Links'], ['conteos', 'Stock contado']] as const).map(([clave, texto]) => (
              <Pressable key={clave} onPress={() => setSolapa(clave)}
                style={[s.solapa, solapa === clave && s.solapaActiva]}>
                <Text style={[s.solapaText, solapa === clave && s.solapaTextActiva]}>{texto}</Text>
              </Pressable>
            ))}
          </View>

          <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 10 }} keyboardShouldPersistTaps="handled">
            {solapa === 'conteos' ? (
              <>
                <View style={s.ayuda}>
                  <Feather name="info" size={13} color="#1C9BD8" />
                  <Text style={s.ayudaText}>
                    Lo que fue contando quien saca las fotos, de lo más nuevo a lo más viejo.
                    Es solo una anotación: el stock de Odoo no se toca desde ahí. Al lado está
                    lo que dice el sistema para que puedas comparar.
                  </Text>
                </View>

                <View style={s.listaHeader}>
                  <Text style={s.paso}>CONTEOS ({conteos.length})</Text>
                  {cargandoConteos && <ActivityIndicator size="small" color="#1C9BD8" />}
                  <View style={{ flex: 1 }} />
                  <Pressable onPress={cargarConteos}>
                    <Text style={s.recargar}>Actualizar</Text>
                  </Pressable>
                </View>

                {!conteos.length && !cargandoConteos && (
                  <Text style={s.vacio}>Todavía nadie anotó un conteo.</Text>
                )}

                {conteos.map((c) => {
                  const dif = c.sistema == null ? null : c.contado - c.sistema;
                  return (
                    <View key={c.id} style={s.fila}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.filaNombre}>{c.sku}</Text>
                        <Text style={s.filaDetalle} numberOfLines={1}>
                          {c.nombre || (c.en_odoo ? '' : 'No está en Odoo')}
                        </Text>
                        <Text style={s.filaDetalle}>
                          {c.quien ? `${c.quien} · ` : ''}{cuando(c.cuando)}
                        </Text>
                      </View>
                      <View style={s.celdaNum}>
                        <Text style={s.celdaLabel}>Contó</Text>
                        <Text style={s.celdaValor}>{num(c.contado)}</Text>
                      </View>
                      <View style={s.celdaNum}>
                        <Text style={s.celdaLabel}>Sistema</Text>
                        <Text style={s.celdaValorGris}>{num(c.sistema)}</Text>
                      </View>
                      <View style={s.celdaNum}>
                        <Text style={s.celdaLabel}>Dif.</Text>
                        <Text style={[s.celdaValor, dif == null ? s.celdaValorGris : dif === 0 ? s.difCero : dif > 0 ? s.difMas : s.difMenos]}>
                          {dif == null ? '—' : dif > 0 ? `+${num(dif)}` : num(dif)}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </>
            ) : (
              <>
            <View style={s.ayuda}>
              <Feather name="info" size={13} color="#1C9BD8" />
              <Text style={s.ayudaText}>
                Generá un link y mandáselo por WhatsApp a quien saca las fotos. Lo abre en el
                celular, busca el repuesto y saca la foto: llega sola a Firebase, con el fondo
                quitado y con el nombre del código. No necesita usuario.
              </Text>
            </View>

            <Text style={s.paso}>NUEVO LINK</Text>
            <View style={s.formRow}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={s.campoLabel}>¿Para quién es?</Text>
                <TextInput
                  style={s.input}
                  value={etiqueta}
                  onChangeText={setEtiqueta}
                  placeholder="Ej: Juan (depósito)"
                  placeholderTextColor="#9CA3AF"
                />
              </View>
              <View style={{ gap: 4 }}>
                <Text style={s.campoLabel}>Días</Text>
                <TextInput style={s.inputChico} value={dias} onChangeText={setDias} keyboardType="numeric" />
              </View>
              <Pressable style={[s.crearBtn, creando && s.crearBtnOff]} onPress={crear} disabled={creando}>
                {creando
                  ? <ActivityIndicator size="small" color="#FFFFFF" />
                  : <Text style={s.crearBtnText}>Crear y copiar</Text>}
              </Pressable>
            </View>

            {!!error && (
              <View style={s.errBanner}>
                <Feather name="alert-triangle" size={14} color="#B91C1C" />
                <Text style={s.errText}>{error}</Text>
              </View>
            )}

            <View style={s.listaHeader}>
              <Text style={s.paso}>LINKS ({links.length})</Text>
              {cargando && <ActivityIndicator size="small" color="#1C9BD8" />}
            </View>

            {!links.length && !cargando && (
              <Text style={s.vacio}>Todavía no hay links. Creá uno arriba.</Text>
            )}

            {links.map((l) => {
              const muerto = !l.activo || l.vencido;
              return (
                <View key={l.token} style={s.fila}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.filaNombre}>{l.etiqueta || 'Sin nombre'}</Text>
                    <Text style={s.filaDetalle}>
                      {l.subidas} foto{l.subidas === 1 ? '' : 's'}
                      {l.ultima ? ` · última el ${fecha(l.ultima)}` : ''}
                      {' · '}
                      {!l.activo ? 'dado de baja' : l.vencido ? 'vencido' : `vence el ${fecha(l.vence)}`}
                    </Text>
                  </View>
                  {!muerto && (
                    <Pressable style={s.copiarBtn} onPress={() => copiar(l.token)}>
                      <Feather name={copiado === l.token ? 'check' : 'copy'} size={14}
                        color={copiado === l.token ? '#15803D' : '#1C9BD8'} />
                      <Text style={[s.copiarText, copiado === l.token && { color: '#15803D' }]}>
                        {copiado === l.token ? 'Copiado' : 'Copiar link'}
                      </Text>
                    </Pressable>
                  )}
                  {l.activo && (
                    <Pressable onPress={() => darDeBaja(l)} hitSlop={8} style={s.bajaBtn}>
                      <Feather name="trash-2" size={16} color="#B91C1C" />
                    </Pressable>
                  )}
                </View>
              );
            })}
              </>
            )}
          </ScrollView>

          <View style={s.footer}>
            <Pressable style={s.close} onPress={onClose}>
              <Text style={s.closeText}>Cerrar</Text>
            </Pressable>
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
  cardDesktop: { width: 760, maxWidth: '100%', maxHeight: '90%', borderRadius: 16 },
  cardMobile: { flex: 1 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  title: { flex: 1, fontFamily: 'BarlowCondensed-Bold', fontSize: 17, color: '#2B2B2B' },

  body: { paddingHorizontal: 18, paddingTop: 14 },
  paso: { fontFamily: 'BarlowCondensed-Bold', fontSize: 13, color: '#8A8A8A', letterSpacing: 0.8, marginBottom: 8, marginTop: 6 },

  ayuda: { flexDirection: 'row', gap: 8, backgroundColor: '#EAF6FC', borderRadius: 10, padding: 10, marginBottom: 8 },
  ayudaText: { flex: 1, fontFamily: 'Rubik', fontSize: 12, color: '#1E3A4C', lineHeight: 17 },

  formRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' },
  campoLabel: { fontFamily: 'Rubik', fontSize: 11, color: '#6B7280' },
  input: { height: 40, borderWidth: 1, borderColor: '#D3D6DB', borderRadius: 8, paddingHorizontal: 10, fontFamily: 'Rubik', fontSize: 14, color: '#2B2B2B', backgroundColor: '#FFFFFF' },
  inputChico: { width: 70, height: 40, borderWidth: 1, borderColor: '#D3D6DB', borderRadius: 8, paddingHorizontal: 10, fontFamily: 'Rubik', fontSize: 14, color: '#2B2B2B', backgroundColor: '#FFFFFF', textAlign: 'center' },
  crearBtn: { height: 40, paddingHorizontal: 18, borderRadius: 999, backgroundColor: '#1C9BD8', alignItems: 'center', justifyContent: 'center' },
  crearBtnOff: { backgroundColor: '#A7D8F0' },
  crearBtnText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 14, color: '#FFFFFF' },

  errBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5', borderRadius: 10, padding: 10, marginTop: 12 },
  errText: { flex: 1, fontFamily: 'Rubik', fontSize: 12, color: '#B91C1C' },

  listaHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  vacio: { fontFamily: 'Rubik', fontSize: 13, color: '#9CA3AF', paddingVertical: 14 },

  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  filaNombre: { fontFamily: 'BarlowCondensed-Bold', fontSize: 16, color: '#2B2B2B' },
  filaDetalle: { fontFamily: 'Rubik', fontSize: 12, color: '#6B7280', marginTop: 2 },
  copiarBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: '#1C9BD8' },
  copiarText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 13, color: '#1C9BD8' },
  bajaBtn: { padding: 6 },

  solapas: { flexDirection: 'row', gap: 6, paddingHorizontal: 18, paddingTop: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  solapa: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  solapaActiva: { borderBottomColor: '#1C9BD8' },
  solapaText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 15, color: '#8A8A8A' },
  solapaTextActiva: { color: '#1C9BD8' },
  recargar: { fontFamily: 'Rubik', fontSize: 12, color: '#1C9BD8', textDecorationLine: 'underline', marginBottom: 8 },
  celdaNum: { width: 68, alignItems: 'flex-end' },
  celdaLabel: { fontFamily: 'Rubik', fontSize: 10, color: '#9CA3AF' },
  celdaValor: { fontFamily: 'BarlowCondensed-Bold', fontSize: 17, color: '#2B2B2B' },
  celdaValorGris: { fontFamily: 'BarlowCondensed-Bold', fontSize: 17, color: '#9CA3AF' },
  difCero: { color: '#15803D' },
  difMas: { color: '#1D4ED8' },
  difMenos: { color: '#B91C1C' },

  footer: { paddingHorizontal: 18, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#F0F0F0', alignItems: 'flex-end' },
  close: { height: 42, paddingHorizontal: 22, borderRadius: 999, borderWidth: 1, borderColor: '#D3D6DB', alignItems: 'center', justifyContent: 'center' },
  closeText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 15, color: '#2B2B2B' },
});

export default CargaFotosLinksModal;
