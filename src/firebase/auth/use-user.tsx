'use client';
import { useRouter, usePathname } from 'next/navigation';
import { useFirebase } from '@/firebase/provider';
import { useDoc } from '@/firebase';
import { useEffect, useState } from 'react';
import { doc } from 'firebase/firestore';
import { useMemoFirebase } from '@/firebase/provider';

export interface UserHookResult {
  user: any | null;
  isAdmin: boolean;
  isUserLoading: boolean;
  userError: Error | null;
}

export const useUser = (): UserHookResult => {
  const { user, isUserLoading, userError, firestore } = useFirebase();
  const router = useRouter();
  const pathname = usePathname();

  const adminRoleRef = useMemoFirebase(() => {
    if (user && firestore) {
      return doc(firestore, 'roles_admin', user.uid);
    }
    return null;
  }, [user, firestore]);

  const { data: adminRoleDoc, isLoading: isAdminLoading } = useDoc(adminRoleRef);

  const [isAdmin, setIsAdmin] = useState(false);
  
  useEffect(() => {
    setIsAdmin(!!adminRoleDoc);
  }, [adminRoleDoc]);

  useEffect(() => {
    if (typeof window !== 'undefined' && !isUserLoading) {
      if (user && pathname === '/login') {
        router.push('/');
      } else if (!user && pathname.startsWith('/admin')) {
        router.push('/login');
      }
    }
  }, [user, isUserLoading, router, pathname]);

  return { user, isAdmin, isUserLoading: isUserLoading || isAdminLoading, userError };
};
