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
  setUser: (user: FirebaseUser | null) => void
  setUserData: (userData: UserData | null) => void
  setLoading: (loading: boolean) => void
  fetchUserData: (uid: string) => Promise<void>
  fetchAllUsers: () => void
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
            let usersArray: any = [];
            QuerySnapshot.forEach((doc) => {
              usersArray.push({ ...doc.data(), uid: doc.id });
            });
            set({ users: usersArray, isfetchLoading: false });
          });
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
          isAuthenticated: false,
          isLoading: false
        });
        if (typeof window !== 'undefined') {
          useAuthStore.persist.clearStorage();
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