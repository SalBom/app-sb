import { create } from 'zustand';

interface ImagenStore {
  imagenes: Record<number, string>;
  setImagen: (id: number, data: string) => void;
}

export const useImagenStore = create<ImagenStore>((set) => ({
  imagenes: {},
  setImagen: (id, data) =>
    set((state) => ({
      imagenes: {
        ...state.imagenes,
        [id]: data,
      },
    })),
}));