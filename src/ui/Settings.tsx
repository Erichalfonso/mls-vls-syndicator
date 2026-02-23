import React, { useState } from 'react';
import type { AppSettings } from '../mls/types';

interface SettingsProps {
  settings: AppSettings;
  onSave: (settings: AppSettings) => Promise<void>;
}

export default function Settings({ settings, onSave }: SettingsProps) {
  const [formData, setFormData] = useState<AppSettings>(settings);
  const [isSaving, setIsSaving] = useState(false);
  const [showMlsPassword, setShowMlsPassword] = useState(false);
  const [showVlsPassword, setShowVlsPassword] = useState(false);
  const [showAirtableKey, setShowAirtableKey] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Local state for comma-separated text inputs (to allow typing commas)
  const [citiesText, setCitiesText] = useState(settings.searchCriteria.cities?.join(', ') || '');
  const [zipCodesText, setZipCodesText] = useState(settings.searchCriteria.zipCodes?.join(', ') || '');

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      // Parse comma-separated values before saving
      const updatedFormData = {
        ...formData,
        searchCriteria: {
          ...formData.searchCriteria,
          cities: citiesText.split(',').map(s => s.trim()).filter(Boolean),
          zipCodes: zipCodesText.split(',').map(s => s.trim()).filter(Boolean),
        },
      };
      await onSave(updatedFormData);
      setSaveMessage('Settings saved successfully!');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error) {
      setSaveMessage('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="settings">
      <section className="settings-section">
        <h2>Bridge MLS API</h2>
        <p className="section-description">
          Enter your Bridge API credentials from bridgedataoutput.com
        </p>

        <div className="form-group">
          <label>MLS Name</label>
          <input
            type="text"
            placeholder="e.g., Miami REALTORS"
            value={formData.mlsCredentials?.mlsName || ''}
            onChange={(e) =>
              setFormData({
                ...formData,
                mlsCredentials: {
                  ...formData.mlsCredentials!,
                  mlsName: e.target.value,
                  serverToken: formData.mlsCredentials?.serverToken || '',
                  mlsId: formData.mlsCredentials?.mlsId || '',
                },
              })
            }
          />
        </div>

        <div className="form-group">
          <label>MLS ID (Dataset)</label>
          <input
            type="text"
            placeholder="e.g., miamire"
            value={formData.mlsCredentials?.mlsId || ''}
            onChange={(e) =>
              setFormData({
                ...formData,
                mlsCredentials: {
                  ...formData.mlsCredentials!,
                  mlsId: e.target.value,
                },
              })
            }
          />
          <small className="help-text">The MLS dataset ID from Bridge (e.g., miamire, stellar)</small>
        </div>

        <div className="form-group">
          <label>Server Token</label>
          <div className="password-input">
            <input
              type={showMlsPassword ? 'text' : 'password'}
              placeholder="Your Bridge Server Token"
              value={formData.mlsCredentials?.serverToken || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  mlsCredentials: {
                    ...formData.mlsCredentials!,
                    serverToken: e.target.value,
                  },
                })
              }
            />
            <button
              type="button"
              className="toggle-password"
              onClick={() => setShowMlsPassword(!showMlsPassword)}
            >
              {showMlsPassword ? '🙈' : '👁️'}
            </button>
          </div>
          <small className="help-text">Found in your Bridge API dashboard under "Server Token"</small>
        </div>
      </section>

      <section className="settings-section">
        <h2>VLS Homes Login</h2>
        <p className="section-description">
          Your VLS Homes account credentials for posting listings.
        </p>

        <div className="form-group">
          <label>Email</label>
          <input
            type="email"
            placeholder="your@email.com"
            value={formData.vlsCredentials?.email || ''}
            onChange={(e) =>
              setFormData({
                ...formData,
                vlsCredentials: {
                  ...formData.vlsCredentials!,
                  email: e.target.value,
                  password: formData.vlsCredentials?.password || '',
                },
              })
            }
          />
        </div>

        <div className="form-group">
          <label>Password</label>
          <div className="password-input">
            <input
              type={showVlsPassword ? 'text' : 'password'}
              placeholder="Your VLS Homes password"
              value={formData.vlsCredentials?.password || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  vlsCredentials: {
                    ...formData.vlsCredentials!,
                    password: e.target.value,
                  },
                })
              }
            />
            <button
              type="button"
              className="toggle-password"
              onClick={() => setShowVlsPassword(!showVlsPassword)}
            >
              {showVlsPassword ? '🙈' : '👁️'}
            </button>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h2>Airtable Tracking</h2>
        <p className="section-description">
          Track synced listings in Airtable. Create a base with columns: MLS #, Address, Price, Date Synced, VLS Link
        </p>

        <div className="form-group">
          <label>Personal Access Token</label>
          <div className="password-input">
            <input
              type={showAirtableKey ? 'text' : 'password'}
              placeholder="pat..."
              value={formData.airtableCredentials?.apiKey || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  airtableCredentials: {
                    ...formData.airtableCredentials!,
                    apiKey: e.target.value,
                    baseId: formData.airtableCredentials?.baseId || '',
                    tableId: formData.airtableCredentials?.tableId || 'Listings',
                  },
                })
              }
            />
            <button
              type="button"
              className="toggle-password"
              onClick={() => setShowAirtableKey(!showAirtableKey)}
            >
              {showAirtableKey ? '🙈' : '👁️'}
            </button>
          </div>
          <small className="help-text">From airtable.com/create/tokens</small>
        </div>

        <div className="form-group">
          <label>Base ID</label>
          <input
            type="text"
            placeholder="app..."
            value={formData.airtableCredentials?.baseId || ''}
            onChange={(e) =>
              setFormData({
                ...formData,
                airtableCredentials: {
                  ...formData.airtableCredentials!,
                  baseId: e.target.value,
                },
              })
            }
          />
          <small className="help-text">Found in the URL: airtable.com/appXXXXXXX/...</small>
        </div>

        <div className="form-group">
          <label>Table Name</label>
          <input
            type="text"
            placeholder="Listings"
            value={formData.airtableCredentials?.tableId || 'Listings'}
            onChange={(e) =>
              setFormData({
                ...formData,
                airtableCredentials: {
                  ...formData.airtableCredentials!,
                  tableId: e.target.value || 'Listings',
                },
              })
            }
          />
          <small className="help-text">The name of your table (default: Listings)</small>
        </div>
      </section>

      <section className="settings-section">
        <h2>Search Criteria</h2>
        <p className="section-description">
          Filter which listings to fetch from MLS.
        </p>

        <div className="form-group">
          <label>County</label>
          <input
            type="text"
            placeholder="e.g., Miami-Dade"
            value={formData.searchCriteria.county || ''}
            onChange={(e) =>
              setFormData({
                ...formData,
                searchCriteria: {
                  ...formData.searchCriteria,
                  county: e.target.value || undefined,
                },
              })
            }
          />
          <small className="help-text">Filter by county (e.g., Miami-Dade, Broward, Palm Beach)</small>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Cities (comma separated)</label>
            <input
              type="text"
              placeholder="Miami, Hialeah, Coral Gables"
              value={citiesText}
              onChange={(e) => setCitiesText(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>ZIP Codes (comma separated)</label>
            <input
              type="text"
              placeholder="33125, 33126, 33127"
              value={zipCodesText}
              onChange={(e) => setZipCodesText(e.target.value)}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Min Price ($)</label>
            <input
              type="number"
              placeholder="100000"
              value={formData.searchCriteria.minPrice || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  searchCriteria: {
                    ...formData.searchCriteria,
                    minPrice: e.target.value ? Number(e.target.value) : undefined,
                  },
                })
              }
            />
          </div>

          <div className="form-group">
            <label>Max Price ($)</label>
            <input
              type="number"
              placeholder="500000"
              value={formData.searchCriteria.maxPrice || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  searchCriteria: {
                    ...formData.searchCriteria,
                    maxPrice: e.target.value ? Number(e.target.value) : undefined,
                  },
                })
              }
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Min Beds</label>
            <input
              type="number"
              placeholder="2"
              min="0"
              max="10"
              value={formData.searchCriteria.minBeds || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  searchCriteria: {
                    ...formData.searchCriteria,
                    minBeds: e.target.value ? Number(e.target.value) : undefined,
                  },
                })
              }
            />
          </div>

          <div className="form-group">
            <label>Max Beds</label>
            <input
              type="number"
              placeholder="5"
              min="0"
              max="10"
              value={formData.searchCriteria.maxBeds || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  searchCriteria: {
                    ...formData.searchCriteria,
                    maxBeds: e.target.value ? Number(e.target.value) : undefined,
                  },
                })
              }
            />
          </div>

          <div className="form-group">
            <label>Min Baths</label>
            <input
              type="number"
              placeholder="1"
              min="0"
              max="10"
              step="0.5"
              value={formData.searchCriteria.minBaths || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  searchCriteria: {
                    ...formData.searchCriteria,
                    minBaths: e.target.value ? Number(e.target.value) : undefined,
                  },
                })
              }
            />
          </div>
        </div>

      </section>

      <section className="settings-section">
        <h2>Auto-Sync</h2>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={formData.autoSync}
            onChange={(e) =>
              setFormData({
                ...formData,
                autoSync: e.target.checked,
              })
            }
          />
          Enable automatic syncing
        </label>

        {formData.autoSync && (
          <div className="form-group" style={{ marginTop: '1rem' }}>
            <label>Sync every (hours)</label>
            <input
              type="number"
              min="1"
              max="168"
              value={formData.syncIntervalHours}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  syncIntervalHours: Number(e.target.value) || 24,
                })
              }
            />
          </div>
        )}
      </section>

      <div className="settings-actions">
        {saveMessage && (
          <span className={`save-message ${saveMessage.includes('success') ? 'success' : 'error'}`}>
            {saveMessage}
          </span>
        )}
        <button className="btn-primary" onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
