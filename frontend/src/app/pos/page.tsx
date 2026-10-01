'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { isLoggedIn, logout } from '@/lib/auth';

interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  selling_price: string;
}

interface Branch {
  id: string;
  name: string;
}

interface CartLine {
  productId: string;
  name: string;
  sku: string;
  unitPrice: number;
  quantity: number;
}

type PaymentMethod = 'cash' | 'mobile_money' | 'card';

export default function PosPage() {
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string>('');
  const [query, setQuery] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.replace('/login');
      return;
    }

    Promise.all([api.get<Product[]>('/products'), api.get<Branch[]>('/branches')])
      .then(([productsData, branchesData]) => {
        setProducts(productsData);
        setBranches(branchesData);
        if (branchesData.length > 0) {
          setBranchId(branchesData[0].id);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));

    searchRef.current?.focus();
  }, [router]);

  const total = useMemo(
    () => cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0),
    [cart],
  );

  function addToCart(product: Product) {
    setCart((prev) => {
      const existing = prev.find((line) => line.productId === product.id);
      if (existing) {
        return prev.map((line) =>
          line.productId === product.id ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }

      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          sku: product.sku,
          unitPrice: Number(product.selling_price),
          quantity: 1,
        },
      ];
    });
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim().toLowerCase();
    if (!q) return;

    const match =
      products.find((p) => p.barcode?.toLowerCase() === q) ||
      products.find((p) => p.sku.toLowerCase() === q) ||
      products.find(
        (p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q),
      );

    if (match) {
      addToCart(match);
      setQuery('');
      setNotFound(false);
    } else {
      setNotFound(true);
    }

    searchRef.current?.focus();
  }

  function adjustQuantity(productId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((line) =>
          line.productId === productId ? { ...line, quantity: line.quantity + delta } : line,
        )
        .filter((line) => line.quantity > 0),
    );
  }

  function clearCart() {
    setCart([]);
    setQuery('');
    setNotFound(false);
    searchRef.current?.focus();
  }

  async function handlePay() {
    if (cart.length === 0 || !branchId || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      await api.post('/sales', {
        branchId,
        paymentMethod,
        amountPaid: total,
        items: cart.map((line) => ({ productId: line.productId, quantity: line.quantity })),
      });

      setSuccessMessage(`Sale complete — TZS ${total.toLocaleString()}`);
      setCart([]);
      setTimeout(() => setSuccessMessage(null), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sale failed');
    } finally {
      setSubmitting(false);
      searchRef.current?.focus();
    }
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'F9') {
        e.preventDefault();
        handlePay();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        clearCart();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, branchId, paymentMethod, submitting]);

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
        <span className="text-lg font-bold text-brand-700">Kariakoo POS</span>
        <div className="flex items-center gap-3">
          {branches.length > 1 && (
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
            >
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          )}
          <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-900">
            Sign out
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col p-4">
          <form onSubmit={handleSearchSubmit}>
            <input
              ref={searchRef}
              type="text"
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setNotFound(false);
              }}
              placeholder="Scan barcode or type product name / SKU…"
              className="w-full rounded-xl border-2 border-brand-600 px-5 py-4 text-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </form>

          {notFound && (
            <p className="mt-2 text-sm text-danger-600">No matching product found — try again.</p>
          )}

          <div className="mt-4 flex-1 overflow-y-auto rounded-xl border border-gray-200 bg-white">
            {cart.length === 0 ? (
              <div className="flex h-full items-center justify-center text-gray-400">
                Cart is empty — scan an item to begin
              </div>
            ) : (
              <table className="w-full text-left">
                <thead className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Item</th>
                    <th className="px-4 py-3">Qty</th>
                    <th className="px-4 py-3">Unit</th>
                    <th className="px-4 py-3">Total</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {cart.map((line) => (
                    <tr key={line.productId} className="border-b border-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{line.name}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => adjustQuantity(line.productId, -1)}
                            className="h-9 w-9 rounded-lg border border-gray-300 text-lg font-bold text-gray-600 hover:bg-gray-100"
                          >
                            −
                          </button>
                          <span className="w-8 text-center text-base">{line.quantity}</span>
                          <button
                            onClick={() => adjustQuantity(line.productId, 1)}
                            className="h-9 w-9 rounded-lg border border-gray-300 text-lg font-bold text-gray-600 hover:bg-gray-100"
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {line.unitPrice.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-900">
                        {(line.unitPrice * line.quantity).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => adjustQuantity(line.productId, -line.quantity)}
                          className="text-sm text-danger-600 hover:underline"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <aside className="flex w-80 flex-col border-l border-gray-200 bg-white p-4">
          <div className="mb-4 rounded-xl bg-brand-50 p-4 text-center">
            <p className="text-sm text-brand-700">Total due</p>
            <p className="text-3xl font-bold text-brand-700">TZS {total.toLocaleString()}</p>
          </div>

          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Payment method
          </p>
          <div className="mb-4 grid grid-cols-1 gap-2">
            {(['cash', 'mobile_money', 'card'] as PaymentMethod[]).map((method) => (
              <button
                key={method}
                onClick={() => setPaymentMethod(method)}
                className={`rounded-xl border-2 py-3 text-base font-medium capitalize transition ${
                  paymentMethod === method
                    ? 'border-brand-600 bg-brand-50 text-brand-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {method.replace('_', ' ')}
              </button>
            ))}
            <button
              disabled
              title="Coming soon — requires the Customers module"
              className="cursor-not-allowed rounded-xl border-2 border-gray-100 py-3 text-base font-medium text-gray-300"
            >
              Credit (coming soon)
            </button>
          </div>

          {error && <p className="mb-2 text-sm text-danger-600">{error}</p>}
          {successMessage && (
            <p className="mb-2 rounded-lg bg-success-50 px-3 py-2 text-sm font-medium text-success-700">
              {successMessage}
            </p>
          )}

          <button
            onClick={handlePay}
            disabled={cart.length === 0 || submitting}
            className="mt-auto rounded-xl bg-brand-600 py-5 text-xl font-bold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? 'Processing…' : 'PAY (F9)'}
          </button>
          <button
            onClick={clearCart}
            className="mt-2 rounded-xl border border-gray-200 py-2 text-sm text-gray-500 hover:bg-gray-50"
          >
            Clear cart (Esc)
          </button>
        </aside>
      </div>
    </div>
  );
}
