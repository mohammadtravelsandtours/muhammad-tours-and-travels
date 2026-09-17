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

export function RegisterScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'Register'>>();
  const { setSession } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const session = await apiClient.register({
        fullName: fullName.trim(),
        email: email.trim(),
        password,
        phoneNumber: phoneNumber.trim(),
        address: address.trim() ? address.trim() : undefined,
      });
      setSession(session);
      navigation.goBack();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create your account. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScreenContainer>
      <Text style={styles.title}>Create your account</Text>
      <Text style={styles.subtitle}>Takes under a minute.</Text>

      <View>
        <LabeledInput label="Full name" value={fullName} onChangeText={setFullName} autoComplete="name" />
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
          autoComplete="new-password"
          hint="At least 10 characters."
        />
        <LabeledInput
          label="Phone number"
          value={phoneNumber}
          onChangeText={setPhoneNumber}
          keyboardType="phone-pad"
          autoComplete="tel"
          placeholder="+8801XXXXXXXXX"
        />
        <LabeledInput
          label="Address"
          value={address}
          onChangeText={setAddress}
          autoComplete="street-address"
          hint="Optional."
        />
        {error && <Text style={styles.error}>{error}</Text>}
        <PrimaryButton
          label={submitting ? 'Creating account…' : 'Create account'}
          onPress={handleSubmit}
          loading={submitting}
          disabled={!fullName || !email || password.length < 10 || !phoneNumber.trim()}
        />
      </View>

      <Text style={styles.footer}>
        Already have an account?{' '}
        <Pressable onPress={() => navigation.replace('Login')}>
          <Text style={styles.link}>Sign in</Text>
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
  error: { color: colors.danger, fontSize: 13, marginBottom: spacing.md },
  footer: { fontSize: 14, color: colors.dusk500, marginTop: spacing.xl, textAlign: 'center' },
  link: { color: colors.tangerineDim, fontWeight: '600' },
  cancel: { marginTop: spacing.lg, alignItems: 'center' },
  cancelText: { color: colors.dusk500, fontSize: 13 },
});
