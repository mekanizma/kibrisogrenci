'use client';

import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';

const SYMBOL = { TRY: '₺', GBP: '£', USD: '$', EUR: '€' };
const LOCALE_TAG = { tr: 'tr-TR', en: 'en-GB' };

function convertMoney(amount, from, to, fx) {
  const gbp = amount * (fx[from] || 1);
  return Math.round(gbp / (fx[to] || 1));
}

export default function PriceHistoryChart({ history, currency, fx, locale, t }) {
  if (!history?.length) {
    return <p className="text-sm text-slate-400 py-6 text-center">{t('priceindex.no_history')}</p>;
  }
  const data = history.map((h) => ({
    date: new Date(h.changed_at).toLocaleDateString(LOCALE_TAG[locale] || 'en-GB', { month: 'short' }),
    value: convertMoney(h.price.amount, h.price.currency, currency, fx),
  }));
  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
          <YAxis
            tick={{ fontSize: 11, fill: '#64748b' }}
            axisLine={false}
            tickLine={false}
            width={48}
            tickFormatter={(v) => `${SYMBOL[currency]}${v}`}
          />
          <Tooltip formatter={(v) => [`${SYMBOL[currency]}${Number(v).toLocaleString()}`, t('priceindex.history')]} />
          <Line type="monotone" dataKey="value" stroke="#0a4d68" strokeWidth={2.5} dot={{ r: 3, fill: '#0a4d68' }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
