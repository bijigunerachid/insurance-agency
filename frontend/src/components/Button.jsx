const variants = {
  primary: 'bg-blue-700 text-white hover:bg-blue-800 disabled:bg-blue-300',
  danger: 'bg-red-700 text-white hover:bg-red-800 disabled:bg-red-300',
  secondary:
    'bg-white text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:text-slate-400',
};

export function Button({ variant = 'primary', type = 'button', className = '', ...props }) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
