/**
 * Bridge API Client
 *
 * Fetches MLS listings from Bridge Interactive's RESO Web API
 * https://api.bridgedataoutput.com/api/v2/OData/{mlsId}/Property
 */

import type { MLSListing, MLSCredentials, SearchCriteria, PropertyType, ListingType } from './types';

const BRIDGE_API_BASE = 'https://api.bridgedataoutput.com/api/v2/OData';

// Map RESO property types to our PropertyType
const PROPERTY_TYPE_MAP: Record<string, PropertyType> = {
  'Residential': 'Single Family',
  'Residential Income': 'Multi-Family',
  'Condominium': 'Condo',
  'Townhouse': 'Townhouse',
  'Land': 'Land',
  'Commercial': 'Commercial',
  'Commercial Sale': 'Commercial',
};

export interface BridgeAPIConfig {
  credentials: MLSCredentials;
}

export interface BridgeAPIResponse {
  '@odata.context'?: string;
  '@odata.nextLink'?: string;
  '@odata.count'?: number;
  value: BridgeProperty[];
}

// Bridge/RESO Property structure (partial - key fields only)
export interface BridgeProperty {
  ListingKey: string;
  ListingId: string;
  ListPrice: number;
  StreetNumber?: string;
  StreetDirPrefix?: string;  // Directional prefix (N, S, E, W, NE, NW, SE, SW)
  StreetName?: string;
  StreetSuffix?: string;
  StreetDirSuffix?: string;  // Directional suffix (less common)
  UnitNumber?: string;
  City: string;
  StateOrProvince: string;
  PostalCode: string;
  BedroomsTotal?: number;
  BathroomsTotalInteger?: number;
  BathroomsFull?: number;
  BathroomsHalf?: number;
  LivingArea?: number;
  LotSizeSquareFeet?: number;
  LotSizeAcres?: number;
  YearBuilt?: number;
  PropertyType?: string;
  PropertySubType?: string;
  PublicRemarks?: string;
  StandardStatus?: string;
  MlsStatus?: string;
  ListAgentFullName?: string;
  ListAgentDirectPhone?: string;
  ListAgentEmail?: string;
  ListOfficeName?: string;
  ListOfficePhone?: string;
  ListingContractDate?: string;
  ModificationTimestamp?: string;
  Media?: BridgeMedia[];
  GarageSpaces?: number;
  PoolPrivateYN?: boolean;
  WaterfrontYN?: boolean;
  SubdivisionName?: string;
  CountyOrParish?: string;
  TaxAnnualAmount?: number;
  AssociationFee?: number;
  // IDX/Syndication permission fields
  IDXEntireListingDisplayYN?: boolean;
  InternetEntireListingDisplayYN?: boolean;
  SyndicateTo?: string[];
  MIAMIRE_OkToAdvertiseList?: string;
}

export interface BridgeMedia {
  MediaKey: string;
  MediaURL: string;
  MediaCategory?: string;  // "Photo", "Video", etc.
  MimeType?: string;       // "image/jpeg", etc.
  Order: number;
  ShortDescription?: string;
  MediaObjectID?: string;
  ResourceRecordKey?: string;
  ResourceName?: string;
  ClassName?: string;
}

export class BridgeAPIClient {
  private config: BridgeAPIConfig;

  constructor(config: BridgeAPIConfig) {
    this.config = config;
  }

  /**
   * Build OData filter string from search criteria
   */
  private buildFilter(criteria: SearchCriteria): string {
    const filters: string[] = [];

    // IMPORTANT: Only fetch rental listings (PropertyType contains 'Lease')
    filters.push("contains(PropertyType, 'Lease')");

    // Only fetch listings where OK To Advertise starts with 'Yes'
    // Values can be: 'Yes - Attribution Required', 'Yes - Attribution NOT Required', etc.
    filters.push("startswith(MIAMIRE_OkToAdvertiseList, 'Yes')");

    // Status filter - default to Active
    if (criteria.listingStatus && criteria.listingStatus.length > 0) {
      const statusFilters = criteria.listingStatus.map(s => `StandardStatus eq '${s}'`);
      filters.push(`(${statusFilters.join(' or ')})`);
    } else {
      filters.push("StandardStatus eq 'Active'");
    }

    // City filter
    if (criteria.cities && criteria.cities.length > 0) {
      const cityFilters = criteria.cities.map(c => `City eq '${c}'`);
      filters.push(`(${cityFilters.join(' or ')})`);
    }

    // Zip code filter
    if (criteria.zipCodes && criteria.zipCodes.length > 0) {
      const zipFilters = criteria.zipCodes.map(z => `PostalCode eq '${z}'`);
      filters.push(`(${zipFilters.join(' or ')})`);
    }

    // County filter - use contains for flexible matching
    if (criteria.county) {
      // Use contains() for partial matching (handles "Miami-Dade", "MIAMI-DADE", etc.)
      filters.push(`contains(tolower(CountyOrParish), '${criteria.county.toLowerCase()}')`);
    }

    // Price range
    if (criteria.minPrice !== undefined) {
      filters.push(`ListPrice ge ${criteria.minPrice}`);
    }
    if (criteria.maxPrice !== undefined) {
      filters.push(`ListPrice le ${criteria.maxPrice}`);
    }

    // Bedrooms
    if (criteria.minBeds !== undefined) {
      filters.push(`BedroomsTotal ge ${criteria.minBeds}`);
    }
    if (criteria.maxBeds !== undefined) {
      filters.push(`BedroomsTotal le ${criteria.maxBeds}`);
    }

    // Bathrooms
    if (criteria.minBaths !== undefined) {
      filters.push(`BathroomsTotalInteger ge ${criteria.minBaths}`);
    }
    if (criteria.maxBaths !== undefined) {
      filters.push(`BathroomsTotalInteger le ${criteria.maxBaths}`);
    }

    // Square footage
    if (criteria.minSqft !== undefined) {
      filters.push(`LivingArea ge ${criteria.minSqft}`);
    }
    if (criteria.maxSqft !== undefined) {
      filters.push(`LivingArea le ${criteria.maxSqft}`);
    }

    // Property types
    if (criteria.propertyTypes && criteria.propertyTypes.length > 0) {
      // Map our property types back to RESO types
      const resoTypes: string[] = [];
      for (const pt of criteria.propertyTypes) {
        for (const [resoType, ourType] of Object.entries(PROPERTY_TYPE_MAP)) {
          if (ourType === pt) {
            resoTypes.push(resoType);
          }
        }
      }
      if (resoTypes.length > 0) {
        // Use contains() instead of eq so "Condominium" matches "Condominium Lease" etc.
        const typeFilters = resoTypes.map(t => `contains(PropertyType, '${t}')`);
        filters.push(`(${typeFilters.join(' or ')})`);
      }
    }

    return filters.join(' and ');
  }

  /**
   * Fetch listings from Bridge API
   */
  async fetchListings(criteria: SearchCriteria, limit: number = 50): Promise<MLSListing[]> {
    const { credentials } = this.config;
    const { serverToken, mlsId } = credentials;

    // Build the API URL
    const baseUrl = `${BRIDGE_API_BASE}/${mlsId}/Property`;

    // Build query parameters
    const params = new URLSearchParams();
    params.set('access_token', serverToken);
    params.set('$top', limit.toString());

    // Note: For Miami dataset (miamire), Media array is embedded in Property response
    // Do NOT use $select as it excludes the Media array
    // Do NOT use $expand as Media is already included in the Property resource

    // Build filter
    const filter = this.buildFilter(criteria);
    if (filter) {
      params.set('$filter', filter);
    }

    // Order by newest first
    params.set('$orderby', 'ModificationTimestamp desc');

    const url = `${baseUrl}?${params.toString()}`;
    console.log('[Bridge API] Fetching:', url.replace(serverToken, '***'));

    try {
      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Bridge API] Error response:', errorText);
        throw new Error(`Bridge API error: ${response.status} ${response.statusText}`);
      }

      const data: BridgeAPIResponse = await response.json();
      console.log(`[Bridge API] Received ${data.value?.length || 0} listings`);

      // Debug: Log first listing's structure to find IDX/Advertise field names
      if (data.value && data.value.length > 0) {
        const firstListing = data.value[0];
        console.log(`[Bridge API] First listing ${firstListing.ListingId} has Media:`, firstListing.Media ? `${firstListing.Media.length} items` : 'undefined');
        if (firstListing.Media && firstListing.Media.length > 0) {
          console.log(`[Bridge API] Sample Media item:`, JSON.stringify(firstListing.Media[0], null, 2));
        }

        // Debug: Log all fields to find "OK To Advertise" field name
        const allFields = Object.keys(firstListing);
        console.log(`[Bridge API] All fields (${allFields.length}):`, allFields.join(', '));

        // Look for IDX/Internet/Advertise related fields
        const idxFields = allFields.filter(f =>
          f.toLowerCase().includes('idx') ||
          f.toLowerCase().includes('internet') ||
          f.toLowerCase().includes('advertise') ||
          f.toLowerCase().includes('syndic') ||
          f.toLowerCase().includes('display')
        );
        if (idxFields.length > 0) {
          console.log(`[Bridge API] IDX/Internet/Advertise fields found:`, idxFields);
          for (const field of idxFields) {
            console.log(`[Bridge API]   ${field}:`, (firstListing as any)[field]);
          }
        } else {
          console.log(`[Bridge API] No IDX/Internet/Advertise fields found in response`);
        }

        // Debug: Show unique OkToAdvertise values across all listings
        const okToAdvertiseValues = data.value.map((l: any) => l.MIAMIRE_OkToAdvertiseList).filter(Boolean);
        const uniqueValues = [...new Set(okToAdvertiseValues)];
        console.log(`[Bridge API] MIAMIRE_OkToAdvertiseList values in response:`, uniqueValues);
      }

      // Convert Bridge properties to our MLSListing format
      return this.convertListings(data.value || []);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Bridge API] Fetch failed:', message);
      throw error;
    }
  }

  /**
   * Convert Bridge API properties to our MLSListing format
   */
  private convertListings(properties: BridgeProperty[]): MLSListing[] {
    return properties.map(prop => this.convertProperty(prop));
  }

  /**
   * Convert a single Bridge property to MLSListing
   */
  private convertProperty(prop: BridgeProperty): MLSListing {
    // Build full address (including directional prefix/suffix)
    const addressParts = [
      prop.StreetNumber,
      prop.StreetDirPrefix,   // e.g., "SW", "NW", "N", "S"
      prop.StreetName,
      prop.StreetSuffix,
      prop.StreetDirSuffix,   // less common, but some addresses have it
    ].filter(Boolean);
    let address = addressParts.join(' ');
    if (prop.UnitNumber) {
      address += ` #${prop.UnitNumber}`;
    }

    // Get image URLs from Media array (embedded in Property for Miami dataset)
    const imageUrls: string[] = [];
    if (prop.Media && Array.isArray(prop.Media) && prop.Media.length > 0) {
      // Sort by Order and get URLs - filter to photos only
      const sortedMedia = [...prop.Media]
        .filter(m => !m.MediaCategory || m.MediaCategory === 'Photo')
        .sort((a, b) => (a.Order || 0) - (b.Order || 0));

      for (const media of sortedMedia) {
        if (media.MediaURL) {
          // Use direct CloudFront URL from Bridge
          imageUrls.push(media.MediaURL);
        }
      }
      console.log(`[Bridge API] Found ${imageUrls.length} images for ${prop.ListingId} (total media items: ${prop.Media.length})`);
      if (imageUrls.length > 0) {
        console.log(`[Bridge API] First image URL: ${imageUrls[0]}`);
      }
    } else {
      console.log(`[Bridge API] No Media array for ${prop.ListingId} - Media value:`, prop.Media);
    }

    // Calculate total bathrooms
    const bathrooms = (prop.BathroomsFull || 0) + ((prop.BathroomsHalf || 0) * 0.5);

    // Detect if it's a rental based on PropertyType containing "Lease"
    const rawPropertyType = prop.PropertyType || '';
    const isRental = rawPropertyType.toLowerCase().includes('lease');
    const listingType: ListingType = isRental ? 'Rent' : 'Sale';

    // Map property type (strip "Lease" suffix for mapping)
    const propertyTypeForMapping = rawPropertyType.replace(/\s*Lease$/i, '').trim();
    const propertyType = PROPERTY_TYPE_MAP[propertyTypeForMapping] || PROPERTY_TYPE_MAP[rawPropertyType] || 'Other';

    // Map status
    let status: MLSListing['status'] = 'Active';
    const bridgeStatus = prop.StandardStatus || prop.MlsStatus || '';
    if (bridgeStatus.toLowerCase().includes('pending')) {
      status = 'Pending';
    } else if (bridgeStatus.toLowerCase().includes('sold') || bridgeStatus.toLowerCase().includes('closed')) {
      status = 'Sold';
    } else if (bridgeStatus.toLowerCase().includes('withdrawn')) {
      status = 'Withdrawn';
    } else if (bridgeStatus.toLowerCase().includes('expired')) {
      status = 'Expired';
    }

    return {
      mlsNumber: prop.ListingId || prop.ListingKey,
      address,
      city: prop.City || '',
      state: prop.StateOrProvince || 'FL',
      zip: prop.PostalCode || '',
      price: prop.ListPrice || 0,
      bedrooms: prop.BedroomsTotal || 0,
      bathrooms: bathrooms || prop.BathroomsTotalInteger || 0,
      sqft: prop.LivingArea || 0,
      lotSize: prop.LotSizeSquareFeet,
      yearBuilt: prop.YearBuilt,
      propertyType,
      listingType,
      description: prop.PublicRemarks || '',
      imageUrls,
      listingAgentName: prop.ListAgentFullName,
      listingAgentPhone: prop.ListAgentDirectPhone,
      listingAgentEmail: prop.ListAgentEmail,
      listingOfficeName: prop.ListOfficeName,
      listingOfficePhone: prop.ListOfficePhone,
      listingDate: prop.ListingContractDate ? new Date(prop.ListingContractDate) : undefined,
      status,
      garage: prop.GarageSpaces,
      pool: prop.PoolPrivateYN,
      waterfront: prop.WaterfrontYN,
      subdivision: prop.SubdivisionName,
      county: prop.CountyOrParish,
      taxAmount: prop.TaxAnnualAmount,
      hoaFee: prop.AssociationFee,
      // Set attribution required flag based on MLS field
      attributionRequired: prop.MIAMIRE_OkToAdvertiseList?.toLowerCase().includes('attribution required') || false,
    };
  }

  /**
   * Test the API connection
   */
  async testConnection(): Promise<{ success: boolean; message: string; count?: number }> {
    try {
      const { credentials } = this.config;
      const { serverToken, mlsId } = credentials;

      // Simple query to test connection
      const url = `${BRIDGE_API_BASE}/${mlsId}/Property?access_token=${serverToken}&$top=1&$select=ListingKey`;

      console.log('[Bridge API] Testing connection...');
      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          message: `API error: ${response.status} - ${errorText.substring(0, 200)}`,
        };
      }

      const data: BridgeAPIResponse = await response.json();

      return {
        success: true,
        message: `Connected to ${mlsId} successfully`,
        count: data['@odata.count'],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        message: `Connection failed: ${message}`,
      };
    }
  }
}

/**
 * Create a Bridge API client
 */
export function createBridgeAPIClient(credentials: MLSCredentials): BridgeAPIClient {
  return new BridgeAPIClient({ credentials });
}
