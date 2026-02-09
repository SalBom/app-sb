// src/components/FiltrosProductos.tsx
import React from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  orden: string;
  setOrden: (val: string) => void;
  mostrarSoloFavoritos: boolean;
  setMostrarSoloFavoritos: (val: boolean) => void;
  marcaSeleccionada: string;
  setMarcaSeleccionada: (val: string) => void;
  categoriaSeleccionada: string;
  setCategoriaSeleccionada: (val: string) => void;
  marcas: { id: number; name: string }[];
  categorias: { id: number; name: string }[];
  onLimpiarFiltros: () => void;
  /** Si es false, oculta los pickers de marca/categoría */
  showBrandCategory?: boolean;
}

const FiltrosProductos: React.FC<Props> = ({
  orden,
  setOrden,
  mostrarSoloFavoritos,
  setMostrarSoloFavoritos,
  marcaSeleccionada,
  setMarcaSeleccionada,
  categoriaSeleccionada,
  setCategoriaSeleccionada,
  marcas,
  categorias,
  onLimpiarFiltros,
  showBrandCategory = true,
}) => {
  return (
    <>
      <View style={[styles.row, { marginTop: 10 }]}>
        <View style={styles.ordenamientoContainer}>
          <Picker
            selectedValue={orden}
            onValueChange={setOrden}
            style={styles.picker}
          >
            <Picker.Item label="Ordenar por..." value="" />
            <Picker.Item label="Precio: menor a mayor" value="precio-asc" />
            <Picker.Item label="Precio: mayor a menor" value="precio-desc" />
            <Picker.Item label="Nombre: A-Z" value="nombre-asc" />
            <Picker.Item label="Nombre: Z-A" value="nombre-desc" />
          </Picker>
        </View>

        <TouchableOpacity
          style={[
            styles.favFilterButton,
            mostrarSoloFavoritos && styles.favFilterButtonActive,
          ]}
          onPress={() => setMostrarSoloFavoritos(!mostrarSoloFavoritos)}
        >
          <Ionicons name="star" size={16} color="#fff" />
          <Text style={styles.favFilterText}>
            {mostrarSoloFavoritos ? 'Ver todos' : 'Solo favoritos'}
          </Text>
        </TouchableOpacity>
      </View>

      {showBrandCategory && (
        <>
          <View style={styles.row}>
            <Picker
              selectedValue={marcaSeleccionada}
              onValueChange={setMarcaSeleccionada}
              style={[styles.picker, { flex: 1 }]}
            >
              <Picker.Item label="Todas las marcas" value="" />
              {marcas.map((m) => (
                <Picker.Item key={m.id} label={m.name} value={m.id.toString()} />
              ))}
            </Picker>

            <Picker
              selectedValue={categoriaSeleccionada}
              onValueChange={setCategoriaSeleccionada}
              style={[styles.picker, { flex: 1 }]}
            >
              <Picker.Item label="Todas las categorías" value="" />
              {categorias.map((c) => (
                <Picker.Item key={c.id} label={c.name} value={c.id.toString()} />
              ))}
            </Picker>
          </View>

          <TouchableOpacity
            onPress={onLimpiarFiltros}
            style={styles.clearBtn}
          >
            <Text style={styles.clearText}>Limpiar filtros</Text>
          </TouchableOpacity>
        </>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 12,
    marginBottom: 6,
  },
  ordenamientoContainer: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    marginRight: 8,
    borderRadius: 8,
    overflow: 'hidden',
    borderColor: '#ccc',
    borderWidth: 1,
    maxWidth: '60%',
    justifyContent: 'center',
    height: 44,
  },
  favFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ccc',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  favFilterButtonActive: {
    backgroundColor: '#009cde',
  },
  favFilterText: {
    color: '#fff',
    marginLeft: 6,
    fontSize: 13,
    fontWeight: '600',
  },
  picker: {
    width: '100%',
    color: '#333',
    fontSize: 13,
    marginTop: Platform.OS === 'android' ? -4 : 0,
  },
  clearBtn: {
    alignSelf: 'flex-end',
    marginHorizontal: 12,
    marginBottom: 6,
    backgroundColor: '#e74c3c',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  clearText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
});

export default FiltrosProductos;
