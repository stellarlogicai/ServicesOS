// src/context/AuthContext.jsx
/**
 * Authentication Context for Employee App
 * 
 * This context manages employee authentication and loads employee profile data.
 * Employees can only access their own profile and assigned jobs.
 */

import React, { createContext, useEffect, useState } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../api/firebase";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);

  async function loadEmployee(firebaseUser) {
    const employeeRef = doc(db, "tenants", "DEFAULT", "employees", firebaseUser.uid);
    const employeeSnap = await getDoc(employeeRef);

    if (!employeeSnap.exists()) {
      throw new Error("Employee profile not found.");
    }

    const data = employeeSnap.data();

    if (data.status !== "active") {
      throw new Error("Employee account is inactive.");
    }

    setEmployee({
      id: employeeSnap.id,
      ...data,
    });
  }

  useEffect(() => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        setUser(firebaseUser);

        if (firebaseUser) {
          await loadEmployee(firebaseUser);
        } else {
          setEmployee(null);
        }
      } catch (error) {
        console.error("Auth error:", error);
        setEmployee(null);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  async function login(email, password) {
    await signInWithEmailAndPassword(auth, email, password);
  }

  async function logout() {
    await signOut(auth);
  }

  return (
    <AuthContext.Provider value={{ user, employee, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
