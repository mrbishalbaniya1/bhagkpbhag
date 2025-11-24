
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
import { generateUsername } from '@/ai/flows/generate-username-flow';

interface SignUpOptions {
    firestore: Firestore;
}

/** Initiate anonymous sign-in (non-blocking). */
export function initiateAnonymousSignIn(authInstance: Auth): void {
  signInAnonymously(authInstance);
}

/** Fetches existing usernames and generates a new unique one. */
async function getUniqueUsername(firestore: Firestore): Promise<string> {
    const usersCollection = collection(firestore, 'users');
    const usersSnapshot = await getDocs(usersCollection);
    const existingUsernames = usersSnapshot.docs.map(doc => doc.data().displayName);
    const newUsername = await generateUsername({ usedUsernames: existingUsernames });
    return newUsername.username;
}


/** Initiate email/password sign-up and create user profile (non-blocking). */
export async function initiateEmailSignUp(authInstance: Auth, email: string, password: string, options: SignUpOptions): Promise<UserCredential> {
  const userCredential = await createUserWithEmailAndPassword(authInstance, email, password);
  const user = userCredential.user;
  const userProfileRef = doc(options.firestore, 'users', user.uid);
  
  const uniqueUsername = await getUniqueUsername(options.firestore);

  const userProfileData = {
      displayName: uniqueUsername,
      email: user.email,
      createdAt: serverTimestamp(),
      highScore: 0,
  };
  
  await setDoc(userProfileRef, userProfileData);
  return userCredential;
}

/** Initiate email/password sign-in, with sign-up fallback (non-blocking). */
export async function initiateEmailSignIn(
    authInstance: Auth, 
    email: string, 
    password: string, 
    toast: ReturnType<typeof useToast>['toast'],
    router: AppRouterInstance,
    signUpOptions?: SignUpOptions
): Promise<void> {
  toast({ title: signUpOptions ? 'Creating account...' : 'Verifying...', description: 'Please wait.' });
  try {
    await signInWithEmailAndPassword(authInstance, email, password);
    toast({ title: 'Success!', description: 'You are now signed in.' });
    router.push('/');
  } catch (error: any) {
      if (error.code === 'auth/user-not-found' && signUpOptions) {
          try {
              await initiateEmailSignUp(authInstance, email, password, signUpOptions);
              toast({ title: 'Account Created!', description: 'You are now signed in.' });
              router.push('/');
          } catch (signUpError: any) {
              console.error("Sign-up error:", signUpError);
              toast({
                  variant: 'destructive',
                  title: 'Sign Up Failed',
                  description: signUpError.message || 'Could not create your account.',
              });
          }
      } else if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found') {
           toast({
              variant: 'destructive',
              title: 'Sign In Failed',
              description: 'The email or password you entered is incorrect.',
           });
      } else if (error.code === 'auth/email-already-in-use') {
          toast({
              variant: 'destructive',
              title: 'Sign Up Failed',
              description: 'An account with this email already exists.',
          });
      } else {
          console.error("Sign-in/up error:", error);
           toast({
              variant: 'destructive',
              title: 'An Error Occurred',
              description: error.message || 'An unexpected error occurred.',
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
      const uniqueUsername = await getUniqueUsername(firestore);
      const userProfileData = {
        displayName: uniqueUsername,
        email: user.email,
        createdAt: serverTimestamp(),
        highScore: 0,
      };
      await setDoc(userProfileRef, userProfileData);
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
    } else {
      console.error("Google sign-in error:", error);
      toast({
        variant: 'destructive',
        title: 'Google Sign-In Failed',
        description: error.message || 'Could not sign in with Google.',
      });
    }
  }
}
