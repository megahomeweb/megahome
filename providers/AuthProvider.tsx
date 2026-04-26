"use client"
import { useEffect } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/firebase/config'
import { useAuthStore } from '@/store/authStore'
import { doc, getDoc } from 'firebase/firestore'
import { fireDB } from '@/firebase/config'
import type { UserData } from '@/store/authStore'
import { isAdminEmail } from '@/lib/admin-config'

interface AuthProviderProps {
  children: React.ReactNode
}

const AuthProvider = ({ children }: AuthProviderProps) => {
  const { setUser, setUserData, setLoading } = useAuthStore()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setLoading(true)

      if (user) {
        setUser(user)

        try {
          const userDocRef = doc(fireDB, 'user', user.uid)
          const userSnapshot = await getDoc(userDocRef)

          if (userSnapshot.exists()) {
            const userData = userSnapshot.data() as UserData
            // Defensive: if this is the hardcoded admin, force role='admin'
            // even if the Firestore doc says otherwise. Prevents the
            // (harmless but confusing) flash where AuthProvider rehydrates
            // from a stale doc that hasn't yet been upserted to admin.
            if (isAdminEmail(user.email)) {
              userData.role = 'admin'
            }
            setUserData(userData)
          } else if (isAdminEmail(user.email)) {
            // Admin authenticated but Firestore profile missing — render
            // the panel anyway so the operator isn't locked out. The
            // LoginForm admin path will upsert the doc on the next login;
            // for the in-flight session we synthesize a minimal profile.
            setUserData({
              name: 'Admin',
              email: user.email,
              uid: user.uid,
              role: 'admin',
              time: null,
              date: '',
              phone: '',
            })
          } else {
            setUserData(null)
          }

          // Server cookie minting is no longer attempted here. The
          // hardcoded admin path mints its cookie via /api/auth/admin-
          // session inside LoginForm; non-admin users don't need a
          // server cookie because they don't traverse admin middleware.
          // Leaving the old fetch in place would re-trigger the
          // "Invalid token" failure on every auth-state change for
          // anyone whose Firebase Admin SDK env isn't fully configured.
        } catch (error) {
          console.error('Error fetching user data:', error)
          setUserData(null)
        }
      } else {
        setUser(null)
        setUserData(null)
        // Clear server-signed session cookie
        fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {})
      }

      setLoading(false)
    })

    return () => unsubscribe()
  }, [setUser, setUserData, setLoading])

  return <>{children}</>
}

export default AuthProvider