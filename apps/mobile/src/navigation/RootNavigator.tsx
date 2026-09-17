import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { navigationRef } from './nav-ref';
import { RootStackParamList, SearchStackParamList, TabParamList, TripsStackParamList } from './types';

import { SearchScreen } from '@/screens/SearchScreen';
import { SearchResultsScreen } from '@/screens/SearchResultsScreen';
import { OfferDetailScreen } from '@/screens/OfferDetailScreen';
import { BookingScreen } from '@/screens/BookingScreen';
import { BookingDetailScreen } from '@/screens/BookingDetailScreen';
import { MyTripsScreen } from '@/screens/MyTripsScreen';
import { ManageBookingScreen } from '@/screens/ManageBookingScreen';
import { AccountScreen } from '@/screens/AccountScreen';
import { LoginScreen } from '@/screens/LoginScreen';
import { RegisterScreen } from '@/screens/RegisterScreen';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();
const SearchStack = createNativeStackNavigator<SearchStackParamList>();
const TripsStack = createNativeStackNavigator<TripsStackParamList>();

const screenOptions = {
  headerStyle: { backgroundColor: colors.ground },
  headerTintColor: colors.dusk900,
  headerShadowVisible: false,
  headerTitleStyle: { fontWeight: '600' as const },
  contentStyle: { backgroundColor: colors.ground },
};

function SearchStackNavigator() {
  return (
    <SearchStack.Navigator screenOptions={screenOptions}>
      <SearchStack.Screen name="Search" component={SearchScreen} options={{ title: 'Search flights' }} />
      <SearchStack.Screen name="SearchResults" component={SearchResultsScreen} options={{ title: 'Results' }} />
      <SearchStack.Screen name="OfferDetail" component={OfferDetailScreen} options={{ title: 'Fare details' }} />
      <SearchStack.Screen name="Booking" component={BookingScreen} options={{ title: 'Book this fare' }} />
      <SearchStack.Screen name="BookingDetail" component={BookingDetailScreen} options={{ title: 'Booking confirmed', headerBackVisible: false }} />
    </SearchStack.Navigator>
  );
}

function TripsStackNavigator() {
  return (
    <TripsStack.Navigator screenOptions={screenOptions}>
      <TripsStack.Screen name="MyTrips" component={MyTripsScreen} options={{ title: 'My trips' }} />
      <TripsStack.Screen name="BookingDetail" component={BookingDetailScreen} options={{ title: 'Booking' }} />
    </TripsStack.Navigator>
  );
}

const TAB_ICONS: Record<keyof TabParamList, keyof typeof Ionicons.glyphMap> = {
  SearchTab: 'search',
  TripsTab: 'airplane',
  ManageTab: 'document-text',
  AccountTab: 'person-circle',
};

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.tangerineDim,
        tabBarInactiveTintColor: colors.dusk500,
        tabBarStyle: { backgroundColor: colors.white, borderTopColor: colors.sand },
        tabBarIcon: ({ color, size }) => <Ionicons name={TAB_ICONS[route.name]} size={size} color={color} />,
      })}
    >
      <Tab.Screen name="SearchTab" component={SearchStackNavigator} options={{ title: 'Search' }} />
      <Tab.Screen name="TripsTab" component={TripsStackNavigator} options={{ title: 'My Trips' }} />
      <Tab.Screen
        name="ManageTab"
        component={ManageBookingScreen}
        options={{ title: 'Manage', headerShown: true, ...screenOptions, headerTitle: 'Manage booking' }}
      />
      <Tab.Screen
        name="AccountTab"
        component={AccountScreen}
        options={{ title: 'Account', headerShown: true, ...screenOptions, headerTitle: 'Account' }}
      />
    </Tab.Navigator>
  );
}

/**
 * Root of the app: a bottom-tab shell (Search / My Trips / Manage /
 * Account — the four things a B2C traveler does, mirroring apps/web's own
 * top nav) wrapped in a native stack that also owns the Login/Register
 * modals so they can be opened from anywhere via navigation/nav-ref.ts's
 * navigationRef, regardless of which nested tab/stack triggered them.
 */
export function RootNavigator() {
  return (
    <NavigationContainer ref={navigationRef}>
      <RootStack.Navigator>
        <RootStack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <RootStack.Group screenOptions={{ presentation: 'modal', ...screenOptions }}>
          <RootStack.Screen name="Login" component={LoginScreen} options={{ title: 'Sign in' }} />
          <RootStack.Screen name="Register" component={RegisterScreen} options={{ title: 'Create account' }} />
        </RootStack.Group>
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
