import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GraduationCap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import loginImage from "./login.png";

// Firebase imports
import { auth, db } from "../../firebase";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { collection, query, where, getDocs, doc, setDoc } from "firebase/firestore";
import { trackUserLogin } from "../../utils/loginTracker";

export default function Login() {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const handleForgotPassword = async () => {
    const emailInput = document.querySelector<HTMLInputElement>("#login-email");
    const email = emailInput?.value.toLowerCase().trim();

    if (!email) {
      toast({
        variant: "destructive",
        title: "Email Required",
        description: "Please enter your email address first.",
      });
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      toast({
        title: "Password Reset Email Sent",
        description: `Check your inbox at ${email} for the password reset link.`,
      });
    } catch (error: any) {
      console.error("Password Reset Error:", error);
      if (error.code === "auth/user-not-found") {
        toast({
          variant: "destructive",
          title: "User Not Found",
          description: "No account exists with this email address.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: error.message || "Failed to send password reset email.",
        });
      }
    }
  };
  
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const emailInput = form.elements.namedItem("login-email") as HTMLInputElement;
    const passwordInput = form.elements.namedItem("login-password") as HTMLInputElement;
    const roleSelect = form.elements.namedItem("role") as HTMLSelectElement;

    const email = emailInput.value.toLowerCase();
    const password = passwordInput.value;
    const role = roleSelect.value;

    try {
      // First, try to authenticate with Firebase Auth
      const authResult = await signInWithEmailAndPassword(auth, email, password);
      
      // After successful auth, check Firestore for user profile
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("email", "==", email));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        // User authenticated but NOT in Firestore - create basic profile
        console.log("⚠️ User authenticated but not in Firestore, creating profile...");
        
        const userDocRef = doc(db, "users", authResult.user.uid);
        await setDoc(userDocRef, {
          uid: authResult.user.uid,
          email: email,
          role: role,
          createdAt: new Date().toISOString(),
          displayName: authResult.user.displayName || email.split('@')[0],
        });
        
        toast({
          title: "Welcome!",
          description: "Your profile has been created successfully.",
        });
      } else {
        // User exists in Firestore - verify role
        const userDoc = querySnapshot.docs[0];
        const userData = userDoc.data();

        if (userData.role !== role) {
          // Sign out since role doesn't match
          await auth.signOut();
          toast({
            variant: "destructive",
            title: "Invalid Role",
            description: `This account is registered as ${userData.role}, not ${role}. Please login with the correct role.`,
          });
          return;
        }
      }

      // Track the login activity
      await trackUserLogin(authResult.user.uid, email);

      // Navigate based on role
      if (role === "student") navigate("/student-dashboard");
      else if (role === "teacher") navigate("/teacher-dashboard");
      else if (role === "admin") navigate("/admin-dashboard");

    } catch (error: any) {
      console.error("Login Error:", error);
      
      // Check if user exists in Firestore for admin password reset
      if (error.code === "auth/invalid-credential" || error.code === "auth/wrong-password") {
        const usersRef = collection(db, "users");
        const q = query(usersRef, where("email", "==", email.toLowerCase()));
        const querySnapshot = await getDocs(q);

        // If admin exists in Firestore but wrong password, redirect to register for password reset
        if (!querySnapshot.empty && querySnapshot.docs[0].data().role === "admin") {
          toast({
            title: "Invalid Password",
            description: "Please register again to reset your password.",
            variant: "destructive",
          });
          navigate("/admin-register");
          return;
        }

        // For student/teacher or other cases, show generic error
        toast({
          variant: "destructive",
          title: "Login Failed",
          description: "Invalid email or password. Please try again.",
        });
      } else if (error.code === "permission-denied") {
        toast({
          variant: "destructive",
          title: "Permission Denied",
          description: "Please contact admin to set up your account.",
        });
      } else if (error.code === "auth/user-not-found") {
        toast({
          variant: "destructive",
          title: "User Not Found",
          description: "No account found with this email.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Login Failed",
          description: error.message || "Something went wrong.",
        });
      }
    }
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #f8f7ff, #ffffff)' }}
    >
      <div className="w-full max-w-4xl">
        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="grid md:grid-cols-2 gap-0">
            {/* Left Side - Image */}
            <div className="hidden md:block bg-gradient-to-br from-purple-50 to-blue-50 p-8">
              <div className="h-full flex items-center justify-center relative">
                <img 
                  src={loginImage} 
                  alt="Login" 
                  className="w-full h-full object-cover rounded-xl shadow-md"
                  style={{ imageRendering: 'crisp-edges' }}
                />
                {/* Overlay Text */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent rounded-xl flex flex-col justify-end p-6">
                  <h3 className="text-2xl font-bold text-white mb-4">Smarter Assessment with AI</h3>
                  <ul className="space-y-2 text-white/90">
                    <li className="flex items-center gap-2">
                      <span className="text-purple-300">•</span>
                      <span className="text-sm">Auto-generated quizzes</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-purple-300">•</span>
                      <span className="text-sm">AI feedback for students</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-purple-300">•</span>
                      <span className="text-sm">Intelligent grading system</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Right Side - Form */}
            <div className="p-6 md:p-8 flex flex-col justify-center bg-gradient-to-br from-purple-50/50 to-blue-50/30">
              {/* Platform Heading */}
              <div className="mb-6 text-center">
                <h1 className="text-3xl font-bold text-purple-600 mb-1">IntelliMark</h1>
                <p className="text-sm text-gray-600">Transform Academic Assessment with AI</p>
              </div>

              {/* Login Section with Icon on Left */}
              <div className="mb-4 text-center">
                <div className="flex items-center justify-center gap-3 mb-3">
                  <div className="flex items-center justify-center w-12 h-12 bg-purple-100 rounded-full flex-shrink-0">
                    <GraduationCap className="w-6 h-6 text-purple-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-800">Login</h2>
                </div>
                <p className="text-sm text-gray-600">Enter your details to sign in</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                {/* Email Field */}
                <div className="space-y-1.5">
                  <Label htmlFor="login-email" className="text-sm font-semibold text-gray-700">
                    Email
                  </Label>
                  <Input 
                    id="login-email" 
                    type="email" 
                    placeholder="example@email.com" 
                    required 
                    className="h-11 px-3 border-gray-300 focus:border-purple-500 focus:ring-purple-500"
                  />
                </div>

                {/* Password Field */}
                <div className="space-y-1.5">
                  <Label htmlFor="login-password" className="text-sm font-semibold text-gray-700">
                    Password
                  </Label>
                  <Input 
                    id="login-password" 
                    type="password" 
                    placeholder="••••••••" 
                    required 
                    className="h-11 px-3 border-gray-300 focus:border-purple-500 focus:ring-purple-500"
                  />
                  <div className="text-right pt-1">
                    <Button 
                      type="button" 
                      variant="link" 
                      onClick={handleForgotPassword}
                      className="text-sm text-purple-600 hover:text-purple-700 p-0 h-auto font-medium"
                    >
                      Forgot Password?
                    </Button>
                  </div>
                </div>

                {/* Role Field */}
                <div className="space-y-1.5">
                  <Label htmlFor="role" className="text-sm font-semibold text-gray-700">
                    Role
                  </Label>
                  <select 
                    id="role" 
                    name="role" 
                    className="w-full h-11 px-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white text-gray-700"
                  >
                    <option value="student">Student</option>
                    <option value="teacher">Teacher</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                {/* Login Button */}
                <Button 
                  type="submit" 
                  className="w-full h-11 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors duration-200 mt-2"
                >
                  Login
                </Button>
              </form>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">© 2026 IntelliMark – AI Powered Assessment System</p>
        </div>
      </div>
    </div>
  );
}