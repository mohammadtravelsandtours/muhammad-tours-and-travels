import { NavigatorScreenParams } from '@react-navigation/native';

export type SearchStackParamList = {
  Search: undefined;
  SearchResults: { searchId: string };
  OfferDetail: { offerId: string };
  Booking: { offerId: string };
  BookingDetail: { id: string };
};

export type TripsStackParamList = {
  MyTrips: undefined;
  BookingDetail: { id: string };
};

export type TabParamList = {
  SearchTab: NavigatorScreenParams<SearchStackParamList>;
  TripsTab: NavigatorScreenParams<TripsStackParamList>;
  ManageTab: undefined;
  AccountTab: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  Login: undefined;
  Register: undefined;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
