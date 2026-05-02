// Re-exports the useAuth hook from the app's AuthContext
// This prevents duplicate auth logic and keeps core layer thin
export { useAuth } from '../../../contexts/AuthContext';
