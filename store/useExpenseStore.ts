import { create } from 'zustand';
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  query,
  onSnapshot,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { fireDB, auth } from '@/firebase/config';
import { Expense } from '@/lib/types';

interface ExpenseState {
  expenses: Expense[];
  loading: boolean;
  /** Live unsubscribe handle — guarded against re-subscribe leaks. */
  _unsubExpenses: (() => void) | null;
  fetchExpenses: () => void;
  addExpense: (e: Omit<Expense, 'id' | 'createdAt'>) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  cleanup: () => void;
}

export const useExpenseStore = create<ExpenseState>((set, get) => ({
  expenses: [],
  loading: true,
  _unsubExpenses: null,

  fetchExpenses: () => {
    if (get()._unsubExpenses) return; // one live subscription per app lifetime

    // Attach AFTER auth resolves — a pre-auth listener hits the rules as an
    // anonymous request, gets denied once and dies silently (the useOrderStore
    // forever-spinner bug). authStateReady() waits for the restored session.
    const subscribe = () => {
      const unsub = onSnapshot(
        query(collection(fireDB, 'expenses'), orderBy('date', 'desc')),
        (snap) => {
          const list = snap.docs.map((d) => ({ ...(d.data() as Omit<Expense, 'id'>), id: d.id }));
          set({ expenses: list, loading: false });
        },
        (err) => {
          console.error('expenses subscription failed:', err);
          set({ loading: false });
        },
      );
      set({ _unsubExpenses: unsub });
    };

    auth
      .authStateReady()
      .then(subscribe)
      .catch(() => subscribe());
  },

  addExpense: async (e) => {
    await addDoc(collection(fireDB, 'expenses'), {
      ...e,
      createdAt: Timestamp.now(),
    });
  },

  deleteExpense: async (id) => {
    await deleteDoc(doc(fireDB, 'expenses', id));
  },

  cleanup: () => {
    get()._unsubExpenses?.();
    set({ _unsubExpenses: null });
  },
}));
