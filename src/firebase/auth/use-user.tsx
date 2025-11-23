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
     // This effect runs only on the client, after hydration.
     // This prevents a server/client mismatch for the initial render.
     if (typeof window !== 'undefined' && window.location.pathname === '/login') {
      return; // Do not run redirect logic on the login page
     }

     if (!isUserLoading && user) {
      // If user is logged in, redirect from other pages if necessary
    }
  }, [user, isUserLoading, router]);

  return { user, isAdmin, isUserLoading: isUserLoading || isAdminLoading, userError };
};
