import { createContext, useContext, useMemo, useState, ReactNode } from 'react';
import { User, logout as apiLogout } from '../services/api';

interface UserContextValue {
  user: User | null;
  isDoctor: boolean;
  signIn: (user: User) => void;
  signOut: () => void;
}

const UserContext = createContext<UserContextValue | null>(null);

export const useUser = (): UserContextValue => {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used inside <UserProvider>');
  return ctx;
};

// The session lives in memory only: closing the app logs out, nothing sensitive goes to localStorage.
export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const value = useMemo<UserContextValue>(() => ({
    user,
    isDoctor: user?.role === 'doctor',
    signIn: setUser,
    signOut: () => { apiLogout(); setUser(null); },
  }), [user]);
  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};
