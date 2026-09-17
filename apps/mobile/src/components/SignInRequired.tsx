import { StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from './PrimaryButton';
import { openLogin, openRegister } from '@/navigation/nav-ref';
import { colors, radius, spacing } from '@/theme/colors';

/**
 * The one auth gate every screen that needs a signed-in traveler renders
 * instead of its real content — Login/Register open as modals over the
 * current screen (see navigation/nav-ref.ts) and, on success, simply
 * dismiss: the gated screen re-renders automatically because it reads
 * `user` from useAuth(), so no "next route" plumbing is needed the way a
 * web redirect would require.
 */
export function SignInRequired({ message }: { message: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Sign in required</Text>
      <Text style={styles.message}>{message}</Text>
      <View style={styles.actions}>
        <PrimaryButton label="Sign in" onPress={openLogin} />
        <PrimaryButton label="Create an account" onPress={openRegister} variant="secondary" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.sand,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginTop: spacing.lg,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.dusk900 },
  message: { fontSize: 14, color: colors.dusk500, marginTop: spacing.sm, marginBottom: spacing.lg, lineHeight: 20 },
  actions: { gap: spacing.sm },
});
