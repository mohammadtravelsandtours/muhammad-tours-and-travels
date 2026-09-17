import AsyncStorage from '@react-native-async-storage/async-storage';

// A thin wrapper (not just an inline AsyncStorage call in auth-context)
// so the one JSON.parse/stringify + error-swallowing policy lives in one
// place — every call site gets the same "corrupt/missing storage never
// crashes, just behaves as signed-out" behavior for free.
const SESSION_KEY = 'mt-mobile-session';

export async function readStoredSession<T>(): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeStoredSession<T>(value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(value));
  } catch {
    // Best-effort persistence — a failed write just means the traveler
    // has to sign in again next launch, never a crash mid-session.
  }
}

export async function clearStoredSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SESSION_KEY);
  } catch {
    // Same best-effort policy as the write above.
  }
}
