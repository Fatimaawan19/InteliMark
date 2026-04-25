import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { auth, db } from "../../firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { Shield } from "lucide-react";

export default function AdminRegister() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const nameInput = form.elements.namedItem("name") as HTMLInputElement;
    const emailInput = form.elements.namedItem("email") as HTMLInputElement;
    const passwordInput = form.elements.namedItem("password") as HTMLInputElement;

    const name = nameInput.value;
    const email = emailInput.value.toLowerCase();
    const password = passwordInput.value;

    try {
      // 🔹 Create user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 🔹 Save user in Firestore
      await setDoc(doc(db, "users", user.uid), {
        name,
        email,
        role: "admin",
        createdAt: new Date(),
      });

      toast({
        title: "Admin Registered",
        description: "You can now login with your credentials.",
      });

      navigate("/admin-dashboard");

    } catch (error: any) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Registration Failed",
        description: error.message || "Something went wrong.",
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-white to-blue-50 p-4">
      <div className="w-full max-w-4xl">
        {/* Registration Card */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="grid md:grid-cols-2 gap-0">
            {/* Left Side - Header */}
            <div className="bg-gradient-to-br from-purple-600 to-purple-800 p-8 md:p-10 flex flex-col justify-center text-white">
              <div className="mb-6">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full mb-4">
                  <Shield className="w-8 h-8 text-white" />
                </div>
                <h1 className="text-3xl md:text-4xl font-bold mb-3">Admin Registration</h1>
                <p className="text-purple-100 text-lg">Create your admin account to manage IntelliMark</p>
              </div>
              
              <div className="space-y-4 mt-8">
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-sm font-semibold">1</span>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">Full Control</h3>
                    <p className="text-sm text-purple-100">Manage students, teachers, and assignments</p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-sm font-semibold">2</span>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">AI-Powered Grading</h3>
                    <p className="text-sm text-purple-100">Automate assessment with advanced AI</p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-sm font-semibold">3</span>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">Analytics Dashboard</h3>
                    <p className="text-sm text-purple-100">Track performance and insights</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Side - Form */}
            <div className="p-6 md:p-8 flex flex-col justify-center">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-800 mb-1">Register as Admin</h2>
                <p className="text-sm text-gray-600">Fill in your details to create an admin account</p>
              </div>

              <form onSubmit={handleRegister} className="space-y-4">
                {/* Full Name Field */}
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-sm font-semibold text-gray-700">
                    Full Name
                  </Label>
                  <Input 
                    id="name" 
                    name="name" 
                    type="text" 
                    placeholder="John Doe" 
                    required 
                    className="h-11 px-3 border-gray-300 focus:border-purple-500 focus:ring-purple-500"
                  />
                </div>

                {/* Email Field */}
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-sm font-semibold text-gray-700">
                    Email
                  </Label>
                  <Input 
                    id="email" 
                    name="email" 
                    type="email" 
                    placeholder="admin@intellimark.com" 
                    required 
                    className="h-11 px-3 border-gray-300 focus:border-purple-500 focus:ring-purple-500"
                  />
                </div>

                {/* Password Field */}
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-sm font-semibold text-gray-700">
                    Password
                  </Label>
                  <Input 
                    id="password" 
                    name="password" 
                    type="password" 
                    placeholder="••••••••" 
                    required 
                    minLength={6}
                    className="h-11 px-3 border-gray-300 focus:border-purple-500 focus:ring-purple-500"
                  />
                  <p className="text-xs text-gray-500 pt-1">Password must be at least 6 characters</p>
                </div>

                {/* Register Button */}
                <Button 
                  type="submit" 
                  className="w-full h-11 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors duration-200 mt-2"
                >
                  Register as Admin
                </Button>

                {/* Login Link */}
                <div className="text-center pt-2">
                  <Button 
                    type="button" 
                    variant="link" 
                    onClick={() => navigate("/")}
                    className="text-sm text-purple-600 hover:text-purple-700 p-0 h-auto font-medium"
                  >
                    Already have an account? Login
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}