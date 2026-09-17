import { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { ScreenContainer } from '@/components/ScreenContainer';
import { LabeledInput } from '@/components/LabeledInput';
import { PrimaryButton } from '@/components/PrimaryButton';
import { MANAGE_BOOKING_AIRLINES } from '@/lib/manage-booking-airlines';
import { colors, radius, spacing } from '@/theme/colors';

/**
 * Mobile counterpart to apps/web's /manage-booking page — same honest
 * limit as that page's doc comment: this never touches an airline
 * reservation directly, it hands the traveler their PNR/last name to
 * paste into the airline's own manage-booking page, which opens in the
 * device browser.
 */
export function ManageBookingScreen() {
  const [iataCode, setIataCode] = useState('');
  const [pnr, setPnr] = useState('');
  const [lastName, setLastName] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const airline = MANAGE_BOOKING_AIRLINES.find((a) => a.iataCode === iataCode);

  async function copy(value: string, label: string) {
    if (!value) return;
    try {
      await Clipboard.setStringAsync(value);
      Alert.alert('Copied', `${label} copied to clipboard.`);
    } catch {
      // Clipboard access failing isn't worth surfacing as an error — the
      // field's value is still visible to copy by hand.
    }
  }

  async function handleContinue() {
    if (!airline) return;
    const supported = await Linking.canOpenURL(airline.manageBookingUrl).catch(() => false);
    if (supported) Linking.openURL(airline.manageBookingUrl);
    else Alert.alert('Could not open link', `Visit ${airline.manageBookingUrl} in your browser.`);
  }

  return (
    <ScreenContainer>
      <Text style={styles.title}>Manage your booking</Text>
      <Text style={styles.subtitle}>
        Choose the airline your ticket was issued on, then continue to that airline's own manage-booking page with your
        booking reference (PNR) and last name ready to paste in. We don't hold or change airline reservations directly
        here.
      </Text>

      <View style={styles.card}>
        <Text style={styles.label}>Airline</Text>
        <Pressable onPress={() => setPickerOpen((o) => !o)} style={styles.picker}>
          <Text style={airline ? styles.pickerValue : styles.pickerPlaceholder}>
            {airline ? `${airline.name} (${airline.iataCode})` : 'Select an airline…'}
          </Text>
        </Pressable>
        {pickerOpen && (
          <View style={styles.dropdown}>
            {MANAGE_BOOKING_AIRLINES.map((a) => (
              <Pressable
                key={a.iataCode}
                onPress={() => {
                  setIataCode(a.iataCode);
                  setPickerOpen(false);
                }}
                style={styles.dropdownOption}
              >
                <Text style={styles.dropdownOptionText}>{a.name} ({a.iataCode})</Text>
              </Pressable>
            ))}
          </View>
        )}

        <View style={styles.row}>
          <View style={styles.flex1}>
            <LabeledInput label="Booking reference (PNR)" value={pnr} onChangeText={(v) => setPnr(v.toUpperCase())} placeholder="e.g. K7QX2P" autoCapitalize="characters" maxLength={10} />
          </View>
          <Pressable onPress={() => copy(pnr, 'PNR')} style={styles.copyButton}>
            <Text style={styles.copyText}>Copy</Text>
          </Pressable>
        </View>

        <View style={styles.row}>
          <View style={styles.flex1}>
            <LabeledInput label="Passenger last name" value={lastName} onChangeText={setLastName} placeholder="As it appears on the ticket" />
          </View>
          <Pressable onPress={() => copy(lastName, 'Last name')} style={styles.copyButton}>
            <Text style={styles.copyText}>Copy</Text>
          </Pressable>
        </View>

        <PrimaryButton
          label={airline ? `Continue to ${airline.name}` : 'Select an airline to continue'}
          onPress={handleContinue}
          disabled={!airline || !pnr || !lastName}
        />
        <Text style={styles.note}>
          This opens {airline ? `${airline.name}'s` : "the airline's"} own manage-booking page in your browser. Use the
          Copy buttons above, then paste your reference and last name into that page's own form.
        </Text>
      </View>

      <Text style={styles.footerNote}>
        Booked with us and can't find your PNR? Check your booking confirmation email, or email
        mohammadtravelsandtours@gmail.com and we'll help you track it down.
      </Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '700', color: colors.dusk900 },
  subtitle: { fontSize: 13, color: colors.dusk500, marginTop: spacing.sm, marginBottom: spacing.lg, lineHeight: 19 },
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.sand, borderRadius: radius.lg, padding: spacing.lg - 2 },
  label: { fontSize: 13, color: colors.dusk500, marginBottom: spacing.xs },
  picker: { borderWidth: 1, borderColor: colors.sand, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.md - 2, marginBottom: spacing.sm },
  pickerValue: { fontSize: 15, color: colors.dusk900, fontWeight: '500' },
  pickerPlaceholder: { fontSize: 15, color: colors.dusk500 },
  dropdown: { borderWidth: 1, borderColor: colors.sand, borderRadius: radius.sm, marginBottom: spacing.md, maxHeight: 260, overflow: 'hidden' },
  dropdownOption: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, borderBottomWidth: 1, borderBottomColor: colors.sand },
  dropdownOptionText: { fontSize: 13, color: colors.dusk900 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  flex1: { flex: 1 },
  copyButton: { paddingTop: spacing.lg + 6 },
  copyText: { fontSize: 12, color: colors.tangerineDim },
  note: { fontSize: 11, color: colors.dusk500, marginTop: spacing.sm, lineHeight: 16 },
  footerNote: { fontSize: 11, color: colors.dusk500, marginTop: spacing.lg, lineHeight: 16 },
});
