import { registerRootComponent } from 'expo';
// Primero de todo: protege la web de los traductores del navegador (no hace nada en el APK).
import './src/utils/webDomGuard';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
