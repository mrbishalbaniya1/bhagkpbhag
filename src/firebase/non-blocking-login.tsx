'use client';
import {
  Auth,
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { Firestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import type { useToast } from '@/hooks/use-toast';

interface SignUpOptions {
    firestore: Firestore;
    displayName: string;
}

/** Initiate anonymous sign-in (non-blocking). */
export function initiateAnonymousSignIn(authInstance: Auth): void {
  signInAnonymously(authInstance);
}

/** Initiate email/password sign-up and create user profile (non-blocking). */
export function initiateEmailSignUp(authInstance: Auth, email: string, password: string, options: SignUpOptions): void {
  createUserWithEmailAndPassword(authInstance, email, password)
    .then(userCredential => {
        // After user is created in Auth, create their profile document in Firestore.
        const user = userCredential.user;
        const userProfileRef = doc(options.firestore, 'users', user.uid);
        
        const userProfileData = {
            displayName: options.displayName,
            email: user.email,
            createdAt: serverTimestamp(),
        };
        
        // This is a non-blocking write.
        return setDoc(userProfileRef, userProfileData);
    })
    .catch((error) => {
        console.error("Sign-up error:", error);
        // You might want to use a toast here to show the error to the user
    });
}

/** Initiate email/password sign-in, with sign-up fallback (non-blocking). */
export function initiateEmailSignIn(
    authInstance: Auth, 
    email: string, 
    password: string, 
    toast: ReturnType<typeof useToast>['toast'],
    signUpOptions?: SignUpOptions
): void {
  signInWithEmailAndPassword(authInstance, email, password)
    .catch((error) => {
        // If the user doesn't exist and we have sign-up info, create a new account.
        if (error.code === 'auth/user-not-found' && signUpOptions) {
            initiateEmailSignUp(authInstance, email, password, signUpOptions);
        } else if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found') {
             // User exists, but password was wrong, or user not found and not in sign-up flow.
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
            // For other errors, log them and show a generic message.
            console.error("Sign-in/up error:", error);
             toast({
                variant: 'destructive',
                title: 'An Error Occurred',
                description: error.message || 'An unexpected error occurred.',
             });
        }
    });
}
