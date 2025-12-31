// Workflows list page - shows all workflows with run buttons

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { workflowsApi } from '../services/api';
import type { Workflow } from '../types';
import './Workflows.css';

export default function Workflows() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    loadWorkflows();
  }, []);

  const loadWorkflows = async () => {
    setLoading(true);
    setError('');

    const response = await workflowsApi.list();
    if (response.success && response.data) {
      setWorkflows(response.data.workflows);
    } else {
      setError(response.error || 'Failed to load workflows');
    }

    setLoading(false);
  };

  const handleRunWorkflow = (workflowId: number) => {
    navigate(`/run/${workflowId}`);
  };

  const handleDeleteWorkflow = async (id: number) => {
    if (!confirm('Are you sure you want to delete this workflow?')) return;

    const response = await workflowsApi.delete(id);
    if (response.success) {
      setWorkflows(workflows.filter(w => w.id !== id));
    } else {
      alert(response.error || 'Failed to delete workflow');
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { text: string; className: string }> = {
      learning: { text: 'Learning...', className: 'status-learning' },
      ready: { text: 'Ready', className: 'status-ready' },
      active: { text: 'Active', className: 'status-active' },
    };
    return badges[status] || { text: status, className: '' };
  };

  return (
    <div className="workflows-page">
      <header className="page-header">
        <div className="header-content">
          <h1>My Workflows</h1>
          <div className="header-actions">
            <span className="user-info">
              {user?.fullName} ({user?.subscriptionTier})
            </span>
            <button onClick={logout} className="logout-btn">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="page-content">
        {error && <div className="error-banner">{error}</div>}

        {loading ? (
          <div className="loading">Loading workflows...</div>
        ) : workflows.length === 0 ? (
          <div className="empty-state">
            <h2>No Workflows Yet</h2>
            <p>Create your first workflow using the Chrome extension.</p>
            <ol className="instructions">
              <li>Open the Chrome extension</li>
              <li>Navigate to the website you want to automate</li>
              <li>Tell the AI what to do (e.g., "Upload a listing")</li>
              <li>The workflow will appear here when learning is complete</li>
            </ol>
          </div>
        ) : (
          <div className="workflows-grid">
            {workflows.map((workflow) => {
              const badge = getStatusBadge(workflow.status);
              const isReady = workflow.status === 'ready';

              return (
                <div key={workflow.id} className="workflow-card">
                  <div className="workflow-header">
                    <h3>{workflow.name}</h3>
                    <span className={`status-badge ${badge.className}`}>
                      {badge.text}
                    </span>
                  </div>

                  {workflow.description && (
                    <p className="workflow-description">{workflow.description}</p>
                  )}

                  <div className="workflow-meta">
                    <div className="meta-item">
                      <span className="meta-label">Website:</span>
                      <span className="meta-value">{workflow.website}</span>
                    </div>
                    <div className="meta-item">
                      <span className="meta-label">Created:</span>
                      <span className="meta-value">
                        {new Date(workflow.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    {workflow.recordedActions && (
                      <div className="meta-item">
                        <span className="meta-label">Actions:</span>
                        <span className="meta-value">
                          {(workflow.recordedActions as any[]).length} steps
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="workflow-actions">
                    {isReady ? (
                      <button
                        onClick={() => handleRunWorkflow(workflow.id)}
                        className="btn-primary"
                      >
                        Run Workflow
                      </button>
                    ) : (
                      <button className="btn-disabled" disabled>
                        {workflow.status === 'learning'
                          ? 'Still Learning...'
                          : 'Not Ready'}
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteWorkflow(workflow.id)}
                      className="btn-danger"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
