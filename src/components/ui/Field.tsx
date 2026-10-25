import { ReactNode } from 'react';

interface FieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
}

const Field = ({ label, htmlFor, required, error, hint, children }: FieldProps) => (
  <div className="field">
    <label htmlFor={htmlFor}>{label}{required && <span className="req" aria-hidden="true">*</span>}</label>
    {children}
    {error ? <span className="error" role="alert">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
  </div>
);

export default Field;
