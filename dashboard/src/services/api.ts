// API service for backend communication

import type { User, Workflow, Listing, AutomationRun, ApiResponse, ScheduleSettings } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'https://claude-browser-agent-production.up.railway.app';

// Helper function to get auth token
const getAuthToken = (): string | null => {
  return localStorage.getItem('authToken');
};

// Helper function to make authenticated requests
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = getAuthToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('API request failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

// Auth API
export const authApi = {
  signup: (email: string, password: string, fullName: string) =>
    apiRequest<{ token: string; user: User }>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, fullName }),
    }),

  login: (email: string, password: string) =>
    apiRequest<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  getMe: () => apiRequest<{ user: User }>('/api/auth/me'),
};

// Workflows API
export const workflowsApi = {
  list: () => apiRequest<{ workflows: Workflow[] }>('/api/workflows'),

  get: (id: number) => apiRequest<{ workflow: Workflow }>(`/api/workflows/${id}`),

  create: (data: { name: string; description: string; website: string }) =>
    apiRequest<{ workflow: Workflow }>('/api/workflows', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: number, data: Partial<Workflow>) =>
    apiRequest<{ workflow: Workflow }>(`/api/workflows/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: number) =>
    apiRequest<{ message: string }>(`/api/workflows/${id}`, {
      method: 'DELETE',
    }),

  finalize: (id: number) =>
    apiRequest<{ workflow: Workflow }>(`/api/workflows/${id}/finalize`, {
      method: 'POST',
    }),

  updateSchedule: (id: number, schedule: ScheduleSettings) =>
    apiRequest<{ workflow: Workflow }>(`/api/workflows/${id}/schedule`, {
      method: 'POST',
      body: JSON.stringify(schedule),
    }),
};

// Listings API
export const listingsApi = {
  list: () => apiRequest<{ listings: Listing[] }>('/api/listings'),

  uploadCsv: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const token = getAuthToken();
    return fetch(`${API_URL}/api/listings/upload-csv`, {
      method: 'POST',
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: formData,
    }).then(res => res.json());
  },
};

// Automation API
export const automationApi = {
  start: (workflowId: number, listingIds?: number[]) =>
    apiRequest<{ automationRun: AutomationRun; listingCount: number; listingIds: number[] }>(
      '/api/automation/start',
      {
        method: 'POST',
        body: JSON.stringify({ workflowId, listingIds }),
      }
    ),

  getStatus: (runId: number) =>
    apiRequest<{ run: AutomationRun; listings: Listing[] }>(
      `/api/automation/runs/${runId}/status`
    ),
};
