// src/context/AuthContext.jsx
/**
 * Authentication Context for Employee App
 * 
 * This context manages employee authentication and loads employee profile data.
 * Employees can only access their own profile and assigned jobs.
 */

import React, { createContext, useEffect, useRef, useState } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "../api/firebase";
import { verifyEmployeeSession } from "../api/employeeSession";

export const EMPLOYEE_ACCESS_MESSAGE =
  "Your employee account is not available. Contact your business administrator.";
export const EMPLOYEE_VERIFICATION_MESSAGE =
  "ServicesOS could not verify your employee account. Try again.";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [tenantId, setTenantId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState("");
  const verificationRequest = useRef(0);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      const requestId = ++verificationRequest.current;
      setUser(null);
      setEmployee(null);
      setTenantId(null);

      if (!firebaseUser) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setAccessError("");

      try {
        const verifiedEmployee = await verifyEmployeeSession(firebaseUser);
        if (requestId !== verificationRequest.current) return;

        setUser(firebaseUser);
        setEmployee(verifiedEmployee);
        setTenantId(verifiedEmployee.tenantId);
      } catch (error) {
        if (requestId !== verificationRequest.current) return;

        setAccessError(
          error?.code === "employee_access_denied"
            ? EMPLOYEE_ACCESS_MESSAGE
            : EMPLOYEE_VERIFICATION_MESSAGE
        );
        if (auth.currentUser?.uid === firebaseUser.uid) {
          try {
            await signOut(auth);
          } catch {
            // The local app remains locked even if Firebase sign-out cannot complete.
          }
        }
      } finally {
        if (requestId === verificationRequest.current) setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  async function login(email, password) {
    setAccessError("");
    setLoading(true);
    setUser(null);
    setEmployee(null);
    setTenantId(null);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      return { success: true };
    } catch (error) {
      setLoading(false);
      return { success: false, error: friendlyLoginError(error?.code) };
    }
  }

  async function logout() {
    verificationRequest.current += 1;
    setUser(null);
    setEmployee(null);
    setTenantId(null);
    setAccessError("");
    setLoading(false);
    await signOut(auth);
  }

  return (
    <AuthContext.Provider value={{
      user,
      employee,
      tenantId,
      loading,
      accessError,
      login,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

function friendlyLoginError(code) {
  const messages = {
    "auth/invalid-credential": "Invalid email or password.",
    "auth/user-not-found": "Invalid email or password.",
    "auth/wrong-password": "Invalid email or password.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/too-many-requests": "Too many attempts. Try again later.",
    "auth/network-request-failed": "Network error. Check your connection and try again.",
  };
  return messages[code] || "Invalid email or password.";
}
