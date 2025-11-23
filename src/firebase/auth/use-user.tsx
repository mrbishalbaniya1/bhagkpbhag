'use client';
import { useRouter } from 'next/navigation';
import { useFirebase } from '@/firebase/provider';
import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';

export interface UserHookResult {
  user: any | null;
  isAdmin: boolean;
  isUserLoading: boolean;
  userError: Error | null;
}

export const useUser = (): UserHookResult => {
  const { user, isUserLoading, userError, firestore } = useFirebase();
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (user && firestore) {
        const adminRoleRef = doc(firestore, 'roles_admin', user.uid);
        try {
          const docSnap = await getDoc(adminRoleRef);
          setIsAdmin(docSnap.exists());
        } catch (error) {
          console.error("Error checking admin status:", error);
          setIsAdmin(false);
        }
      } else {
        setIsAdmin(false);
      }
      setIsLoading(false);
    };
    if (!isUserLoading) {
      checkAdminStatus();
    }
  }, [user, isUserLoading, firestore]);
  
  useEffect(() => {
     if (!isUserLoading && user) {
      // If user is logged in, redirect from login page
      if(window.location.pathname === '/login') {
        router.push('/');
      }
    }
  }, [user, isUserLoading, router]);

  return { user, isAdmin, isUserLoading: isUserLoading || isLoading, userError };
};
