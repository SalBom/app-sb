import { Platform, useWindowDimensions } from 'react-native';

/**
 * Punto de corte compartido para el layout de escritorio web (mismo valor
 * usado en Home.tsx y MainTabs.tsx). Mantenerlo centralizado evita que la
 * app quede con breakpoints distintos en cada pantalla.
 */
export default function useIsDesktopWeb(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= 1024;
}
