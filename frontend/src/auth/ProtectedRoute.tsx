import type { PropsWithChildren } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

export function ProtectedRoute({ children }: PropsWithChildren) {
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === 'loading') {
    return (
      <div className="auth-loading-page">
        <div className="auth-loading-mark">S</div>
        <p>Preparing your workspace…</p>
      </div>
    );
  }
  if (auth.status !== 'authenticated') {
    return <Navigate to="/auth/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}
