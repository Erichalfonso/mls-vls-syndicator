// Main App component with routing

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import Workflows from './pages/Workflows';
import RunWorkflow from './pages/RunWorkflow';
import AutomationStatus from './pages/AutomationStatus';
import './App.css';

// Protected route component
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/workflows" replace /> : <Login />}
      />
      <Route
        path="/workflows"
        element={
          <ProtectedRoute>
            <Workflows />
          </ProtectedRoute>
        }
      />
      <Route
        path="/run/:workflowId"
        element={
          <ProtectedRoute>
            <RunWorkflow />
          </ProtectedRoute>
        }
      />
      <Route
        path="/status/:runId"
        element={
          <ProtectedRoute>
            <AutomationStatus />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/workflows" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
