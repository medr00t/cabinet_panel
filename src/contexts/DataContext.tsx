import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { Appointment, Balance, Patient, errorMessage, listAppointments, listPatients, patientBalances } from '../services/api';

interface DataContextValue {
  patients: Patient[];
  appointments: Appointment[];
  balances: Map<number, Balance>;
  loading: boolean;
  error: string | null;
  /** Bumped on every successful refresh so open screens can reload their own data. */
  version: number;
  refresh: () => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

export const useData = (): DataContextValue => {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside <DataProvider>');
  return ctx;
};

const POLL_MS = 20_000;

// Everyone shares one database, so besides loading on demand we re-read it every 20 s and
// whenever the window regains focus: what another laptop just entered shows up on its own.
export const DataProvider = ({ children }: { children: ReactNode }) => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [balances, setBalances] = useState<Map<number, Balance>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const [p, a, b] = await Promise.all([listPatients(), listAppointments(), patientBalances()]);
      setPatients(p);
      setAppointments(a);
      setBalances(new Map(b.map((x) => [x.patientId, x])));
      setError(null);
      setVersion((v) => v + 1);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(() => { if (!document.hidden) refresh(); }, POLL_MS);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [refresh]);

  const value = useMemo(
    () => ({ patients, appointments, balances, loading, error, version, refresh }),
    [patients, appointments, balances, loading, error, version, refresh],
  );
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};
