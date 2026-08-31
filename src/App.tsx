import { useState } from 'react';
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
import type { User, Process } from './types';
import { mockUsers } from './data/mock';

export type Page =
  | 'dashboard'
  | 'processes'
  | 'process-details'
  | 'new-process'
  | 'import'
  | 'tags'
  | 'reports'
  | 'admin';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [page, setPage] = useState<Page>('dashboard');
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null);

  const handleLogin = (email: string, _password: string) => {
    const found = mockUsers.find((u) => u.email === email) ?? mockUsers[0];
    setUser(found);
    setPage('dashboard');
  };

  const handleLogout = () => {
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
        return <ProcessList navigateTo={navigateTo} />;
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
      case 'admin':
        return <Admin user={user} />;
      default:
        return <Dashboard navigateTo={navigateTo} />;
    }
  };

  return (
    <Layout user={user} currentPage={page} navigateTo={navigateTo} onLogout={handleLogout}>
      {renderPage()}
    </Layout>
  );
}
