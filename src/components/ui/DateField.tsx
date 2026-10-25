import { useEffect, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { isValid, parse } from 'date-fns';

interface DateFieldProps {
  /** ISO date (yyyy-MM-dd) or '' */
  value: string;
  /** Called with an ISO date once a complete, valid date is typed/picked; '' while incomplete or invalid. */
  onChange: (iso: string) => void;
  id?: string;
  invalid?: boolean;
  disabled?: boolean;
  width?: number;
  ariaLabel?: string;
}

const isoToText = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

/** "15032026" -> "15/03/2026" (partial input keeps its slashes: "1503" -> "15/03"). */
const format = (digits: string): string => {
  const d = digits.slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
};

const textToIso = (text: string): string => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!m) return '';
  const d = parse(text, 'dd/MM/yyyy', new Date());
  return isValid(d) && Number(m[3]) >= 1900 ? `${m[3]}-${m[2]}-${m[1]}` : '';
};

/** Date input that is always dd/mm/yyyy, independent of the system / WebView language. */
const DateField = ({ value, onChange, id, invalid, disabled, width, ariaLabel }: DateFieldProps) => {
  const [text, setText] = useState(isoToText(value));
  const picker = useRef<HTMLInputElement>(null);
  const previous = useRef(value);

  // follow outside changes (arrows, reset, ...) but never clobber what is being typed
  useEffect(() => {
    if (value !== previous.current) {
      previous.current = value;
      setText(isoToText(value));
    }
  }, [value]);

  const emit = (next: string) => {
    setText(next);
    const iso = textToIso(next);
    previous.current = iso;
    onChange(iso);
  };

  const typed = (raw: string) => {
    let digits = raw.replace(/\D/g, '');
    // Backspace on a "/" removes the slash only; also drop the digit before it
    if (raw.length < text.length && text.endsWith('/') && raw === text.slice(0, -1)) digits = digits.slice(0, -1);
    emit(format(digits));
  };

  const complete = text.length === 10;
  const bad = invalid || (complete && textToIso(text) === '');

  const openPicker = () => {
    const el = picker.current;
    if (!el) return;
    try { el.showPicker(); } catch { el.focus(); }
  };

  return (
    <div className="date-field" style={width ? { width } : undefined}>
      <input
        id={id} className="input num" inputMode="numeric" autoComplete="off" placeholder="jj/mm/aaaa" maxLength={10}
        value={text} disabled={disabled} aria-invalid={bad || undefined} aria-label={ariaLabel}
        onChange={(e) => typed(e.target.value)}
      />
      <button type="button" className="date-btn" tabIndex={-1} disabled={disabled} onClick={openPicker} aria-label="Ouvrir le calendrier"><CalendarDays /></button>
      <input ref={picker} type="date" className="date-native" tabIndex={-1} aria-hidden="true" value={value}
        onChange={(e) => { if (e.target.value) emit(isoToText(e.target.value)); }} />
    </div>
  );
};

export default DateField;
