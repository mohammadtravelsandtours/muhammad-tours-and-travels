import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AirportInput } from '@/components/AirportInput';
import { DateField } from '@/components/DateField';
import { PrimaryButton } from '@/components/PrimaryButton';
import { apiClient, ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { todayPlus } from '@/lib/format';
import { CabinClass, FlightSearchSegmentInput, TripType } from '@/lib/flight-types';
import { SearchStackParamList } from '@/navigation/types';
import { colors, radius, spacing } from '@/theme/colors';

const TRIP_TYPES: { value: TripType; label: string }[] = [
  { value: 'ONE_WAY', label: 'One way' },
  { value: 'ROUND_TRIP', label: 'Round trip' },
  { value: 'MULTI_CITY', label: 'Multi-city' },
];

const CABINS: { value: CabinClass; label: string }[] = [
  { value: 'ECONOMY', label: 'Economy' },
  { value: 'PREMIUM_ECONOMY', label: 'Premium' },
  { value: 'BUSINESS', label: 'Business' },
  { value: 'FIRST', label: 'First' },
];

function emptySegment(departureDate: string): FlightSearchSegmentInput {
  return { origin: '', destination: '', departureDate };
}

/**
 * Mobile counterpart to apps/web's FlightSearchForm — same POST
 * /flights/search contract and the same "round trip is really two
 * segments under the hood, the UI just shows one From/To pair" behavior
 * (see that component's doc comment). Simplified to always show the full
 * set of controls (no `compact` variant) since there's no homepage-hero
 * placement to economize for on mobile.
 */
export function SearchScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<SearchStackParamList, 'Search'>>();
  const { accessToken } = useAuth();

  const [tripType, setTripType] = useState<TripType>('ROUND_TRIP');
  const [segments, setSegments] = useState<FlightSearchSegmentInput[]>([
    emptySegment(todayPlus(14)),
    emptySegment(todayPlus(21)),
  ]);
  const [cabin, setCabin] = useState<CabinClass>('ECONOMY');
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function setTrip(next: TripType) {
    setTripType(next);
    if (next === 'ONE_WAY') setSegments([segments[0] ?? emptySegment(todayPlus(14))]);
    else if (next === 'ROUND_TRIP') setSegments([segments[0] ?? emptySegment(todayPlus(14)), segments[1] ?? emptySegment(todayPlus(21))]);
    else if (segments.length < 2) setSegments([...segments, emptySegment(todayPlus(21))]);
  }

  const mainOrigin = segments[0]?.origin ?? '';
  const mainDestination = segments[0]?.destination ?? '';

  function setMainOrigin(v: string) {
    setSegments((prev) => prev.map((s, i) => (i === 0 ? { ...s, origin: v } : tripType === 'ROUND_TRIP' && i === 1 ? { ...s, destination: v } : s)));
  }
  function setMainDestination(v: string) {
    setSegments((prev) => prev.map((s, i) => (i === 0 ? { ...s, destination: v } : tripType === 'ROUND_TRIP' && i === 1 ? { ...s, origin: v } : s)));
  }
  function updateSegment(index: number, patch: Partial<FlightSearchSegmentInput>) {
    setSegments((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }
  function addSegment() {
    const last = segments[segments.length - 1];
    setSegments([...segments, emptySegment(last?.departureDate ?? todayPlus(14))]);
  }
  function removeSegment(index: number) {
    setSegments((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    setError(null);
    for (const s of segments) {
      if (s.origin.length !== 3 || s.destination.length !== 3) {
        setError('Choose both a from and a to airport for every flight.');
        return;
      }
      if (s.origin === s.destination) {
        setError('Origin and destination cannot be the same airport.');
        return;
      }
    }
    setSubmitting(true);
    try {
      const result = await apiClient.searchFlights(
        { tripType, cabin, segments, adults, children: children || undefined, infants: infants || undefined, currency: 'USD' },
        accessToken ?? undefined,
      );
      navigation.navigate('SearchResults', { searchId: result.searchId });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Search failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScreenContainer>
      <Text style={styles.title}>Search flights</Text>
      <Text style={styles.subtitle}>One search fans out to every connected supplier at once.</Text>

      <View style={styles.segmentRow}>
        {TRIP_TYPES.map((t) => (
          <Pressable key={t.value} onPress={() => setTrip(t.value)} style={[styles.chip, tripType === t.value && styles.chipActive]}>
            <Text style={[styles.chipText, tripType === t.value && styles.chipTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {tripType !== 'MULTI_CITY' ? (
        <View style={styles.card}>
          <AirportInput label="From" value={mainOrigin} onChange={setMainOrigin} placeholder="City or airport" />
          <AirportInput label="To" value={mainDestination} onChange={setMainDestination} placeholder="City or airport" />
          <DateField label="Depart" value={segments[0]?.departureDate ?? ''} minimumDate={new Date()} onChange={(v) => updateSegment(0, { departureDate: v })} />
          {tripType === 'ROUND_TRIP' && (
            <DateField
              label="Return"
              value={segments[1]?.departureDate ?? ''}
              minimumDate={segments[0]?.departureDate ? new Date(segments[0].departureDate) : new Date()}
              onChange={(v) => updateSegment(1, { departureDate: v })}
            />
          )}
        </View>
      ) : (
        <>
          {segments.map((segment, i) => (
            <View key={i} style={styles.card}>
              <View style={styles.legHeader}>
                <Text style={styles.legTitle}>Flight {i + 1}</Text>
                {segments.length > 2 && (
                  <Pressable onPress={() => removeSegment(i)}>
                    <Text style={styles.remove}>Remove</Text>
                  </Pressable>
                )}
              </View>
              <AirportInput label="From" value={segment.origin} onChange={(v) => updateSegment(i, { origin: v })} placeholder="City or airport" />
              <AirportInput label="To" value={segment.destination} onChange={(v) => updateSegment(i, { destination: v })} placeholder="City or airport" />
              <DateField label="Date" value={segment.departureDate} minimumDate={new Date()} onChange={(v) => updateSegment(i, { departureDate: v })} />
            </View>
          ))}
          {segments.length < 6 && (
            <Pressable onPress={addSegment}>
              <Text style={styles.addLeg}>+ Add another flight</Text>
            </Pressable>
          )}
        </>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Travelers</Text>
        <PaxRow label="Adults" sublabel="12+ years" value={adults} min={1} max={9} onChange={(v) => { setAdults(v); setInfants((p) => Math.min(p, v)); }} />
        <PaxRow label="Children" sublabel="2–11 years" value={children} min={0} max={8} onChange={setChildren} />
        <PaxRow label="Infants" sublabel="Under 2 years" value={infants} min={0} max={adults} onChange={setInfants} />

        <Text style={[styles.cardTitle, { marginTop: spacing.lg }]}>Cabin class</Text>
        <View style={styles.segmentRow}>
          {CABINS.map((c) => (
            <Pressable key={c.value} onPress={() => setCabin(c.value)} style={[styles.chip, cabin === c.value && styles.chipActive]}>
              <Text style={[styles.chipText, cabin === c.value && styles.chipTextActive]}>{c.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}
      <PrimaryButton label={submitting ? 'Searching…' : 'Search flights'} onPress={handleSubmit} loading={submitting} />
    </ScreenContainer>
  );
}

function PaxRow({ label, sublabel, value, min, max, onChange }: { label: string; sublabel: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <View style={styles.paxRow}>
      <View>
        <Text style={styles.paxLabel}>{label}</Text>
        <Text style={styles.paxSublabel}>{sublabel}</Text>
      </View>
      <View style={styles.paxControls}>
        <Pressable disabled={value <= min} onPress={() => onChange(Math.max(min, value - 1))} style={[styles.paxButton, value <= min && styles.paxButtonDisabled]}>
          <Text style={styles.paxButtonText}>−</Text>
        </Pressable>
        <Text style={styles.paxValue}>{value}</Text>
        <Pressable disabled={value >= max} onPress={() => onChange(Math.min(max, value + 1))} style={[styles.paxButton, value >= max && styles.paxButtonDisabled]}>
          <Text style={styles.paxButtonText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '700', color: colors.dusk900, marginTop: spacing.sm },
  subtitle: { fontSize: 13, color: colors.dusk500, marginTop: spacing.xs, marginBottom: spacing.lg },
  segmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.sand },
  chipActive: { backgroundColor: colors.dusk900, borderColor: colors.dusk900 },
  chipText: { fontSize: 13, color: colors.dusk700 },
  chipTextActive: { color: colors.white, fontWeight: '600' },
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.sand,
    borderRadius: radius.lg,
    padding: spacing.lg - 2,
    marginBottom: spacing.md,
  },
  cardTitle: { fontSize: 14, fontWeight: '600', color: colors.dusk900, marginBottom: spacing.sm },
  legHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  legTitle: { fontSize: 14, fontWeight: '600', color: colors.dusk900 },
  remove: { fontSize: 12, color: colors.dusk500 },
  addLeg: { fontSize: 14, color: colors.tangerineDim, marginBottom: spacing.md },
  paxRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm },
  paxLabel: { fontSize: 14, color: colors.dusk900 },
  paxSublabel: { fontSize: 12, color: colors.dusk500 },
  paxControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  paxButton: { width: 28, height: 28, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.sand, alignItems: 'center', justifyContent: 'center' },
  paxButtonDisabled: { opacity: 0.4 },
  paxButtonText: { fontSize: 16, color: colors.dusk700 },
  paxValue: { fontSize: 15, fontWeight: '600', color: colors.dusk900, width: 20, textAlign: 'center' },
  error: { color: colors.danger, fontSize: 13, marginBottom: spacing.md },
});
