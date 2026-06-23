import { Currency } from '../types';

interface CurrencySelectorProps {
  currency: Currency;
  onCurrencyChange: (currency: Currency) => void;
}

export function CurrencySelector({ currency, onCurrencyChange }: CurrencySelectorProps) {
  return (
    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
      {(['Kz', 'USD', 'EUR'] as Currency[]).map((c) => (
        <button
          key={c}
          onClick={() => onCurrencyChange(c)}
          className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${
            currency === c
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {c}
        </button>
      ))}
    </div>
  );
}
