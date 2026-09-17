import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { formatDate } from '@/lib/format';
import { colors, radius, spacing } from '@/theme/colors';

interface DateFieldProps {
  label: string;
  value: string; // YYYY-MM-DD
  minimumDate?: Date;
  onChange: (value: string) => void;
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * A YYYY-MM-DD field backed by the native date picker (calendar sheet on
 * iOS, native dialog on Android) rather than a text field — dates are the
 * one input a fat-finger typo silently produces a valid-looking but wrong
 * search for, so this removes free typing entirely.
 */
export function DateField({ label, value, minimumDate, onChange }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const dateValue = value ? new Date(`${value}T00:00:00`) : new Date();

  function handleChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') setOpen(false);
    if (event.type === 'dismissed' || !selected) return;
    onChange(toIso(selected));
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable onPress={() => setOpen(true)} style={styles.field}>
        <Text style={value ? styles.value : styles.placeholder}>{value ? formatDate(`${value}T00:00:00`) : 'Select a date'}</Text>
      </Pressable>
      {open && (
        <DateTimePicker
          value={dateValue}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          minimumDate={minimumDate}
          onChange={handleChange}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: { fontSize: 13, color: colors.dusk500, marginBottom: spacing.xs },
  field: {
    borderWidth: 1,
    borderColor: colors.sand,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 2,
    backgroundColor: colors.white,
  },
  value: { fontSize: 15, color: colors.dusk900, fontWeight: '500' },
  placeholder: { fontSize: 15, color: colors.dusk500 },
});
