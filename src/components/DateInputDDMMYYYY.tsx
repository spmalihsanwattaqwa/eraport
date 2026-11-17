import React, { useEffect, useRef, useState } from 'react';
import { Calendar } from 'lucide-react';
import { formatDateDDMMYYYY, normalizeDateInput } from '../utils/studentUtils.ts';

interface DateInputDDMMYYYYProps {
  value: unknown;
  onChange: (nextValue: string) => void;
  outputFormat?: 'iso' | 'dmy';
  required?: boolean;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Date input that always displays and accepts dd/mm/yyyy regardless of browser OS locale,
 * paired with a native calendar picker button.
 */
export function DateInputDDMMYYYY({
  value,
  onChange,
  outputFormat = 'iso',
  required = false,
  className = '',
  placeholder = 'dd/mm/yyyy',
  disabled = false,
}: DateInputDDMMYYYYProps) {
  const pickerRef = useRef<HTMLInputElement | null>(null);
  const [text, setText] = useState(() => formatDateDDMMYYYY(value));

  useEffect(() => {
    setText(formatDateDDMMYYYY(value));
  }, [value]);

  const isoValue = normalizeDateInput(value);

  const commitValue = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      setText('');
      onChange('');
      return;
    }
    const iso = normalizeDateInput(trimmed);
    if (iso) {
      const dmy = formatDateDDMMYYYY(iso);
      setText(dmy);
      onChange(outputFormat === 'dmy' ? dmy : iso);
    } else {
      setText(trimmed);
      onChange(trimmed);
    }
  };

  return (
    <div className="relative">
      <input
        type="text"
        inputMode="numeric"
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          if (v.trim() === '') {
            onChange('');
            return;
          }
          if (/^\d{2}\/\d{2}\/\d{4}$/.test(v.trim())) {
            const iso = normalizeDateInput(v.trim());
            if (iso) {
              onChange(outputFormat === 'dmy' ? formatDateDDMMYYYY(iso) : iso);
            }
          }
        }}
        onBlur={() => commitValue(text)}
        className={`${className} pr-9 font-mono-tabular`}
      />
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
        <button
          type="button"
          disabled={disabled}
          tabIndex={-1}
          title="Pilih tanggal dari kalender"
          onClick={() => {
            const el = pickerRef.current;
            if (!el) return;
            if (typeof (el as HTMLInputElement & { showPicker?: () => void }).showPicker === 'function') {
              try {
                (el as HTMLInputElement & { showPicker?: () => void }).showPicker!();
              } catch {
                el.click();
              }
            } else {
              el.click();
            }
          }}
          className="rounded p-1 text-slate-700 hover:bg-amber-50 hover:text-emerald-900 disabled:opacity-40"
        >
          <Calendar className="h-4 w-4" />
        </button>
        <input
          ref={pickerRef}
          type="date"
          disabled={disabled}
          tabIndex={-1}
          aria-hidden="true"
          value={isoValue}
          onChange={(e) => {
            const iso = e.target.value;
            if (!iso) {
              setText('');
              onChange('');
              return;
            }
            const dmy = formatDateDDMMYYYY(iso);
            setText(dmy);
            onChange(outputFormat === 'dmy' ? dmy : iso);
          }}
          className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
        />
      </div>
    </div>
  );
}
