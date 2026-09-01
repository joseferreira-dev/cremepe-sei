import { useState, useEffect } from 'react';
import Login from './components/Login';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import ProcessList from './components/ProcessList';
import ProcessDetails from './components/ProcessDetails';
import NewProcess from './components/NewProcess';
import ImportBatch from './components/ImportBatch';
import TagsManager from './components/TagsManager';
import Admin from './components/Admin';
import Reports from './components/Reports';
import SyncPage from './components/SyncPage';
import Profile from './components/Profile';
import { DialogProvider } from './components/ui/Dialog';
import type { User } from './types';
import { login as apiLogin, loadStoredUser, clearSession, getToken } from './api';

export type Page =
  | 'dashboard'
  | 'processes'
  | 'processes-sem-resumo'
  | 'process-details'
  | 'new-process'
  | 'import'
  | 'tags'
  | 'reports'
  | 'sync'
  | 'admin'
  | 'profile';

export default function App() {
  const [user, setUser] = useState<User | null>(() => loadStoredUser());
  const [page, setPage] = useState<Page>('dashboard');
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null);

  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener('cremepe-unauthorized', onUnauthorized);
    return () => window.removeEventListener('cremepe-unauthorized', onUnauthorized);
  }, []);

  const handleLogin = async (email: string, password: string): Promise<string | null> => {
    try {
      const data = await apiLogin(email, password);
      setUser(data.user);
      setPage('dashboard');
      return null;
    } catch (err: any) {
      return err?.message || 'Erro ao autenticar.';
    }
  };

  const handleLogout = () => {
    clearSession();
    setUser(null);
    setPage('dashboard');
  };

  const navigateTo = (p: Page, processId?: string) => {
    setPage(p);
    if (processId) setSelectedProcessId(processId);
  };

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  const renderPage = () => {
    switch (page) {
      case 'dashboard':
        return <Dashboard navigateTo={navigateTo} />;
      case 'processes':
        return <ProcessList navigateTo={navigateTo} user={user} />;
      case 'processes-sem-resumo':
        return <ProcessList navigateTo={navigateTo} onlyWithoutResumo user={user} />;
      case 'process-details':
        return <ProcessDetails processId={selectedProcessId} navigateTo={navigateTo} user={user} />;
      case 'new-process':
        return <NewProcess navigateTo={navigateTo} />;
      case 'import':
        return <ImportBatch navigateTo={navigateTo} />;
      case 'tags':
        return <TagsManager />;
      case 'reports':
        return <Reports />;
      case 'sync':
        return <SyncPage navigateTo={navigateTo} />;
      case 'admin':
        return <Admin user={user} />;
      case 'profile':
        return <Profile user={user} />;
      default:
        return <Dashboard navigateTo={navigateTo} />;
    }
  };

  return (
    <DialogProvider>
      <Layout user={user} currentPage={page} navigateTo={navigateTo} onLogout={handleLogout}>
        {renderPage()}
      </Layout>
    </DialogProvider>
  );
}
