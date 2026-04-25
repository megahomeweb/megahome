import { fireDB } from '@/firebase/config';
import { ProductT } from '@/lib/types';
import { addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';
import {create} from 'zustand';

interface ProductStore {
  products: ProductT[];
  product: ProductT | null;
  loading: boolean;
  _unsubProducts: (() => void) | null;
  fetchProducts: () => void;
  cleanup: () => void;
  fetchSingleProduct: (id: string) => Promise<void>;
  updateProduct: (id: string, updatedProduct: ProductT) => Promise<void>;
  bulkUpdatePrices: (productIds: string[], percentChange: number, updateCost: boolean) => Promise<number>;
  bulkUpdateStock: (updates: { id: string; stock: number }[]) => Promise<number>;
  deleteProduct: (productId: string) => Promise<void>;
  deleteAllProducts: () => Promise<void>;
  bulkAddProducts: (products: { title: string; category: string; subcategory: string; price: string; costPrice: number; stock: number; description: string }[]) => Promise<void>;
  bulkUpdateProducts: (updates: { id: string; title?: string; price?: string; costPrice?: number; stock?: number; category?: string; subcategory?: string; description?: string }[]) => Promise<number>;
  duplicateProduct: (productId: string) => Promise<void>;
}

const useProductStore = create<ProductStore>((set, get) => ({
  products: [],
  product: null,
  loading: false,
  _unsubProducts: null,

  fetchProducts: () => {
    // Prevent duplicate listeners
    if (get()._unsubProducts) return;
    set({ loading: true });
    try {
      const q = query(collection(fireDB, "products"), orderBy("time"));
      const unsubscribe = onSnapshot(q, (QuerySnapshot) => {
        const productArray: ProductT[] = [];
        QuerySnapshot.forEach((d) => {
          productArray.push({ ...d.data(), id: d.id } as ProductT);
        });
        set({ products: productArray, loading: false });
      });
      set({ _unsubProducts: unsubscribe });
    } catch (error) {
      console.error('Error fetching products:', error);
      set({ loading: false });
    }
  },

  cleanup: () => {
    const unsub = get()._unsubProducts;
    if (unsub) {
      unsub();
      set({ _unsubProducts: null });
    }
  },

  fetchSingleProduct: async (id: string) => {
    set({ loading: true });
    try {
      const productDoc = await getDoc(doc(fireDB, 'products', id));
      const d = productDoc.data();

      if (d) {
        set({
          product: {
            id,
            title: d.title,
            price: d.price,
            costPrice: d.costPrice,
            productImageUrl: d.productImageUrl,
            category: d.category,
            description: d.description,
            quantity: d.quantity,
            stock: d.stock,
            time: d.time,
            date: d.date,
            storageFileId: d.storageFileId,
            subcategory: d.subcategory
          } as ProductT,
          loading: false
        });
      } else {
        set({ loading: false });
        console.error('Product not found');
      }
    } catch (error) {
      console.error('Error fetching product:', error);
      set({ loading: false });
    }
  },

  updateProduct: async (id: string, updatedProduct: ProductT) => {
    set({ loading: true });
    try {
      const productRef = doc(fireDB, 'products', id);
      // Use updateDoc to preserve fields not in updatedProduct
      const { id: _id, ...data } = updatedProduct;
      await updateDoc(productRef, data);
      set({ product: updatedProduct, loading: false });
    } catch (error) {
      console.error('Error updating product:', error);
      set({ loading: false });
    }
  },

  // Bulk update prices by percentage for given product IDs.
  // Price is stored as a string (e.g. "5000") but Excel imports and manual
  // entries sometimes contain locale separators ("5,000", "5 000", "5.000")
  // or stray currency text ("5000 so'm"). Plain Number("5,000") returns NaN
  // and Math.round(NaN) returns NaN — Firestore then silently writes
  // `price: "NaN"`, breaking display, sort, and totals across the catalog.
  // Strip everything but digits before parsing, and skip the row if the
  // result is non-positive (don't blow away a valid price with 0).
  bulkUpdatePrices: async (productIds: string[], percentChange: number, updateCost: boolean) => {
    const batch = writeBatch(fireDB);
    const multiplier = 1 + (percentChange / 100);
    let updated = 0;

    const parsePrice = (raw: unknown): number => {
      if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
      if (typeof raw !== 'string') return NaN;
      const digits = raw.replace(/[^\d]/g, '');
      return digits ? Number(digits) : NaN;
    };

    for (const pid of productIds) {
      const product = get().products.find((p) => p.id === pid);
      if (!product) continue;

      const currentPrice = parsePrice(product.price);
      if (!Number.isFinite(currentPrice) || currentPrice <= 0) continue;

      const newPrice = Math.max(0, Math.round(currentPrice * multiplier));
      const updates: { price: string; costPrice?: number } = { price: String(newPrice) };

      if (updateCost && product.costPrice && Number.isFinite(product.costPrice)) {
        updates.costPrice = Math.round(product.costPrice * multiplier);
      }

      batch.update(doc(fireDB, 'products', pid), updates);
      updated++;
    }

    await batch.commit();
    return updated;
  },

  bulkUpdateStock: async (updates: { id: string; stock: number }[]) => {
    const batch = writeBatch(fireDB);
    for (const { id, stock } of updates) {
      const ref = doc(fireDB, "products", id);
      batch.update(ref, { stock });
    }
    await batch.commit();
    return updates.length;
  },

  deleteProduct: async (productId) => {
    try {
      const productRef = doc(fireDB, 'products', productId);
      await deleteDoc(productRef);
      set((state) => ({
        products: state.products.filter(product => product.id !== productId)
      }));
    } catch (error) {
      console.error('Error deleting product:', error);
    }
  },

  deleteAllProducts: async () => {
    const { products } = get();
    // Firestore batches limited to 500 ops, chunk accordingly
    for (let i = 0; i < products.length; i += 500) {
      const batch = writeBatch(fireDB);
      const chunk = products.slice(i, i + 500);
      for (const product of chunk) {
        batch.delete(doc(fireDB, 'products', product.id));
      }
      await batch.commit();
    }
    set({ products: [] });
  },

  bulkAddProducts: async (products) => {
    for (let i = 0; i < products.length; i += 500) {
      const batch = writeBatch(fireDB);
      const chunk = products.slice(i, i + 500);
      for (const product of chunk) {
        const docRef = doc(collection(fireDB, 'products'));
        batch.set(docRef, {
          title: product.title,
          category: product.category,
          subcategory: product.subcategory || '',
          price: product.price,
          costPrice: product.costPrice || 0,
          stock: product.stock || 0,
          quantity: product.stock || 0,
          description: product.description || '',
          productImageUrl: [],
          storageFileId: '',
          time: Timestamp.now(),
          date: Timestamp.now(),
        });
      }
      await batch.commit();
    }
  },

  bulkUpdateProducts: async (updates) => {
    const batch = writeBatch(fireDB);
    for (const { id, ...data } of updates) {
      const ref = doc(fireDB, "products", id);
      const cleanData: Record<string, string | number> = {};
      if (data.title !== undefined) cleanData.title = data.title;
      if (data.price !== undefined) cleanData.price = data.price;
      if (data.costPrice !== undefined) cleanData.costPrice = data.costPrice;
      if (data.stock !== undefined) cleanData.stock = data.stock;
      if (data.category !== undefined) cleanData.category = data.category;
      if (data.subcategory !== undefined) cleanData.subcategory = data.subcategory;
      if (data.description !== undefined) cleanData.description = data.description;
      if (Object.keys(cleanData).length > 0) {
        batch.update(ref, cleanData);
      }
    }
    await batch.commit();
    return updates.length;
  },

  duplicateProduct: async (productId: string) => {
    const original = get().products.find(p => p.id === productId);
    if (!original) throw new Error("Product not found");
    const newProduct = {
      title: `Nusxa: ${original.title}`,
      price: original.price,
      costPrice: original.costPrice || 0,
      category: original.category,
      subcategory: original.subcategory || "",
      description: original.description || "",
      quantity: original.quantity || 0,
      stock: original.stock || 0,
      productImageUrl: [],
      storageFileId: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
      time: Timestamp.now(),
      date: Timestamp.now(),
    };
    await addDoc(collection(fireDB, "products"), newProduct);
  },
}));

export default useProductStore;
