import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer } from '@/components/ScreenContainer';
import { SignInRequired } from '@/components/SignInRequired';
import { apiClient, ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { BOOKING_STATUS_LABEL, BookingSummary } from '@/lib/flight-types';
import { formatDate, formatMoney } from '@/lib/format';
import { TripsStackParamList } from '@/navigation/types';
import { colors, radius, spacing } from '@/theme/colors';

export function MyTripsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<TripsStackParamList, 'MyTrips'>>();
  const { user, accessToken } = useAuth();
  const [bookings, setBookings] = useState<BookingSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refetch every time this tab regains focus (e.g. after cancelling a
  // booking on its detail screen and navigating back) rather than only
  // once on mount.
  useFocusEffect(
    useCallback(() => {
      if (!accessToken) return;
      apiClient
        .listBookings(accessToken)
        .then((r) => setBookings(r.bookings))
        .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your bookings.'));
    }, [accessToken]),
  );

  if (!user) {
    return (
      <ScreenContainer>
        <Text style={styles.title}>My trips</Text>
        <SignInRequired message="Sign in to see your bookings." />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <Text style={styles.title}>My trips</Text>

      {error && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{error}</Text>
        </View>
      )}
      {!error && bookings === null && (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.tangerine} />
        </View>
      )}
      {bookings && bookings.length === 0 && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>No bookings yet — search for a flight from the Search tab to get started.</Text>
        </View>
      )}

      {bookings?.map((b) => (
        <Pressable key={b.id} onPress={() => navigation.navigate('BookingDetail', { id: b.id })} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
          <View style={styles.cardLeft}>
            <Text style={styles.route}>{b.route ?? 'Booking'} · {b.bookingReference}</Text>
            <Text style={styles.meta}>{formatDate(b.createdAt)} · {BOOKING_STATUS_LABEL[b.status]}</Text>
          </View>
          <Text style={styles.amount}>{formatMoney(b.totalAmount, b.currency)}</Text>
        </Pressable>
      ))}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '700', color: colors.dusk900, marginBottom: spacing.lg },
  notice: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.sand, borderRadius: 12, padding: spacing.lg },
  noticeText: { fontSize: 13, color: colors.dusk500 },
  loading: { paddingVertical: spacing.xxl, alignItems: 'center' },
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.sand,
    borderRadius: radius.lg,
    padding: spacing.lg - 2,
    marginBottom: spacing.md - 2,
  },
  cardPressed: { borderColor: colors.tangerine },
  cardLeft: { flexShrink: 1 },
  route: { fontSize: 14, fontWeight: '600', color: colors.dusk900 },
  meta: { fontSize: 12, color: colors.dusk500, marginTop: 2 },
  amount: { fontSize: 14, fontWeight: '700', color: colors.dusk900 },
});
