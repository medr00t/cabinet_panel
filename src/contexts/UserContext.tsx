import React, { createContext, useContext, useState, ReactNode } from 'react';
import { User, clearAuth } from '../services/database';

interface UserContextType {
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const useUser = () => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};

interface UserProviderProps {
  children: ReactNode;
}

export const UserProvider: React.FC<UserProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);

  const login = (user: User) => {
    console.log('[DEBUG] UserContext login called with:', user);
    setUser(user);
    console.log('[DEBUG] User set in context, isAuthenticated should now be:', true);
  };

  const logout = () => {
    setUser(null);
    clearAuth();
    localStorage.removeItem('currentUser'); // legacy key from older versions
  };

  const isAuthenticated = user !== null;

  const value: UserContextType = {
    user,
    login,
    logout,
    isAuthenticated,
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};

export default UserContext;