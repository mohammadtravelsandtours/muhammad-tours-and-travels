import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer } from '@/components/ScreenContainer';
import { LabeledInput } from '@/components/LabeledInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import { apiClient, ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { RootStackParamList } from '@/navigation/types';
import { colors, spacing } from '@/theme/colors';

/**
 * Presented as a modal (see RootNavigator) over whatever screen asked for
 * it — on success it just goes back, letting the underlying screen react
 * to the now-signed-in auth state on its own. See SignInRequired.tsx.
 */
export function LoginScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'Login'>>();
  const { setSession } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const session = await apiClient.login(email.trim(), password);
      if ('twoFactorRequired' in session) {
        // No B2C account can enable 2FA today (that setup UI only exists
        // in the admin app) — handled defensively so this never crashes.
        setError('This account requires two-factor authentication, which isn’t supported here yet. Please contact support.');
        return;
      }
      setSession(session);
      navigation.goBack();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in. Check your details and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScreenContainer>
      <Text style={styles.title}>Welcome back</Text>
      <Text style={styles.subtitle}>Sign in to see your trips and bookings.</Text>

      <View style={styles.form}>
        <LabeledInput
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <LabeledInput
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
        />
        {error && <Text style={styles.error}>{error}</Text>}
        <PrimaryButton label={submitting ? 'Signing in…' : 'Sign in'} onPress={handleSubmit} loading={submitting} disabled={!email || !password} />
      </View>

      <Text style={styles.footer}>
        New here?{' '}
        <Pressable onPress={() => navigation.replace('Register')}>
          <Text style={styles.link}>Create an account</Text>
        </Pressable>
      </Text>
      <Pressable onPress={() => navigation.goBack()} style={styles.cancel}>
        <Text style={styles.cancelText}>Not now</Text>
      </Pressable>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '700', color: colors.dusk900, marginTop: spacing.lg },
  subtitle: { fontSize: 14, color: colors.dusk500, marginTop: spacing.sm, marginBottom: spacing.xl },
  form: { gap: 0 },
  error: { color: colors.danger, fontSize: 13, marginBottom: spacing.md },
  footer: { fontSize: 14, color: colors.dusk500, marginTop: spacing.xl, textAlign: 'center' },
  link: { color: colors.tangerineDim, fontWeight: '600' },
  cancel: { marginTop: spacing.lg, alignItems: 'center' },
  cancelText: { color: colors.dusk500, fontSize: 13 },
});
