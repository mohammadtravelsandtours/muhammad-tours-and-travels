import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { colors, radius, spacing } from '@/theme/colors';

interface LabeledInputProps extends TextInputProps {
  label: string;
  hint?: string;
}

export function LabeledInput({ label, hint, style, ...rest }: LabeledInputProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.dusk500}
        style={[styles.input, style]}
        {...rest}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
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
  hint: { fontSize: 12, color: colors.dusk500, marginTop: spacing.xs },
});
