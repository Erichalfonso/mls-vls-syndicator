/**
 * VLS Homes Poster
 *
 * Puppeteer automation for posting listings to VLS Homes
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import * as path from 'path';
import type { MLSListing, VLSCredentials } from '../mls/types';

export interface VLSPosterConfig {
  credentials: VLSCredentials;
  headless?: boolean;
  slowMo?: number;
  timeout?: number;
}

export interface PostResult {
  success: boolean;
  vlsListingId?: string;
  error?: string;
}

// VLS Homes URLs
const VLS_URLS = {
  login: 'https://vlshomes.com/members_mobi/passgen.cfm',
  dashboard: 'https://vlshomes.com/members_mobi/brokers.cfm',
  addListing: 'https://vlshomes.com/members_mobi/manform.cfm?short=t',
  myListings: 'https://vlshomes.com/members_mobi/matchedt.cfm?limit=sales',
};

// Property type mapping from MLS to VLS classification
const PROPERTY_TYPE_MAP: Record<string, string> = {
  'Single Family': 'RES',
  'House': 'RES',
  'Condo': 'CON',
  'Condominium': 'CON',
  'Co-op': 'COP',
  'Cooperative': 'COP',
  'Land': 'LAN',
  'Lot': 'LAN',
  'Commercial': 'COM',
  'Rental': 'REN',
  'Apartment': 'REN',
};

export class VLSPoster {
  private config: VLSPosterConfig;
  private browser: Browser | null = null;
  private page: Page | null = null;
  private isLoggedIn: boolean = false;

  constructor(config: VLSPosterConfig) {
    this.config = {
      headless: true,
      slowMo: 50,
      timeout: 30000,
      ...config,
    };
  }

  /**
   * Initialize browser
   */
  async init(): Promise<void> {
    if (this.browser) return;

    this.browser = await puppeteer.launch({
      headless: this.config.headless,
      slowMo: this.config.slowMo,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    this.page = await this.browser.newPage();
    this.page.setDefaultTimeout(this.config.timeout || 30000);

    // Set viewport
    await this.page.setViewport({ width: 1280, height: 800 });
  }

  /**
   * Close browser
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      this.isLoggedIn = false;
    }
  }

  /**
   * Login to VLS Homes
   */
  async login(): Promise<boolean> {
    if (!this.page) await this.init();
    if (this.isLoggedIn) return true;

    try {
      const page = this.page!;

      console.log('[VLS] Navigating to login page...');
      await page.goto(VLS_URLS.login, { waitUntil: 'networkidle2', timeout: 60000 });

      console.log('[VLS] Filling credentials...');
      // Clear any existing values first
      await page.evaluate(() => {
        const textInput = document.querySelector('input[type="text"]') as HTMLInputElement;
        const passInput = document.querySelector('input[type="password"]') as HTMLInputElement;
        if (textInput) textInput.value = '';
        if (passInput) passInput.value = '';
      });

      await page.type('input[type="text"]', this.config.credentials.email);
      await page.type('input[type="password"]', this.config.credentials.password);

      console.log('[VLS] Clicking login button...');
      // Click and wait for either navigation or URL change
      await Promise.all([
        page.click('input[type="submit"]'),
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {
          console.log('[VLS] Navigation timeout, checking URL...');
        }),
      ]);

      // Wait a bit for page to settle
      await new Promise(r => setTimeout(r, 2000));

      // Check if we're on the secure/welcome page
      let url = page.url();
      console.log('[VLS] Current URL after login:', url);

      if (url.includes('secure.cfm')) {
        console.log('[VLS] On secure page, clicking Continue...');
        // Look for continue button/link
        const continueBtn = await page.$('a.btn, input[type="submit"], button, a[href*="brokers"]');
        if (continueBtn) {
          await Promise.all([
            continueBtn.click(),
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}),
          ]);
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      // Verify we're logged in (should be on dashboard)
      const currentUrl = page.url();
      console.log('[VLS] Final URL:', currentUrl);
      this.isLoggedIn = currentUrl.includes('brokers.cfm') ||
                        currentUrl.includes('members_mobi') ||
                        currentUrl.includes('secure.cfm');

      console.log('[VLS] Login successful:', this.isLoggedIn);
      return this.isLoggedIn;
    } catch (error) {
      console.error('[VLS] Login failed:', error);
      return false;
    }
  }

  /**
   * Post a listing to VLS Homes
   */
  async postListing(listing: MLSListing, imagePaths: string[]): Promise<PostResult> {
    if (!this.page) await this.init();

    // Ensure logged in
    if (!this.isLoggedIn) {
      const loggedIn = await this.login();
      if (!loggedIn) {
        return { success: false, error: 'Failed to login to VLS Homes' };
      }
    }

    try {
      const page = this.page!;

      // Step 1: Navigate to Add Listing form
      console.log('[VLS] Navigating to Add Listing form...');
      await page.goto(VLS_URLS.addListing, { waitUntil: 'networkidle2', timeout: 60000 });

      // Wait for page to fully load and log current URL
      await new Promise(r => setTimeout(r, 2000));
      console.log('[VLS] Add Listing URL:', page.url());

      // Check if we got an error page
      const pageContent = await page.content();
      if (pageContent.includes('500') || pageContent.includes('Error') || pageContent.includes('error')) {
        console.log('[VLS] Possible error on page, checking...');
      }

      // Wait for the classification radio buttons to be present
      try {
        await page.waitForSelector('input[name="list_class"]', { timeout: 10000 });
      } catch (e) {
        console.log('[VLS] Form not found, taking screenshot for debug...');
        throw new Error('Add Listing form did not load properly');
      }

      // Step 2: Fill Step 1 - Basic Info
      console.log('[VLS] Filling Step 1 - Basic Info...');
      await this.fillStep1(page, listing);

      // Step 3: Click Continue and wait for Step 2
      console.log('[VLS] Submitting Step 1...');
      await Promise.all([
        page.click('input[type="submit"]'),
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {
          console.log('[VLS] Step 1 navigation timeout, continuing...');
        }),
      ]);
      await new Promise(r => setTimeout(r, 2000));
      console.log('[VLS] Current URL after Step 1:', page.url());

      // Step 4: Fill Step 2 - Property Details
      console.log('[VLS] Filling Step 2 - Property Details...');
      await this.fillStep2(page, listing);

      // Step 5: Submit the listing
      console.log('[VLS] Submitting listing...');
      const submitBtn = await page.$('input[type="submit"][value="Submit"]') ||
                        await page.$('input[type="submit"]');
      if (submitBtn) {
        await Promise.all([
          submitBtn.click(),
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {
            console.log('[VLS] Submit navigation timeout, continuing...');
          }),
        ]);
      }
      await new Promise(r => setTimeout(r, 2000));

      // Step 6: Extract VLS listing ID from URL
      const currentUrl = page.url();
      console.log('[VLS] URL after submit:', currentUrl);
      const listingIdMatch = currentUrl.match(/in_listing=(\d+)/);
      const vlsListingId = listingIdMatch ? listingIdMatch[1] : undefined;
      console.log('[VLS] Listing ID:', vlsListingId);

      // Step 7: Upload images if available
      if (vlsListingId && imagePaths.length > 0) {
        console.log('[VLS] Uploading images...');
        await this.uploadImages(page, vlsListingId, imagePaths);
      }

      return {
        success: true,
        vlsListingId,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[VLS] Failed to post listing:', message);
      return { success: false, error: message };
    }
  }

  /**
   * Fill Step 1 - Basic listing info
   */
  private async fillStep1(page: Page, listing: MLSListing): Promise<void> {
    // Wait for page to fully render
    await new Promise(r => setTimeout(r, 1000));

    console.log(`[VLS] Step 1: Posting as ${listing.listingType === 'Rent' ? 'RENTAL' : 'FOR SALE'} - $${listing.price}`);
    console.log('[VLS] Step 1: Selecting classification...');
    // Select classification (property type) - field name is "list_class"
    const classification = PROPERTY_TYPE_MAP[listing.propertyType] || 'RES';
    console.log('[VLS] Step 1: Classification value:', classification);

    // Wait for specific radio button and click using evaluate for reliability
    const selector = `input[name="list_class"][value="${classification}"]`;
    await page.waitForSelector(selector, { timeout: 10000 });
    await page.evaluate((sel) => {
      const el = document.querySelector(sel) as HTMLInputElement;
      if (el) el.click();
    }, selector);

    // Select "For Sale" or "For Rent" based on listing type
    if (listing.listingType === 'Rent') {
      console.log('[VLS] Step 1: Checking For Rent...');
      const forRentCheckbox = await page.$('input[type="checkbox"][name="for_rent"]');
      if (forRentCheckbox) {
        const isChecked = await page.evaluate(el => (el as HTMLInputElement).checked, forRentCheckbox);
        if (!isChecked) {
          await forRentCheckbox.click();
        }
      }
    } else {
      console.log('[VLS] Step 1: Checking For Sale...');
      const forSaleCheckbox = await page.$('input[type="checkbox"][name="for_sale"]');
      if (forSaleCheckbox) {
        const isChecked = await page.evaluate(el => (el as HTMLInputElement).checked, forSaleCheckbox);
        if (!isChecked) {
          await forSaleCheckbox.click();
        }
      }
    }

    // Parse address components
    const addressParts = this.parseAddress(listing.address);
    console.log('[VLS] Step 1: Address parts:', addressParts);

    // Fill street number - field name is "in_st_num"
    console.log('[VLS] Step 1: Filling street number...');
    await page.waitForSelector('input[name="in_st_num"]', { timeout: 5000 });
    await page.type('input[name="in_st_num"]', addressParts.number);

    // Fill street name - field name is "in_street"
    console.log('[VLS] Step 1: Filling street name...');
    await page.waitForSelector('input[name="in_street"]', { timeout: 5000 });
    await page.type('input[name="in_street"]', addressParts.name);

    // Fill street type - field name is "in_st_type"
    console.log('[VLS] Step 1: Filling street type...');
    await page.waitForSelector('input[name="in_st_type"]', { timeout: 5000 });
    await page.type('input[name="in_st_type"]', addressParts.type);

    // Fill zip code - field name is "in_zip"
    console.log('[VLS] Step 1: Filling zip code:', listing.zip);
    await page.waitForSelector('input[name="in_zip"]', { timeout: 5000 });
    await page.type('input[name="in_zip"]', listing.zip);

    console.log('[VLS] Step 1: Complete!');
  }

  /**
   * Fill Step 2 - Property details
   */
  private async fillStep2(page: Page, listing: MLSListing): Promise<void> {
    console.log('[VLS] Step 2: Filling price...');
    // Sale Price - field name is "LP"
    await page.type('input[name="LP"]', listing.price.toString());

    console.log('[VLS] Step 2: Selecting bedrooms...');
    // Bedrooms (dropdown) - field name is "numbeds"
    await this.selectDropdown(page, 'select[name="numbeds"]', listing.bedrooms.toString());

    console.log('[VLS] Step 2: Selecting bathrooms...');
    // Bathrooms Full (dropdown) - field name is "numfulbath"
    const fullBaths = Math.floor(listing.bathrooms);
    await this.selectDropdown(page, 'select[name="numfulbath"]', fullBaths.toString());

    // Bathrooms Half (dropdown) - field name is "numhlfbath"
    const halfBaths = listing.bathrooms % 1 >= 0.5 ? 1 : 0;
    await this.selectDropdown(page, 'select[name="numhlfbath"]', halfBaths.toString());

    console.log('[VLS] Step 2: Filling sqft...');
    // Square footage - field name is "sqft"
    await page.type('input[name="sqft"]', listing.sqft.toString());

    // Year built - field name is "built"
    if (listing.yearBuilt) {
      console.log('[VLS] Step 2: Filling year built...');
      await page.type('input[name="built"]', listing.yearBuilt.toString());
    }

    // Lot size - field name is "lotsize"
    if (listing.lotSize) {
      console.log('[VLS] Step 2: Filling lot size...');
      await page.type('input[name="lotsize"]', listing.lotSize.toString());
    }

    console.log('[VLS] Step 2: Filling description...');
    // Property description - field name is "webnote"
    // Include attribution as required by MLS
    let description = listing.description || '';

    // Add attribution line for MLS compliance
    const attributionParts: string[] = [];
    if (listing.listingAgentName) {
      attributionParts.push(`Listed by: ${listing.listingAgentName}`);
    }
    if (listing.listingOfficeName) {
      attributionParts.push(listing.listingOfficeName);
    }
    if (attributionParts.length > 0) {
      description += `\n\n${attributionParts.join(' - ')}`;
    }

    const descTextarea = await page.$('textarea[name="webnote"]');
    if (descTextarea) {
      await descTextarea.type(description);
    }

    console.log('[VLS] Step 2: Complete!');
  }

  /**
   * Upload images to a listing
   */
  private async uploadImages(page: Page, listingId: string, imagePaths: string[]): Promise<void> {
    if (imagePaths.length === 0) {
      console.log('[VLS] No images to upload');
      return;
    }

    console.log(`[VLS] Uploading ${imagePaths.length} images...`);

    try {
      // Navigate to the upload page
      await page.goto(`https://vlshomes.com/members_mobi/ask_multiple.cfm?in_listing=${listingId}`, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      await new Promise(r => setTimeout(r, 1000));

      // Find the file input (supports multiple files)
      const fileInput = await page.$('input#get_photos');
      if (!fileInput) {
        console.warn('[VLS] File input not found on upload page');
        return;
      }

      // Upload ALL images at once (the input has multiple="" attribute)
      console.log(`[VLS] Selecting ${imagePaths.length} files for upload...`);
      await fileInput.uploadFile(...imagePaths);
      console.log(`[VLS] All ${imagePaths.length} files selected successfully`);

      // Wait a moment for files to be processed
      await new Promise(r => setTimeout(r, 2000));

      // The submit button is hidden by default (display: none)
      // Make it visible first, then click it
      await page.evaluate(() => {
        const submitBtn = document.querySelector('input[type="submit"]') as HTMLElement;
        if (submitBtn) {
          submitBtn.style.display = 'inline-block';
        }
      });

      // Find and click the submit/upload button
      const submitBtn = await page.$('input[type="submit"]');
      if (submitBtn) {
        await Promise.all([
          submitBtn.click(),
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {
            console.log('[VLS] Upload navigation timeout, continuing...');
          }),
        ]);
        console.log(`[VLS] All ${imagePaths.length} images uploaded successfully`);
      } else {
        console.warn('[VLS] Submit button not found on upload page');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[VLS] Failed to upload images:`, message);
    }

    console.log(`[VLS] Finished uploading images`);
  }

  /**
   * Check if a listing already exists on VLS Homes
   */
  async checkDuplicate(mlsNumber: string): Promise<boolean> {
    if (!this.page) await this.init();
    if (!this.isLoggedIn) await this.login();

    try {
      const page = this.page!;

      // Navigate to listings page and search
      await page.goto(VLS_URLS.myListings, { waitUntil: 'networkidle2' });

      // Check if MLS number appears on the page
      const pageContent = await page.content();
      return pageContent.includes(mlsNumber);
    } catch (error) {
      console.error('Duplicate check failed:', error);
      return false;
    }
  }

  /**
   * Delete a listing from VLS Homes
   */
  async deleteListing(vlsListingId: string): Promise<boolean> {
    if (!this.page) await this.init();
    if (!this.isLoggedIn) await this.login();

    try {
      const page = this.page!;

      // Navigate to delete page
      await page.goto(`https://vlshomes.com/members_mobi/upddel.cfm?in_listing=${vlsListingId}`, {
        waitUntil: 'networkidle2',
      });

      // Click delete button
      await page.click('input[type="submit"][value="Delete"]');
      await page.waitForNavigation({ waitUntil: 'networkidle2' });

      return true;
    } catch (error) {
      console.error('Delete listing failed:', error);
      return false;
    }
  }

  /**
   * Parse address into components
   */
  private parseAddress(address: string): { number: string; name: string; type: string } {
    // Basic address parsing (e.g., "123 Main St" -> { number: "123", name: "Main", type: "St" })
    const parts = address.trim().split(/\s+/);

    if (parts.length >= 3) {
      return {
        number: parts[0],
        name: parts.slice(1, -1).join(' '),
        type: parts[parts.length - 1],
      };
    } else if (parts.length === 2) {
      return {
        number: parts[0],
        name: parts[1],
        type: '',
      };
    } else {
      return {
        number: '',
        name: address,
        type: '',
      };
    }
  }

  /**
   * Select dropdown option by value
   */
  private async selectDropdown(page: Page, selector: string, value: string): Promise<void> {
    try {
      await page.select(selector, value);
    } catch (error) {
      // Try clicking option directly if select doesn't work
      const dropdown = await page.$(selector);
      if (dropdown) {
        await dropdown.click();
        await page.waitForSelector(`${selector} option[value="${value}"]`);
        await page.click(`${selector} option[value="${value}"]`);
      }
    }
  }
}

/**
 * Create a VLS poster instance
 */
export function createVLSPoster(credentials: VLSCredentials): VLSPoster {
  return new VLSPoster({ credentials });
}
