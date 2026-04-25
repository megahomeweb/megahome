import { fireDB } from '@/firebase/config';
import { CategoryI } from '@/lib/types';
import { addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, query, updateDoc } from 'firebase/firestore';
import {create} from 'zustand';

interface CategoryStoreI {
  categories: CategoryI[];
  category: CategoryI | null;
  loading: boolean;
  _unsubCategories: (() => void) | null;
  addCategory: (newCategory: CategoryI) => Promise<void>;
  fetchCategories: () => void;
  cleanup: () => void;
  fetchSingleCategory: (id: string) => void;
  updateCategory: (id: string, updatedCategory: CategoryI) => Promise<void>;
  deleteCategory: (categoryId: string) => void;
}

const useCategoryStore = create<CategoryStoreI>((set, get) => ({
  categories: [],
  category: null,
  loading: false,
  _unsubCategories: null,
  
  // Add a new category
  addCategory: async (newCategory: CategoryI) => {
    set({ loading: true });
    try {
      const categoryDoc = collection(fireDB, 'categories');
      await addDoc(categoryDoc, newCategory);
      set({ loading: false });
    } catch (error) {
      console.error('Error adding category:', error);
      set({ loading: false });
    }
  },

  // fetch single category with id
  fetchSingleCategory: async (id) => {
    set({loading: true});
    try {
      const categoryDoc = await getDoc(doc(fireDB, 'categories', id));
      const categoryData = categoryDoc.data();

      if (categoryData) {
        set({
          category: {
            id, 
            name: categoryData.name,
            description: categoryData.description,
            categoryImgUrl: categoryData.categoryImgUrl,
            storageFileId: categoryData.storageFileId,
            subcategory: categoryData.subcategory
          } as CategoryI,
          loading: false
        });
      } else {
        set({ loading: false });
        console.error('category not found');
      }
      
      
    } catch (error) {
      
    }
  },

  // Update a category. updateDoc instead of setDoc — setDoc REPLACES the
  // whole document, which silently wipes any field the form doesn't know
  // about (createdAt, displayOrder, custom flags added by future features).
  // updateDoc merges, preserving unknown fields. Strip `id` so we don't
  // persist a redundant copy in the doc body.
  updateCategory: async (id: string, updatedCategory: CategoryI) => {
    set({ loading: true });
    try {
      const { id: _id, ...data } = updatedCategory;
      await updateDoc(doc(fireDB, 'categories', id), data);
      set({ category: updatedCategory, loading: false });
    } catch (error) {
      console.error('Error updating category:', error);
      set({ loading: false });
    }
  },

  cleanup: () => {
    const unsub = get()._unsubCategories;
    if (unsub) {
      unsub();
      set({ _unsubCategories: null });
    }
  },

  // Fetch all categories
  fetchCategories: () => {
    // Prevent duplicate listeners
    if (get()._unsubCategories) return;
    set({ loading: true });
    try {
      const q = query(collection(fireDB, "categories"));
      const unsubscribe = onSnapshot(q, (QuerySnapshot) => {
        const categoryArray: CategoryI[] = [];
        QuerySnapshot.forEach((doc) => {
          categoryArray.push({ ...doc.data(), id: doc.id } as CategoryI);
        });
        set({ categories: categoryArray, loading: false });
      });
      set({ _unsubCategories: unsubscribe });
    } catch (error) {
      console.error('Error fetching categories:', error);
      set({ loading: false });
    }
  },

  // delete category with id
  deleteCategory: async (categoryId) => {
    try {
      const categoryRef = doc(fireDB, 'categories', categoryId);
      await deleteDoc(categoryRef);
      set((state) => ({
        categories: state.categories.filter(category => category.id !== categoryId)
      }));
    } catch (error) {
      console.error('Error deleting category:', error);
    }
  }
}))

export default useCategoryStore;