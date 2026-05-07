import AdminHeader from '@/components/admin/AdminHeader'
import Sidebar from '@/components/admin/Sidebar'
import BottomNav from '@/components/admin/BottomNav'
import DailySummaryGenerator from '@/components/admin/DailySummaryGenerator'
import CommandPalette from '@/components/admin/CommandPalette'
import SwipeableAdminContent from '@/components/admin/SwipeableAdminContent'
import OfflineBanner from '@/components/admin/OfflineBanner'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import { ReactNode } from 'react'

const AdminLayout = ({ children }: { children: ReactNode }) => {
  return (
    <ProtectedRoute requireAuth={true} adminOnly={true}>
      <CommandPalette />
      <div className="flex min-h-screen bg-gray-100 print:bg-white print:min-h-0 overflow-x-clip">
        {/* Sidebar — desktop only */}
        <div className="print:hidden">
          <Sidebar />
        </div>

        {/* Main Content. The min-w-0 here is load-bearing — flex items default
            to min-width:auto, which means a flex child refuses to shrink below
            its content's intrinsic min-width. Any wide product title or table
            inside would push this column past the viewport, defeating every
            "responsive" class on its descendants. min-w-0 is what makes
            shrink-to-fit actually work in flex contexts. */}
        <div className="flex-1 min-w-0 flex flex-col transition-all duration-300 ease-in-out">
          {/* Header + offline status — hidden during print */}
          <div className="print:hidden">
            <AdminHeader />
            <OfflineBanner />
          </div>

          {/* Page content — extra bottom padding on mobile for BottomNav.
              Mobile drops the outer padding entirely so the white card spans
              edge-to-edge; nested children still own their own per-page
              padding. */}
          <main className="flex-1 min-w-0 p-0 sm:p-4 md:p-6 pb-20 lg:pb-6 print:p-0">
            <div className='bg-white w-full h-full rounded-none sm:rounded-2xl p-0 sm:p-4 shadow-none sm:shadow-2xl print:shadow-none print:rounded-none print:p-0 min-w-0 overflow-x-clip'>
              <SwipeableAdminContent>
                {children}
              </SwipeableAdminContent>
            </div>
          </main>
        </div>
      </div>

      {/* Mobile bottom navigation */}
      <BottomNav />

      <DailySummaryGenerator />
    </ProtectedRoute>
  )
}

export default AdminLayout
