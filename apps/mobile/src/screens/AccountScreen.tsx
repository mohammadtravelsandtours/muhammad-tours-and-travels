import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SignInRequired } from '@/components/SignInRequired';
import { ScreenContainer } from '@/components/ScreenContainer';
import { useAuth } from '@/lib/auth-context';
import { TabParamList } from '@/navigation/types';
import { colors, spacing } from '@/theme/colors';

export function AccountScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<TabParamList, 'AccountTab'>>();
  const { user, logout } = useAuth();

  if (!user) {
    return (
      <ScreenContainer>
        <Text style={styles.title}>Account</Text>
        <SignInRequired message="Sign in to view your account." />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <Text style={styles.title}>Hi, {user.fullName.split(' ')[0]}</Text>
      <Text style={styles.email}>{user.email}</Text>

      <View style={styles.actions}>
        <PrimaryButton label="View your trips" onPress={() => navigation.navigate('TripsTab', { screen: 'MyTrips' })} variant="secondary" />
        <PrimaryButton label="Search for a flight" onPress={() => navigation.navigate('SearchTab', { screen: 'Search' })} variant="secondary" />
        <PrimaryButton label="Sign out" onPress={logout} variant="danger" />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '700', color: colors.dusk900 },
  email: { fontSize: 14, color: colors.dusk500, marginTop: spacing.xs, marginBottom: spacing.xl },
  actions: { gap: spacing.sm },
});
