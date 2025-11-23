'use client';
import { useRouter } from 'next/navigation';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useDoc } from '@/firebase';
import { useEffect, useState } from 'react';
import { doc } from 'firebase/firestore';

export interface UserHookResult {
  user: any | null;
  isAdmin: boolean;
  isUserLoading: boolean;
  userError: Error | null;
}

export const useUser = (): UserHookResult => {
  const { user, isUserLoading, userError, firestore } = useFirebase();
  const router = useRouter();

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
     if (!isUserLoading && user) {
      // If user is logged in, redirect from login page
      if(window.location.pathname === '/login') {
        router.push('/');
      }
    }
  }, [user, isUserLoading, router]);

  return { user, isAdmin, isUserLoading: isUserLoading || isAdminLoading, userError };
};
