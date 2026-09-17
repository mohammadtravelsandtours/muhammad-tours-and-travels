// Frontend-side mirror of HajjUmrahController's serialize() shapes (see
// apps/api/src/modules/hajj-umrah/hajj-umrah.controller.ts).

export interface HajjUmrahPackage {
  id: string;
  title: string;
  type: 'HAJJ' | 'UMRAH';
  description: string | null;
  departureDate: string;
  returnDate: string;
  durationNights: number;
  currency: string;
  /** Price PER PILGRIM. */
  totalAmount: number;
  depositType: 'PERCENTAGE' | 'FIXED';
  depositValue: number;
  capacity: number;
  seatsBooked: number;
  seatsRemaining: number;
  inclusions: string[];
  makkahHotel: string | null;
  madinahHotel: string | null;
  active: boolean;
  createdAt: string;
}

export interface CreateHajjUmrahBookingInput {
  packageId: string;
  pilgrims: number;
  leadPilgrimName: string;
  contactPhone: string;
  contactEmail: string;
  /** Omit to pay exactly the minimum deposit shown on the package. */
  paymentAmount?: number;
  paymentMethodToken?: string;
}

export interface AddHajjUmrahPaymentInput {
  amount: number;
  paymentMethodToken?: string;
}

export interface HajjUmrahPayment {
  id: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
}

export interface HajjUmrahBooking {
  id: string;
  bookingReference: string;
  status: 'PENDING_DEPOSIT' | 'DEPOSIT_PAID' | 'PARTIALLY_PAID' | 'FULLY_PAID' | 'CANCELLED';
  pilgrims: number;
  leadPilgrimName: string;
  contactPhone: string;
  contactEmail: string;
  currency: string;
  totalAmount: number;
  minimumDepositAmount: number;
  amountPaid: number;
  balanceRemaining: number;
  createdAt: string;
  package?: HajjUmrahPackage;
  payments: HajjUmrahPayment[];
}
