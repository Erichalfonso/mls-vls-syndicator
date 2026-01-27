/**
 * Airtable Client
 *
 * Records synced listings to Airtable for tracking
 */

export interface AirtableCredentials {
  apiKey: string;      // Personal Access Token from airtable.com/account
  baseId: string;      // Base ID (starts with "app...")
  tableId: string;     // Table ID or name (e.g., "Listings" or "tbl...")
}

export interface AirtableListingRecord {
  mlsNumber: string;
  address: string;
  price: number;
  dateSynced: string;  // ISO date string
  vlsLink: string;
}

export class AirtableClient {
  private credentials: AirtableCredentials;
  private baseUrl: string;

  constructor(credentials: AirtableCredentials) {
    this.credentials = credentials;
    this.baseUrl = `https://api.airtable.com/v0/${credentials.baseId}/${encodeURIComponent(credentials.tableId)}`;
    console.log('[Airtable] Initialized with base URL:', this.baseUrl.replace(credentials.baseId, 'app***'));
  }

  /**
   * Add a listing record to Airtable
   */
  async addListing(record: AirtableListingRecord): Promise<{ success: boolean; recordId?: string; error?: string }> {
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.credentials.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          records: [
            {
              fields: {
                'MLS #': record.mlsNumber,
                'Address': record.address,
                'Price': record.price,
                'Date Synced': record.dateSynced,
                'VLS Link': record.vlsLink,
              },
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.error?.message || `HTTP ${response.status}`;
        console.error('[Airtable] Error adding record:', errorMessage);
        return { success: false, error: errorMessage };
      }

      const data = await response.json();
      const recordId = data.records?.[0]?.id;
      console.log(`[Airtable] Added record ${recordId} for MLS ${record.mlsNumber}`);
      return { success: true, recordId };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Airtable] Failed to add record:', message);
      console.error('[Airtable] URL was:', this.baseUrl);
      console.error('[Airtable] Full error:', error);
      return { success: false, error: message };
    }
  }

  /**
   * Check if a listing already exists in Airtable
   */
  async findByMlsNumber(mlsNumber: string): Promise<string | null> {
    try {
      const filterFormula = encodeURIComponent(`{MLS #}="${mlsNumber}"`);
      const url = `${this.baseUrl}?filterByFormula=${filterFormula}&maxRecords=1`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.credentials.apiKey}`,
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return data.records?.[0]?.id || null;
    } catch (error) {
      console.error('[Airtable] Error checking for existing record:', error);
      return null;
    }
  }

  /**
   * Test the connection to Airtable
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const url = `${this.baseUrl}?maxRecords=1`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.credentials.apiKey}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.error?.message || `HTTP ${response.status}`;
        return { success: false, message: `Connection failed: ${errorMessage}` };
      }

      return { success: true, message: 'Connected to Airtable successfully' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message: `Connection failed: ${message}` };
    }
  }
}

/**
 * Create an Airtable client instance
 */
export function createAirtableClient(credentials: AirtableCredentials): AirtableClient {
  return new AirtableClient(credentials);
}
