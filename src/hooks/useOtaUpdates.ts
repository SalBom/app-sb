// src/hooks/useOtaUpdates.ts
// Actualizaciones "por aire" (OTA): permiten corregir la app sin recompilar ni
// publicar un APK nuevo. Solo aplica a cambios de JavaScript; si se toca algo
// nativo (una librería nueva, permisos, etc.) sí hace falta build nuevo — de
// eso se encarga la política de runtimeVersion "fingerprint" en app.json, que
// evita que una actualización caiga sobre un binario incompatible.
import { useEffect, useRef } from 'react';
import { Alert, AppState, AppStateStatus, Platform } from 'react-native';
import * as Updates from 'expo-updates';

export default function useOtaUpdates() {
  // Evita mostrar el cartel dos veces si el usuario ya dijo "más tarde".
  const yaAvisado = useRef(false);
  const buscando = useRef(false);

  useEffect(() => {
    // En web no existe; en desarrollo tampoco (rompería con el servidor local).
    if (Platform.OS === 'web' || __DEV__ || !Updates.isEnabled) return;

    const buscarActualizacion = async () => {
      if (buscando.current || yaAvisado.current) return;
      buscando.current = true;
      try {
        const res = await Updates.checkForUpdateAsync();
        if (!res.isAvailable) return;

        await Updates.fetchUpdateAsync();
        yaAvisado.current = true;

        // NO se reinicia solo: el vendedor puede estar cargando un pedido y
        // perderlo. Se le avisa y decide él. Si elige "Más tarde", igual queda
        // descargada y se aplica sola la próxima vez que abra la app.
        Alert.alert(
          'Actualización disponible',
          'Hay una versión nueva de la app lista para usar. ¿Querés aplicarla ahora?',
          [
            { text: 'Más tarde', style: 'cancel' },
            { text: 'Actualizar', onPress: () => Updates.reloadAsync().catch(() => {}) },
          ]
        );
      } catch {
        // Sin conexión o sin actualizaciones publicadas: seguimos normal.
      } finally {
        buscando.current = false;
      }
    };

    buscarActualizacion();

    // También al volver a la app: así el vendedor la recibe sin tener que
    // cerrarla y abrirla de nuevo.
    const sub = AppState.addEventListener('change', (estado: AppStateStatus) => {
      if (estado === 'active') buscarActualizacion();
    });
    return () => sub.remove();
  }, []);
}
