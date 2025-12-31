// Run workflow page - upload CSV and start automation

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { workflowsApi, listingsApi, automationApi } from '../services/api';
import type { Workflow, Listing } from '../types';
import './RunWorkflow.css';

export default function RunWorkflow() {
  const { workflowId } = useParams<{ workflowId: string }>();
  const navigate = useNavigate();

  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadWorkflow();
    loadListings();
  }, [workflowId]);

  const loadWorkflow = async () => {
    if (!workflowId) return;

    const response = await workflowsApi.get(parseInt(workflowId));
    if (response.success && response.data) {
      setWorkflow(response.data.workflow);
    } else {
      setError(response.error || 'Failed to load workflow');
    }
    setLoading(false);
  };

  const loadListings = async () => {
    const response = await listingsApi.list();
    if (response.success && response.data) {
      setListings(response.data.listings.filter(l => l.uploadStatus === 'pending'));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.name.endsWith('.csv') || file.name.endsWith('.xlsx')) {
        setCsvFile(file);
        setError('');
      } else {
        setError('Please select a CSV or Excel file');
        setCsvFile(null);
      }
    }
  };

  const handleUploadCsv = async () => {
    if (!csvFile) return;

    setUploading(true);
    setError('');

    try {
      const response = await listingsApi.uploadCsv(csvFile);
      if (response.success && response.data) {
        setListings(response.data.listings);
        setCsvFile(null);
        alert(`Successfully uploaded ${response.data.listings.length} listings!`);
      } else {
        setError(response.error || 'Failed to upload CSV');
      }
    } catch (err) {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleStartAutomation = async () => {
    if (!workflowId || listings.length === 0) return;

    setStarting(true);
    setError('');

    try {
      const response = await automationApi.start(
        parseInt(workflowId),
        listings.map(l => l.id)
      );

      if (response.success && response.data) {
        navigate(`/status/${response.data.automationRun.id}`);
      } else {
        setError(response.error || 'Failed to start automation');
      }
    } catch (err) {
      setError('Failed to start automation. Please try again.');
    } finally {
      setStarting(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading workflow...</div>;
  }

  if (!workflow) {
    return <div className="error-page">Workflow not found</div>;
  }

  return (
    <div className="run-workflow-page">
      <header className="page-header">
        <div className="header-content">
          <button onClick={() => navigate('/workflows')} className="back-btn">
            ← Back
          </button>
          <h1>Run: {workflow.name}</h1>
        </div>
      </header>

      <main className="page-content">
        {error && <div className="error-banner">{error}</div>}

        <div className="workflow-info">
          <h2>Workflow Details</h2>
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">Website:</span>
              <span className="info-value">{workflow.website}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Status:</span>
              <span className="info-value">{workflow.status}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Actions:</span>
              <span className="info-value">
                {workflow.recordedActions
                  ? (workflow.recordedActions as any[]).length
                  : 0}{' '}
                steps
              </span>
            </div>
          </div>
        </div>

        <div className="upload-section">
          <h2>Step 1: Upload Listings</h2>
          <p>Upload a CSV or Excel file containing your listing data.</p>

          <div className="upload-area">
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileChange}
              id="csv-upload"
              className="file-input"
            />
            <label htmlFor="csv-upload" className="file-label">
              {csvFile ? csvFile.name : 'Choose CSV or Excel file'}
            </label>

            {csvFile && (
              <button
                onClick={handleUploadCsv}
                disabled={uploading}
                className="upload-btn"
              >
                {uploading ? 'Uploading...' : 'Upload File'}
              </button>
            )}
          </div>
        </div>

        <div className="listings-section">
          <h2>Step 2: Review Listings</h2>
          {listings.length === 0 ? (
            <div className="empty-state">
              <p>No pending listings. Upload a CSV file to get started.</p>
            </div>
          ) : (
            <>
              <p>
                Found <strong>{listings.length}</strong> pending listings.
              </p>
              <div className="listings-preview">
                {listings.slice(0, 5).map((listing) => (
                  <div key={listing.id} className="listing-card">
                    <div className="listing-info">
                      <strong>{listing.address}</strong>
                      <span>
                        {listing.city}, {listing.state}
                      </span>
                    </div>
                    <div className="listing-price">
                      {listing.price
                        ? `$${listing.price.toLocaleString()}`
                        : 'N/A'}
                    </div>
                  </div>
                ))}
                {listings.length > 5 && (
                  <p className="more-listings">
                    + {listings.length - 5} more listings
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="start-section">
          <h2>Step 3: Start Automation</h2>
          <p>
            This will run the workflow on all {listings.length} pending
            listings.
          </p>

          <button
            onClick={handleStartAutomation}
            disabled={starting || listings.length === 0}
            className="start-btn"
          >
            {starting ? 'Starting...' : 'Start Automation'}
          </button>

          {listings.length > 0 && (
            <div className="cost-estimate">
              <p>
                Estimated cost: ~${(listings.length * 0.001).toFixed(3)}
              </p>
              <p className="savings">
                (99.8% savings vs. pure AI approach: ~$
                {(listings.length * 0.5).toFixed(2)})
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
