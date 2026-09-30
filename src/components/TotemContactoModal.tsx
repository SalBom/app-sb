// src/components/TotemContactoModal.tsx
// En el tótem de la expo no se puede abrir WhatsApp: saldría de la web y dejaría
// el kiosko abierto en otra aplicación. En su lugar mostramos un cartel con un
// QR que el visitante escanea con SU celular y le abre el chat ya escrito, con
// el producto que estaba mirando.
//
// El QR se genera acá mismo (sin pedirle nada a internet), así que funciona
// aunque la conexión del predio ande mal.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import { Feather } from '@expo/vector-icons';
import QRCode from 'qrcode';
import { SALBOM_WHATSAPP, mensajeWhatsApp } from '../utils/whatsapp';
import { useTotemContactoStore } from '../store/totemContactoStore';

const TELEFONO_LEGIBLE = '+54 9 11 3796-9970';

export default function TotemContactoModal() {
  const { visible, producto, cerrar } = useTotemContactoStore();
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) { setQr(null); return; }
    const url = `https://wa.me/${SALBOM_WHATSAPP}?text=${encodeURIComponent(mensajeWhatsApp(producto))}`;
    QRCode.toDataURL(url, { margin: 1, width: 520, errorCorrectionLevel: 'M' })
      .then(setQr)
      .catch(() => setQr(null));
  }, [visible, producto]);

  // Se cierra solo: si el visitante se va, la pantalla no queda con el cartel puesto.
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(cerrar, 60000);
    return () => clearTimeout(t);
  }, [visible, cerrar]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={cerrar}>
      <Pressable style={s.backdrop} onPress={cerrar} />
      <View style={s.wrap} pointerEvents="box-none">
        <View style={s.card}>
          <Text style={s.titulo}>CONSULTAR POR WHATSAPP</Text>
          {!!producto?.name && (
            <Text style={s.producto} numberOfLines={2}>
              {producto.name}{producto.default_code ? ` · ${producto.default_code}` : ''}
            </Text>
          )}

          <Text style={s.instruccion}>Escaneá el código con la cámara de tu celular</Text>

          <View style={s.qrBox}>
            {qr ? (
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              <img src={qr} alt="Código QR de WhatsApp" style={{ width: 260, height: 260 } as any} />
            ) : (
              <Text style={s.qrCargando}>Generando código…</Text>
            )}
          </View>

          <Text style={s.oTambien}>o escribinos a</Text>
          <Text style={s.telefono}>{TELEFONO_LEGIBLE}</Text>

          <Pressable style={s.cerrar} onPress={cerrar}>
            <Feather name="x" size={18} color="#2B2B2B" />
            <Text style={s.cerrarText}>Cerrar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' },
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: 460, maxWidth: '100%', backgroundColor: '#FFFFFF', borderRadius: 20, paddingVertical: 32, paddingHorizontal: 28, alignItems: 'center' },
  titulo: { fontFamily: 'BarlowCondensed-Bold', fontSize: 30, color: '#2B2B2B', letterSpacing: 0.5, textAlign: 'center' },
  producto: { fontFamily: 'Rubik', fontSize: 15, color: '#6B7280', textAlign: 'center', marginTop: 6 },
  instruccion: { fontFamily: 'Rubik', fontSize: 16, color: '#2B2B2B', textAlign: 'center', marginTop: 20 },
  qrBox: { width: 300, height: 300, alignItems: 'center', justifyContent: 'center', marginTop: 16, borderWidth: 2, borderColor: '#EFEFEF', borderRadius: 16 },
  qrCargando: { fontFamily: 'Rubik', fontSize: 14, color: '#9CA3AF' },
  oTambien: { fontFamily: 'Rubik', fontSize: 14, color: '#9CA3AF', marginTop: 18 },
  telefono: { fontFamily: 'BarlowCondensed-Bold', fontSize: 30, color: '#25D366', marginTop: 2 },
  cerrar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24, height: 54, paddingHorizontal: 34, borderRadius: 999, borderWidth: 1, borderColor: '#D3D6DB' },
  cerrarText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 18, color: '#2B2B2B' },
});
