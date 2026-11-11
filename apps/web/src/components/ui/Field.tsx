import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import clsx from 'clsx';

export const inputClass = (invalid?: boolean) =>
  clsx(
    'block w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-stone-900 shadow-xs placeholder:text-stone-400',
    'focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none disabled:bg-stone-100',
    invalid ? 'border-red-400' : 'border-stone-300',
  );

interface FieldProps {
  label: string;
  error?: string;
  hint?: ReactNode;
  children: (id: string, describedBy: string | undefined) => ReactNode;
  className?: string;
}

// label + control + error, wired up for screen readers
export function Field({ label, error, hint, children, className }: FieldProps) {
  const id = useId();
  const errId = `${id}-err`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-stone-700">
        {label}
      </label>
      {children(id, describedBy)}
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-xs text-stone-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="mt-1.5 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: ReactNode; wrapperClassName?: string };

export const TextField = forwardRef<HTMLInputElement, InputProps>(function TextField(
  { label, error, hint, wrapperClassName, className, ...rest },
  ref,
) {
  return (
    <Field label={label} error={error} hint={hint} className={wrapperClassName}>
      {(id, describedBy) => (
        <input ref={ref} id={id} aria-invalid={!!error} aria-describedby={describedBy} className={clsx(inputClass(!!error), className)} {...rest} />
      )}
    </Field>
  );
});

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string; hint?: ReactNode; wrapperClassName?: string };

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaProps>(function TextArea(
  { label, error, hint, wrapperClassName, className, ...rest },
  ref,
) {
  return (
    <Field label={label} error={error} hint={hint} className={wrapperClassName}>
      {(id, describedBy) => (
        <textarea ref={ref} id={id} aria-invalid={!!error} aria-describedby={describedBy} className={clsx(inputClass(!!error), 'min-h-28', className)} {...rest} />
      )}
    </Field>
  );
});

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string; wrapperClassName?: string };

export const SelectField = forwardRef<HTMLSelectElement, SelectProps>(function SelectField(
  { label, error, wrapperClassName, className, children, ...rest },
  ref,
) {
  return (
    <Field label={label} error={error} className={wrapperClassName}>
      {(id, describedBy) => (
        <select ref={ref} id={id} aria-invalid={!!error} aria-describedby={describedBy} className={clsx(inputClass(!!error), className)} {...rest}>
          {children}
        </select>
      )}
    </Field>
  );
});
