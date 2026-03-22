"use client";

import { useCallback, useEffect, useState } from "react";

const EXPLORER = "https://sepolia.etherscan.io/tx/";

export interface TxToastItem {
  id: number;
  message: string;
  txHash: string;
}

let nextId = 0;

export function useTxToasts() {
  const [toasts, setToasts] = useState<TxToastItem[]>([]);

  const addToast = useCallback((message: string, txHash: string) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, txHash }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 8000);
  }, []);

  return { toasts, addToast };
}

export default function TxToastContainer({ toasts }: { toasts: TxToastItem[] }) {
  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-sm">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

function Toast({ toast }: { toast: TxToastItem }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => setVisible(false), 7400);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className={`
        rounded-lg border border-emerald-500/30 bg-[#0a0a0a]/95 backdrop-blur-md
        p-4 shadow-xl shadow-emerald-500/5
        transition-all duration-500 ease-out
        ${visible ? "translate-x-0 opacity-100" : "translate-x-8 opacity-0"}
      `}
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5 h-8 w-8 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
          <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-emerald-400">{toast.message}</p>
          <p className="text-[10px] text-white/30 font-mono mt-1 truncate">{toast.txHash}</p>
          <a
            href={`${EXPLORER}${toast.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 mt-2 text-[11px] font-semibold text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            View on Etherscan
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}
