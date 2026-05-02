import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthProvider } from './AuthProvider';

export function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuthProvider();
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}
