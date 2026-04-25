"use client"
import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'

interface ProtectedRouteProps {
  children: React.ReactNode
  requireAuth?: boolean
  adminOnly?: boolean
  redirectTo?: string
}

const ProtectedRoute = ({
  children,
  requireAuth = true,
  adminOnly = false,
  redirectTo,
}: ProtectedRouteProps) => {
  const router = useRouter()
  const pathname = usePathname()
  const { isAuthenticated, userData, isLoading, hasAdminAccess } = useAuthStore()

  // Intermediate state: Firebase says "authenticated" but the Firestore
  // user doc (which carries the role) hasn't arrived yet. If we let the
  // role check run here, hasAdminAccess() returns false (no role to read)
  // and an admin gets bounced to '/' the instant their auth state flips,
  // before AuthProvider's getDoc has a chance to populate userData. Treat
  // it as "still loading" — the spinner shows for ~50–200ms then resolves.
  const userDataPending = isAuthenticated && !userData

  useEffect(() => {
    if (isLoading || userDataPending) return

    if (requireAuth && !isAuthenticated) {
      // For admin paths send to /login with a redirect param so we can
      // return to the originally-requested page after sign-in. For other
      // protected pages keep the legacy '/' destination.
      const isAdminPath = adminOnly || pathname.startsWith('/admin')
      const target = isAdminPath
        ? `/login?redirect=${encodeURIComponent(pathname || '/admin')}`
        : '/'
      router.push(target)
      return
    }

    if (adminOnly && isAuthenticated && !hasAdminAccess()) {
      router.push('/')
      return
    }

    if (redirectTo && isAuthenticated) {
      // Read ?redirect from window directly. Using next/navigation's
      // useSearchParams here forces every page that mounts ProtectedRoute
      // (i.e. all of /admin/*) into dynamic rendering, which broke the
      // build on statically-prerendered admin pages. The effect only runs
      // client-side, so window.location is always defined.
      const search = typeof window !== 'undefined' ? window.location.search : ''
      const next = new URLSearchParams(search).get('redirect')
      const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : null
      if (safeNext) {
        router.push(safeNext)
      } else if (hasAdminAccess()) {
        router.push('/admin')
      } else {
        router.push('/')
      }
    }
  }, [
    isAuthenticated,
    userData,
    isLoading,
    userDataPending,
    requireAuth,
    adminOnly,
    redirectTo,
    router,
    pathname,
    hasAdminAccess,
  ])

  if (isLoading || userDataPending) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-400"></div>
      </div>
    )
  }

  if (requireAuth && !isAuthenticated) {
    return null
  }

  if (adminOnly && isAuthenticated && !hasAdminAccess()) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
          <p className="text-gray-600 mt-2">You don&apos;t have permission to access this page.</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

export default ProtectedRoute
