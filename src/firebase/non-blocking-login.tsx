
'use client';
import {
  Auth,
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  UserCredential,
} from 'firebase/auth';
import { Firestore, doc, setDoc, serverTimestamp, getDoc, collection, getDocs } from 'firebase/firestore';
import type { useToast } from '@/hooks/use-toast';
import { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

interface SignUpOptions {
    firestore: Firestore;
}

/** Initiate anonymous sign-in (non-blocking). */
export function initiateAnonymousSignIn(authInstance: Auth): void {
  signInAnonymously(authInstance);
}

/** Initiate email/password sign-up and create user profile (non-blocking). */
export async function initiateEmailSignUp(authInstance: Auth, email: string, password: string, options: SignUpOptions): Promise<UserCredential> {
  const userCredential = await createUserWithEmailAndPassword(authInstance, email, password);
  const user = userCredential.user;
  const userProfileRef = doc(options.firestore, 'users', user.uid);
  
  // Use email as the initial display name. User can change it later.
  const userProfileData = {
      displayName: user.email,
      email: user.email,
      createdAt: serverTimestamp(),
      highScore: 0,
      xp: 0,
      level: 1,
      achievements: [],
      gamesPlayed: 0,
  };
  
  setDoc(userProfileRef, userProfileData).catch(error => {
    const permissionError = new FirestorePermissionError({
      path: userProfileRef.path,
      operation: 'create',
      requestResourceData: userProfileData,
    });
    errorEmitter.emit('permission-error', permissionError);
  });
  
  return userCredential;
}

/** Initiate email/password sign-in, with sign-up fallback (non-blocking). */
export async function initiateEmailSignIn(
    authInstance: Auth, 
    email: string, 
    password: string, 
    toast: ReturnType<typeof useToast>['toast'],
    router: AppRouterInstance,
): Promise<void> {
  toast({ title: 'Verifying...', description: 'Please wait.' });
  try {
    await signInWithEmailAndPassword(authInstance, email, password);
    toast({ title: 'Success!', description: 'You are now signed in.' });
    router.push('/');
  } catch (error: any) {
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found') {
           toast({
              variant: 'destructive',
              title: 'Sign In Failed',
              description: 'The email or password you entered is incorrect.',
           });
      } else if (error.code === 'auth/operation-not-allowed') {
          toast({
              variant: 'destructive',
              title: 'Sign In Failed',
              description: 'Email/Password sign-in is not enabled for this app.',
          });
      } else {
           toast({
              variant: 'destructive',
              title: 'An Error Occurred',
              description: error.message || 'An unexpected error occurred during sign-in.',
           });
      }
  }
}

/** Initiate Google Sign-In and create user profile if new (non-blocking). */
export async function initiateGoogleSignIn(
  authInstance: Auth,
  firestore: Firestore,
  toast: ReturnType<typeof useToast>['toast'],
  router: AppRouterInstance
): Promise<void> {
  const provider = new GoogleAuthProvider();
  toast({ title: 'Signing In with Google...', description: 'Please follow the prompts.' });
  try {
    const result = await signInWithPopup(authInstance, provider);
    const user = result.user;
    const userProfileRef = doc(firestore, 'users', user.uid);
    const docSnap = await getDoc(userProfileRef);

    if (!docSnap.exists()) {
      // Use email as initial display name
      const userProfileData = {
        displayName: user.email,
        email: user.email,
        createdAt: serverTimestamp(),
        highScore: 0,
        xp: 0,
        level: 1,
        achievements: [],
        gamesPlayed: 0,
      };
      setDoc(userProfileRef, userProfileData).catch(error => {
        const permissionError = new FirestorePermissionError({
            path: userProfileRef.path,
            operation: 'create',
            requestResourceData: userProfileData,
        });
        errorEmitter.emit('permission-error', permissionError);
      });
    }
    toast({ title: 'Success!', description: 'You are now signed in with Google.' });
    router.push('/');
  } catch (error: any) {
    if (error.code === 'auth/popup-closed-by-user') {
      toast({
        variant: 'default',
        title: 'Sign-in cancelled',
        description: 'You closed the Google Sign-In window.',
      });
    } else if (error.code === 'auth/operation-not-allowed') {
        toast({
            variant: 'destructive',
            title: 'Sign In Failed',
            description: 'Google Sign-In is not enabled for this app.',
        });
    } else {
      toast({
        variant: 'destructive',
        title: 'Google Sign-In Failed',
        description: error.message || 'Could not sign in with Google.',
      });
    }
  }
}

    