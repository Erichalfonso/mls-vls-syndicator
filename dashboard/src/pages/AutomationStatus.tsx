// Automation status page - shows real-time progress

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { automationApi } from '../services/api';
import type { AutomationRun, Listing } from '../types';
import './AutomationStatus.css';

export default function AutomationStatus() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();

  const [run, setRun] = useState<AutomationRun | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadStatus();

    // Poll for updates every 2 seconds
    const interval = setInterval(() => {
      if (run?.status !== 'running') {
        clearInterval(interval);
      } else {
        loadStatus();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [runId, run?.status]);

  const loadStatus = async () => {
    if (!runId) return;

    const response = await automationApi.getStatus(parseInt(runId));
    if (response.success && response.data) {
      setRun(response.data.run);
      setListings(response.data.listings);
    } else {
      setError(response.error || 'Failed to load status');
    }
    setLoading(false);
  };

  if (loading) {
    return <div className="loading">Loading automation status...</div>;
  }

  if (!run) {
    return <div className="error-page">Automation run not found</div>;
  }

  const progress = (run.successfulListings / run.totalListings) * 100;
  const isComplete = run.status === 'completed' || run.status === 'failed';

  return (
    <div className="automation-status-page">
      <header className="page-header">
        <div className="header-content">
          <button onClick={() => navigate('/workflows')} className="back-btn">
            ← Back to Workflows
          </button>
          <h1>Automation Progress</h1>
        </div>
      </header>

      <main className="page-content">
        {error && <div className="error-banner">{error}</div>}

        <div className="status-overview">
          <div className="status-card">
            <h3>Status</h3>
            <div className={`status-badge status-${run.status}`}>
              {run.status === 'running' && '⏳ Running'}
              {run.status === 'completed' && '✓ Completed'}
              {run.status === 'failed' && '✗ Failed'}
            </div>
          </div>

          <div className="status-card">
            <h3>Progress</h3>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }}></div>
            </div>
            <p className="progress-text">
              {run.successfulListings} / {run.totalListings} ({progress.toFixed(0)}%)
            </p>
          </div>

          <div className="status-card">
            <h3>Success Rate</h3>
            <p className="success-rate">
              {run.totalListings > 0
                ? ((run.successfulListings / run.totalListings) * 100).toFixed(1)
                : 0}
              %
            </p>
            <p className="secondary-text">
              {run.successfulListings} succeeded, {run.failedListings} failed
            </p>
          </div>

          <div className="status-card">
            <h3>Duration</h3>
            <p className="duration">
              {run.completedAt
                ? `${Math.round(
                    (new Date(run.completedAt).getTime() -
                      new Date(run.startedAt).getTime()) /
                      1000
                  )}s`
                : 'Running...'}
            </p>
            <p className="secondary-text">
              Started: {new Date(run.startedAt).toLocaleTimeString()}
            </p>
          </div>
        </div>

        <div className="listings-status">
          <h2>Listing Details</h2>

          <div className="listings-table">
            <div className="table-header">
              <div className="col-address">Address</div>
              <div className="col-status">Status</div>
              <div className="col-result">Result</div>
            </div>

            {listings.map((listing) => (
              <div key={listing.id} className="table-row">
                <div className="col-address">
                  <strong>{listing.address}</strong>
                  <span className="city">
                    {listing.city}, {listing.state}
                  </span>
                </div>

                <div className="col-status">
                  <span className={`listing-status status-${listing.uploadStatus}`}>
                    {listing.uploadStatus === 'pending' && '⏸ Pending'}
                    {listing.uploadStatus === 'processing' && '⏳ Processing'}
                    {listing.uploadStatus === 'completed' && '✓ Uploaded'}
                    {listing.uploadStatus === 'failed' && '✗ Failed'}
                  </span>
                </div>

                <div className="col-result">
                  {listing.uploadStatus === 'completed' && (
                    <span className="success">Success</span>
                  )}
                  {listing.uploadStatus === 'failed' && (
                    <span className="error">
                      {listing.uploadResult?.error || 'Unknown error'}
                    </span>
                  )}
                  {listing.uploadStatus === 'processing' && (
                    <span className="processing">Processing...</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {isComplete && (
          <div className="completion-actions">
            {run.status === 'completed' && (
              <div className="success-message">
                All listings processed successfully!
              </div>
            )}
            {run.status === 'failed' && (
              <div className="failure-message">
                Automation failed. Check error logs above.
              </div>
            )}

            <button onClick={() => navigate('/workflows')} className="done-btn">
              Done
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
