import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FlightOffer } from '@/lib/flight-types';
import { legLabel, legsFor } from '@/lib/itinerary';
import { formatDuration, formatLayover, formatMoney, formatTime, stopsLabel } from '@/lib/format';
import { colors, radius, spacing } from '@/theme/colors';

export function OfferCard({ offer, onPress }: { offer: FlightOffer; onPress: () => void }) {
  const legs = legsFor(offer);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.row}>
        <View style={styles.flex1}>
          <Text style={styles.eyebrow}>{offer.isMock ? 'DEMO fare' : offer.validatingCarrier}</Text>
          {legs.map((leg, i) => (
            <View key={i} style={i > 0 ? styles.legSpacing : undefined}>
              {legLabel(i, legs.length) && <Text style={styles.legLabel}>{legLabel(i, legs.length)}</Text>}
              <Text style={styles.time}>
                {formatTime(leg.departureAt)} {leg.origin} → {formatTime(leg.arrivalAt)} {leg.destination}
              </Text>
              <Text style={styles.meta}>
                {formatDuration(leg.durationMinutes)} · {stopsLabel(leg.stops)}
                {leg.layovers.length > 0 ? ` · ${leg.layovers.map((l) => formatLayover(l.airport, l.minutes)).join(', ')}` : ''}
              </Text>
            </View>
          ))}
        </View>
        <View style={styles.priceCol}>
          <Text style={styles.price}>{formatMoney(offer.totalFare, offer.currency)}</Text>
          <Text style={styles.metaRight}>{offer.fareFamily} · {offer.cabin.replace('_', ' ')}</Text>
          <Text style={styles.metaRight}>{offer.refundable ? 'Refundable' : 'Non-refundable'}</Text>
        </View>
      </View>

      <Text style={styles.baggage} numberOfLines={2}>
        Baggage: {offer.baggage.note ?? `${offer.baggage.checkedKg ?? 0}kg checked, ${offer.baggage.carryOnKg ?? 0}kg carry-on`}
        {offer.isMock ? '  ·  DEMO / MOCK — not a real fare' : ''}
      </Text>

      {offer.transitVisaWarning && (
        <View style={styles.warning}>
          <Text style={styles.warningText}>⚠ {offer.transitVisaWarning}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.sand,
    borderRadius: radius.lg,
    padding: spacing.lg - 2,
    marginBottom: spacing.md - 2,
  },
  pressed: { borderColor: colors.tangerine },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  flex1: { flex: 1 },
  eyebrow: { fontSize: 12, color: colors.dusk500, marginBottom: 2 },
  legSpacing: { marginTop: spacing.sm },
  legLabel: { fontSize: 10, fontWeight: '700', color: colors.dusk500, textTransform: 'uppercase', letterSpacing: 0.4 },
  time: { fontSize: 18, fontWeight: '600', color: colors.dusk900, marginTop: 2 },
  meta: { fontSize: 12, color: colors.dusk500, marginTop: 2 },
  priceCol: { alignItems: 'flex-end' },
  price: { fontSize: 20, fontWeight: '700', color: colors.dusk900 },
  metaRight: { fontSize: 11, color: colors.dusk500, marginTop: 2, textAlign: 'right' },
  baggage: { fontSize: 12, color: colors.dusk500, marginTop: spacing.sm + 2 },
  warning: { marginTop: spacing.sm, backgroundColor: `${colors.sand}80`, borderRadius: radius.sm - 2, padding: spacing.sm + 2 },
  warningText: { fontSize: 12, color: colors.dusk500 },
});
