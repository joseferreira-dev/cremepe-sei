import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import Login from './components/Login';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import ProcessList from './components/ProcessList';
import ProcessDetails from './components/ProcessDetails';
import NewProcess from './components/NewProcess';
import TagsManager from './components/TagsManager';
import Admin from './components/Admin';
import Reports from './components/Reports';
import SyncPage from './components/SyncPage';
import StalledProcesses from './components/StalledProcesses';
import Profile from './components/Profile';
import { DialogProvider } from './components/ui/Dialog';
import type { User } from './types';
import { login as apiLogin, loadStoredUser, clearSession, fetchMe } from './api';

function AppRoutes({ user, setUser, onLogout }: { user: User; setUser: (u: User) => void; onLogout: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Redireciona para dashboard se a URL não existe
    const validPaths = ['/', '/processes', '/processes/sem-resumo', '/new-process', '/tags', '/reports', '/sync', '/stalled', '/admin', '/profile'];
    const isProcessDetails = /^\/process\/[a-f0-9-]+$/.test(location.pathname);
    if (!validPaths.includes(location.pathname) && !isProcessDetails && location.pathname !== '/') {
      navigate('/', { replace: true });
    }
  }, [location.pathname, navigate]);

  return (
    <Layout user={user} currentPage={location.pathname} onLogout={onLogout}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/processes" element={<ProcessList />} />
        <Route path="/processes/sem-resumo" element={<ProcessList onlyWithoutResumo />} />
        <Route path="/process/:id" element={<ProcessDetails user={user} />} />
        <Route path="/new-process" element={<NewProcess />} />
        <Route path="/tags" element={<TagsManager />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/sync" element={<SyncPage user={user} />} />
        <Route path="/stalled" element={<StalledProcesses />} />
        <Route path="/admin" element={<Admin user={user} onUserUpdated={setUser} />} />
        <Route path="/profile" element={<Profile user={user} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(() => loadStoredUser());

  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener('cremepe-unauthorized', onUnauthorized);
    return () => window.removeEventListener('cremepe-unauthorized', onUnauthorized);
  }, []);

  useEffect(() => {
    if (!user) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        fetchMe().then(setUser).catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [!!user]);

  const handleLogin = async (email: string, password: string): Promise<string | null> => {
    try {
      const data = await apiLogin(email, password);
      setUser(data.user);
      return null;
    } catch (err: any) {
      return err?.message || 'Erro ao autenticar.';
    }
  };

  const handleLogout = () => {
    clearSession();
    setUser(null);
  };

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <DialogProvider>
      <BrowserRouter>
        <AppRoutes user={user} setUser={setUser} onLogout={handleLogout} />
      </BrowserRouter>
    </DialogProvider>
  );
}
