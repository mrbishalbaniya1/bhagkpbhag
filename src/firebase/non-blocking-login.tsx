'use client';
import {
  Auth, // Import Auth type for type hinting
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  // Assume getAuth and app are initialized elsewhere
} from 'firebase/auth';
import { errorEmitter } from './error-emitter';
import { FirestorePermissionError } from './errors';

/** Initiate anonymous sign-in (non-blocking). */
export function initiateAnonymousSignIn(authInstance: Auth): void {
  // CRITICAL: Call signInAnonymously directly. Do NOT use 'await signInAnonymously(...)'.
  signInAnonymously(authInstance);
  // Code continues immediately. Auth state change is handled by onAuthStateChanged listener.
}

/** Initiate email/password sign-up (non-blocking). */
export function initiateEmailSignUp(authInstance: Auth, email: string, password: string): void {
  // CRITICAL: Call createUserWithEmailAndPassword directly. Do NOT use 'await createUserWithEmailAndPassword(...)'.
  createUserWithEmailAndPassword(authInstance, email, password)
    .catch((error) => {
        // This catch block will handle errors during sign-up, like if the email
        // is already in use after a race condition, or password is too weak.
        console.error("Sign-up error:", error);
    });
  // Code continues immediately. Auth state change is handled by onAuthStateChanged listener.
}

/** Initiate email/password sign-in (non-blocking). */
export function initiateEmailSignIn(authInstance: Auth, email: string, password: string): void {
  signInWithEmailAndPassword(authInstance, email, password)
    .catch((error) => {
        // If the user doesn't exist, create a new account.
        if (error.code === 'auth/user-not-found') {
            initiateEmailSignUp(authInstance, email, password);
        } else if (error.code === 'auth/invalid-credential') {
             // User exists, but password was wrong. Do nothing, let the user try again.
             // You could show a toast here if you have a toast system.
             console.error("Invalid credentials.");
        } else {
            // For other errors, you might want to handle them differently
            console.error("Sign-in error:", error);
        }
    });
}
