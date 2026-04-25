import React, { createContext, useContext } from "react";

interface AuthContextType {
  user: any; // Replace 'any' with your user type
}

const AuthContext = createContext<AuthContextType>({ user: null });

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Replace with your actual auth logic
  const user = null;

  return (
    <AuthContext.Provider value={{ user }}>
      {children}
    </AuthContext.Provider>
  );
};