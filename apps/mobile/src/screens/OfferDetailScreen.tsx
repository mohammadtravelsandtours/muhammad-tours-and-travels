import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer } from '@/components/ScreenContainer';
import { PrimaryButton } from '@/components/PrimaryButton';
import { apiClient, ApiError } from '@/lib/api-client';
import { FlightOffer } from '@/lib/flight-types';
import { legLabel, legsFor, routeSummary } from '@/lib/itinerary';
import { formatDate, formatDuration, formatLayover, formatMoney, formatTime, stopsLabel } from '@/lib/format';
import { SearchStackParamList } from '@/navigation/types';
import { colors, radius, spacing } from '@/theme/colors';

export function OfferDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<SearchStackParamList, 'OfferDetail'>>();
  const route = useRoute<RouteProp<SearchStackParamList, 'OfferDetail'>>();
  const { offerId } = route.params;

  const [offer, setOffer] = useState<FlightOffer | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getOffer(offerId)
      .then((o) => !cancelled && setOffer(o))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : 'Could not load this fare.'));
    return () => {
      cancelled = true;
    };
  }, [offerId]);

  const legs = offer ? legsFor(offer) : [];

  return (
    <ScreenContainer>
      {error && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{error} — this fare may have expired. Please search again.</Text>
        </View>
      )}

      {!error && !offer && (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.tangerine} />
        </View>
      )}

      {offer && (
        <>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{routeSummary(legs)}</Text>
            {offer.isMock && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>DEMO / MOCK</Text>
              </View>
            )}
          </View>
          <Text style={styles.subtitle}>
            {offer.fareFamily} · {offer.cabin.replace('_', ' ')}
          </Text>

          {legs.map((leg, li) => (
            <View key={li}>
              {legLabel(li, legs.length) && (
                <Text style={styles.legHeader}>
                  {legLabel(li, legs.length)} · {formatDate(leg.departureAt)} · {formatDuration(leg.durationMinutes)} ·{' '}
                  {stopsLabel(leg.stops)}
                </Text>
              )}
              <View style={styles.card}>
                {leg.segments.map((s, i) => (
                  <View key={i} style={[styles.segment, i > 0 && styles.segmentBorder]}>
                    <Text style={styles.segmentFlight}>{s.marketingCarrier} {s.flightNumber}</Text>
                    <View style={styles.segmentRow}>
                      <Text style={styles.segmentTime}>{formatTime(s.departureAt)} {s.origin}</Text>
                      <Text style={styles.segmentDuration}>{formatDuration(s.durationMinutes)}</Text>
                      <Text style={styles.segmentTime}>{formatTime(s.arrivalAt)} {s.destination}</Text>
                    </View>
                    <Text style={styles.segmentMeta}>
                      {formatDate(s.departureAt)} · {s.bookingClass} class{s.aircraft ? ` · ${s.aircraft}` : ''}
                    </Text>
                    {i < leg.segments.length - 1 && (
                      <Text style={styles.layover}>
                        {leg.layovers[i] ? formatLayover(leg.layovers[i].airport, leg.layovers[i].minutes) : `Layover in ${s.destination}`}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            </View>
          ))}

          <View style={styles.infoGrid}>
            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>Baggage</Text>
              <Text style={styles.infoBody}>
                {offer.baggage.note ?? `${offer.baggage.checkedKg ?? 0}kg checked, ${offer.baggage.carryOnKg ?? 0}kg carry-on`}
              </Text>
            </View>
            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>Fare rules</Text>
              <Text style={styles.infoBody}>
                {offer.refundable ? 'Refundable' : 'Non-refundable'} · {offer.changeable ? 'Changeable' : 'No changes allowed'}
                {offer.ticketingDeadline ? `\nTicketing deadline: ${formatDate(offer.ticketingDeadline)}` : ''}
              </Text>
            </View>
          </View>

          {offer.transitVisaWarning && (
            <View style={styles.warning}>
              <Text style={styles.warningText}>
                ⚠ {offer.transitVisaWarning} This is general guidance only — always confirm with the relevant embassy or airline.
              </Text>
            </View>
          )}

          <View style={styles.priceCard}>
            <View>
              <Text style={styles.priceLabel}>Total price, all passengers</Text>
              <Text style={styles.price}>{formatMoney(offer.totalFare, offer.currency)}</Text>
            </View>
          </View>
          <PrimaryButton label="Continue to booking" onPress={() => navigation.navigate('Booking', { offerId: offer.id })} />
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  notice: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.sand, borderRadius: 12, padding: spacing.lg },
  noticeText: { fontSize: 13, color: colors.danger },
  loading: { paddingVertical: spacing.xxl, alignItems: 'center' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  title: { fontSize: 21, fontWeight: '700', color: colors.dusk900, flexShrink: 1 },
  badge: { backgroundColor: `${colors.tangerine}22`, borderRadius: radius.pill, paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xs },
  badgeText: { fontSize: 11, color: colors.tangerineDim, fontWeight: '600' },
  subtitle: { fontSize: 13, color: colors.dusk500, marginTop: spacing.xs, marginBottom: spacing.lg },
  legHeader: { fontSize: 11, fontWeight: '700', color: colors.dusk500, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: spacing.xs, marginTop: spacing.sm },
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.sand, borderRadius: radius.lg, padding: spacing.lg - 2, marginBottom: spacing.md },
  segment: { paddingVertical: spacing.sm },
  segmentBorder: { borderTopWidth: 1, borderTopColor: colors.sand, marginTop: spacing.sm },
  segmentFlight: { fontSize: 12, color: colors.dusk500, marginBottom: spacing.xs },
  segmentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  segmentTime: { fontSize: 14, fontWeight: '600', color: colors.dusk900 },
  segmentDuration: { fontSize: 12, color: colors.dusk500 },
  segmentMeta: { fontSize: 12, color: colors.dusk500, marginTop: 2 },
  layover: { fontSize: 11, color: colors.dusk500, marginTop: 4, fontStyle: 'italic' },
  infoGrid: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  infoCard: { flex: 1, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.sand, borderRadius: radius.md, padding: spacing.md },
  infoTitle: { fontSize: 12, fontWeight: '600', color: colors.dusk700 },
  infoBody: { fontSize: 13, color: colors.dusk500, marginTop: spacing.xs },
  warning: { backgroundColor: `${colors.sand}80`, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  warningText: { fontSize: 12, color: colors.dusk700 },
  priceCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.sand, borderRadius: radius.lg, padding: spacing.lg - 2, marginBottom: spacing.md },
  priceLabel: { fontSize: 12, color: colors.dusk500 },
  price: { fontSize: 28, fontWeight: '700', color: colors.dusk900, marginTop: 2 },
});
