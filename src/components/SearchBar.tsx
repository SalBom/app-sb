// src/components/SearchBar.tsx
import React from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  TextInputProps,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SearchBarProps extends TextInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onClear?: () => void;
  /** Estilo visual: "default" | "hero" */
  variant?: 'default' | 'hero';
  /** Mueve la lupa a la derecha */
  rightIcon?: boolean;
  /** Estilo adicional para el contenedor */
  containerStyle?: ViewStyle;
}

const SearchBar: React.FC<SearchBarProps> = ({
  value,
  onChangeText,
  onClear,
  variant = 'default',
  rightIcon = false,
  containerStyle,
  placeholder,
  ...rest
}) => {
  const isHero = variant === 'hero';
  return (
    <View
      style={[
        styles.container,
        isHero && styles.containerHero,
        containerStyle,
      ]}
    >
      {!rightIcon && (
        <Ionicons
          name="search"
          size={20}
          color="#8CA1AE"
          style={styles.searchIcon}
        />
      )}

      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? (isHero ? 'BUSCAR' : 'Buscar...')}
        placeholderTextColor={isHero ? '#A9BAC6' : '#888'}
        style={[styles.input, isHero && styles.inputHero]}
        {...rest}
      />

      {rightIcon && (
        <Ionicons
          name="search"
          size={20}
          color={isHero ? '#8CA1AE' : '#888'}
          style={styles.rightSearchIcon}
        />
      )}

      {value.length > 0 && (
        <TouchableOpacity
          onPress={onClear || (() => onChangeText(''))}
          style={styles.clearBtn}
        >
          <Ionicons name="close-circle" size={20} color="#9FB2BF" />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginHorizontal: 10,
    paddingHorizontal: 12,
    height: 40,
  },
  containerHero: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    height: 44,
    borderWidth: 1,
    borderColor: '#E0E7EC',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  inputHero: {
    fontSize: 15,
    letterSpacing: 0.4,
    color: '#2B2B2B',
  },
  searchIcon: { marginRight: 8 },
  rightSearchIcon: { marginLeft: 8 },
  clearBtn: { marginLeft: 6 },
});

export default SearchBar;
