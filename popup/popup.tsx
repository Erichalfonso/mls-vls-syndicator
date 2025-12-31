import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';

const BACKEND_URL = 'http://localhost:8000';

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
    addMessage('system', 'Logged out successfully');
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

  // Main interface (authenticated)
  return (
    <div className="app">
      <div className="header">
        <h1>Claude Browser Agent</h1>
        <button onClick={() => setShowSettings(!showSettings)} className="settings-btn">
          ⚙️
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
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);
