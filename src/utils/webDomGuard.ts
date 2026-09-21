// src/utils/webDomGuard.ts
// Solo web. Si el usuario traduce la página con Chrome/Google Translate (o una
// extensión toca el DOM), el traductor mueve los nodos de texto que React
// administra. Cuando React después quiere sacarlos, el navegador tira
// "removeChild: el nodo no es hijo de este nodo" y se cae toda la pantalla.
// Este parche (el recomendado en facebook/react#11538) ignora ese caso puntual
// en vez de romper: el peor efecto es un texto que queda sin actualizar.
import { Platform } from 'react-native';

if (Platform.OS === 'web' && typeof Node === 'function' && Node.prototype) {
  const proto: any = Node.prototype;
  if (!proto.__salbomGuard) {
    proto.__salbomGuard = true;

    const originalRemoveChild = proto.removeChild;
    proto.removeChild = function (child: any) {
      if (child && child.parentNode !== this) {
        console.warn('[webDomGuard] removeChild ignorado: el nodo ya no era hijo (¿traductor del navegador?)');
        return child;
      }
      return originalRemoveChild.apply(this, arguments as any);
    };

    const originalInsertBefore = proto.insertBefore;
    proto.insertBefore = function (newNode: any, referenceNode: any) {
      if (referenceNode && referenceNode.parentNode !== this) {
        console.warn('[webDomGuard] insertBefore sin referencia válida (¿traductor del navegador?)');
        return originalInsertBefore.call(this, newNode, null);
      }
      return originalInsertBefore.apply(this, arguments as any);
    };
  }
}

export {};
