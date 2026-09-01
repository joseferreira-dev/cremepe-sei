import { useState } from 'react';
import type { Page } from '../App';
import type { User } from '../types';
import logoCremepe from '@/imports/logo-cremepe.png';

interface NavItem {
  id: Page;
  label: string;
  icon: React.ReactNode;
  roles?: string[];
}

const MenuIcon = ({ d }: { d: string }) => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <MenuIcon d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /> },
  { id: 'processes', label: 'Processos', icon: <MenuIcon d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /> },
  { id: 'processes-sem-resumo', label: 'Sem Resumo IA', icon: <MenuIcon d="M12 9v3m0 4h.01M9 19a7 7 0 116-6.99V13a1 1 0 002 0v-.01A9 9 0 1012 21c-1 0-2-.25-3-.99h0" /> },
  { id: 'new-process', label: 'Novo Processo', icon: <MenuIcon d="M12 4v16m8-8H4" /> },
  { id: 'import', label: 'Importar Lote', icon: <MenuIcon d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /> },
  { id: 'tags', label: 'Tags', icon: <MenuIcon d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /> },
  { id: 'reports', label: 'Relatórios', icon: <MenuIcon d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /> },
  { id: 'sync', label: 'Sincronização', icon: <MenuIcon d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /> },
  { id: 'admin', label: 'Administração', icon: <MenuIcon d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />, roles: ['admin'] },
  { id: 'profile', label: 'Meu Perfil', icon: <MenuIcon d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /> },
];

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  protocolo: 'Protocolo',
  analista: 'Analista',
  gestor: 'Gestor',
};

interface Props {
  user: User;
  currentPage: Page;
  navigateTo: (page: Page) => void;
  onLogout: () => void;
  children: React.ReactNode;
}

export default function Layout({ user, currentPage, navigateTo, onLogout, children }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  const visibleNav = navItems.filter(
    (item) => !item.roles || item.roles.includes(user.role)
  );

  return (
    <div className="flex h-full" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Sidebar */}
      <aside
        className="flex flex-col shrink-0 transition-all duration-300"
        style={{
          width: collapsed ? 64 : 240,
          background: 'linear-gradient(180deg, #003D26 0%, #006B42 100%)',
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-green-700">
          <img src={logoCremepe} alt="CREMEPE" className="w-8 h-8 object-contain shrink-0" />
          {!collapsed && (
            <div className="overflow-hidden">
              <p className="text-white font-bold text-sm leading-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>
                CREMEPE SEI
              </p>
              <p className="text-green-400 text-xs">Gestão de Processos</p>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="ml-auto text-green-400 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d={collapsed ? 'M13 5l7 7-7 7M5 5l7 7-7 7' : 'M11 19l-7-7 7-7m8 14l-7-7 7-7'} />
            </svg>
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 space-y-0.5 px-2 overflow-y-auto">
          {visibleNav.map((item) => {
            const active = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => navigateTo(item.id)}
                title={collapsed ? item.label : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? 'text-white'
                    : 'text-green-300 hover:text-white hover:bg-white/10'
                }`}
                style={active ? { background: 'rgba(255,255,255,0.15)' } : {}}
              >
                <span className="shrink-0">{item.icon}</span>
                {!collapsed && <span className="truncate">{item.label}</span>}
                {active && !collapsed && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#8DC63F' }} />
                )}
              </button>
            );
          })}
        </nav>

        {/* User */}
        <div className="p-3 border-t border-green-700">
          {collapsed ? (
            <button
              onClick={onLogout}
              title="Sair"
              className="w-full flex items-center justify-center py-2 text-green-400 hover:text-red-300 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          ) : (
            <div>
              <button
                onClick={() => navigateTo('profile')}
                className="flex items-center gap-2 mb-2 w-full text-left hover:bg-white/10 rounded-lg px-1 py-1 transition-colors"
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                  style={{ background: '#8DC63F' }}
                >
                  {user.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                </div>
                <div className="overflow-hidden">
                  <p className="text-white text-xs font-medium truncate">{user.name.split(' ')[0]} {user.name.split(' ').slice(-1)[0]}</p>
                  <p className="text-green-400 text-xs">{roleLabels[user.role]}</p>
                </div>
              </button>
              <button
                onClick={onLogout}
                className="w-full flex items-center gap-2 px-3 py-1.5 rounded text-green-400 hover:text-red-300 hover:bg-red-900/20 transition-all text-xs"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sair
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto bg-gray-50">
        {children}
      </main>
    </div>
  );
}
