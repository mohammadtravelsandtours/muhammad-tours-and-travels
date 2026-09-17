/**
 * Mirrors PaymentProvider's shape (payments/payment-provider.interface.ts)
 * — same "abstraction first, mock implementation, real gateway plugs in
 * behind the interface later" pattern, applied to WhatsApp messaging.
 * NotificationsService depends only on this interface, never on a
 * concrete provider — see MockWhatsAppProvider for the always-inert
 * default and WhatsAppCloudApiProvider for the real (Meta Cloud API)
 * implementation this phase adds.
 */
export interface WhatsAppMessageRequest {
  /** E.164-ish phone number, e.g. "+8801700000000" — WhatsAppCloudApiProvider strips the leading "+" itself (Meta's API expects digits only). */
  toPhone: string;
  message: string;
}

export interface WhatsAppMessageResult {
  status: 'SENT' | 'FAILED';
  providerMessageId?: string;
  failureReason?: string;
}

export interface WhatsAppProvider {
  readonly providerCode: string;
  sendMessage(request: WhatsAppMessageRequest): Promise<WhatsAppMessageResult>;
}
