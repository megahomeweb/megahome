import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { User as FirebaseUser, signOut } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, fireDB } from '@/firebase/config'
import { collection, onSnapshot } from 'firebase/firestore'
import { isAdminEmail } from '@/lib/admin-config'

type Role = "admin" | "manager" | "user"

interface UserData {
  name: string
  email: string | null
  uid: string
  role: Role
  time: any
  date: string
  phone: string
}

interface AuthState {
  user: FirebaseUser | null
  userData: UserData | null
  users: UserData[]
  isAuthenticated: boolean
  isLoading: boolean
  isfetchLoading: boolean
  /**
   * Live onSnapshot handle from the most recent fetchAllUsers() call.
   * Tracked here so logout() can guarantee the listener is torn down
   * even if a mounted component never reached its own cleanup (e.g.
   * the logout redirect unmounts the consumer mid-flight). Callers
   * still capture and dispose their own returned unsub for normal
   * unmount — this is belt-and-suspenders.
   */
  _unsubAllUsers: (() => void) | null
  setUser: (user: FirebaseUser | null) => void
  setUserData: (userData: UserData | null) => void
  setLoading: (loading: boolean) => void
  fetchUserData: (uid: string) => Promise<void>
  fetchAllUsers: () => (() => void) | undefined
  logout: () => void
  isAdmin: () => boolean
  isManager: () => boolean
  hasAdminAccess: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      userData: null,
      users: [],
      isAuthenticated: false,
      isLoading: true,
      isfetchLoading: true,
      _unsubAllUsers: null,

      setUser: (user) => {
        // Do NOT touch isLoading here. AuthProvider drives the loading
        // lifecycle: it calls setLoading(true) at the start of an auth
        // event, then setUser, then awaits the userData fetch, then
        // setLoading(false). Previously setUser flipped isLoading=false
        // mid-flight, opening a window where the store advertised
        // {isAuthenticated: true, userData: null, isLoading: false}.
        // ProtectedRoute saw that window on admin login and bounced the
        // user to '/' before their role had been read from Firestore —
        // looked exactly like "login succeeds but no redirect to /admin".
        set({
          user,
          isAuthenticated: !!user,
        })
      },

      setUserData: (userData) => {
        set({ userData })
      },

      setLoading: (loading) => {
        set({ isLoading: loading })
      },

      fetchUserData: async (uid: string) => {
        try {
          const userDoc = doc(fireDB, 'user', uid)
          const userSnapshot = await getDoc(userDoc)
          
          if (userSnapshot.exists()) {
            const userData = userSnapshot.data() as UserData
            set({ userData })
          } else {
            console.error('User document not found')
            set({ userData: null })
          }
        } catch (error) {
          console.error('Error fetching user data:', error)
          set({ userData: null })
        }
      },

      fetchAllUsers: () => {
        set({ isfetchLoading: true });
        try {
          const q = collection(fireDB, "user");
          const unsubscribe = onSnapshot(q, (QuerySnapshot) => {
            const usersArray: UserData[] = [];
            QuerySnapshot.forEach((doc) => {
              usersArray.push({ ...(doc.data() as UserData), uid: doc.id });
            });
            set({ users: usersArray, isfetchLoading: false });
          });
          // Track the most-recent handle on the store so logout() can
          // tear down even if the consumer component never disposes it.
          // Firestore's unsubscribe is idempotent — double-call is safe.
          set({ _unsubAllUsers: unsubscribe });
          return unsubscribe;
        } catch (error) {
          console.error('Error fetching users:', error);
          set({ isfetchLoading: false });
          return undefined;
        }
      },

      logout: async () => {
        // Tear down every Firestore live listener BEFORE we sign out.
        // Otherwise: onSnapshot keeps firing against a stale auth context
        // for several seconds, the rules deny the reads, and the operator
        // sees "Missing or insufficient permissions" errors in the console
        // after every logout. Lazy-imported to avoid a circular import.
        if (typeof window !== 'undefined') {
          try {
            const { useOrderStore } = await import('@/store/useOrderStore');
            useOrderStore.getState().cleanup();
          } catch {}
          try {
            const useProductStore = (await import('@/store/useProductStore')).default as
              { getState: () => { cleanup?: () => void } };
            useProductStore.getState().cleanup?.();
          } catch {}
          try {
            const { useNotificationStore } = await import('@/store/useNotificationStore');
            (useNotificationStore.getState() as { stopListening?: () => void }).stopListening?.();
          } catch {}
        }
        // Tear down the all-users listener too (separate code path from
        // the lazy-imported stores above because authStore already owns
        // this listener — no need for a dynamic import).
        const unsubUsers = get()._unsubAllUsers;
        if (unsubUsers) {
          try { unsubUsers(); } catch {}
        }
        try {
          await signOut(auth);
        } catch (error) {
          console.error('Error signing out:', error);
        }
        // Clear server-signed session cookie
        fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {});
        set({
          user: null,
          userData: null,
          users: [],
          _unsubAllUsers: null,
          isAuthenticated: false,
          isLoading: false
        });
        // Wipe every persisted client cache so the next user on the
        // same device (think: shared POS tablet at a market stall)
        // can't see the previous operator's cart, drafts, unread
        // notifications, or wishlist. Privacy bug if these leak.
        // Lazy-imported for the same circular-import reason as above.
        if (typeof window !== 'undefined') {
          useAuthStore.persist.clearStorage();
          try {
            const useCartProductStore = (await import('@/store/useCartStore')).default as
              { persist?: { clearStorage?: () => void } };
            useCartProductStore.persist?.clearStorage?.();
          } catch {}
          try {
            const useDraftStore = (await import('@/store/useDraftStore')).default as
              { persist?: { clearStorage?: () => void } };
            useDraftStore.persist?.clearStorage?.();
          } catch {}
          try {
            const { useNotificationStore } = await import('@/store/useNotificationStore');
            (useNotificationStore as unknown as { persist?: { clearStorage?: () => void } })
              .persist?.clearStorage?.();
          } catch {}
          try {
            const useWishlistStore = (await import('@/store/useWishlistStore')).default as
              { persist?: { clearStorage?: () => void } };
            useWishlistStore.persist?.clearStorage?.();
          } catch {}
        }
      },

      // Admin checks gate on the FIREBASE EMAIL, not on userData.role.
      // The role field in Firestore is treated as a hint (so the UI can
      // tag people as managers etc.) but admin access is granted to
      // exactly one identity — the hardcoded admin email. This means:
      //   - Tampering with your own user doc to set role='admin' does
      //     nothing (you don't own the admin email).
      //   - The admin can survive a corrupted/missing Firestore profile
      //     and still log in (we re-upsert it on each admin login).
      //   - Removing the role from Firestore can't lock the admin out.
      isAdmin: () => {
        const { user } = get()
        return isAdminEmail(user?.email)
      },

      isManager: () => {
        const { userData } = get()
        return userData?.role === 'manager'
      },

      hasAdminAccess: () => {
        const { user } = get()
        return isAdminEmail(user?.email)
      }
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        userData: state.userData,
        isAuthenticated: state.isAuthenticated
      })
    }
  )
)

export type { UserData };