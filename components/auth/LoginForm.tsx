"use client"
import React from 'react'
import { Button } from '../ui/button';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SubmitHandler, useForm } from 'react-hook-form';
import toast from 'react-hot-toast'
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, fireDB } from '@/firebase/config';
import { doc, getDoc } from 'firebase/firestore'
import { FirebaseError } from 'firebase/app';
import { useAuthStore, type UserData } from '@/store/authStore';

interface LoginFormInputs {
  email: string
  password: string
}

const LoginForm = () => {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset
  } = useForm<LoginFormInputs>({
    defaultValues: {
      email: "",
      password: ""
    }
  })

  const userLoginFunction: SubmitHandler<LoginFormInputs> = async (data) => {
    setLoading(true)

    try {
      // 1. Authenticate with Firebase Auth.
      const userCredential = await signInWithEmailAndPassword(auth, data.email, data.password);
      const user = userCredential.user

      // 2. Read user profile from Firestore (single round-trip; was a
      //    realtime onSnapshot listener that never needed to be realtime).
      const userSnap = await getDoc(doc(fireDB, 'user', user.uid))
      if (!userSnap.exists()) {
        // The Auth account exists but no Firestore profile — orphaned
        // signup, or doc deleted. Surface this clearly instead of leaving
        // the user staring at a frozen "Kirilyapti..." button.
        toast.error("Profil topilmadi. Iltimos, administrator bilan bog'laning.")
        setLoading(false)
        return
      }
      const userData = { ...(userSnap.data() as UserData), uid: user.uid }
      if (!userData.role) {
        toast.error("Foydalanuvchi roli aniqlanmadi")
        setLoading(false)
        return
      }

      // 3. Mint the server-signed session cookie. This MUST succeed for
      //    middleware to let the user through to /admin — previously the
      //    error was swallowed (// best-effort) so a misconfigured
      //    SESSION_SECRET produced a silent loop: success toast →
      //    router.push('/admin') → middleware bounces back to /login.
      try {
        const idToken = await user.getIdToken()
        const res = await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({} as Record<string, unknown>))
          const msg = (body as { error?: string })?.error || `Sessiya yaratilmadi (${res.status})`
          console.error('Session POST failed', res.status, body)
          toast.error(msg)
          setLoading(false)
          return
        }
      } catch (err) {
        console.error('Session network error', err)
        toast.error("Sessiya yaratilmadi: tarmoq xatosi")
        setLoading(false)
        return
      }

      // 4. Hydrate the Zustand store BEFORE navigating. AuthProvider's
      //    onAuthStateChanged also fires and writes the same data, but it
      //    races with the navigation — if router.push('/admin') wins,
      //    AdminLayout mounts with userData=null and ProtectedRoute can't
      //    decide whether to allow the page. Writing here makes the
      //    decision deterministic on the very first paint.
      const { setUser, setUserData } = useAuthStore.getState()
      setUser(user)
      setUserData(userData)

      reset()
      toast.success("Tizimga muvaffaqiyatli kirdingiz")

      // 5. Honour ?redirect=/admin/... so a user bounced from a deep admin
      //    page lands back where they were trying to go. Read directly
      //    from window so we don't drag in next/navigation's
      //    useSearchParams (which would force /login out of static
      //    rendering and break the production build).
      const search = typeof window !== 'undefined' ? window.location.search : ''
      const redirectParam = new URLSearchParams(search).get('redirect')
      const safeRedirect =
        redirectParam && redirectParam.startsWith('/') && !redirectParam.startsWith('//')
          ? redirectParam
          : null

      const isStaff = userData.role === 'admin' || userData.role === 'manager'
      router.push(safeRedirect || (isStaff ? '/admin' : '/'))
    } catch (error) {
      setLoading(false)
      if (error instanceof FirebaseError) {
        switch (error.code) {
          case 'auth/invalid-credential':
            toast.error("Email noto‘g‘ri yoki parol xato")
            break
          case 'auth/invalid-email':
            toast.error("Email manzili noto‘g‘ri")
            break
          case 'auth/too-many-requests':
            toast.error("Juda ko'p urinish. Iltimos, keyinroq qayta urinib ko'ring")
            break
          case 'auth/network-request-failed':
            toast.error("Internet aloqasi yo'q. Tarmoqni tekshiring")
            break
          default:
            console.error('Login error', error.code, error.message)
            toast.error("Kirish amalga oshmadi. Iltimos, qayta urinib ko'ring")
        }
      } else {
        console.error('Login unknown error', error)
        toast.error("Noma'lum xatolik yuz berdi")
      }
    }
  }

  return (
    <div className='bg-white flex items-center justify-center w-full h-full rounded-2xl p-4 shadow-2xl'>
      <form onSubmit={handleSubmit(userLoginFunction)} className="layout-content-container flex flex-col w-[512px] max-w-[512px] py-5 flex-1">
        <h1 className="text-black text-[22px] text-center font-bold leading-tight tracking-[-0.015em] px-4 pb-3 pt-5">Mega akkauntiga kirish</h1>
        <div className="flex flex-wrap items-end gap-4 md:px-4 py-3">
          <label className="flex flex-col min-w-40 flex-1">
            <p className="text-black text-base font-medium leading-normal pb-2">Email</p>
            <input
              type='email'
              placeholder="Sizning emailingiz"
              className={`form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-xl text-black focus:outline-0 focus:ring-0 border-none bg-[#EEEEEE] focus:border-none h-10 placeholder:text-[#6B6B6B] p-4 text-base font-normal leading-normal ${
                errors.email ? 'border-red-500 border-2' : ''
              }`}
              {...register('email', {
                required: "Email majburiy kiritilishi kerak",
                pattern: {
                  value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                  message: "Email manzili noto'g'ri"
                }
              })}
            />
            {errors.email && (
              <span className="text-red-500 text-sm mt-1">{errors.email.message}</span>
            )}
          </label>
        </div>
        <div className="flex flex-wrap items-end gap-4 md:px-4 py-3">
          <label className="flex flex-col min-w-40 flex-1">
            <p className="text-black text-base font-medium leading-normal pb-2">Parol</p>
            <input
              type='password'
              placeholder="Sizning parolingiz"
              className={`form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-xl text-black focus:outline-0 focus:ring-0 border-none bg-[#EEEEEE] focus:border-none h-10 placeholder:text-[#6B6B6B] p-4 text-base font-normal leading-normal ${
                errors.password ? 'border-red-500 border-2' : ''
              }`}
              {...register('password', {
                required: "Parol majburiy kiritilishi kerak",
                minLength: {
                  value: 6,
                  message: "Parol kamida 6 ta belgidan iborat bo'lishi kerak"
                }
              })}
            />
            {errors.password && (
              <span className="text-red-500 text-sm mt-1">{errors.password.message}</span>
            )}
          </label>
        </div>
        <div className="flex md:px-4 py-3">
          <Button
            type='submit'
            variant={'default'}
            disabled={loading || isSubmitting}
            className="cursor-pointer overflow-hidden rounded-xl w-full h-12 bg-black text-[#FFFFFF] text-sm font-bold leading-normal tracking-[0.015em]"
          >
            <span className="truncate">{loading ? 'Kirilyapti...' : 'Hisobga kirish'}</span>
          </Button>
        </div>
        <div className='flex justify-center gap-2 py-3'>
          <span className="text-[#6B6B6B] text-sm font-normal leading-normal text-center">Yoki</span>
          <Link href={'/sign-up'} className="text-[#6B6B6B] text-sm font-normal leading-normal text-center underline">Ro&apos;yxatdan o&apos;tish</Link>
        </div>
      </form>
    </div>
  )
}

export default LoginForm
