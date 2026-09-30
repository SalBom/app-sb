// src/components/TotemPromoQR.tsx
// Cartel que aparece cada tantos minutos en el tótem con DOS códigos QR:
//   1) WhatsApp con el mensaje de "quiero ser distribuidor" ya escrito;
//   2) la lista de precios de Shimura (archivo en Drive).
// La idea es que el visitante se lleve el contacto y la lista en SU celular,
// sin que el tótem tenga que salir de la web.
//
// Los QR se generan acá mismo, sin pedirle nada a internet, así funcionan
// aunque la conexión del predio ande mal.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import QRCode from 'qrcode';
import { useTotemPromoStore } from '../store/totemPromoStore';
import { TOTEM_PROMO_DURACION_MS } from '../config/totem';
import { SALBOM_WHATSAPP } from '../utils/whatsapp';

const MENSAJE_DISTRIBUIDOR =
  'Hola, quiero ser distribuidor Shimura. Podria solicitarle la lista de precios y ofertas?';

const URL_WHATSAPP = `https://wa.me/${SALBOM_WHATSAPP}?text=${encodeURIComponent(MENSAJE_DISTRIBUIDOR)}`;
const URL_LISTA_PRECIOS = 'https://drive.google.com/file/d/16OkKlxIFyZeLsnQs5m5TBeJpD-Pwf4li/view?usp=drive_link';

const TELEFONO_LEGIBLE = '+54 9 11 3796-9970';

export default function TotemPromoQR() {
  const visible = useTotemPromoStore((s) => s.visible);
  const ocultar = useTotemPromoStore((s) => s.ocultar);
  const [qrs, setQrs] = useState<{ wa: string; lista: string } | null>(null);

  // Se generan una sola vez y quedan en memoria: el cartel aparece muchas
  // veces a lo largo del día y no tiene sentido recalcularlos cada vez.
  useEffect(() => {
    if (!visible || qrs) return;
    const opciones = { margin: 1, width: 560, errorCorrectionLevel: 'M' as const };
    Promise.all([
      QRCode.toDataURL(URL_WHATSAPP, opciones),
      QRCode.toDataURL(URL_LISTA_PRECIOS, opciones),
    ])
      .then(([wa, lista]) => setQrs({ wa, lista }))
      .catch(() => setQrs(null));
  }, [visible, qrs]);

  // Se cierra solo, tanto si lo abrió el reloj como si lo abrió el botón de la
  // barra lateral: nunca queda un cartel puesto tapando el catálogo.
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(ocultar, TOTEM_PROMO_DURACION_MS);
    return () => clearTimeout(t);
  }, [visible, ocultar]);

  if (!visible) return null;

  return (
    <Pressable style={s.fondo} onPress={ocultar}>
      <View style={s.centro}>
        <Text style={s.encabezado}>ESCANEÁ CON TU CELULAR</Text>

        <View style={s.tarjetas}>
          <View style={s.tarjeta}>
            <View style={[s.iconoWrap, { backgroundColor: '#DCFCE7' }]}>
              <Feather name="message-circle" size={40} color="#15803D" />
            </View>
            <Text style={s.titulo}>¿QUERÉS SER{'\n'}DISTRIBUIDOR SHIMURA?</Text>
            <View style={s.qrBox}>
              {qrs
                ? <img src={qrs.wa} alt="QR de WhatsApp" style={{ width: 320, height: 320 } as any} />
                : <Text style={s.cargando}>Generando código…</Text>}
            </View>
            <Text style={s.pie}>Te abre el WhatsApp con el mensaje escrito</Text>
            <Text style={s.telefono}>{TELEFONO_LEGIBLE}</Text>
          </View>

          <View style={s.tarjeta}>
            <View style={[s.iconoWrap, { backgroundColor: '#DBEAFE' }]}>
              <Feather name="file-text" size={40} color="#1D4ED8" />
            </View>
            <Text style={s.titulo}>LISTA DE PRECIOS{'\n'}SHIMURA</Text>
            <View style={s.qrBox}>
              {qrs
                ? <img src={qrs.lista} alt="QR de la lista de precios" style={{ width: 320, height: 320 } as any} />
                : <Text style={s.cargando}>Generando código…</Text>}
            </View>
            <Text style={s.pie}>Llevate la lista completa en tu celular</Text>
            <Text style={[s.telefono, { color: '#1C9BD8' }]}>Precios actualizados</Text>
          </View>
        </View>

        <View style={s.seguir}>
          <Feather name="chevron-left" size={22} color="#6B7280" />
          <Text style={s.seguirText}>Tocá la pantalla para seguir viendo el catálogo</Text>
          <Feather name="chevron-right" size={22} color="#6B7280" />
        </View>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  fondo: {
    // 'fixed': tapa la pantalla completa aunque la página esté scrolleada.
    position: 'fixed' as any, left: 0, top: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(17,20,23,0.92)', alignItems: 'center', justifyContent: 'center', zIndex: 9998,
  },
  centro: { alignItems: 'center', paddingHorizontal: 40 },
  encabezado: { fontFamily: 'BarlowCondensed-Bold', fontSize: 46, color: '#FFFFFF', letterSpacing: 1, marginBottom: 36 },

  tarjetas: { flexDirection: 'row', gap: 28, alignItems: 'stretch' },
  tarjeta: {
    width: 470, backgroundColor: '#FFFFFF', borderRadius: 20,
    paddingVertical: 30, paddingHorizontal: 26, alignItems: 'center',
  },
  iconoWrap: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  titulo: { fontFamily: 'BarlowCondensed-Bold', fontSize: 28, lineHeight: 30, color: '#2B2B2B', textAlign: 'center', marginTop: 16 },
  qrBox: { width: 340, height: 340, alignItems: 'center', justifyContent: 'center', marginTop: 20, borderWidth: 2, borderColor: '#EFEFEF', borderRadius: 16 },
  cargando: { fontFamily: 'Rubik', fontSize: 14, color: '#9CA3AF' },
  pie: { fontFamily: 'Rubik', fontSize: 15, color: '#6B7280', textAlign: 'center', marginTop: 18 },
  telefono: { fontFamily: 'BarlowCondensed-Bold', fontSize: 26, color: '#25D366', marginTop: 4 },

  seguir: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 40 },
  seguirText: { fontFamily: 'Rubik', fontSize: 18, color: '#D1D5DB' },
});
