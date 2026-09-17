import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { apiClient } from '@/lib/api-client';
import { colors, radius, spacing } from '@/theme/colors';

interface AirportOption {
  iataCode: string;
  name: string;
  city: string;
  country: string;
}

interface AirportInputProps {
  label: string;
  value: string;
  onChange: (iataCode: string) => void;
  placeholder?: string;
}

/**
 * Mobile counterpart to apps/web/src/components/airport-input.tsx — same
 * GET /airports/search-backed autocomplete, same "free text still accepts
 * a bare IATA code, real validation happens server-side" contract, just
 * with an inline dropdown list instead of a CSS-positioned absolute one.
 */
export function AirportInput({ label, value, onChange, placeholder }: AirportInputProps) {
  const [query, setQuery] = useState(value);
  const [options, setOptions] = useState<AirportOption[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => setQuery(value), [value]);

  function handleInput(next: string) {
    setQuery(next);
    onChange(next.toUpperCase());
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (next.trim().length < 2) {
      setOptions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const { results } = await apiClient.searchAirports(next);
        setOptions(results);
        setOpen(results.length > 0);
      } catch {
        setOptions([]);
      }
    }, 200);
  }

  function select(o: AirportOption) {
    onChange(o.iataCode);
    setQuery(`${o.city} (${o.iataCode})`);
    setOpen(false);
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={query}
        onChangeText={handleInput}
        onFocus={() => options.length > 0 && setOpen(true)}
        placeholder={placeholder}
        placeholderTextColor={colors.dusk500}
        maxLength={60}
        autoCapitalize="words"
        style={styles.input}
      />
      {open && (
        <View style={styles.dropdown}>
          <FlatList
            data={options}
            keyExtractor={(o) => o.iataCode}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable onPress={() => select(item)} style={styles.option}>
                <Text style={styles.optionCity}>
                  {item.city} <Text style={styles.optionCode}>({item.iataCode})</Text>
                </Text>
                <Text style={styles.optionMeta}>{item.name}, {item.country}</Text>
              </Pressable>
            )}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: { fontSize: 13, color: colors.dusk500, marginBottom: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.sand,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 2,
    fontSize: 15,
    color: colors.dusk900,
    backgroundColor: colors.white,
  },
  dropdown: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.sand,
    borderRadius: radius.sm,
    backgroundColor: colors.white,
    maxHeight: 220,
    overflow: 'hidden',
  },
  option: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, borderBottomWidth: 1, borderBottomColor: colors.sand },
  optionCity: { fontSize: 14, fontWeight: '600', color: colors.dusk900 },
  optionCode: { fontWeight: '400', color: colors.dusk500 },
  optionMeta: { fontSize: 12, color: colors.dusk500, marginTop: 2 },
});
