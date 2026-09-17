import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SignInRequired } from '@/components/SignInRequired';
import { apiClient, ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Booking, BOOKING_STATUS_LABEL, CANCELLABLE_STATUSES } from '@/lib/flight-types';
import { formatDateTime, formatMoney } from '@/lib/format';
import { SearchStackParamList, TripsStackParamList } from '@/navigation/types';
import { colors, radius, spacing } from '@/theme/colors';

const TERMINAL_GOOD: Booking['status'][] = ['CONFIRMED', 'TICKETED'];
const TERMINAL_BAD: Booking['status'][] = ['FAILED', 'CANCELLED', 'EXPIRED'];

type Route = RouteProp<SearchStackParamList, 'BookingDetail'> | RouteProp<TripsStackParamList, 'BookingDetail'>;

/**
 * Reachable from either stack (right after a fresh booking, or from My
 * Trips) — see navigation/types.ts. Adds a Cancel action the web app
 * doesn't currently surface in its UI, exercising the cancel/refund
 * backend built in an earlier phase (POST /bookings/:id/cancel) so "manage"
 * in "search → book → manage" (Phase 7's exit criterion) means something
 * beyond read-only status.
 */
export function BookingDetailScreen() {
  const route = useRoute<Route>();
  const { id } = route.params;
  const { user, accessToken } = useAuth();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  function load() {
    if (!accessToken) return;
    apiClient
      .getBooking(id, accessToken)
      .then(setBooking)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load this booking.'));
  }

  useEffect(load, [accessToken, id]);

  if (!user) {
    return (
      <ScreenContainer>
        <SignInRequired message="Sign in to view this booking." />
      </ScreenContainer>
    );
  }

  function confirmCancel() {
    Alert.alert(
      'Cancel this booking?',
      'This requests cancellation with the supplier and, where eligible, starts a refund. This cannot be undone.',
      [
        { text: 'Keep booking', style: 'cancel' },
        { text: 'Cancel booking', style: 'destructive', onPress: doCancel },
      ],
    );
  }

  async function doCancel() {
    if (!accessToken) return;
    setCancelling(true);
    setCancelError(null);
    try {
      const updated = await apiClient.cancelBooking(id, 'Cancelled by traveler from the mobile app', accessToken);
      setBooking(updated);
    } catch (err) {
      setCancelError(err instanceof ApiError ? err.message : 'Could not cancel this booking. Please try again or contact support.');
    } finally {
      setCancelling(false);
    }
  }

  return (
    <ScreenContainer>
      {error && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{error}</Text>
        </View>
      )}
      {!error && !booking && (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.tangerine} />
        </View>
      )}

      {booking && (
        <>
          <View style={styles.headerRow}>
            <View style={styles.flex1}>
              <Text style={styles.title}>Booking {booking.bookingReference}</Text>
              <Text style={styles.subtitle}>Created {formatDateTime(booking.createdAt)}</Text>
            </View>
            <StatusBadge status={booking.status} />
          </View>

          {TERMINAL_GOOD.includes(booking.status) && (
            <View style={styles.infoNotice}>
              <Text style={styles.infoNoticeText}>
                {booking.status === 'TICKETED' ? 'Your ticket has been issued. Details are below.' : 'Your booking is confirmed with the supplier. Ticketing will follow.'}
              </Text>
            </View>
          )}
          {TERMINAL_BAD.includes(booking.status) && (
            <View style={styles.notice}>
              <Text style={styles.noticeText}>
                This booking did not complete ({BOOKING_STATUS_LABEL[booking.status].toLowerCase()}). You have not been charged for a confirmed fare.
              </Text>
            </View>
          )}
          {booking.status === 'REFUND_PENDING' && (
            <View style={styles.infoNotice}>
              <Text style={styles.infoNoticeText}>Your refund is being processed.</Text>
            </View>
          )}
          {booking.status === 'REFUNDED' && (
            <View style={styles.infoNotice}>
              <Text style={styles.infoNoticeText}>This booking was cancelled and refunded.</Text>
            </View>
          )}

          {booking.offer && (
            <View style={styles.card}>
              <Text style={styles.cardMeta}>
                {booking.offer.fareFamily} · {booking.offer.cabin.replace('_', ' ')} · {booking.offer.stops === 0 ? 'Nonstop' : `${booking.offer.stops} stop(s)`}
              </Text>
              {booking.offer.segments.map((s, i) => (
                <View key={i} style={styles.segmentRow}>
                  <Text style={styles.segmentFlight}>{s.marketingCarrier} {s.flightNumber}</Text>
                  <Text style={styles.segmentTime}>{formatDateTime(s.departureAt)} {s.origin}</Text>
                  <Text style={styles.segmentArrow}>→</Text>
                  <Text style={styles.segmentTime}>{formatDateTime(s.arrivalAt)} {s.destination}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.infoGrid}>
            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>Travelers</Text>
              {booking.passengers.map((p) => (
                <Text key={p.id} style={styles.infoBody}>{p.title} {p.firstName} {p.lastName} · {p.type.toLowerCase()}</Text>
              ))}
            </View>
            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>Total paid</Text>
              <Text style={styles.totalAmount}>{formatMoney(booking.totalAmount, booking.currency)}</Text>
              <Text style={styles.infoBody}>{booking.contactEmail}{'\n'}{booking.contactPhone}</Text>
            </View>
          </View>

          {booking.tickets.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Tickets</Text>
              {booking.tickets.map((t) => (
                <Text key={t.ticketNumber} style={styles.infoBody}>Ticket {t.ticketNumber} — {t.status.toLowerCase()}</Text>
              ))}
            </View>
          )}

          {CANCELLABLE_STATUSES.includes(booking.status) && (
            <View style={styles.cancelSection}>
              {cancelError && <Text style={styles.errorText}>{cancelError}</Text>}
              <PrimaryButton label={cancelling ? 'Cancelling…' : 'Cancel booking'} onPress={confirmCancel} loading={cancelling} variant="danger" />
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Booking history</Text>
            {booking.statusHistory.map((h, i) => (
              <Text key={i} style={styles.historyLine}>
                {formatDateTime(h.createdAt)}: {h.fromStatus} → {h.toStatus}{h.reason ? ` (${h.reason})` : ''}
              </Text>
            ))}
          </View>
        </>
      )}
    </ScreenContainer>
  );
}

function StatusBadge({ status }: { status: Booking['status'] }) {
  const good = TERMINAL_GOOD.includes(status);
  const bad = TERMINAL_BAD.includes(status);
  return (
    <View style={[styles.badge, good && styles.badgeGood, bad && styles.badgeBad]}>
      <Text style={[styles.badgeText, good && styles.badgeTextGood, bad && styles.badgeTextBad]}>{BOOKING_STATUS_LABEL[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { backgroundColor: colors.dangerBg, borderRadius: 12, padding: spacing.lg, marginBottom: spacing.md },
  noticeText: { fontSize: 13, color: colors.danger },
  infoNotice: { backgroundColor: `${colors.sand}80`, borderRadius: 12, padding: spacing.lg, marginBottom: spacing.md },
  infoNoticeText: { fontSize: 13, color: colors.dusk700 },
  loading: { paddingVertical: spacing.xxl, alignItems: 'center' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.md, gap: spacing.sm },
  flex1: { flex: 1 },
  title: { fontSize: 20, fontWeight: '700', color: colors.dusk900 },
  subtitle: { fontSize: 12, color: colors.dusk500, marginTop: 2 },
  badge: { backgroundColor: colors.sand, borderRadius: radius.pill, paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xs },
  badgeGood: { backgroundColor: colors.successBg },
  badgeBad: { backgroundColor: colors.dangerBg },
  badgeText: { fontSize: 11, fontWeight: '600', color: colors.dusk700 },
  badgeTextGood: { color: colors.success },
  badgeTextBad: { color: colors.danger },
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.sand, borderRadius: radius.lg, padding: spacing.lg - 2, marginBottom: spacing.md },
  cardMeta: { fontSize: 12, color: colors.dusk500, marginBottom: spacing.sm },
  cardTitle: { fontSize: 13, fontWeight: '600', color: colors.dusk700, marginBottom: spacing.sm },
  segmentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.xs, borderTopWidth: 1, borderTopColor: colors.sand, marginTop: spacing.xs },
  segmentFlight: { fontSize: 11, color: colors.dusk500, width: 70 },
  segmentTime: { fontSize: 12, color: colors.dusk900, flexShrink: 1 },
  segmentArrow: { fontSize: 12, color: colors.dusk500 },
  infoGrid: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  infoCard: { flex: 1, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.sand, borderRadius: radius.md, padding: spacing.md },
  infoTitle: { fontSize: 12, fontWeight: '600', color: colors.dusk700, marginBottom: spacing.xs },
  infoBody: { fontSize: 12, color: colors.dusk500, marginBottom: 2 },
  totalAmount: { fontSize: 20, fontWeight: '700', color: colors.dusk900, marginBottom: spacing.xs },
  cancelSection: { marginBottom: spacing.md },
  errorText: { color: colors.danger, fontSize: 13, marginBottom: spacing.sm },
  historyLine: { fontSize: 11, color: colors.dusk500, marginBottom: 2 },
});
