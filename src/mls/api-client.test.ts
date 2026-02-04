import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BridgeAPIClient, BridgeProperty, BridgeMedia } from './api-client';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('BridgeAPIClient', () => {
  let client: BridgeAPIClient;

  beforeEach(() => {
    client = new BridgeAPIClient({
      credentials: {
        serverToken: 'test-token',
        mlsId: 'miamire',
        mlsName: 'Miami REALTORS',
      },
    });
    vi.clearAllMocks();
  });

  describe('Media array extraction', () => {
    it('should extract MediaURLs from embedded Media array', async () => {
      // Mock response matching Bridge support's example
      const mockProperty: BridgeProperty = {
        ListingKey: 'a009cddc91b2bf2b13f651d002e92b4e',
        ListingId: 'A11376532',
        ListPrice: 500000,
        City: 'Miami',
        StateOrProvince: 'FL',
        PostalCode: '33101',
        StreetNumber: '123',
        StreetName: 'Main',
        StreetSuffix: 'St',
        Media: [
          {
            MediaKey: 'a009cddc91b2bf2b13f651d002e92b4e-m1',
            MediaCategory: 'Photo',
            MediaURL: 'https://dvvjkgh94f2v6.cloudfront.net/523fa3e6/381255037/83dcefb7.jpeg',
            Order: 1,
            MimeType: 'image/jpeg',
          },
          {
            MediaKey: 'a009cddc91b2bf2b13f651d002e92b4e-m2',
            MediaCategory: 'Photo',
            MediaURL: 'https://dvvjkgh94f2v6.cloudfront.net/523fa3e6/381255037/1ad5be0d.jpeg',
            Order: 2,
            MimeType: 'image/jpeg',
          },
          {
            MediaKey: 'a009cddc91b2bf2b13f651d002e92b4e-m3',
            MediaCategory: 'Photo',
            MediaURL: 'https://dvvjkgh94f2v6.cloudfront.net/523fa3e6/381255037/abc123.jpeg',
            Order: 3,
            MimeType: 'image/jpeg',
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          '@odata.context': 'test',
          value: [mockProperty],
        }),
      });

      const listings = await client.fetchListings({ cities: ['Miami'] }, 1);

      expect(listings).toHaveLength(1);
      expect(listings[0].imageUrls).toHaveLength(3);
      expect(listings[0].imageUrls[0]).toBe('https://dvvjkgh94f2v6.cloudfront.net/523fa3e6/381255037/83dcefb7.jpeg');
      expect(listings[0].imageUrls[1]).toBe('https://dvvjkgh94f2v6.cloudfront.net/523fa3e6/381255037/1ad5be0d.jpeg');
      expect(listings[0].imageUrls[2]).toBe('https://dvvjkgh94f2v6.cloudfront.net/523fa3e6/381255037/abc123.jpeg');
    });

    it('should sort Media by Order', async () => {
      const mockProperty: BridgeProperty = {
        ListingKey: 'test-key',
        ListingId: 'A123',
        ListPrice: 300000,
        City: 'Miami',
        StateOrProvince: 'FL',
        PostalCode: '33101',
        Media: [
          {
            MediaKey: 'm3',
            MediaCategory: 'Photo',
            MediaURL: 'https://example.com/image3.jpg',
            Order: 3,
          },
          {
            MediaKey: 'm1',
            MediaCategory: 'Photo',
            MediaURL: 'https://example.com/image1.jpg',
            Order: 1,
          },
          {
            MediaKey: 'm2',
            MediaCategory: 'Photo',
            MediaURL: 'https://example.com/image2.jpg',
            Order: 2,
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ value: [mockProperty] }),
      });

      const listings = await client.fetchListings({}, 1);

      expect(listings[0].imageUrls).toEqual([
        'https://example.com/image1.jpg',
        'https://example.com/image2.jpg',
        'https://example.com/image3.jpg',
      ]);
    });

    it('should filter to only Photo media category', async () => {
      const mockProperty: BridgeProperty = {
        ListingKey: 'test-key',
        ListingId: 'A123',
        ListPrice: 300000,
        City: 'Miami',
        StateOrProvince: 'FL',
        PostalCode: '33101',
        Media: [
          {
            MediaKey: 'm1',
            MediaCategory: 'Photo',
            MediaURL: 'https://example.com/photo1.jpg',
            Order: 1,
          },
          {
            MediaKey: 'm2',
            MediaCategory: 'Video',
            MediaURL: 'https://example.com/video.mp4',
            Order: 2,
          },
          {
            MediaKey: 'm3',
            MediaCategory: 'Photo',
            MediaURL: 'https://example.com/photo2.jpg',
            Order: 3,
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ value: [mockProperty] }),
      });

      const listings = await client.fetchListings({}, 1);

      expect(listings[0].imageUrls).toHaveLength(2);
      expect(listings[0].imageUrls).not.toContain('https://example.com/video.mp4');
    });

    it('should handle empty Media array', async () => {
      const mockProperty: BridgeProperty = {
        ListingKey: 'test-key',
        ListingId: 'A123',
        ListPrice: 300000,
        City: 'Miami',
        StateOrProvince: 'FL',
        PostalCode: '33101',
        Media: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ value: [mockProperty] }),
      });

      const listings = await client.fetchListings({}, 1);

      expect(listings[0].imageUrls).toHaveLength(0);
    });

    it('should handle missing Media array (undefined)', async () => {
      const mockProperty: BridgeProperty = {
        ListingKey: 'test-key',
        ListingId: 'A123',
        ListPrice: 300000,
        City: 'Miami',
        StateOrProvince: 'FL',
        PostalCode: '33101',
        // No Media property
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ value: [mockProperty] }),
      });

      const listings = await client.fetchListings({}, 1);

      expect(listings[0].imageUrls).toHaveLength(0);
    });

    it('should handle Media items without MediaURL', async () => {
      const mockProperty: BridgeProperty = {
        ListingKey: 'test-key',
        ListingId: 'A123',
        ListPrice: 300000,
        City: 'Miami',
        StateOrProvince: 'FL',
        PostalCode: '33101',
        Media: [
          {
            MediaKey: 'm1',
            MediaCategory: 'Photo',
            MediaURL: 'https://example.com/image1.jpg',
            Order: 1,
          },
          {
            MediaKey: 'm2',
            MediaCategory: 'Photo',
            MediaURL: '', // Empty URL
            Order: 2,
          },
          {
            MediaKey: 'm3',
            MediaCategory: 'Photo',
            // No MediaURL at all
            Order: 3,
          } as BridgeMedia,
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ value: [mockProperty] }),
      });

      const listings = await client.fetchListings({}, 1);

      // Should only include the first item with valid URL
      expect(listings[0].imageUrls).toHaveLength(1);
      expect(listings[0].imageUrls[0]).toBe('https://example.com/image1.jpg');
    });
  });

  describe('API request format', () => {
    it('should NOT include $select or $expand in request (for Miami dataset)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ value: [] }),
      });

      await client.fetchListings({ cities: ['Miami'] }, 10);

      const calledUrl = mockFetch.mock.calls[0][0] as string;

      // Should NOT have $select (which would exclude Media)
      expect(calledUrl).not.toContain('$select');
      // Should NOT have $expand (Media is embedded, not expanded)
      expect(calledUrl).not.toContain('$expand');
    });

    it('should include access_token, $top, $filter, and $orderby', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ value: [] }),
      });

      await client.fetchListings({ cities: ['Miami'] }, 50);

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      const decodedUrl = decodeURIComponent(calledUrl);

      expect(decodedUrl).toContain('access_token=test-token');
      expect(decodedUrl).toContain('$top=50');
      expect(decodedUrl).toContain('$filter=');
      expect(decodedUrl).toContain('$orderby=ModificationTimestamp');
    });
  });

  describe('Filter building', () => {
    it('should filter for rentals only (PropertyType contains Lease)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ value: [] }),
      });

      await client.fetchListings({}, 10);

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      // URL encoding uses + for spaces
      const decodedUrl = decodeURIComponent(calledUrl).replace(/\+/g, ' ');

      expect(decodedUrl).toContain("contains(PropertyType, 'Lease')");
    });

    it('should filter for OK To Advertise listings only', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ value: [] }),
      });

      await client.fetchListings({}, 10);

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      const decodedUrl = decodeURIComponent(calledUrl).replace(/\+/g, ' ');

      // Should check for MIAMIRE_OkToAdvertiseList starting with 'Yes'
      expect(decodedUrl).toContain("startswith(MIAMIRE_OkToAdvertiseList, 'Yes')");
    });

    it('should combine rental and syndication filters with other criteria', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ value: [] }),
      });

      await client.fetchListings({
        cities: ['Miami'],
        minPrice: 1000,
        maxPrice: 5000,
      }, 10);

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      const decodedUrl = decodeURIComponent(calledUrl).replace(/\+/g, ' ');

      // All filters should be present
      expect(decodedUrl).toContain("contains(PropertyType, 'Lease')");
      expect(decodedUrl).toContain("startswith(MIAMIRE_OkToAdvertiseList, 'Yes')");
      expect(decodedUrl).toContain("City eq 'Miami'");
      expect(decodedUrl).toContain('ListPrice ge 1000');
      expect(decodedUrl).toContain('ListPrice le 5000');
    });
  });

  describe('Rental vs Sale detection', () => {
    it('should detect rental listings from PropertyType containing Lease', async () => {
      const mockProperty: BridgeProperty = {
        ListingKey: 'test-key',
        ListingId: 'A123',
        ListPrice: 2500,
        City: 'Miami',
        StateOrProvince: 'FL',
        PostalCode: '33101',
        PropertyType: 'Residential Lease',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ value: [mockProperty] }),
      });

      const listings = await client.fetchListings({}, 1);

      expect(listings[0].listingType).toBe('Rent');
    });

    it('should detect sale listings from PropertyType without Lease', async () => {
      const mockProperty: BridgeProperty = {
        ListingKey: 'test-key',
        ListingId: 'A123',
        ListPrice: 500000,
        City: 'Miami',
        StateOrProvince: 'FL',
        PostalCode: '33101',
        PropertyType: 'Residential',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ value: [mockProperty] }),
      });

      const listings = await client.fetchListings({}, 1);

      expect(listings[0].listingType).toBe('Sale');
    });

    it('should map property type correctly when stripping Lease suffix', async () => {
      const mockProperty: BridgeProperty = {
        ListingKey: 'test-key',
        ListingId: 'A123',
        ListPrice: 3000,
        City: 'Miami',
        StateOrProvince: 'FL',
        PostalCode: '33101',
        PropertyType: 'Condominium Lease',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ value: [mockProperty] }),
      });

      const listings = await client.fetchListings({}, 1);

      expect(listings[0].listingType).toBe('Rent');
      expect(listings[0].propertyType).toBe('Condo');
    });
  });

  describe('Property conversion', () => {
    it('should correctly convert all listing fields', async () => {
      const mockProperty: BridgeProperty = {
        ListingKey: 'key123',
        ListingId: 'A11376532',
        ListPrice: 750000,
        StreetNumber: '456',
        StreetName: 'Ocean',
        StreetSuffix: 'Blvd',
        UnitNumber: '5A',
        City: 'Miami Beach',
        StateOrProvince: 'FL',
        PostalCode: '33139',
        BedroomsTotal: 3,
        BathroomsFull: 2,
        BathroomsHalf: 1,
        LivingArea: 1850,
        YearBuilt: 2015,
        PropertyType: 'Condominium',
        PublicRemarks: 'Beautiful oceanfront condo',
        StandardStatus: 'Active',
        ListAgentFullName: 'John Smith',
        GarageSpaces: 2,
        PoolPrivateYN: true,
        WaterfrontYN: true,
        Media: [
          {
            MediaKey: 'm1',
            MediaCategory: 'Photo',
            MediaURL: 'https://example.com/photo.jpg',
            Order: 1,
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ value: [mockProperty] }),
      });

      const listings = await client.fetchListings({}, 1);
      const listing = listings[0];

      expect(listing.mlsNumber).toBe('A11376532');
      expect(listing.address).toBe('456 Ocean Blvd #5A');
      expect(listing.city).toBe('Miami Beach');
      expect(listing.state).toBe('FL');
      expect(listing.zip).toBe('33139');
      expect(listing.price).toBe(750000);
      expect(listing.bedrooms).toBe(3);
      expect(listing.bathrooms).toBe(2.5); // 2 full + 0.5 half
      expect(listing.sqft).toBe(1850);
      expect(listing.yearBuilt).toBe(2015);
      expect(listing.propertyType).toBe('Condo');
      expect(listing.description).toBe('Beautiful oceanfront condo');
      expect(listing.status).toBe('Active');
      expect(listing.listingAgentName).toBe('John Smith');
      expect(listing.garage).toBe(2);
      expect(listing.pool).toBe(true);
      expect(listing.waterfront).toBe(true);
      expect(listing.imageUrls).toHaveLength(1);
    });
  });
});
