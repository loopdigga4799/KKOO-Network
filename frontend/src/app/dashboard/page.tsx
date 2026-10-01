'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/status-badge';

interface Product {
  id: string;
  name: string;
  sku: string;
}

interface Sale {
  id: string;
  status: string;
  total: string;
  payment_method: string;
  created_at: string;
}

interface SalesSummary {
  period: { days: number; from: string; to: string };
  current: { salesCount: number; revenue: number; voidedCount: number; averageSale: number };
  previous: { salesCount: number; revenue: number };
  daily: { date: string; salesCount: number; revenue: number }[];
  payments: { method: string; salesCount: number; revenue: number }[];
}

const periods = [7, 30, 90] as const;

function formatTzs(value: number) {
  return `TZS ${Math.round(value).toLocaleString('en-TZ')}`;
}

function formatDate(date: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('en-TZ', {
    ...options,
    timeZone: 'Africa/Dar_es_Salaam',
  }).format(new Date(`${date}T12:00:00Z`));
}

function comparison(current: number, previous: number) {
  if (previous === 0) {
    return current === 0 ? 'No change from prior period' : 'Activity began this period';
  }

  const change = Math.round(((current - previous) / previous) * 100);
  return `${change > 0 ? '+' : ''}${change}% vs prior period`;
}

function StatCard({
  label,
  value,
  detail,
  positive,
}: {
  label: string;
  value: string;
  detail: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-4 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-gray-950">{value}</p>
      <p className={`mt-2 text-xs ${positive ? 'text-brand-700' : 'text-gray-500'}`}>{detail}</p>
    </div>
  );
}

export default function DashboardOverviewPage() {
  const [period, setPeriod] = useState<(typeof periods)[number]>(30);
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    Promise.all([
      api.get<SalesSummary>(`/sales/summary?days=${period}`),
      api.get<Product[]>('/products'),
      api.get<Sale[]>('/sales'),
    ])
      .then(([summaryData, productsData, salesData]) => {
        if (!active) return;
        setSummary(summaryData);
        setProducts(productsData);
        setSales(salesData);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load business overview');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [period, reloadKey]);

  const dailyByDate = new Map((summary?.daily ?? []).map((day) => [day.date, day]));
  const daily = summary
    ? Array.from({ length: summary.period.days }, (_, index) => {
        const date = new Date(`${summary.period.from}T00:00:00Z`);
        date.setUTCDate(date.getUTCDate() + index);
        const key = date.toISOString().slice(0, 10);
        return dailyByDate.get(key) ?? { date: key, salesCount: 0, revenue: 0 };
      })
    : [];
  const peakRevenue = Math.max(...daily.map((day) => day.revenue), 0);
  const chartLabels = new Set(
    daily
      .map((_, index) => index)
      .filter((index) => index === 0 || index === daily.length - 1 || index % Math.ceil(daily.length / 5) === 0),
  );
  const paymentTotal = summary?.payments.reduce((total, payment) => total + payment.revenue, 0) ?? 0;
  const rangeLabel = period === 7 ? 'Last 7 days' : period === 30 ? 'Last 30 days' : 'Last 90 days';

  if (loading && !summary) {
    return (
      <div aria-busy="true" className="space-y-4">
        <div className="h-8 w-52 animate-pulse rounded bg-gray-200" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {periods.slice(0, 2).map((item) => (
            <div key={item} className="h-28 animate-pulse rounded-md bg-gray-100 sm:h-32" />
          ))}
          <div className="hidden h-32 animate-pulse rounded-md bg-gray-100 sm:block" />
          <div className="hidden h-32 animate-pulse rounded-md bg-gray-100 xl:block" />
        </div>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div role="alert" className="max-w-xl border-l-4 border-danger-600 bg-white p-5">
        <h1 className="text-lg font-semibold text-gray-950">Overview unavailable</h1>
        <p className="mt-2 text-sm text-gray-600">{error ?? 'The report could not be loaded.'}</p>
        <button
          type="button"
          onClick={() => setReloadKey((key) => key + 1)}
          className="mt-4 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 border-b border-gray-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-700">Kariakoo / Operations</p>
          <h1 className="mt-2 text-2xl font-semibold text-gray-950">Business overview</h1>
          <p className="mt-1 text-sm text-gray-500">
            {formatDate(summary.period.from, { day: 'numeric', month: 'short' })}
            {' - '}
            {formatDate(summary.period.to, { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex rounded-md border border-gray-200 bg-white p-1" aria-label="Reporting period">
            {periods.map((days) => (
              <button
                key={days}
                type="button"
                aria-pressed={period === days}
                onClick={() => setPeriod(days)}
                className={`rounded px-3 py-2 text-xs font-medium transition ${
                  period === days ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {days}D
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setReloadKey((key) => key + 1)}
            disabled={loading}
            className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Sales revenue"
          value={formatTzs(summary.current.revenue)}
          detail={comparison(summary.current.revenue, summary.previous.revenue)}
          positive={summary.current.revenue >= summary.previous.revenue}
        />
        <StatCard
          label="Completed sales"
          value={summary.current.salesCount.toLocaleString()}
          detail={comparison(summary.current.salesCount, summary.previous.salesCount)}
          positive={summary.current.salesCount >= summary.previous.salesCount}
        />
        <StatCard
          label="Average sale"
          value={formatTzs(summary.current.averageSale)}
          detail={`${summary.current.voidedCount.toLocaleString()} voided in period`}
        />
        <StatCard
          label="Active products"
          value={products.length.toLocaleString()}
          detail="Across this tenant"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.8fr)]">
        <section className="rounded-md border border-gray-200 bg-white p-4 sm:p-5" aria-labelledby="trend-title">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="trend-title" className="text-base font-semibold text-gray-950">Revenue movement</h2>
              <p className="mt-1 text-xs text-gray-500">Completed sales by business day · {rangeLabel.toLowerCase()}</p>
            </div>
            <span className="text-xs font-medium text-gray-500">{formatTzs(summary.current.revenue)}</span>
          </div>

          {summary.current.salesCount === 0 ? (
            <div className="mt-6 flex h-40 items-center justify-center border-y border-dashed border-gray-200 text-sm text-gray-500">
              No completed sales in this period
            </div>
          ) : (
            <div className="mt-6 overflow-x-auto pb-1">
              <div
                role="img"
                aria-label={`Daily revenue for ${rangeLabel.toLowerCase()}`}
                className="flex h-44 min-w-[520px] items-end gap-1 border-b border-gray-200 px-1 sm:gap-2"
              >
                {daily.map((day, index) => {
                  const height = peakRevenue > 0 ? Math.max((day.revenue / peakRevenue) * 100, day.revenue ? 5 : 0) : 0;
                  const peak = day.revenue === peakRevenue && day.revenue > 0;
                  return (
                    <div key={day.date} className="group flex h-full min-w-0 flex-1 flex-col justify-end">
                      <div className="mb-2 h-4 truncate text-center text-[10px] text-gray-500" title={`${day.salesCount} sales`}>
                        {day.salesCount > 0 ? day.salesCount : ''}
                      </div>
                      <div
                        title={`${formatDate(day.date, { weekday: 'short', day: 'numeric', month: 'short' })}: ${formatTzs(day.revenue)}`}
                        aria-label={`${formatDate(day.date, { weekday: 'long', day: 'numeric', month: 'long' })}: ${formatTzs(day.revenue)}`}
                        className={`min-h-0 rounded-t-sm transition-[height] ${peak ? 'bg-amber-500' : 'bg-brand-600'}`}
                        style={{ height: `${height}%` }}
                      />
                      <div className="mt-2 h-4 text-center text-[10px] text-gray-500">
                        {chartLabels.has(index) ? formatDate(day.date, { day: 'numeric', month: period === 7 ? undefined : 'short' }) : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-right text-[10px] text-gray-400">Bars show completed sales; counts above each day</p>
            </div>
          )}
        </section>

        <section className="rounded-md border border-gray-200 bg-white p-4 sm:p-5" aria-labelledby="payments-title">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="payments-title" className="text-base font-semibold text-gray-950">Payment mix</h2>
              <p className="mt-1 text-xs text-gray-500">Recorded tender on completed sales</p>
            </div>
            <span className="text-xs font-medium text-gray-500">{summary.payments.length} methods</span>
          </div>

          {summary.payments.length === 0 ? (
            <p className="mt-8 border-y border-dashed border-gray-200 py-8 text-center text-sm text-gray-500">
              Payment activity will appear here
            </p>
          ) : (
            <div className="mt-6 space-y-5">
              <div className="flex h-2 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
                {summary.payments.map((payment, index) => (
                  <div
                    key={payment.method}
                    className={index === 0 ? 'bg-brand-600' : index === 1 ? 'bg-amber-500' : 'bg-gray-500'}
                    style={{ width: `${paymentTotal ? (payment.revenue / paymentTotal) * 100 : 0}%` }}
                  />
                ))}
              </div>
              <div className="divide-y divide-gray-100">
                {summary.payments.map((payment, index) => (
                  <div key={payment.method} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${index === 0 ? 'bg-brand-600' : index === 1 ? 'bg-amber-500' : 'bg-gray-500'}`} />
                      <span className="truncate text-sm capitalize text-gray-700">{payment.method.replace('_', ' ')}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-950">{formatTzs(payment.revenue)}</p>
                      <p className="text-[10px] text-gray-500">
                        {payment.salesCount} sales · {paymentTotal ? Math.round((payment.revenue / paymentTotal) * 100) : 0}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      <section aria-labelledby="recent-sales-title">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 id="recent-sales-title" className="text-base font-semibold text-gray-950">Recent sales</h2>
            <p className="mt-1 text-xs text-gray-500">Latest recorded transactions across branches</p>
          </div>
          <span className="text-xs text-gray-500">Showing {Math.min(sales.length, 8)} of {sales.length}</span>
        </div>
        <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
          <table className="w-full min-w-[620px] text-sm">
            <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Date and time</th>
                <th className="px-4 py-3 font-semibold">Payment</th>
                <th className="px-4 py-3 text-right font-semibold">Total</th>
                <th className="px-4 py-3 text-right font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {sales.slice(0, 8).map((sale) => (
                <tr key={sale.id} className="border-t border-gray-100">
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                    {new Intl.DateTimeFormat('en-TZ', {
                      timeZone: 'Africa/Dar_es_Salaam',
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    }).format(new Date(sale.created_at))}
                  </td>
                  <td className="px-4 py-3 capitalize text-gray-600">{sale.payment_method.replace('_', ' ')}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-gray-950">{formatTzs(Number(sale.total))}</td>
                  <td className="px-4 py-3 text-right">
                    <StatusBadge tone={sale.status === 'completed' ? 'success' : 'neutral'}>
                      {sale.status}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
              {sales.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">
                    No sales have been recorded yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
