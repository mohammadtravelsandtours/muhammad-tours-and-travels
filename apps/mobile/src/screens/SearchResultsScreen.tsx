import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer } from '@/components/ScreenContainer';
import { OfferCard } from '@/components/OfferCard';
import { apiClient, ApiError } from '@/lib/api-client';
import { FlightOffer, SearchResult } from '@/lib/flight-types';
import { SearchStackParamList } from '@/navigation/types';
import { colors, spacing } from '@/theme/colors';

type SortKey = 'best' | 'price' | 'duration' | 'stops';
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'best', label: 'Best' },
  { key: 'price', label: 'Cheapest' },
  { key: 'duration', label: 'Fastest' },
  { key: 'stops', label: 'Fewest stops' },
];

/** Sums every leg (1 stop each way = 2) — per-leg max is what "fewest stops" should compare, same fix as the web results page. */
function maxLegStops(offer: FlightOffer): number {
  if (offer.legs && offer.legs.length > 0) return Math.max(...offer.legs.map((l) => l.stops));
  return offer.stops;
}

function bestScore(offer: FlightOffer, bounds: { minPrice: number; maxPrice: number; minDuration: number; maxDuration: number }): number {
  const priceRange = bounds.maxPrice - bounds.minPrice || 1;
  const durationRange = bounds.maxDuration - bounds.minDuration || 1;
  const priceScore = (offer.totalFare - bounds.minPrice) / priceRange;
  const durationScore = (offer.totalDurationMinutes - bounds.minDuration) / durationRange;
  return priceScore * 0.6 + durationScore * 0.4;
}

export function SearchResultsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<SearchStackParamList, 'SearchResults'>>();
  const route = useRoute<RouteProp<SearchStackParamList, 'SearchResults'>>();
  const { searchId } = route.params;

  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('best');

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getSearch(searchId)
      .then((r) => !cancelled && setResult(r))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : 'Could not load these results.'));
    return () => {
      cancelled = true;
    };
  }, [searchId]);

  const bounds = result
    ? {
        minPrice: Math.min(...result.offers.map((o) => o.totalFare), Infinity),
        maxPrice: Math.max(...result.offers.map((o) => o.totalFare), -Infinity),
        minDuration: Math.min(...result.offers.map((o) => o.totalDurationMinutes), Infinity),
        maxDuration: Math.max(...result.offers.map((o) => o.totalDurationMinutes), -Infinity),
      }
    : { minPrice: 0, maxPrice: 0, minDuration: 0, maxDuration: 0 };

  const offers = result
    ? [...result.offers].sort((a, b) => {
        if (sort === 'price') return a.totalFare - b.totalFare;
        if (sort === 'duration') return a.totalDurationMinutes - b.totalDurationMinutes;
        if (sort === 'stops') return maxLegStops(a) - maxLegStops(b);
        return bestScore(a, bounds) - bestScore(b, bounds);
      })
    : [];

  return (
    <ScreenContainer>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{result ? `${result.offerCount} fare${result.offerCount === 1 ? '' : 's'} found` : 'Searching…'}</Text>
        <Pressable onPress={() => navigation.navigate('Search')}>
          <Text style={styles.link}>New search</Text>
        </Pressable>
      </View>

      {error && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{error} — the search may have expired after 30 minutes.</Text>
        </View>
      )}

      {!error && !result && (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.tangerine} />
        </View>
      )}

      {result && result.offers.length === 0 && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>No fares matched this search. Try different dates or airports.</Text>
        </View>
      )}

      {result && result.offers.length > 0 && (
        <>
          <View style={styles.sortRow}>
            <Text style={styles.sortLabel}>Sort:</Text>
            {SORTS.map((s) => (
              <Pressable key={s.key} onPress={() => setSort(s.key)}>
                <Text style={[styles.sortOption, sort === s.key && styles.sortOptionActive]}>{s.label}</Text>
              </Pressable>
            ))}
          </View>
          {offers.map((offer) => (
            <OfferCard key={offer.id} offer={offer} onPress={() => navigation.navigate('OfferDetail', { offerId: offer.id })} />
          ))}
        </>
      )}

      {result?.supplierRuns?.some((r) => r.status !== 'SUCCESS') && (
        <View style={styles.supplierStatus}>
          <Text style={styles.supplierTitle}>Supplier status</Text>
          {result.supplierRuns.map((r) => (
            <Text key={r.supplierCode} style={styles.supplierLine}>
              {r.supplierName}: {r.status.toLowerCase()}{r.status !== 'SUCCESS' && r.errorMessage ? ` — ${r.errorMessage}` : ''}
            </Text>
          ))}
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  title: { fontSize: 19, fontWeight: '700', color: colors.dusk900, flexShrink: 1 },
  link: { fontSize: 13, color: colors.tangerineDim },
  notice: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.sand, borderRadius: 12, padding: spacing.lg },
  noticeText: { fontSize: 13, color: colors.dusk500 },
  loading: { paddingVertical: spacing.xxl, alignItems: 'center' },
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  sortLabel: { fontSize: 12, color: colors.dusk500 },
  sortOption: { fontSize: 12, color: colors.dusk500 },
  sortOptionActive: { color: colors.dusk900, fontWeight: '700', textDecorationLine: 'underline' },
  supplierStatus: { marginTop: spacing.lg },
  supplierTitle: { fontSize: 12, fontWeight: '600', color: colors.dusk700, marginBottom: spacing.xs },
  supplierLine: { fontSize: 12, color: colors.dusk500 },
});
