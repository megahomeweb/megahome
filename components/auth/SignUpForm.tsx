"use client"
import React, { useState } from 'react'
import { Button } from '../ui/button';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SubmitHandler, useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, fireDB } from '@/firebase/config';
import { setDoc, doc, Timestamp } from 'firebase/firestore';
import { useAuthStore } from '@/store/authStore';
import { FirebaseError } from 'firebase/app';
import { telegramNotify } from '@/lib/telegram/notify-client';
import { isAdminEmail } from '@/lib/admin-config';

// Form inputs type
interface SignUpFormInputs {
  name: string
  email: string
  password: string
  phone: string
}

type Role = "admin" | "manager" | "user"

// User type for Firestore
interface User {
  name: string
  email: string | null
  uid: string
  role: Role
  time: Timestamp
  date: string
  phone: string
}


const SignUpForm = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const { setUser, setUserData } = useAuthStore();
  const [phoneNumber, setPhoneNumber] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset
  } = useForm<SignUpFormInputs>({
    defaultValues: {
      name: "",
      email: "",
      password: "",
      phone: ""
    }
  })

  const handlePhoneNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, ""); // Remove non-numeric characters
    if (value.startsWith("998")) {
      value = value.slice(3);
    }
    value = value.slice(0, 9);

    // Agar input bo'sh bo'lsa, tozalash
    if (!value) {
      setPhoneNumber("");
      return;
    }

    // Format the value as +998 (XX) XXX-XX-XX
    const formattedValue = value
      ? `+998 (${value.slice(0, 2)}${value.length > 2 ? ")" : ""}${value.length > 2 ? " " : ""}${value.slice(2, 5)}${value.length > 5 ? "-" : ""}${value.slice(5, 7)}${value.length > 7 ? "-" : ""}${value.slice(7)}`
      : "";

    setPhoneNumber(formattedValue);
  };

  const userSignupFunction: SubmitHandler<SignUpFormInputs> = async (data) => {
    setLoading(true)

    // The admin email is reserved — blocked from public signup so an
    // attacker can't claim it before the real admin's first login. The
    // admin account is auto-created by LoginForm's admin path on first
    // sign-in attempt with the correct password.
    if (isAdminEmail(data.email)) {
      toast.error("Bu email manzili band. Iltimos, boshqa email kiriting.")
      setLoading(false)
      return
    }

    try {
      // Firebase authentication - user yaratish
      const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password)
      const firebaseUser = userCredential.user
      
      // Firestore uchun user obyektini yaratish
      const user: User = {
        name: data.name,
        email: firebaseUser.email,
        uid: firebaseUser.uid,
        role: "user",
        time: Timestamp.now(),
        date: new Date().toLocaleString(
          "en-US",
          {
            month: "short",
            day: "2-digit",
            year: "numeric",
          }
        ),
        phone: phoneNumber
      }

      // Firestore ga user ma'lumotlarini saqlash
      await setDoc(doc(fireDB, "user", firebaseUser.uid), user);
      
      // Zustand store'ni yangilash
      setUser(firebaseUser)
      setUserData(user)

      // Notify admin via Telegram (fire-and-forget)
      telegramNotify('new_user', {
        name: data.name,
        email: data.email,
        phone: phoneNumber,
      });

      // Form ni tozalash
      reset()

      // Success message
      toast.success("Ro'yxatdan muvaffaqiyatli o'tdingiz")
      
      setLoading(false)
      
      // Auto-login: user is already authenticated, redirect to home
      router.push('/')

    } catch (error) {
      setLoading(false)
      if (error instanceof FirebaseError) {
        // Handle specific Firebase auth errors
        switch (error.code) {
          case 'auth/email-already-in-use':
            toast.error("Bu email allaqachon ro'yxatdan o'tgan. Iltimos, boshqa email kiriting yoki tizimga kiring.")
            break
          case 'auth/weak-password':
            toast.error("Parol juda oddiy. Iltimos, kamida 6 ta belgidan foydalaning.")
            break
          case 'auth/invalid-email':
            toast.error("Email manzili formati noto'g'ri")
            break
          case 'auth/operation-not-allowed':
            toast.error("Email/parol orqali ro'yxatdan o'tish yoqilmagan")
            break
          case 'auth/network-request-failed':
            toast.error("Tarmoqda xatolik. Iltimos, internet aloqangizni tekshiring")
            break
          default:
            toast.error("Ro'yxatdan o'tish amalga oshmadi. Iltimos, qayta urinib ko'ring")
        }
      } else {
        toast.error("Noma'lum xatolik yuz berdi")
      }
    }
  }
  
  return (
    <div className='bg-white flex items-center justify-center w-full h-full rounded-2xl p-4 shadow-2xl'>
      <form onSubmit={handleSubmit(userSignupFunction)} className="layout-content-container flex flex-col w-[512px] max-w-[512px] py-5 flex-1">
        <h1 className="text-black text-[22px] text-center font-bold leading-tight tracking-[-0.015em] px-4 pb-3 pt-5">Megadan ro&apos;yxatdan o&apos;tish</h1>
        {/* full name */}
        <div className="flex flex-wrap items-end gap-4 md:px-4 py-3">
          <label className="flex flex-col min-w-40 flex-1">
            <p className="text-black text-base font-medium leading-normal pb-2">To&apos;liq ism</p>
            <input
              type='text'
              placeholder="Sizning to'liq ismingiz"
              className={`form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-xl text-black focus:outline-0 focus:ring-0 border-none bg-[#EEEEEE] focus:border-none h-10 placeholder:text-[#6B6B6B] p-4 text-base font-normal leading-normal ${
                errors.name ? 'border-red-500 border-2' : ''
              }`}
              {...register('name', {
                required: "Ism majburiy kiritilishi kerak",
                minLength: {
                  value: 2,
                  message: "Ism kamida 2 ta belgidan iborat bo'lishi kerak"
                },
                pattern: {
                  value: /^[\p{L}\p{M}\s'ʻʼ\-]+$/u,
                  message: "Ism faqat harflar va bo'sh joylardan iborat bo'lishi mumkin"
                }
              })}
            />
            {errors.name && (
              <span className="text-red-500 text-sm mt-1">{errors.name.message}</span>
            )}
          </label>
        </div>
        {/* phone number */}
        <div className="flex flex-wrap items-end gap-4 md:px-4 py-3">
          <label className="flex flex-col min-w-40 flex-1">
            <p className="text-black text-base font-medium leading-normal pb-2">Telifon raqam</p>
            <input
              type='text'
              placeholder="+998 (__) ___-__-__"
              className={`form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-xl text-black focus:outline-0 focus:ring-0 border-none bg-[#EEEEEE] focus:border-none h-10 placeholder:text-[#6B6B6B] p-4 text-base font-normal leading-normal ${
                errors.phone ? 'border-red-500 border-2' : ''
              }`}
              value={phoneNumber}
              {...register('phone', {
                required: "Telefon raqami majburiy kiritilishi kerak",
                validate: (value) => {
                  const digits = value.replace(/\D/g, "");
                  return digits.length === 12 || "Telefon raqami kod bilan birga 12 ta raqamdan iborat bo'lishi kerak";
                }
              })}
              onChange={(e) => {
                handlePhoneNumberChange(e);
              }}
              maxLength={20}
            />
            {errors.phone && (
              <span className="text-red-500 text-sm mt-1">{errors.phone.message}</span>
            )}
          </label>
        </div>
        {/* email name */}
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
                  message: "Email manzili noto'g'ri kiritilgan"
                }
              })}
            />
            {errors.email && (
              <span className="text-red-500 text-sm mt-1">{errors.email.message}</span>
            )}
          </label>
        </div>
         {/* Password Field */}
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
         {/* Submit Button */}
        <div className="flex md:px-4 py-3">
          <Button
            type='submit'
            variant={'default'}
            disabled={loading || isSubmitting}
            className="cursor-pointer overflow-hidden rounded-xl w-full h-12 bg-black text-[#FFFFFF] text-sm font-bold leading-normal tracking-[0.015em] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="truncate">
              {loading ? "Hisob yaratilmoqda..." : "Ro'yxatdan o'tish"}
            </span>
          </Button>
        </div>
        <div className='flex justify-center gap-2 py-3'>
          <span className="text-[#6B6B6B] text-sm font-normal leading-normal text-center">Allaqachon ro&apos;yxatdan o&apos;tganmisz?</span>
          <Link href={'/login'} className="text-[#6B6B6B] text-sm font-normal leading-normal text-center underline">Hisobga kirish</Link>
        </div>
      </form>
    </div>
  )
}

export default SignUpForm