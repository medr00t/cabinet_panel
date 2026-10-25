import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';

export type Route =
  | { page: 'dashboard' }
  | { page: 'patients' }
  | { page: 'patient'; patientId: number }
  | { page: 'agenda'; date?: string }
  | { page: 'caisse' };

interface NavContextValue {
  route: Route;
  go: (route: Route) => void;
}

const NavContext = createContext<NavContextValue | null>(null);

export const useNav = (): NavContextValue => {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useNav must be used inside <NavProvider>');
  return ctx;
};

export const NavProvider = ({ children }: { children: ReactNode }) => {
  const [route, setRoute] = useState<Route>({ page: 'dashboard' });
  const go = useCallback((r: Route) => setRoute(r), []);
  const value = useMemo(() => ({ route, go }), [route, go]);
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
};
