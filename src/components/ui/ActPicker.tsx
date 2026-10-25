import { KeyboardEvent, useMemo, useState } from 'react';
import { ACT_CATALOG, ACT_GROUPS, actStatus } from '../../constants';
import { STATUS } from '../../teeth';

interface ActPickerProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  placeholder?: string;
  /** show which tooth state an act leaves behind (only meaningful for acts, not appointment motifs) */
  showEffect?: boolean;
}

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Free-text input with grouped suggestions (diagnostic, soins, endodontie, chirurgie, prothèse…). */
const ActPicker = ({ id, value, onChange, invalid, placeholder, showEffect }: ActPickerProps) => {
  const [open, setOpen] = useState(false);
  const [hot, setHot] = useState(-1);

  const groups = useMemo(() => {
    const q = plain(value.trim());
    return ACT_GROUPS.map((group) => ({
      group,
      items: ACT_CATALOG.filter((a) => a.group === group && (!q || plain(a.name).includes(q))),
    })).filter((g) => g.items.length > 0);
  }, [value]);
  const flat = groups.flatMap((g) => g.items);

  const pick = (name: string) => { onChange(name); setOpen(false); setHot(-1); };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHot((h) => Math.min(h + 1, flat.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHot((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter' && open && hot >= 0 && flat[hot]) { e.preventDefault(); pick(flat[hot].name); }
    else if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); }
  };

  let index = -1;
  return (
    <div className="combo">
      <input
        id={id} className="input" value={value} placeholder={placeholder} autoComplete="off" aria-invalid={invalid}
        role="combobox" aria-expanded={open} aria-autocomplete="list"
        onChange={(e) => { onChange(e.target.value); setOpen(true); setHot(-1); }}
        onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 130)} onKeyDown={onKey}
      />
      {open && flat.length > 0 && (
        <div className="combo-list" role="listbox">
          {groups.map(({ group, items }) => (
            <div key={group}>
              <div className="combo-group">{group}</div>
              {items.map((a) => {
                index += 1;
                const effect = showEffect ? actStatus(a.name) : undefined;
                const mine = index;
                return (
                  <button key={a.name} type="button" role="option" aria-selected={mine === hot} className={`combo-item ${mine === hot ? 'hot' : ''}`}
                    onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setHot(mine)} onClick={() => pick(a.name)}>
                    {a.name}
                    {effect && <small style={{ background: STATUS[effect].soft, color: STATUS[effect].color }}>{STATUS[effect].label}</small>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ActPicker;
