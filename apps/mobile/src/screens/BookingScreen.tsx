import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer } from '@/components/ScreenContainer';
import { LabeledInput } from '@/components/LabeledInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SignInRequired } from '@/components/SignInRequired';
import { apiClient, ApiError, isPriceConfirmationRequired, newIdempotencyKey } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { FlightOffer, PassengerInput, PassengerType } from '@/lib/flight-types';
import { legLabel, legsFor, routeSummary } from '@/lib/itinerary';
import { formatDuration, formatMoney, formatTime, stopsLabel } from '@/lib/format';
import { SearchStackParamList } from '@/navigation/types';
import { colors, radius, spacing } from '@/theme/colors';

const STEPS = ['Travelers', 'Contact', 'Review'] as const;
const TITLES_BY_TYPE: Record<PassengerType, string[]> = {
  ADULT: ['Mr', 'Mrs', 'Ms', 'Mx'],
  CHILD: ['Mstr', 'Miss'],
  INFANT: ['Mstr', 'Miss'],
};

function blankPassenger(type: PassengerType): PassengerInput {
  return { type, title: TITLES_BY_TYPE[type][0], firstName: '', lastName: '', dateOfBirth: '' };
}

function buildInitialPassengers(counts?: { adults: number; children: number; infants: number }): PassengerInput[] {
  if (!counts) return [blankPassenger('ADULT')];
  const list: PassengerInput[] = [];
  for (let i = 0; i < counts.adults; i++) list.push(blankPassenger('ADULT'));
  for (let i = 0; i < counts.children; i++) list.push(blankPassenger('CHILD'));
  for (let i = 0; i < counts.infants; i++) list.push(blankPassenger('INFANT'));
  return list;
}

/**
 * Mobile counterpart to apps/web's /offers/[offerId]/book page — same
 * three-step flow (travelers → contact → review-and-reprice-and-confirm),
 * same idempotency-key/price-confirmation handling against POST /bookings.
 * Gated by SignInRequired instead of a route redirect (see that
 * component's doc comment for why).
 */
export function BookingScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<SearchStackParamList, 'Booking'>>();
  const route = useRoute<RouteProp<SearchStackParamList, 'Booking'>>();
  const { offerId } = route.params;
  const { user, accessToken } = useAuth();

  const [offer, setOffer] = useState<FlightOffer | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  const [passengers, setPassengers] = useState<PassengerInput[]>([]);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  const [reviewError, setReviewError] = useState<string | null>(null);
  const [previewTotal, setPreviewTotal] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [priceConfirm, setPriceConfirm] = useState<{ previousTotal: number; newTotal: number; currency: string } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const idempotencyKey = useMemo(() => newIdempotencyKey(), [offerId]);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getOffer(offerId)
      .then((o) => {
        if (cancelled) return;
        setOffer(o);
        setPassengers(buildInitialPassengers(o.passengerCounts));
      })
      .catch((err) => !cancelled && setLoadError(err instanceof ApiError ? err.message : 'Could not load this fare.'));
    return () => {
      cancelled = true;
    };
  }, [offerId]);

  useEffect(() => {
    if (user) {
      setContactName((prev) => prev || user.fullName);
      setContactEmail((prev) => prev || user.email);
    }
  }, [user]);

  if (!user) {
    return (
      <ScreenContainer>
        <SignInRequired message="Sign in or create an account to book this fare." />
      </ScreenContainer>
    );
  }

  function updatePassenger(index: number, patch: Partial<PassengerInput>) {
    setPassengers((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function validatePassengers(): string | null {
    for (const [i, p] of passengers.entries()) {
      if (!p.firstName.trim() || !p.lastName.trim() || !p.dateOfBirth) {
        return `Passenger ${i + 1}: first name, last name, and date of birth are required.`;
      }
    }
    return null;
  }

  function validateContact(): string | null {
    if (!contactName.trim()) return 'Contact name is required.';
    if (!/^\S+@\S+\.\S+$/.test(contactEmail)) return 'Enter a valid contact email.';
    if (!/^\+?[0-9]{7,15}$/.test(contactPhone)) return 'Enter a valid contact phone number (e.g. +8801XXXXXXXXX).';
    return null;
  }

  async function goToReview() {
    const err = validateContact();
    if (err) {
      setReviewError(err);
      return;
    }
    setReviewError(null);
    setStep(2);
    setPreviewLoading(true);
    try {
      const preview = await apiClient.repriceOffer(offerId);
      setPreviewTotal(preview.stillAvailable ? preview.newTotal : null);
      if (!preview.stillAvailable) setReviewError('This fare is no longer available from the supplier. Please search again.');
    } catch {
      setPreviewTotal(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function submitBooking(acceptedTotalFare?: number) {
    if (!offer || !accessToken) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await apiClient.createBooking(
        { offerId: offer.id, passengers, contactName, contactEmail, contactPhone, acceptedTotalFare },
        accessToken,
        idempotencyKey,
      );
      if (isPriceConfirmationRequired(result)) {
        setPriceConfirm({ previousTotal: result.previousTotal, newTotal: result.newTotal, currency: result.currency });
        return;
      }
      navigation.replace('BookingDetail', { id: result.id });
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Could not complete the booking. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const legs = offer ? legsFor(offer) : [];

  return (
    <ScreenContainer>
      {loadError && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{loadError}</Text>
        </View>
      )}
      {!loadError && !offer && (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.tangerine} />
        </View>
      )}

      {offer && (
        <>
          <View style={styles.stepsRow}>
            {STEPS.map((label, i) => (
              <View key={label} style={styles.stepItem}>
                <View style={[styles.stepDot, i <= step && styles.stepDotActive]}>
                  <Text style={[styles.stepDotText, i <= step && styles.stepDotTextActive]}>{i + 1}</Text>
                </View>
                <Text style={[styles.stepLabel, i === step && styles.stepLabelActive]}>{label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryText}>
              {routeSummary(legs)}
              {legs.map((leg, i) => (
                <Text key={i}>
                  {' · '}
                  {legLabel(i, legs.length) ? `${legLabel(i, legs.length)} ` : ''}
                  {formatTime(leg.departureAt)} · {formatDuration(leg.durationMinutes)} · {stopsLabel(leg.stops)}
                </Text>
              ))}
            </Text>
            <Text style={styles.summaryPrice}>{formatMoney(offer.totalFare, offer.currency)}</Text>
          </View>

          {step === 0 && (
            <View>
              {passengers.map((p, i) => (
                <View key={i} style={styles.card}>
                  <Text style={styles.cardTitle}>Passenger {i + 1} · {p.type.toLowerCase()}</Text>
                  <View style={styles.titleRow}>
                    {TITLES_BY_TYPE[p.type].map((t) => (
                      <Pressable key={t} onPress={() => updatePassenger(i, { title: t })} style={[styles.titleChip, p.title === t && styles.titleChipActive]}>
                        <Text style={[styles.titleChipText, p.title === t && styles.titleChipTextActive]}>{t}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <LabeledInput label="First name" value={p.firstName} onChangeText={(v) => updatePassenger(i, { firstName: v })} />
                  <LabeledInput label="Last name" value={p.lastName} onChangeText={(v) => updatePassenger(i, { lastName: v })} />
                  <LabeledInput label="Date of birth (YYYY-MM-DD)" value={p.dateOfBirth} onChangeText={(v) => updatePassenger(i, { dateOfBirth: v })} placeholder="1990-01-31" />
                  <LabeledInput label="Nationality (optional)" value={p.nationality ?? ''} onChangeText={(v) => updatePassenger(i, { nationality: v || undefined })} />
                  <LabeledInput label="Passport number (optional)" value={p.passportNumber ?? ''} onChangeText={(v) => updatePassenger(i, { passportNumber: v || undefined })} />
                </View>
              ))}
              {reviewError && <Text style={styles.error}>{reviewError}</Text>}
              <PrimaryButton
                label="Continue"
                onPress={() => {
                  const err = validatePassengers();
                  if (err) setReviewError(err);
                  else {
                    setReviewError(null);
                    setStep(1);
                  }
                }}
              />
            </View>
          )}

          {step === 1 && (
            <View>
              <View style={styles.card}>
                <LabeledInput label="Contact name" value={contactName} onChangeText={setContactName} />
                <LabeledInput label="Contact email" value={contactEmail} onChangeText={setContactEmail} keyboardType="email-address" autoCapitalize="none" />
                <LabeledInput label="Contact phone" value={contactPhone} onChangeText={setContactPhone} placeholder="+8801XXXXXXXXX" keyboardType="phone-pad" />
              </View>
              {reviewError && <Text style={styles.error}>{reviewError}</Text>}
              <View style={styles.buttonRow}>
                <Pressable onPress={() => setStep(0)} style={styles.backButton}>
                  <Text style={styles.backText}>Back</Text>
                </Pressable>
                <View style={styles.flex1}>
                  <PrimaryButton label="Review booking" onPress={goToReview} variant="secondary" />
                </View>
              </View>
            </View>
          )}

          {step === 2 && (
            <View>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Travelers</Text>
                {passengers.map((p, i) => (
                  <Text key={i} style={styles.reviewLine}>{p.title} {p.firstName} {p.lastName} · {p.type.toLowerCase()}</Text>
                ))}
                <Text style={[styles.cardTitle, { marginTop: spacing.md }]}>Contact</Text>
                <Text style={styles.reviewLine}>{contactName} · {contactEmail} · {contactPhone}</Text>
              </View>

              <View style={styles.card}>
                <View style={styles.priceRow}>
                  <Text style={styles.priceRowLabel}>
                    {previewLoading ? 'Checking current price…' : 'Price re-verified with the supplier'}
                  </Text>
                  <Text style={styles.priceRowValue}>{formatMoney(previewTotal ?? offer.totalFare, offer.currency)}</Text>
                </View>
                {previewTotal !== null && previewTotal !== offer.totalFare && (
                  <Text style={styles.priceChangedNote}>
                    Price changed since search (was {formatMoney(offer.totalFare, offer.currency)}); re-confirmed again on submit.
                  </Text>
                )}
              </View>

              {reviewError && <Text style={styles.error}>{reviewError}</Text>}
              {submitError && <Text style={styles.error}>{submitError}</Text>}

              {priceConfirm ? (
                <View style={styles.priceConfirmBox}>
                  <Text style={styles.priceConfirmText}>
                    The supplier's price just changed: previously {formatMoney(priceConfirm.previousTotal, priceConfirm.currency)}, now{' '}
                    {formatMoney(priceConfirm.newTotal, priceConfirm.currency)}. Continue at the new price?
                  </Text>
                  <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
                    <PrimaryButton
                      label={submitting ? 'Booking…' : `Accept ${formatMoney(priceConfirm.newTotal, priceConfirm.currency)} and book`}
                      onPress={() => submitBooking(priceConfirm.newTotal)}
                      loading={submitting}
                    />
                    <PrimaryButton label="Cancel" onPress={() => setPriceConfirm(null)} variant="secondary" />
                  </View>
                </View>
              ) : (
                <View style={styles.buttonRow}>
                  <Pressable onPress={() => setStep(1)} style={styles.backButton}>
                    <Text style={styles.backText}>Back</Text>
                  </Pressable>
                  <View style={styles.flex1}>
                    <PrimaryButton label={submitting ? 'Booking…' : 'Confirm and book'} onPress={() => submitBooking()} loading={submitting || previewLoading} />
                  </View>
                </View>
              )}
            </View>
          )}
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  notice: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.sand, borderRadius: 12, padding: spacing.lg },
  noticeText: { fontSize: 13, color: colors.danger },
  loading: { paddingVertical: spacing.xxl, alignItems: 'center' },
  stepsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.lg },
  stepItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  stepDot: { width: 22, height: 22, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.sand, alignItems: 'center', justifyContent: 'center' },
  stepDotActive: { backgroundColor: colors.tangerine, borderColor: colors.tangerine },
  stepDotText: { fontSize: 11, color: colors.dusk500 },
  stepDotTextActive: { color: colors.white, fontWeight: '700' },
  stepLabel: { fontSize: 11, color: colors.dusk500 },
  stepLabelActive: { color: colors.dusk900, fontWeight: '600' },
  summaryCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.sand, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  summaryText: { fontSize: 12, color: colors.dusk700, flex: 1 },
  summaryPrice: { fontSize: 14, fontWeight: '700', color: colors.dusk900 },
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.sand, borderRadius: radius.lg, padding: spacing.lg - 2, marginBottom: spacing.md },
  cardTitle: { fontSize: 14, fontWeight: '600', color: colors.dusk900, marginBottom: spacing.sm },
  titleRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  titleChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.sand },
  titleChipActive: { backgroundColor: colors.dusk900, borderColor: colors.dusk900 },
  titleChipText: { fontSize: 12, color: colors.dusk700 },
  titleChipTextActive: { color: colors.white, fontWeight: '600' },
  error: { color: colors.danger, fontSize: 13, marginBottom: spacing.md },
  buttonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  backButton: { paddingVertical: spacing.md, paddingHorizontal: spacing.sm },
  backText: { color: colors.dusk500, fontSize: 14 },
  flex1: { flex: 1 },
  reviewLine: { fontSize: 13, color: colors.dusk700, marginBottom: 2 },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  priceRowLabel: { fontSize: 12, color: colors.dusk500, flex: 1 },
  priceRowValue: { fontSize: 20, fontWeight: '700', color: colors.dusk900 },
  priceChangedNote: { fontSize: 11, color: colors.tangerineDim, marginTop: spacing.sm },
  priceConfirmBox: { backgroundColor: `${colors.sand}80`, borderRadius: radius.md, padding: spacing.md },
  priceConfirmText: { fontSize: 13, color: colors.dusk700 },
});
