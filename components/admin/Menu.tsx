"use client"
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import React from 'react'
import { BiUser } from 'react-icons/bi'
import { LayoutDashboard, ShoppingCart, PackagePlus, BarChart3, Crown, FileText, Warehouse, MessageCircle, Receipt, Tag, Percent } from 'lucide-react';
import { useNotificationStore } from '@/store/useNotificationStore'
import { useAuthStore } from '@/store/authStore'

const Menu = () => {
  const pathname = usePathname();
  const { notifications } = useNotificationStore();
  const { isAdmin, hasAdminAccess } = useAuthStore();
  const admin = isAdmin();
  const staffAccess = hasAdminAccess(); // admin OR manager

  const newOrderCount = notifications.filter((n) => !n.read && n.type === 'new_order').length;
  const newUserCount = notifications.filter((n) => !n.read && n.type === 'new_user').length;

  const isActive = (path: string) => pathname === path;

  return (
    <div className="flex flex-col gap-2 py-4">
      <Link href={'/admin/'} className={`flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-link-hover ${isActive('/admin') ? 'bg-brand-gray-100' : ''}`}>
        <LayoutDashboard size={24} />
        <p className="text-black text-sm font-medium leading-normal">Bosh sahifa</p>
      </Link>

      {/* All staff: POS — Sotuv nuqtasi */}
      <Link href={'/admin/sotuv'} className={`flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-link-hover ${isActive('/admin/sotuv') ? 'bg-brand-gray-100' : ''}`}>
        <Receipt size={24} className="text-emerald-600" />
        <p className="text-black text-sm font-medium leading-normal">Sotuv nuqtasi</p>
        <span className="ml-auto text-[9px] font-bold uppercase tracking-wide bg-emerald-100 text-emerald-700 rounded-md px-1.5 py-0.5">
          POS
        </span>
      </Link>

      {/* Admin only: User management */}
      {admin && (
        <Link href={'/admin/users'} className={`flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-link-hover ${isActive('/admin/users') ? 'bg-brand-gray-100' : ''}`}>
          <BiUser size={24} />
          <p className="text-black text-sm font-medium leading-normal">Foydalanuvchilar</p>
          {newUserCount > 0 && (
            <span className="ml-auto flex items-center justify-center min-w-5 h-5 px-1.5 text-[11px] font-bold text-white bg-blue-500 rounded-full">
              {newUserCount}
            </span>
          )}
        </Link>
      )}

      {/* Admin/Manager: Categories */}
      {staffAccess && (
        <Link href={'/admin/categories'} className={`flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-link-hover ${isActive('/admin/categories') ? 'bg-brand-gray-100' : ''}`}>
          <div className="text-black" data-icon="Package" data-size="24px" data-weight="regular">
            <svg xmlns="http://www.w3.org/2000/svg" width="24px" height="24px" fill="currentColor" viewBox="0 0 256 256">
              <path d="M223.68,66.15,135.68,18a15.88,15.88,0,0,0-15.36,0l-88,48.17a16,16,0,0,0-8.32,14v95.64a16,16,0,0,0,8.32,14l88,48.17a15.88,15.88,0,0,0,15.36,0l88-48.17a16,16,0,0,0,8.32-14V80.18A16,16,0,0,0,223.68,66.15ZM128,32l80.34,44-29.77,16.3-80.35-44ZM128,120,47.66,76l33.9-18.56,80.34,44ZM40,90l80,43.78v85.79L40,175.82Zm176,85.78h0l-80,43.79V133.82l32-17.51V152a8,8,0,0,0,16,0V107.55L216,90v85.77Z"></path>
            </svg>
          </div>
          <p className="text-black text-sm font-medium leading-normal">Kategoriyalar</p>
        </Link>
      )}

      {/* All staff: Products */}
      <Link href={'/admin/products'} className={`flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-link-hover ${isActive('/admin/products') ? 'bg-brand-gray-100' : ''}`}>
        <div className="text-black" data-icon="Table" data-size="24px" data-weight="fill">
          <svg xmlns="http://www.w3.org/2000/svg" width="24px" height="24px" fill="currentColor" viewBox="0 0 256 256">
            <path d="M224,48H32a8,8,0,0,0-8,8V192a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A8,8,0,0,0,224,48ZM40,112H80v32H40Zm56,0H216v32H96ZM40,160H80v32H40Zm176,32H96V160H216v32Z"></path>
          </svg>
        </div>
        <p className="text-black text-sm font-medium leading-normal">Mahsulotlar</p>
      </Link>

      {/* All staff: Orders */}
      <Link href={'/admin/orders'} className={`flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-link-hover ${isActive('/admin/orders') ? 'bg-brand-gray-100' : ''}`}>
        <ShoppingCart size={24} />
        <p className="text-black text-sm font-medium leading-normal">Buyurtmalar</p>
        {newOrderCount > 0 && (
          <span className="ml-auto flex items-center justify-center min-w-5 h-5 px-1.5 text-[11px] font-bold text-white bg-green-500 rounded-full animate-pulse">
            {newOrderCount}
          </span>
        )}
      </Link>

      {/* All staff: Invoices */}
      <Link href={'/admin/invoices'} className={`flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-link-hover ${isActive('/admin/invoices') ? 'bg-brand-gray-100' : ''}`}>
        <FileText size={24} />
        <p className="text-black text-sm font-medium leading-normal">Schyot-faktura</p>
      </Link>

      {/* All staff: Label maker */}
      <Link href={'/admin/label'} className={`flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-link-hover ${isActive('/admin/label') ? 'bg-brand-gray-100' : ''}`}>
        <Tag size={24} />
        <p className="text-black text-sm font-medium leading-normal">Etiketkalar</p>
      </Link>

      {/* All staff: Kirim */}
      <Link href={'/admin/kirim'} className={`flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-link-hover ${isActive('/admin/kirim') ? 'bg-brand-gray-100' : ''}`}>
        <PackagePlus size={24} />
        <p className="text-black text-sm font-medium leading-normal">Kirim (tovar qabul)</p>
      </Link>

      {/* All staff: Warehouse */}
      <Link href={'/admin/ombor'} className={`flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-link-hover ${isActive('/admin/ombor') ? 'bg-brand-gray-100' : ''}`}>
        <Warehouse size={24} />
        <p className="text-black text-sm font-medium leading-normal">Ombor</p>
      </Link>

      {/* Admin/Manager: Reports */}
      {staffAccess && (
        <Link href={'/admin/reports'} className={`flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-link-hover ${isActive('/admin/reports') ? 'bg-brand-gray-100' : ''}`}>
          <BarChart3 size={24} />
          <p className="text-black text-sm font-medium leading-normal">Hisobotlar</p>
        </Link>
      )}

      {/* Admin/Manager: Customer ranking */}
      {staffAccess && (
        <Link href={'/admin/customers'} className={`flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-link-hover ${isActive('/admin/customers') ? 'bg-brand-gray-100' : ''}`}>
          <Crown size={24} />
          <p className="text-black text-sm font-medium leading-normal">Mijozlar reytingi</p>
        </Link>
      )}

      {/* Admin only: Promo codes */}
      {admin && (
        <Link href={'/admin/promo'} className={`flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-link-hover ${isActive('/admin/promo') ? 'bg-brand-gray-100' : ''}`}>
          <Percent size={24} />
          <p className="text-black text-sm font-medium leading-normal">Promo kodlar</p>
        </Link>
      )}

      {/* Admin only: Telegram Bot */}
      {admin && (
        <Link href={'/admin/telegram'} className={`flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-link-hover ${isActive('/admin/telegram') ? 'bg-brand-gray-100' : ''}`}>
          <MessageCircle size={24} />
          <p className="text-black text-sm font-medium leading-normal">Telegram Bot</p>
        </Link>
      )}
    </div>
  )
}

export default Menu
