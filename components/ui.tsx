import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Loader2, LucideIcon, MoreVertical, X } from 'lucide-react';

type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger' | 'ai';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-dark active:brightness-95',
  outline: 'bg-black/[0.05] text-ink hover:bg-black/[0.08] active:bg-black/[0.11]',
  ghost: 'text-gray-600 hover:bg-black/[0.05] hover:text-ink',
  danger: 'bg-red-500/10 text-red-600 hover:bg-red-500/15',
  ai: 'bg-accent-soft text-accent hover:bg-accent/15',
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  icon?: LucideIcon;
  loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ variant = 'primary', size = 'md', icon: Icon, loading, className = '', children, disabled, ...props }) => (
  <button
    className={`inline-flex items-center justify-center gap-1.5 font-medium rounded-full transition-[background-color,transform,filter] active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 ${
      size === 'sm' ? 'px-3.5 py-1.5 text-[13px]' : 'px-5 py-2 text-sm'
    } ${VARIANTS[variant]} ${className}`}
    disabled={disabled || loading}
    {...props}
  >
    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : Icon && <Icon className="w-4 h-4 shrink-0" />}
    {children}
  </button>
);

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  active?: boolean;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon: Icon, label, active, className = '', ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={`p-1.5 rounded-full transition-colors ${active ? 'bg-black/[0.08] text-ink' : 'text-gray-500 hover:bg-black/[0.05] hover:text-ink'} ${className}`}
      {...props}
    >
      <Icon className="w-4 h-4" />
    </button>
  ),
);

export const Modal: React.FC<{ open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }> = ({
  open, onClose, title, children, wide,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/25 backdrop-blur-sm flex items-start md:items-center justify-center p-4 overflow-y-auto animate-fade" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className={`bg-white shadow-lift w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} rounded-[22px] my-8 animate-sheet`}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-[19px] font-display">{title}</h2>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </div>
        <div className="px-6 pb-6">{children}</div>
      </div>
    </div>
  );
};

export const Menu: React.FC<{ label?: string; icon?: LucideIcon; children: React.ReactNode; trigger?: React.ReactNode }> = ({
  label = 'More actions', icon = MoreVertical, children, trigger,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      {trigger ? (
        <div onClick={() => setOpen(!open)}>{trigger}</div>
      ) : (
        <IconButton icon={icon} label={label} active={open} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} />
      )}
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-1.5 w-60 material rounded-xl shadow-lift p-1.5 animate-fade" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
};

export const MenuItem: React.FC<{ icon?: LucideIcon; onClick: () => void; danger?: boolean; children: React.ReactNode }> = ({ icon: Icon, onClick, danger, children }) => (
  <button
    role="menuitem"
    type="button"
    onClick={onClick}
    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 text-[13px] text-left rounded-md hover:bg-accent hover:text-white ${danger ? 'text-red-600' : 'text-gray-800'}`}
  >
    {Icon && <Icon className="w-4 h-4 shrink-0" />}
    {children}
  </button>
);

export const MenuDivider = () => <div className="my-1 mx-2.5 border-t border-black/10" />;

export const Label: React.FC<{ children: React.ReactNode; htmlFor?: string }> = ({ children, htmlFor }) => (
  <label htmlFor={htmlFor} className="block font-medium text-gray-500 text-[12px] mb-1.5">
    {children}
  </label>
);

export const inputClass =
  'w-full bg-white border border-black/10 px-3 py-2 text-sm rounded-lg focus:border-accent focus:ring-[3px] focus:ring-accent/25 focus:outline-none transition-[border-color,box-shadow] placeholder:text-gray-400';

export const TextArea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number }> = ({ minRows = 3, className = '', value, ...props }) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  // Grow with content so long scripts don't need an inner scrollbar.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return <textarea ref={ref} rows={minRows} value={value} className={`${inputClass} resize-none leading-relaxed ${className}`} {...props} />;
};

export const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string }> = ({ checked, onChange, label }) => (
  <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
    <input type="checkbox" role="switch" className="sr-only peer" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span aria-hidden="true" className="relative w-[34px] h-5 rounded-full bg-gray-300 transition-colors peer-checked:bg-[#34C759] peer-focus-visible:ring-[3px] peer-focus-visible:ring-accent/40 after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-[14px]" />
    {label}
  </label>
);

export const EmptyState: React.FC<{ icon: LucideIcon; title: string; children?: React.ReactNode }> = ({ icon: Icon, title, children }) => (
  <div className="text-center py-10 px-4 text-gray-500">
    <Icon className="w-8 h-8 mx-auto mb-3 text-gray-300" />
    <p className="font-medium text-gray-700">{title}</p>
    {children && <div className="text-sm mt-1">{children}</div>}
  </div>
);

export const Meter: React.FC<{ value: number; total: number; label: string; dark?: boolean }> = ({ value, total, label, dark }) => {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className={`flex justify-between text-xs mb-1 ${dark ? 'text-white/75' : 'text-gray-500'}`}>
        <span>{label}</span>
        <span className="tabular-nums">{total ? `${value}/${total}` : '—'}</span>
      </div>
      <div className={`h-1.5 rounded-full overflow-hidden ${dark ? 'bg-white/25' : 'bg-gray-200'}`} role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full transition-all ${pct === 100 ? (dark ? 'bg-emerald-300' : 'bg-emerald-500') : dark ? 'bg-white' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};
