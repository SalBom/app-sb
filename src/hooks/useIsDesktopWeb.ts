import { Platform, useWindowDimensions } from 'react-native';
import { esTotem } from '../config/totem';

/**
 * Punto de corte compartido para el layout de escritorio web (mismo valor
 * usado en Home.tsx y MainTabs.tsx). Mantenerlo centralizado evita que la
 * app quede con breakpoints distintos en cada pantalla.
 */
export default function useIsDesktopWeb(): boolean {
  const { width } = useWindowDimensions();
  // El tótem es vertical (1080 de ancho): entraría por el corte de mobile, pero
  // queremos el diseño de escritorio, no el de celular estirado.
  return Platform.OS === 'web' && (esTotem() || width >= 1024);
}
