interface MoneyInputProps {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

/** Text input for amounts: accepts "1250", "1 250,50"; parsing is done by utils/format.parseAmount. */
const MoneyInput = ({ id, value, onChange, invalid, disabled, placeholder = '0,00' }: MoneyInputProps) => (
  <div className="input-affix has-suffix">
    <input id={id} className="input num" inputMode="decimal" autoComplete="off" value={value} placeholder={placeholder}
      disabled={disabled} aria-invalid={invalid} onChange={(e) => onChange(e.target.value)} onFocus={(e) => e.target.select()} />
    <span className="suffix">DH</span>
  </div>
);

export default MoneyInput;
