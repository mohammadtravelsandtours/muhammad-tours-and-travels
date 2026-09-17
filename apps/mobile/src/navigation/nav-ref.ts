import { createNavigationContainerRef } from '@react-navigation/native';
import { RootStackParamList } from './types';

// A module-level ref (React Navigation's own documented pattern for this)
// so a screen buried inside a nested tab/stack — SearchTab > Booking, say —
// can open the root-level Login/Register modal without every intermediate
// navigator needing typed knowledge of the root stack. RootNavigator.tsx
// attaches this to <NavigationContainer ref={navigationRef}>; screens only
// ever call the two helpers below, never navigationRef.navigate directly.
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function openLogin() {
  if (navigationRef.isReady()) navigationRef.navigate('Login');
}

export function openRegister() {
  if (navigationRef.isReady()) navigationRef.navigate('Register');
}

export function dismissAuthModal() {
  if (navigationRef.isReady() && navigationRef.canGoBack()) navigationRef.goBack();
}
