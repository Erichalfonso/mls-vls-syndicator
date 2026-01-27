/**
 * MLS Listing Data Types
 */

// Core listing data from MLS
export interface MLSListing {
  mlsNumber: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  lotSize?: number;
  yearBuilt?: number;
  propertyType: PropertyType;
  listingType: ListingType; // Sale or Rent
  description: string;
  imageUrls: string[];
  listingAgentName?: string;
  listingAgentPhone?: string;
  listingAgentEmail?: string;
  listingOfficeName?: string;
  listingOfficePhone?: string;
  listingDate?: Date;
  status: ListingStatus;
  // Additional common MLS fields
  garage?: number;
  pool?: boolean;
  waterfront?: boolean;
  subdivision?: string;
  county?: string;
  taxAmount?: number;
  hoaFee?: number;
  // Attribution requirement from MLS
  attributionRequired?: boolean;
}

export type ListingType = 'Sale' | 'Rent';

export type PropertyType =
  | 'Single Family'
  | 'Condo'
  | 'Townhouse'
  | 'Multi-Family'
  | 'Land'
  | 'Commercial'
  | 'Other';

export type ListingStatus =
  | 'Active'
  | 'Pending'
  | 'Sold'
  | 'Withdrawn'
  | 'Expired';

// Sync result for each listing
export interface SyncResult {
  mlsNumber: string;
  address: string;
  status: 'success' | 'failed' | 'skipped';
  message: string;
  timestamp: Date;
  vlsListingId?: string; // If successfully posted
}

// MLS API credentials (Bridge API)
export interface MLSCredentials {
  serverToken: string;       // Bridge Server Token for API auth
  mlsId: string;             // Dataset ID e.g., "miamire"
  mlsName: string;           // Display name e.g., "Miami REALTORS"
  // Optional - for OAuth if needed
  clientId?: string;
  clientSecret?: string;
}

// VLS Homes credentials
export interface VLSCredentials {
  email: string;
  password: string;
}

// Airtable credentials for tracking
export interface AirtableCredentials {
  apiKey: string;      // Personal Access Token
  baseId: string;      // Base ID (starts with "app...")
  tableId: string;     // Table name (e.g., "Listings")
}

// Search criteria for fetching listings
export interface SearchCriteria {
  cities?: string[];
  zipCodes?: string[];
  county?: string;
  minPrice?: number;
  maxPrice?: number;
  minBeds?: number;
  maxBeds?: number;
  minBaths?: number;
  maxBaths?: number;
  minSqft?: number;
  maxSqft?: number;
  propertyTypes?: PropertyType[];
  listingStatus?: ListingStatus[];
  daysOnMarket?: number;
}

// App settings
export interface AppSettings {
  mlsCredentials?: MLSCredentials;
  vlsCredentials?: VLSCredentials;
  airtableCredentials?: AirtableCredentials;
  searchCriteria: SearchCriteria;
  autoSync: boolean;
  syncIntervalHours: number;
  lastSyncTime?: Date;
}

// Sync session data
export interface SyncSession {
  id: string;
  startTime: Date;
  endTime?: Date;
  totalListings: number;
  posted: number;
  failed: number;
  skipped: number;
  results: SyncResult[];
}
