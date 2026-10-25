import React from 'react';
import { useUser } from '../contexts/UserContext';
import Clock from './Clock';
import './Header.css';

const Header: React.FC = () => {
  const { user, logout } = useUser();

  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case 'doctor':
        return 'Docteur';
      case 'reception':
        return 'Réception';
      default:
        return role;
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'doctor':
        return '#e74c3c';
      case 'reception':
        return '#3498db';
      default:
        return '#95a5a6';
    }
  };

  return (
    <header className="app-header">
      <div className="header-content">
        <div className="header-left">
          <h1>Centre Dentaire Riad El Ansari</h1>
        </div>
        
        <div className="header-right">
          <Clock />
          {user && (
            <div className="user-info">
              <div className="user-details">
                <span className="user-name">{user.name}</span>
                <span 
                  className="user-role"
                  style={{ backgroundColor: getRoleColor(user.role) }}
                >
                  {getRoleDisplayName(user.role)}
                </span>
              </div>
              <button onClick={logout} className="logout-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16,17 21,12 16,7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                Déconnexion
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;