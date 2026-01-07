import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
import { CONFIG } from '../config';

const BACKEND_URL = CONFIG.BACKEND_URL;

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

interface AgentStatus {
  running: boolean;
  currentAction?: string;
  progress?: string;
}

interface User {
  id: number;
  email: string;
  fullName: string;
  subscriptionTier: string;
}

interface Workflow {
  id: number;
  name: string;
  description: string;
  website: string;
  status: string;
  recordedActions: any[];
  isScheduled: boolean;
  scheduleStartTime: string | null;
  scheduleEndTime: string | null;
  scheduleDays: string[] | null;
  scheduleTimezone: string | null;
  lastScheduledRun: string | null;
  createdAt: string;
}

interface ScheduleSettings {
  isScheduled: boolean;
  scheduleStartTime: string;
  scheduleEndTime: string;
  scheduleDays: string[];
  scheduleTimezone: string;
}

type TabType = 'chat' | 'workflows';

// Schedule Modal Component
const DAYS = [
  { value: 'monday', label: 'Mon' },
  { value: 'tuesday', label: 'Tue' },
  { value: 'wednesday', label: 'Wed' },
  { value: 'thursday', label: 'Thu' },
  { value: 'friday', label: 'Fri' },
  { value: 'saturday', label: 'Sat' },
  { value: 'sunday', label: 'Sun' },
];

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'Pacific/Honolulu',
];

interface ScheduleModalProps {
  workflow: Workflow;
  onClose: () => void;
  onSave: (workflowId: number, schedule: ScheduleSettings) => Promise<void>;
}

function ScheduleModal({ workflow, onClose, onSave }: ScheduleModalProps) {
  const [isScheduled, setIsScheduled] = useState(workflow.isScheduled || false);
  const [startTime, setStartTime] = useState(workflow.scheduleStartTime || '09:00');
  const [endTime, setEndTime] = useState(workflow.scheduleEndTime || '17:00');
  const [selectedDays, setSelectedDays] = useState<string[]>(
    workflow.scheduleDays || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
  );
  const [timezone, setTimezone] = useState(workflow.scheduleTimezone || 'America/New_York');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleDayToggle = (day: string) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleSave = async () => {
    setError('');

    if (isScheduled) {
      if (!startTime || !endTime) {
        setError('Set both start and end times');
        return;
      }
      if (selectedDays.length === 0) {
        setError('Select at least one day');
        return;
      }
      if (startTime >= endTime) {
        setError('End time must be after start time');
        return;
      }
    }

    setSaving(true);

    try {
      await onSave(workflow.id, {
        isScheduled,
        scheduleStartTime: startTime,
        scheduleEndTime: endTime,
        scheduleDays: selectedDays,
        scheduleTimezone: timezone,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save schedule');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Schedule: {workflow.name}</h3>
          <button className="modal-close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {error && <div className="modal-error">{error}</div>}

          <label className="schedule-toggle">
            <input
              type="checkbox"
              checked={isScheduled}
              onChange={(e) => setIsScheduled(e.target.checked)}
            />
            <span>Enable Scheduled Runs</span>
          </label>

          {isScheduled && (
            <>
              <div className="time-row">
                <div className="time-field">
                  <label>Start</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>
                <div className="time-field">
                  <label>End</label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
              </div>

              <div className="days-section">
                <label>Active Days</label>
                <div className="days-grid">
                  {DAYS.map((day) => (
                    <button
                      key={day.value}
                      type="button"
                      className={`day-btn ${selectedDays.includes(day.value) ? 'active' : ''}`}
                      onClick={() => handleDayToggle(day.value)}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="timezone-section">
                <label>Timezone</label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz.replace('America/', '').replace('Pacific/', '').replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>

              {workflow.lastScheduledRun && (
                <div className="last-run-info">
                  Last run: {new Date(workflow.lastScheduledRun).toLocaleString()}
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-cancel" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn-save" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<AgentStatus>({ running: false });
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authToken, setAuthToken] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [isSignupMode, setIsSignupMode] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Tab and workflows state
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [workflowsLoading, setWorkflowsLoading] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  // Authentication form state
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authFullName, setAuthFullName] = useState('');

  useEffect(() => {
    // Load auth token from storage and verify it
    chrome.storage.local.get(['authToken', 'user'], async (result) => {
      if (result.authToken) {
        try {
          // Verify token with backend
          const response = await fetch(`${BACKEND_URL}/api/auth/me`, {
            headers: {
              'Authorization': `Bearer ${result.authToken}`
            }
          });

          const data = await response.json();
          if (data.success) {
            setAuthToken(result.authToken);
            setUser(data.data.user);
            setIsLoggedIn(true);
          } else {
            // Token invalid, clear storage
            chrome.storage.local.remove(['authToken', 'user']);
          }
        } catch (error) {
          console.error('Token verification failed:', error);
          chrome.storage.local.remove(['authToken', 'user']);
        }
      }
      setAuthLoading(false);
    });

    // Listen for status updates from background
    chrome.runtime.onMessage.addListener((message) => {
      try {
        if (message.type === 'status_update') {
          setStatus(message.status);
        } else if (message.type === 'agent_message') {
          if (typeof message.content === 'string') {
            addMessage('assistant', message.content);
          } else {
            console.error('Invalid message content:', message.content);
            addMessage('system', 'Error: Invalid message format');
          }
        }
      } catch (error) {
        console.error('Error handling message:', error, message);
        addMessage('system', `Error: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addMessage = (role: 'user' | 'assistant' | 'system', content: string) => {
    setMessages(prev => {
      const previousMessages = Array.isArray(prev) ? prev : [];
      return [...previousMessages, { role, content, timestamp: new Date() }];
    });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: authEmail,
          password: authPassword
        })
      });

      const data = await response.json();

      if (data.success) {
        setAuthToken(data.data.token);
        setUser(data.data.user);
        setIsLoggedIn(true);

        // Store in chrome.storage
        await chrome.storage.local.set({
          authToken: data.data.token,
          user: data.data.user
        });

        addMessage('system', `Welcome back, ${data.data.user.fullName}!`);

        // Clear form
        setAuthEmail('');
        setAuthPassword('');
      } else {
        addMessage('system', `Login failed: ${data.error || 'Invalid credentials'}`);
      }
    } catch (error) {
      addMessage('system', `Login error: ${error instanceof Error ? error.message : 'Network error'}`);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: authEmail,
          password: authPassword,
          fullName: authFullName
        })
      });

      const data = await response.json();

      if (data.success) {
        setAuthToken(data.data.token);
        setUser(data.data.user);
        setIsLoggedIn(true);

        // Store in chrome.storage
        await chrome.storage.local.set({
          authToken: data.data.token,
          user: data.data.user
        });

        addMessage('system', `Account created! Welcome, ${data.data.user.fullName}!`);

        // Clear form
        setAuthEmail('');
        setAuthPassword('');
        setAuthFullName('');
        setIsSignupMode(false);
      } else {
        addMessage('system', `Signup failed: ${data.error || 'Could not create account'}`);
      }
    } catch (error) {
      addMessage('system', `Signup error: ${error instanceof Error ? error.message : 'Network error'}`);
    }
  };

  const handleLogout = async () => {
    await chrome.storage.local.remove(['authToken', 'user']);
    setAuthToken('');
    setUser(null);
    setIsLoggedIn(false);
    setMessages([]);
    setShowSettings(false);
    setWorkflows([]);
    addMessage('system', 'Logged out successfully');
  };

  // Load workflows from backend
  const loadWorkflows = async () => {
    if (!authToken) return;

    setWorkflowsLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/workflows`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      const data = await response.json();
      if (data.success && data.data?.workflows) {
        setWorkflows(data.data.workflows);
      }
    } catch (error) {
      console.error('Failed to load workflows:', error);
    } finally {
      setWorkflowsLoading(false);
    }
  };

  // Save schedule settings
  const handleSaveSchedule = async (workflowId: number, schedule: ScheduleSettings) => {
    const response = await fetch(`${BACKEND_URL}/api/workflows/${workflowId}/schedule`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify(schedule)
    });

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || 'Failed to save schedule');
    }

    // Update workflow in local state
    if (data.data?.workflow) {
      setWorkflows(workflows.map(w =>
        w.id === workflowId ? data.data.workflow : w
      ));
    }
  };

  // Load workflows when switching to workflows tab
  useEffect(() => {
    if (activeTab === 'workflows' && isLoggedIn && workflows.length === 0) {
      loadWorkflows();
    }
  }, [activeTab, isLoggedIn]);

  const openScheduleModal = (workflow: Workflow) => {
    setSelectedWorkflow(workflow);
    setShowScheduleModal(true);
  };

  // Finalize a workflow (change from learning to ready)
  const handleFinalizeWorkflow = async (workflowId: number) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/workflows/${workflowId}/finalize`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      const data = await response.json();
      if (data.success && data.data?.workflow) {
        setWorkflows(workflows.map(w =>
          w.id === workflowId ? data.data.workflow : w
        ));
      } else {
        alert(data.error || 'Failed to finalize workflow');
      }
    } catch (error) {
      console.error('Failed to finalize workflow:', error);
      alert('Failed to finalize workflow');
    }
  };

  // Delete a workflow
  const handleDeleteWorkflow = async (workflowId: number) => {
    if (!confirm('Delete this workflow?')) return;

    try {
      const response = await fetch(`${BACKEND_URL}/api/workflows/${workflowId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      const data = await response.json();
      if (data.success) {
        setWorkflows(workflows.filter(w => w.id !== workflowId));
      } else {
        alert(data.error || 'Failed to delete workflow');
      }
    } catch (error) {
      console.error('Failed to delete workflow:', error);
      alert('Failed to delete workflow');
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !authToken) return;

    const userMessage = input.trim();
    setInput('');
    addMessage('user', userMessage);

    // Send to background script with auth token
    chrome.runtime.sendMessage({
      type: 'run_agent',
      goal: userMessage,
      authToken: authToken
    });
  };

  const handleStop = () => {
    chrome.runtime.sendMessage({ type: 'stop_agent' });
    setStatus({ running: false });
  };

  // Show loading state while verifying token
  if (authLoading) {
    return (
      <div className="app">
        <div className="auth-container">
          <h1>Claude Browser Agent</h1>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // Show login/signup form if not authenticated
  if (!isLoggedIn) {
    return (
      <div className="app">
        <div className="auth-container">
          <h1>Claude Browser Agent</h1>
          <p className="auth-subtitle">AI-powered browser automation</p>

          <form onSubmit={isSignupMode ? handleSignup : handleLogin} className="auth-form">
            <h2>{isSignupMode ? 'Create Account' : 'Sign In'}</h2>

            {isSignupMode && (
              <input
                type="text"
                placeholder="Full Name"
                value={authFullName}
                onChange={(e) => setAuthFullName(e.target.value)}
                required
              />
            )}

            <input
              type="email"
              placeholder="Email"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              required
            />

            <input
              type="password"
              placeholder="Password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              required
            />

            <button type="submit" className="auth-submit-btn">
              {isSignupMode ? 'Sign Up' : 'Sign In'}
            </button>

            <p className="auth-toggle">
              {isSignupMode ? 'Already have an account?' : "Don't have an account?"}{' '}
              <a onClick={() => setIsSignupMode(!isSignupMode)}>
                {isSignupMode ? 'Sign In' : 'Sign Up'}
              </a>
            </p>
          </form>

          {messages.length > 0 && (
            <div className="auth-messages">
              {messages.map((msg, idx) => (
                <div key={idx} className={`message message-${msg.role}`}>
                  {msg.content}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Helper to get status badge
  const getStatusBadge = (wfStatus: string) => {
    const badges: Record<string, { text: string; className: string }> = {
      learning: { text: 'Learning', className: 'badge-learning' },
      ready: { text: 'Ready', className: 'badge-ready' },
      active: { text: 'Active', className: 'badge-active' },
    };
    return badges[wfStatus] || { text: wfStatus, className: '' };
  };

  // Main interface (authenticated)
  return (
    <div className="app">
      <div className="header">
        <h1>Claude Browser Agent</h1>
        <button onClick={() => setShowSettings(!showSettings)} className="settings-btn">
          ⚙️
        </button>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
        >
          💬 Chat
        </button>
        <button
          className={`tab ${activeTab === 'workflows' ? 'active' : ''}`}
          onClick={() => setActiveTab('workflows')}
        >
          📋 Workflows
        </button>
      </div>

      {showSettings && (
        <div className="settings-panel">
          <h3>Account</h3>
          <div className="user-info">
            <p><strong>Name:</strong> {user?.fullName}</p>
            <p><strong>Email:</strong> {user?.email}</p>
            <p><strong>Plan:</strong> {user?.subscriptionTier}</p>
          </div>
          <button onClick={handleLogout} className="logout-btn">Logout</button>
          <button onClick={() => setShowSettings(false)}>Close</button>
        </div>
      )}

      {status.running && (
        <div className="status-bar">
          <div className="spinner"></div>
          <div className="status-text">
            <div className="status-action">{status.currentAction || 'Thinking...'}</div>
            {status.progress && <div className="status-progress">{status.progress}</div>}
          </div>
          <button onClick={handleStop} className="stop-btn">Stop</button>
        </div>
      )}

      {/* Chat Tab */}
      {activeTab === 'chat' && (
        <>
          <div className="messages">
            {messages.length === 0 && (
              <div className="welcome">
                <h2>👋 Welcome!</h2>
                <p>Tell me what you want to automate on this page.</p>
                <div className="examples">
                  <h3>Examples:</h3>
                  <ul>
                    <li>"Fill out this form with my resume data"</li>
                    <li>"Find all product links and save to a file"</li>
                    <li>"Upload photos from my Downloads folder"</li>
                    <li>"Click through this checkout flow"</li>
                  </ul>
                </div>
              </div>
            )}

            {Array.isArray(messages) && messages.map((msg, idx) => (
              <div key={idx} className={`message message-${msg.role}`}>
                <div className="message-header">
                  <span className="message-role">
                    {msg.role === 'user' ? '👤' : msg.role === 'assistant' ? '🤖' : 'ℹ️'}
                  </span>
                  <span className="message-time">
                    {msg.timestamp.toLocaleTimeString()}
                  </span>
                </div>
                <div className="message-content">{msg.content}</div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="input-area">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="What would you like me to do on this page?"
              disabled={status.running}
              rows={3}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || status.running}
              className="send-btn"
            >
              Send
            </button>
          </div>
        </>
      )}

      {/* Workflows Tab */}
      {activeTab === 'workflows' && (
        <div className="workflows-container">
          <div className="workflows-header">
            <h2>My Workflows</h2>
            <button onClick={loadWorkflows} className="refresh-btn" disabled={workflowsLoading}>
              {workflowsLoading ? '...' : '🔄'}
            </button>
          </div>

          {workflowsLoading ? (
            <div className="workflows-loading">Loading workflows...</div>
          ) : workflows.length === 0 ? (
            <div className="workflows-empty">
              <p>No workflows yet.</p>
              <p className="hint">Use the Chat tab to create a new workflow by telling the AI what to automate.</p>
            </div>
          ) : (
            <div className="workflows-list">
              {workflows.map((workflow) => {
                const badge = getStatusBadge(workflow.status);
                const isReady = workflow.status === 'ready' || workflow.status === 'active';

                return (
                  <div key={workflow.id} className="workflow-item">
                    <div className="workflow-item-header">
                      <span className="workflow-name">{workflow.name}</span>
                      <span className={`workflow-badge ${badge.className}`}>{badge.text}</span>
                    </div>

                    <div className="workflow-item-meta">
                      <span className="workflow-website">{workflow.website}</span>
                      {workflow.recordedActions && (
                        <span className="workflow-steps">
                          {(workflow.recordedActions as any[]).length} steps
                        </span>
                      )}
                    </div>

                    {workflow.isScheduled && (
                      <div className="workflow-schedule-info">
                        ⏰ {workflow.scheduleStartTime} - {workflow.scheduleEndTime}
                      </div>
                    )}

                    <div className="workflow-item-actions">
                      {workflow.status === 'learning' && (
                        <button
                          className="btn-finalize"
                          onClick={() => handleFinalizeWorkflow(workflow.id)}
                        >
                          ✓ Mark Ready
                        </button>
                      )}
                      {isReady && (
                        <button
                          className="btn-schedule-small"
                          onClick={() => openScheduleModal(workflow)}
                        >
                          {workflow.isScheduled ? '⏰ Edit Schedule' : '⏰ Schedule'}
                        </button>
                      )}
                      <button
                        className="btn-delete-small"
                        onClick={() => handleDeleteWorkflow(workflow.id)}
                        title="Delete workflow"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Schedule Modal */}
      {showScheduleModal && selectedWorkflow && (
        <ScheduleModal
          workflow={selectedWorkflow}
          onClose={() => {
            setShowScheduleModal(false);
            setSelectedWorkflow(null);
          }}
          onSave={handleSaveSchedule}
        />
      )}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);
