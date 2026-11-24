import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { SESSION_EXPIRED_EVENT, User, logout as apiLogout, restoreSession } from '../services/api';

interface UserContextValue {
  user: User | null;
  isDoctor: boolean;
  /** false until the first check of an existing login (page refresh) is done */
  ready: boolean;
  signIn: (user: User) => void;
  signOut: () => void;
}

const UserContext = createContext<UserContextValue | null>(null);

export const useUser = (): UserContextValue => {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used inside <UserProvider>');
  return ctx;
};

// The login lives on the server (an HttpOnly cookie): a page refresh keeps it, nothing sensitive is stored in the browser.
export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    restoreSession().then((u) => { if (u) setUser(u); }).finally(() => setReady(true));
    const expired = () => setUser(null);
    window.addEventListener(SESSION_EXPIRED_EVENT, expired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, expired);
  }, []);
  const value = useMemo<UserContextValue>(() => ({
    user,
    isDoctor: user?.role === 'doctor',
    ready,
    signIn: setUser,
    signOut: () => { apiLogout(); setUser(null); },
  }), [user, ready]);
  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};
