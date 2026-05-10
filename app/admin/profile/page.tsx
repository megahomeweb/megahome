"use client"
import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../../../store/authStore';
import { Button } from '../../../components/ui/button';
import PanelTitle from '../../../components/admin/PanelTitle';
import toast from 'react-hot-toast';
import { auth } from '../../../firebase/config';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { updateDoc, doc } from 'firebase/firestore';
import { fireDB } from '../../../firebase/config';

const AdminProfilePage = () => {
  const { userData, setUserData } = useAuthStore();
  const [form, setForm] = useState({
    name: '',
    phone: '',
    oldPassword: '',
    newPassword: '',
  });
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loading, setLoading] = useState(false);

  /**
   * Password policy: minimum 8 characters, must contain at least one
   * letter and one digit. Returns a localized error message or null if
   * the password is acceptable.
   *
   * Why client-side: Firebase Auth itself enforces ≥6 chars only, which
   * for an admin account is unacceptably weak. Defense in depth — server
   * still hashes whatever Firebase accepts, but we refuse to send a
   * weak password to Firebase in the first place.
   */
  const validateNewPassword = (pwd: string): string | null => {
    if (pwd.length < 8) return 'Yangi parol kamida 8 ta belgidan iborat bo\'lsin';
    if (!/[A-Za-z]/.test(pwd)) return 'Yangi parolda kamida bitta harf bo\'lsin';
    if (!/\d/.test(pwd)) return 'Yangi parolda kamida bitta raqam bo\'lsin';
    return null;
  };

  useEffect(() => {
    if (userData) {
      setForm({
        name: userData.name || '',
        phone: userData.phone || '',
        oldPassword: '',
        newPassword: '',
      });
      setPhoneNumber(userData.phone || '');
    }
  }, [userData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handlePhoneNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, ""); // Remove non-numeric characters
    if (value.startsWith("998")) {
      value = value.slice(3);
    }
    value = value.slice(0, 9);
    if (!value) {
      setPhoneNumber("");
      setForm({ ...form, phone: "" });
      return;
    }
    // Format the value as +998 (XX) XXX-XX-XX
    const formattedValue = value
      ? `+998 (${value.slice(0, 2)}${value.length > 2 ? ")" : ""}${value.length > 2 ? " " : ""}${value.slice(2, 5)}${value.length > 5 ? "-" : ""}${value.slice(5, 7)}${value.length > 7 ? "-" : ""}${value.slice(7)}`
      : "";
    setPhoneNumber(formattedValue);
    setForm({ ...form, phone: formattedValue });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setPhoneError("");
    setPasswordError("");
    // Phone validation: must be 9 digits after +998
    const digits = phoneNumber.replace(/\D/g, "");
    if (digits.length !== 12) {
      setPhoneError('Telefon raqami to\'liq emas.');
      setLoading(false);
      return;
    }
    // Validate password policy BEFORE we burn a Firebase reauth call.
    // Firebase reauth has rate limits — repeatedly submitting a too-weak
    // password could lock the admin out of the account.
    if (form.oldPassword && form.newPassword) {
      const pwdProblem = validateNewPassword(form.newPassword);
      if (pwdProblem) {
        setPasswordError(pwdProblem);
        setLoading(false);
        return;
      }
      if (form.newPassword === form.oldPassword) {
        setPasswordError('Yangi parol eskisidan farq qilsin');
        setLoading(false);
        return;
      }
    }
    try {
      if (!userData || !userData.email) {
        toast.error('Foydalanuvchi ma\'lumotlari topilmadi.');
        setLoading(false);
        return;
      }
      const user = auth.currentUser;
      if (!user) {
        toast.error('Foydalanuvchi tizimga kirmagan.');
        setLoading(false);
        return;
      }
      // Agar parol maydonlari to'ldirilgan bo'lsa, parolni o'zgartirish
      if (form.oldPassword && form.newPassword) {
        const credential = EmailAuthProvider.credential(userData.email, form.oldPassword);
        await reauthenticateWithCredential(user, credential);
        await updatePassword(user, form.newPassword);
      } else if ((form.oldPassword && !form.newPassword) || (!form.oldPassword && form.newPassword)) {
        toast.error('Parolni o\'zgartirish uchun har ikkala parol maydonini toldiring.');
        setLoading(false);
        return;
      }
      // Ism va telefon raqamini yangilash (Firestore va frontend state)
      const userDocRef = doc(fireDB, 'user', userData.uid);
      await updateDoc(userDocRef, { name: form.name, phone: phoneNumber });
      setUserData({
        ...userData,
        name: form.name,
        phone: phoneNumber,
      });
      if (form.oldPassword && form.newPassword) {
        toast.success('Parol, ism va telefon raqami yangilandi!');
      } else {
        toast.success('Ism va telefon raqami yangilandi!');
      }
    } catch (err) {
      if (err instanceof Error) {
        toast.error(err.message || 'Xatolik yuz berdi.');
        console.log(err);
      } else {
        toast.error('Xatolik yuz berdi.');
        console.log(err);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="px-3 sm:px-6 py-3 sm:py-6 max-w-xl mx-auto">
      <PanelTitle title="Profilim" />
      <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4 mt-3 sm:mt-6 px-1">
        <div>
          <label className="block mb-1 font-medium">Ism</label>
          <input
            name="name"
            value={form.name}
            onChange={handleChange}
            required
            className="flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-xl text-brand-black-text focus:outline-0 focus:ring-0 border-none bg-[#e7edf3] focus:border-none !h-10 placeholder:text-[#4e7397] p-4 text-base font-normal leading-normal"
          />
        </div>
        <div>
          <label className="block mb-1 font-medium">Telefon raqami</label>
          <input
            name="phone"
            type="text"
            placeholder="+998 (__) ___-__-__"
            className={`form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-xl text-brand-black-text focus:outline-0 focus:ring-0 border-none bg-[#e7edf3] focus:border-none !h-10 placeholder:text-[#4e7397] p-4 text-base font-normal leading-normal ${phoneError ? 'border-red-500 border-2' : ''}`}
            value={phoneNumber}
            onChange={handlePhoneNumberChange}
            maxLength={20}
            required
          />
          {phoneError && (
            <span className="text-red-500 text-sm mt-1">{phoneError}</span>
          )}
        </div>
        <div>
          <label className="block mb-1 font-medium">Eski parol</label>
          <input
            name="oldPassword"
            type="password"
            value={form.oldPassword}
            onChange={handleChange}
            placeholder="Eski parolni kiriting"
            className="flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-xl text-brand-black-text focus:outline-0 focus:ring-0 border-none bg-[#e7edf3] focus:border-none !h-10 placeholder:text-[#4e7397] p-4 text-base font-normal leading-normal"
          />
        </div>
        <div>
          <label className="block mb-1 font-medium">Yangi parol</label>
          <input
            name="newPassword"
            type="password"
            value={form.newPassword}
            onChange={handleChange}
            placeholder="Yangi parolni kiriting"
            autoComplete="new-password"
            className={`flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-xl text-brand-black-text focus:outline-0 focus:ring-0 border-none bg-[#e7edf3] focus:border-none !h-10 placeholder:text-[#4e7397] p-4 text-base font-normal leading-normal ${passwordError ? 'border-red-500 border-2' : ''}`}
          />
          <p className="text-[11px] text-gray-500 mt-1">
            Kamida 8 ta belgi · 1 ta harf · 1 ta raqam
          </p>
          {passwordError && (
            <span className="text-red-500 text-sm mt-1 block">{passwordError}</span>
          )}
        </div>
        <Button type="submit" disabled={loading}>
          {loading ? 'Saqlanmoqda...' : 'Saqlash'}
        </Button>
      </form>
    </div>
  );
};

export default AdminProfilePage; 