import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, sheets_v4 } from 'googleapis';

export interface BookingSheetRow {
  bookingReference: string;
  createdAt: Date;
  channel: string;
  contactName: string;
  contactEmail: string;
  route: string;
  totalAmount: number;
  currency: string;
  status: string;
}

const SHEET_RANGE = 'Bookings!A:I';

/**
 * Secondary record-keeping only — appends one row per booking to a
 * Google Sheet an ops team can open directly, alongside (never instead
 * of) the real Postgres record. REQUIRES REAL GOOGLE CLOUD CREDENTIALS
 * (a service account with edit access to the target spreadsheet) via
 * GOOGLE_SHEETS_SPREADSHEET_ID / GOOGLE_SHEETS_CLIENT_EMAIL /
 * GOOGLE_SHEETS_PRIVATE_KEY — see configuration.ts. With none of those
 * set (the default), this logs and no-ops rather than failing anything
 * that calls it; this sandbox has no network access to actually
 * exercise a real Sheets API call, so the write path below is reviewed
 * for correctness against the googleapis client's documented usage,
 * NOT executed against a live spreadsheet.
 */
@Injectable()
export class GoogleSheetsService {
  private readonly logger = new Logger(GoogleSheetsService.name);
  private client: sheets_v4.Sheets | null = null;
  private spreadsheetId: string | null = null;

  constructor(private readonly config: ConfigService) {
    const settings = this.config.get<{ spreadsheetId: string; clientEmail: string; privateKey: string } | undefined>('integrations.googleSheets');
    if (!settings) return;

    const auth = new google.auth.JWT({
      email: settings.clientEmail,
      key: settings.privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    this.client = google.sheets({ version: 'v4', auth });
    this.spreadsheetId = settings.spreadsheetId;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  /** Fire-and-forget from the caller's point of view — never throws, so a Sheets outage can never fail a real booking. */
  async recordBooking(row: BookingSheetRow): Promise<void> {
    if (!this.client || !this.spreadsheetId) {
      this.logger.log(`[MOCK SHEETS] Not configured — would append booking ${row.bookingReference} to Google Sheets`);
      return;
    }

    try {
      await this.client.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: SHEET_RANGE,
        valueInputOption: 'RAW',
        requestBody: {
          values: [
            [
              row.bookingReference,
              row.createdAt.toISOString(),
              row.channel,
              row.contactName,
              row.contactEmail,
              row.route,
              row.totalAmount,
              row.currency,
              row.status,
            ],
          ],
        },
      });
    } catch (err) {
      this.logger.error(`Google Sheets append failed for booking ${row.bookingReference}: ${(err as Error).message}`);
    }
  }
}
