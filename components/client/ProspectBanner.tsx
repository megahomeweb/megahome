"use client"
import React from 'react'
import { Clock } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'

/**
 * Slim status bar shown to prospects (Ehtimoliy foydalanuvchi) on every
 * client-side page: signed up, but the admin hasn't approved them yet, so
 * prices stay hidden. Intentionally not dismissible — it disappears on its
 * own the moment the admin promotes them to Foydalanuvchi (the auth store
 * re-renders consumers when userData changes).
 */
const ProspectBanner = () => {
  const { isProspect } = useAuthStore()
  if (!isProspect()) return null

  return (
    <div className="bg-amber-50 border-b border-amber-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-2.5 flex items-center justify-center gap-2 text-center">
        <Clock className="size-4 text-amber-600 shrink-0" />
        <p className="text-xs sm:text-sm font-medium text-amber-800">
          Hisobingiz tekshirilmoqda — tez orada qo&apos;ng&apos;iroq qilamiz
        </p>
      </div>
    </div>
  )
}

export default ProspectBanner
