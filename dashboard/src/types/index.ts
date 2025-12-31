// Type definitions for the VLS Automation Dashboard

export interface User {
  id: number;
  email: string;
  fullName: string;
  subscriptionTier: string;
  createdAt: string;
}

export interface Workflow {
  id: number;
  userId: number;
  name: string;
  description: string | null;
  website: string;
  status: 'learning' | 'ready' | 'active';
  recordedActions: any[] | null;
  fieldMappings: Record<string, string> | null;
  successIndicators: any | null;
  createdAt: string;
  updatedAt: string;
}

export interface Listing {
  id: number;
  userId: number;
  workflowId: number | null;
  mlsNumber: string | null;
  address: string;
  city: string;
  state: string;
  zipCode: string | null;
  price: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  squareFeet: number | null;
  description: string | null;
  listingData: any | null;
  uploadStatus: 'pending' | 'processing' | 'completed' | 'failed';
  uploadResult: any | null;
  uploadedAt: string | null;
  imageUrls: string[] | null;
  createdAt: string;
}

export interface AutomationRun {
  id: number;
  userId: number;
  workflowId: number;
  runType: 'ai_learning' | 'deterministic' | 'api_sync';
  status: 'running' | 'completed' | 'failed';
  totalListings: number;
  successfulListings: number;
  failedListings: number;
  startedAt: string;
  completedAt: string | null;
  errorLog: any | null;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
