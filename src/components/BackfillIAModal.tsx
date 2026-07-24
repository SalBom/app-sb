// src/components/BackfillIAModal.tsx
// Proceso de "primera carga": la IA recorre todos los productos con ficha
// técnica y completa sus atributos + descripción como BORRADOR. Solo ADMIN.
// El proceso corre en el backend; acá se dispara y se muestra el progreso.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ActivityIndicator, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import axios from 'axios';
import { API_URL } from '../config';
import { getCuitFromStorage } from '../utils/authStorage';
import useIsDesktopWeb from '../hooks/useIsDesktopWeb';

type St = {
  running?: boolean; total?: number; procesados?: number;
  con_ficha?: number; sin_ficha?: number; errores?: number; saltados?: number;
  terminado?: boolean;
};

const Stat = ({ label, value, color }: { label: string; value: number; color: string }) => (
  <View style={s.statBox}>
    <Text style={[s.statValue, { color }]}>{value}</Text>
    <Text style={s.statLabel}>{label}</Text>
  </View>
);

const BackfillIAModal = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
  const isDesktopWeb = useIsDesktopWeb();
  const [st, setSt] = useState<St>({});
  const [starting, setStarting] = useState(false);
  const [polling, setPolling] = useState(false);
  const timer = useRef<any>(null);

  const stopTimer = () => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    setPolling(false);
  };

  const fetchStatus = async () => {
    try {
      const cuit = await getCuitFromStorage();
      const res = await axios.get(`${API_URL}/admin/product-specs/backfill/status`, { params: { cuit } });
      setSt(res.data || {});
      if (res.data && !res.data.running) stopTimer();
    } catch {}
  };

  const startPolling = () => {
    if (timer.current) return;
    setPolling(true);
    timer.current = setInterval(fetchStatus, 2500);
  };

  useEffect(() => {
    if (!visible) return;
    fetchStatus().then(() => {
      // Si al abrir ya hay un proceso corriendo (ej. otra sesión), seguimos el progreso.
      setSt(prev => { if (prev.running) startPolling(); return prev; });
    });
    return () => stopTimer();
  }, [visible]);

  const iniciar = () => {
    Alert.alert(
      'Generar fichas con IA (lote)',
      'La IA va a leer las fichas técnicas de todos los productos que aún no tengan características cargadas, y va a completar sus atributos y descripción como BORRADOR (los revisás y aprobás después, producto por producto). Esto consume crédito de IA. ¿Continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, generar',
          onPress: async () => {
            setStarting(true);
            try {
              const cuit = await getCuitFromStorage();
              await axios.post(`${API_URL}/admin/product-specs/backfill`, { cuit, solo_faltantes: true });
              await fetchStatus();
              startPolling();
            } catch (e: any) {
              Alert.alert('Error', e?.response?.data?.error || 'No se pudo iniciar el proceso.');
            } finally {
              setStarting(false);
            }
          },
        },
      ]
    );
  };

  const total = st.total || 0;
  const procesados = st.procesados || 0;
  const pct = total > 0 ? Math.round((procesados / total) * 100) : 0;
  const enCurso = !!st.running || polling;
  const mostrarProgreso = enCurso || !!st.terminado;

  return (
    <Modal visible={visible} transparent animationType={isDesktopWeb ? 'fade' : 'slide'} onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={[s.wrap, isDesktopWeb ? s.wrapDesktop : s.wrapMobile]} pointerEvents="box-none">
        <View style={[s.card, isDesktopWeb ? s.cardDesktop : s.cardMobile]}>
          <View style={s.header}>
            <Feather name="zap" size={18} color="#7C3AED" />
            <Text style={s.title} numberOfLines={1}>Generar fichas con IA (lote)</Text>
            <Pressable onPress={onClose} hitSlop={8}><Feather name="x" size={20} color="#6B7280" /></Pressable>
          </View>

          <View style={s.body}>
            <Text style={s.desc}>
              La IA lee la ficha técnica de cada producto y completa sus atributos y descripción.
              Los resultados quedan como <Text style={{ fontWeight: '700' }}>borrador</Text>: se publican
              recién cuando los aprobás desde cada producto.
            </Text>

            {mostrarProgreso ? (
              <>
                <View style={s.progressTrack}>
                  <View style={[s.progressFill, { width: (`${pct}%` as any) }]} />
                </View>
                <Text style={s.pctText}>{procesados} / {total} ({pct}%)</Text>

                <View style={s.stats}>
                  <Stat label="Con ficha (IA)" value={st.con_ficha || 0} color="#16A34A" />
                  <Stat label="Sin ficha" value={st.sin_ficha || 0} color="#9CA3AF" />
                  <Stat label="Ya cargados" value={st.saltados || 0} color="#1C9BD8" />
                  <Stat label="Errores" value={st.errores || 0} color="#D32F2F" />
                </View>

                {enCurso ? (
                  <View style={s.runningRow}>
                    <ActivityIndicator color="#7C3AED" size="small" />
                    <Text style={s.runningText}>Procesando… (podés cerrar esta ventana, el proceso sigue solo)</Text>
                  </View>
                ) : (
                  <Text style={s.doneText}>✓ Proceso terminado. Revisá y aprobá los borradores en cada producto.</Text>
                )}
              </>
            ) : (
              <Pressable style={[s.startBtn, starting && { opacity: 0.7 }]} onPress={iniciar} disabled={starting}>
                {starting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Feather name="play" size={15} color="#fff" />
                    <Text style={s.startText}>Iniciar proceso</Text>
                  </>
                )}
              </Pressable>
            )}
          </View>

          <View style={s.footer}>
            <Pressable style={s.close} onPress={onClose}><Text style={s.closeText}>Cerrar</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const s = StyleSheet.create({
  backdrop: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)' },
  wrap: { flex: 1 },
  wrapDesktop: { alignItems: 'center', justifyContent: 'center' },
  wrapMobile: { justifyContent: 'flex-end' },
  card: { backgroundColor: '#FFFFFF' },
  cardDesktop: { width: 460, borderRadius: 16, overflow: 'hidden' },
  cardMobile: { width: '100%', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },

  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  title: { flex: 1, fontFamily: 'BarlowCondensed-Bold', fontSize: 16, color: '#2B2B2B' },

  body: { paddingHorizontal: 16, paddingVertical: 16 },
  desc: { fontFamily: 'Rubik', fontSize: 13, color: '#4B5563', lineHeight: 19, marginBottom: 16 },

  startBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#7C3AED', height: 46, borderRadius: 10 },
  startText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 15, color: '#FFFFFF', letterSpacing: 0.3 },

  progressTrack: { height: 10, borderRadius: 999, backgroundColor: '#EEE', overflow: 'hidden' },
  progressFill: { height: 10, borderRadius: 999, backgroundColor: '#7C3AED' },
  pctText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 14, color: '#2B2B2B', marginTop: 8, textAlign: 'center' },

  stats: { flexDirection: 'row', gap: 8, marginTop: 16 },
  statBox: { flex: 1, alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 10, paddingVertical: 10 },
  statValue: { fontFamily: 'BarlowCondensed-Bold', fontSize: 20 },
  statLabel: { fontFamily: 'Rubik', fontSize: 10, color: '#6B7280', marginTop: 2, textAlign: 'center' },

  runningRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  runningText: { flex: 1, fontFamily: 'Rubik', fontSize: 12, color: '#6B7280' },
  doneText: { fontFamily: 'Rubik', fontSize: 13, color: '#16A34A', marginTop: 16, fontWeight: '600' },

  footer: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  close: { height: 44, borderRadius: 999, borderWidth: 1, borderColor: '#D3D6DB', alignItems: 'center', justifyContent: 'center' },
  closeText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 14, color: '#2B2B2B' },
});

export default BackfillIAModal;
