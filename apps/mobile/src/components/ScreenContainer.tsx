import { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/theme/colors';

/**
 * Shared page chrome every screen in this app uses instead of a bare View —
 * safe-area + keyboard-avoidance + scroll, so no individual screen has to
 * remember all three (a very easy thing to forget on just one screen and
 * end up with a form field hidden behind the keyboard).
 */
export function ScreenContainer({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const Wrapper = scroll ? ScrollView : View;
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Wrapper
          style={scroll ? undefined : styles.flex}
          contentContainerStyle={scroll ? styles.scrollContent : undefined}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </Wrapper>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.ground },
  flex: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 48 },
});
