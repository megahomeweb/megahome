"use client"
import React from 'react'
import { Button } from '../ui/button';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SubmitHandler, useForm } from 'react-hook-form';
import toast from 'react-hot-toast'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  type User as FirebaseUser,
} from 'firebase/auth';
import { auth, fireDB } from '@/firebase/config';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore'
import { FirebaseError } from 'firebase/app';
import { useAuthStore, type UserData } from '@/store/authStore';
import { ADMIN_EMAIL, isAdminEmail } from '@/lib/admin-config';

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

  // === Hardcoded-admin login path ====================================
  // Sidesteps Firebase Admin SDK entirely (which is what was producing
  // "Invalid token"). On the very first login attempt for the admin
  // email, the Firebase Auth user might not exist yet — we auto-create
  // it so the operator never has to "register" first. Then we upsert
  // the Firestore profile with role='admin' (idempotent), and finally
  // mint the admin cookie via the dedicated endpoint.
  const handleAdminLogin = async (
    email: string,
    password: string,
  ): Promise<void> => {
    let firebaseUser: FirebaseUser

    try {
      const cred = await signInWithEmailAndPassword(auth, email, password)
      firebaseUser = cred.user
    } catch (err) {
      // First-ever admin login: account doesn't exist in Firebase Auth
      // yet. Auto-create with the hardcoded password so the admin never
      // has to do a manual signup step. Subsequent logins use the
      // existing account.
      const code = err instanceof FirebaseError ? err.code : ''
      const isMissing =
        code === 'auth/user-not-found' || code === 'auth/invalid-credential'

      if (!isMissing) {
        throw err
      }

      try {
        const created = await createUserWithEmailAndPassword(auth, email, password)
        firebaseUser = created.user
      } catch (createErr) {
        // If account exists with a DIFFERENT password, sign-in failed
        // with invalid-credential and create now fails with email-in-use.
        // Surface a useful message so the operator knows what happened.
        const createCode = createErr instanceof FirebaseError ? createErr.code : ''
        if (createCode === 'auth/email-already-in-use') {
          throw new FirebaseError(
            'auth/invalid-credential',
            'Admin akkaunti mavjud, lekin parol mos kelmaydi',
          )
        }
        throw createErr
      }
    }

    // Upsert the Firestore profile with role='admin'. `merge: true` keeps
    // any existing fields (name, phone, time/date) intact while ensuring
    // role is correct.
    const userRef = doc(fireDB, 'user', firebaseUser.uid)
    const snap = await getDoc(userRef)
    const existing = snap.exists() ? (snap.data() as Partial<UserData>) : {}
    const adminUserData: UserData = {
      name: existing.name || 'Admin',
      email: ADMIN_EMAIL,
      uid: firebaseUser.uid,
      role: 'admin',
      time: existing.time ?? Timestamp.now(),
      date:
        existing.date ||
        new Date().toLocaleString('en-US', {
          month: 'short',
          day: '2-digit',
          year: 'numeric',
        }),
      phone: existing.phone || '',
    }
    await setDoc(userRef, adminUserData, { merge: true })

    // Mint the admin session cookie via the dedicated endpoint. This
    // does NOT call /api/auth/session — that endpoint relies on
    // Firebase Admin verifyIdToken and was failing with "Invalid token".
    const res = await fetch('/api/auth/admin-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        uid: firebaseUser.uid,
      }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({} as Record<string, unknown>))
      const msg = (body as { error?: string })?.error || `Sessiya yaratilmadi (${res.status})`
      throw new Error(msg)
    }

    // Hydrate the store BEFORE navigating so ProtectedRoute has fresh
    // data on the very first paint of /admin (avoids the role-check
    // race we fixed in the previous commit).
    const { setUser, setUserData } = useAuthStore.getState()
    setUser(firebaseUser)
    setUserData(adminUserData)

    reset()
    toast.success('Admin paneliga xush kelibsiz')
    router.push('/admin')
  }

  // === Non-admin (regular user) login path ===========================
  const handleUserLogin = async (
    email: string,
    password: string,
  ): Promise<void> => {
    const cred = await signInWithEmailAndPassword(auth, email, password)
    const firebaseUser = cred.user

    const userSnap = await getDoc(doc(fireDB, 'user', firebaseUser.uid))
    if (!userSnap.exists()) {
      toast.error("Profil topilmadi. Iltimos, ro'yxatdan o'ting.")
      return
    }
    const userData = { ...(userSnap.data() as UserData), uid: firebaseUser.uid }

    // Defensive: if a non-admin email somehow has role='admin' in
    // Firestore (legacy data, manual tampering), strip it. Admin access
    // is governed by the hardcoded email check, not the doc.
    if (!isAdminEmail(firebaseUser.email)) {
      userData.role = userData.role === 'manager' ? 'manager' : 'user'
    }

    // For non-admin users we do NOT need a server cookie — they don't
    // pass through admin middleware. Skipping the /api/auth/session call
    // also means non-admins are unaffected by Firebase Admin SDK
    // misconfiguration.

    const { setUser, setUserData } = useAuthStore.getState()
    setUser(firebaseUser)
    setUserData(userData)

    reset()
    toast.success('Tizimga muvaffaqiyatli kirdingiz')

    const search = typeof window !== 'undefined' ? window.location.search : ''
    const redirectParam = new URLSearchParams(search).get('redirect')
    const safeRedirect =
      redirectParam && redirectParam.startsWith('/') && !redirectParam.startsWith('//')
        ? redirectParam
        : null

    router.push(safeRedirect || '/')
  }

  const userLoginFunction: SubmitHandler<LoginFormInputs> = async (data) => {
    setLoading(true)

    try {
      const email = data.email.trim()
      if (isAdminEmail(email)) {
        await handleAdminLogin(email, data.password)
      } else {
        await handleUserLogin(email, data.password)
      }
    } catch (error) {
      if (error instanceof FirebaseError) {
        switch (error.code) {
          case 'auth/invalid-credential':
            toast.error("Email noto‘g‘ri yoki parol xato")
            break
          case 'auth/user-not-found':
            toast.error("Bunday foydalanuvchi topilmadi")
            break
          case 'auth/wrong-password':
            toast.error("Parol noto‘g‘ri")
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
          case 'auth/email-already-in-use':
            toast.error("Email allaqachon ro'yxatdan o'tgan")
            break
          case 'auth/weak-password':
            toast.error("Parol juda oddiy")
            break
          default:
            console.error('Login error', error.code, error.message)
            toast.error(error.message || "Kirish amalga oshmadi")
        }
      } else if (error instanceof Error) {
        console.error('Login error', error)
        toast.error(error.message)
      } else {
        console.error('Login unknown error', error)
        toast.error("Noma'lum xatolik yuz berdi")
      }
    } finally {
      setLoading(false)
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
