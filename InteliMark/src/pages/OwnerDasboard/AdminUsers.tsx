import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, UserPlus, Trash2, Users, GraduationCap, BookOpen } from 'lucide-react';

import { auth, db } from '../../firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, collection, onSnapshot, deleteDoc, addDoc, Timestamp } from "firebase/firestore";
import { trackUserSignup } from '../../utils/loginTracker';

const AdminUsers: React.FC = () => {
  const navigate = useNavigate();  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('student');
  const [loading, setLoading] = useState(false);
  // Student fields
  const [batch, setBatch] = useState('');
  const [regNo, setRegNo] = useState('');
  const [studentPhone, setStudentPhone] = useState('');
  const [semester, setSemester] = useState('');  const [degree, setDegree] = useState('');
  const [studentDept, setStudentDept] = useState('');

  // Teacher fields
  const [specialization, setSpecialization] = useState('');
  const [teacherDept, setTeacherDept] = useState('');
  const [teacherPhone, setTeacherPhone] = useState('');

  // Users state
  const [users, setUsers] = useState<any[]>([]);

  // REAL-TIME FETCH
  React.useEffect(() => {
    const usersCol = collection(db, "users");

    const unsubscribe = onSnapshot(usersCol, (snapshot) => {
      const usersList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setUsers(usersList);
    });

    return () => unsubscribe();
  }, []);  // Auto-generate registration number when batch, degree, and semester are filled
  useEffect(() => {
    if (role === 'student' && batch && degree && semester) {
      generateRegNumber();
    } else if (role === 'student') {
      setRegNo('');
      setStudentDept('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batch, degree, semester, role]);

  // Separate effect to regenerate when users list changes
  useEffect(() => {
    if (role === 'student' && batch && degree && semester) {
      generateRegNumber();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users]);

  const generateRegNumber = () => {
    // Only generate if all required fields are filled
    if (!batch || !degree || !semester) {
      setRegNo('');
      setStudentDept('');
      return;
    }

    // Determine degree code based on selected degree
    let degreeCode = '';
    if (degree === 'Bachelor of Computer Science') {
      degreeCode = 'BCS';
      setStudentDept('Computer Science'); // Auto-set department
    } else if (degree === 'Bachelor of Data Science') {
      degreeCode = 'BDS';
      setStudentDept('Data Science'); // Auto-set department
    } else {
      setRegNo('');
      setStudentDept('');
      return; // Don't generate if degree not recognized
    }

    // Extract year from batch (e.g., "2024" -> "24")
    const yearCode = batch.slice(-2);

    // Prefix for registration number
    const prefix = `FA${yearCode}-${degreeCode}-`;

    // Find all students with the same prefix
    const existingStudents = users.filter(u => 
      u.role === 'student' && 
      u.regNo && 
      u.regNo.startsWith(prefix)
    );

    // Extract numbers and find the highest
    const numbers = existingStudents.map(s => {
      const match = s.regNo.match(/\d+$/);
      return match ? parseInt(match[0]) : 0;
    });

    // Get next number
    const nextNumber = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;

    // Format with leading zeros (001, 002, etc.)
    const formattedNumber = String(nextNumber).padStart(3, '0');

    // Set the registration number
    setRegNo(`${prefix}${formattedNumber}`);
  };// Add user handler
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Create user with password
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const userData: any = {
        name,
        email,
        role,
        createdAt: new Date()
      };

      if (role === 'student') {
        userData.batch = batch;
        userData.regNo = regNo;
        userData.phone = studentPhone;
        userData.semester = semester;
        userData.degree = degree;
        userData.department = studentDept;
      }

      if (role === 'teacher') {
        userData.specialization = specialization;
        userData.department = teacherDept;
        userData.phone = teacherPhone;
      }      // Save to Firestore
      await setDoc(doc(db, "users", user.uid), userData);

      // Track user signup
      await trackUserSignup(user.uid, email);

      // Create success notification for admin
      await addDoc(collection(db, 'notifications'), {
        title: `New ${role} account created`,
        message: `${name} registered as ${role}`,
        type: 'success',
        timestamp: Timestamp.now(),
        read: false,
        recipientRole: 'admin'
      });

      alert(`User ${name} added successfully as ${role}!`);

      // Reset form
      setName('');
      setEmail('');
      setPassword('');
      setRole('student');
      setBatch('');
      setRegNo('');
      setStudentPhone('');
      setSemester('');
      setDegree('');
      setStudentDept('');
      setSpecialization('');
      setTeacherDept('');
      setTeacherPhone('');

    } catch (error: any) {
      console.error(error);
      alert(error.message || 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  // Delete user
  const handleDeleteUser = async (userId: string) => {
    try {
      await deleteDoc(doc(db, "users", userId));
      alert("User deleted successfully!");
    } catch (error) {
      console.error("Error deleting user:", error);
      alert("Failed to delete user");
    }
  };  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
      {/* Title Bar */}
      <div className="px-4 md:px-6 pt-8 pb-4 flex items-center gap-4 border-b bg-white/80 backdrop-blur-md shadow-sm">
        <Button 
          variant="ghost" 
          onClick={() => navigate('/admin-dashboard')}
          className="hover:bg-primary/10 transition-all p-2 rounded-lg"
        >
          <svg className="h-5 w-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent flex items-center gap-2">
            InteliMark
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-primary" viewBox="0 0 24 24" fill="none"><path d="M17.5 7.5a3.5 3.5 0 0 0-3.5-3.5c-.5 0-.98.09-1.42.26A3.5 3.5 0 0 0 6.5 7.5c0 .5.09.98.26 1.42A3.5 3.5 0 0 0 7.5 17.5c.5 0 .98-.09 1.42-.26A3.5 3.5 0 0 0 17.5 16.5c0-.5-.09-.98-.26-1.42A3.5 3.5 0 0 0 16.5 6.5c-.5 0-.98.09-1.42.26A3.5 3.5 0 0 0 7.5 7.5" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </span>
        </div>
        <div className="pl-6 border-l border-gray-200 flex flex-col">
          <span className="text-2xl font-bold text-gray-900">User Management</span>
          <span className="text-sm text-gray-600">Manage students and teachers in the system</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Enhanced Form Section */}
          <div className="lg:col-span-1 animate-in fade-in slide-in-from-left-4 duration-700">
            <Card className="border-0 shadow-xl bg-white sticky top-8 overflow-hidden h-[calc(100vh-80px)]">
              <CardHeader className="border-b bg-gradient-to-br from-primary/10 via-primary/5 to-transparent relative overflow-hidden">
                <div className="absolute inset-0 bg-grid-white/10 [mask-image:linear-gradient(0deg,white,transparent)]"></div>
                <div className="relative flex items-center gap-3">
                  <div className="p-3 bg-gradient-to-br from-primary to-primary/80 rounded-xl shadow-lg">
                    <UserPlus className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-bold text-gray-900">Add New User</CardTitle>
                    <CardDescription className="text-xs text-gray-600">Create student or teacher account</CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-6 h-[calc(100%-100px)] overflow-y-auto scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-gray-100 hover:scrollbar-thumb-primary/40">
                <form className="space-y-5" onSubmit={handleAddUser}>
                  {/* Name Field */}
                  <div className="space-y-2 group">
                    <Label htmlFor="name" className="text-sm font-semibold text-gray-700 group-hover:text-primary transition-colors">
                      Full Name
                    </Label>
                    <Input
                      id="name"
                      type="text"
                      placeholder="Enter full name"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      required
                      className="border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                  </div>                  {/* Email Field */}
                  <div className="space-y-2 group">
                    <Label htmlFor="email" className="text-sm font-semibold text-gray-700 group-hover:text-primary transition-colors">
                      Email Address
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="user@example.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                      className="border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                  </div>

                  {/* Password Field */}
                  <div className="space-y-2 group">
                    <Label htmlFor="password" className="text-sm font-semibold text-gray-700 group-hover:text-primary transition-colors">
                      Password
                    </Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      className="border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                  </div>

                  {/* Role Field */}
                  <div className="space-y-2 group">
                    <Label htmlFor="role" className="text-sm font-semibold text-gray-700 group-hover:text-primary transition-colors">
                      Role
                    </Label>
                    <Select value={role} onValueChange={setRole}>
                      <SelectTrigger className="border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all">
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="student">
                          <div className="flex items-center gap-2">
                            <GraduationCap className="h-4 w-4 text-blue-600" />
                            <span>Student</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="teacher">
                          <div className="flex items-center gap-2">
                            <BookOpen className="h-4 w-4 text-purple-600" />
                            <span>Teacher</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Student-specific Fields with Animation */}
                  {role === 'student' && (
                    <div className="space-y-4 pt-4 border-t border-gray-200 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-1 rounded-full bg-primary"></div>
                        <p className="text-xs font-bold text-primary uppercase tracking-wider">Student Information</p>
                      </div>                        <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label className="text-xs font-medium text-gray-600">Batch Year</Label>
                          <Input
                            placeholder="2024"
                            value={batch}
                            onChange={e => setBatch(e.target.value)}
                            required
                            className="border-gray-200 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-medium text-gray-600">Semester</Label>
                          <Input
                            placeholder="1"
                            value={semester}
                            onChange={e => setSemester(e.target.value)}
                            required
                            className="border-gray-200 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                          />
                        </div>
                      </div>                      <div className="space-y-2">
                        <Label className="text-xs font-medium text-gray-600">Phone Number</Label>
                        <Input
                          type="tel"
                          placeholder="03001234567"
                          value={studentPhone}
                          onChange={e => setStudentPhone(e.target.value)}
                          required
                          className="border-gray-200 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                        />
                      </div>                      <div className="space-y-2">
                        <Label className="text-xs font-medium text-gray-600">Degree Program</Label>
                        <Select value={degree} onValueChange={setDegree} required>
                          <SelectTrigger className="border-gray-200 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20">
                            <SelectValue placeholder="Select degree" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Bachelor of Data Science">Bachelor of Data Science</SelectItem>
                            <SelectItem value="Bachelor of Computer Science">Bachelor of Computer Science</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>                      <div className="space-y-2">
                        <Label className="text-xs font-medium text-gray-600">Department</Label>
                        <Input
                          placeholder=""
                          value={studentDept}
                          readOnly
                          className="border-gray-200 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all bg-gray-50"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs font-medium text-gray-600">Registration Number</Label>
                        <Input
                          placeholder=""
                          value={regNo}
                          readOnly
                          className="border-gray-200 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all bg-gray-50"
                        />
                      </div>
                    </div>
                  )}

                  {/* Teacher-specific Fields with Animation */}
                  {role === 'teacher' && (
                    <div className="space-y-4 pt-4 border-t border-gray-200 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-1 rounded-full bg-purple-600"></div>
                        <p className="text-xs font-bold text-purple-600 uppercase tracking-wider">Teacher Information</p>
                      </div>
                      
                      <div className="space-y-2">
                        <Label className="text-xs font-medium text-gray-600">Specialization</Label>
                        <Input
                          placeholder="Machine Learning, AI"
                          value={specialization}
                          onChange={e => setSpecialization(e.target.value)}
                          required
                          className="border-gray-200 text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs font-medium text-gray-600">Department</Label>
                        <Input
                          placeholder="Computer Science"
                          value={teacherDept}
                          onChange={e => setTeacherDept(e.target.value)}
                          required
                          className="border-gray-200 text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs font-medium text-gray-600">Phone Number</Label>
                        <Input
                          type="tel"
                          placeholder="03001234567"
                          value={teacherPhone}
                          onChange={e => setTeacherPhone(e.target.value)}
                          required
                          className="border-gray-200 text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                        />
                      </div>
                    </div>
                  )}

                  <Button 
                    type="submit" 
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-primary via-primary/90 to-primary hover:from-primary/90 hover:via-primary hover:to-primary/90 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02]"
                  >
                    {loading ? (
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        <span>Adding User...</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <UserPlus className="h-4 w-4" />
                        <span>Add User</span>
                      </div>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>          {/* Enhanced Users List Section */}
          <div className="lg:col-span-2 animate-in fade-in slide-in-from-right-4 duration-700">
            <Card className="border-0 shadow-xl bg-white overflow-hidden">
              <CardHeader className="border-b bg-gradient-to-br from-primary/10 via-primary/5 to-transparent relative overflow-hidden">
                <div className="absolute inset-0 bg-grid-white/10 [mask-image:linear-gradient(0deg,white,transparent)]"></div>
                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-gradient-to-br from-primary to-primary/80 rounded-xl shadow-lg">
                      <Users className="h-5 w-5 text-white" />
                    </div>
                    <div>                      <CardTitle className="text-xl font-bold text-gray-900">All Users</CardTitle>
                      <CardDescription className="text-xs text-gray-600">
                        <span className="inline-flex items-center gap-1">
                          <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                          {users.filter(u => u.role === 'student').length} Students
                        </span>
                        <span className="text-gray-400 mx-1">•</span>
                        <span className="inline-flex items-center gap-1">
                          <div className="h-2 w-2 rounded-full bg-purple-500"></div>
                          {users.filter(u => u.role === 'teacher').length} Teachers
                        </span>
                      </CardDescription>
                    </div>
                  </div>
                  
                  {/* Total Users Count - Inside Section */}
                  <div className="flex items-center gap-2 bg-white/80 backdrop-blur-sm px-4 py-2 rounded-lg shadow-sm border border-gray-200">
                    <span className="text-sm text-gray-600">Total:</span>
                    <span className="text-lg font-bold text-gray-900">{users.filter(u => u.role !== 'admin').length}</span>
                  </div>
                </div>
              </CardHeader>              <CardContent className="p-6">
                {users.filter(u => u.role !== 'admin').length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="p-6 bg-gradient-to-br from-gray-100 to-slate-100 rounded-2xl mb-6 shadow-inner">
                      <Users className="h-16 w-16 text-gray-400" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">No Users Yet</h3>
                    <p className="text-sm text-gray-500 max-w-sm">Add your first student or teacher using the form to get started with user management</p>
                  </div>
                ) : (                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {users.filter(u => u.role !== 'admin').map((user, index) => (
                      <div 
                        key={user.id} 
                        className={`group relative p-4 bg-white rounded-xl border border-gray-200 hover:shadow-lg transition-all duration-200 overflow-hidden ${
                          user.role === 'student' 
                            ? 'hover:border-blue-300' 
                            : 'hover:border-purple-300'
                        }`}
                      >
                        {/* User Info */}
                        <div className="relative flex items-center gap-3">
                          <div className="relative flex-shrink-0">
                            <Avatar className={`h-12 w-12 border-2 border-white shadow-sm ${
                              user.role === 'student'
                                ? 'group-hover:border-blue-200'
                                : 'group-hover:border-purple-200'
                            }`}>
                              <AvatarFallback className={`font-semibold text-sm ${
                                user.role === 'student' 
                                  ? 'bg-blue-50 text-blue-700' 
                                  : 'bg-purple-50 text-purple-700'
                              }`}>
                                {user.name ? user.name.split(" ").map(n => n[0]).join("").toUpperCase() : "U"}
                              </AvatarFallback>
                            </Avatar>
                            <div className={`absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-white shadow-sm flex items-center justify-center ${
                              user.role === 'student' ? 'bg-blue-500' : 'bg-purple-500'
                            }`}>
                              {user.role === 'student' ? (
                                <GraduationCap className="h-2.5 w-2.5 text-white" />
                              ) : (
                                <BookOpen className="h-2.5 w-2.5 text-white" />
                              )}
                            </div>
                          </div>

                          <div className="flex-1 min-w-0 pr-8">
                            <h3 className="font-semibold text-gray-900 truncate text-sm">
                              {user.name}
                            </h3>
                            <p className="text-xs text-gray-500 truncate mb-1.5">{user.email}</p>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge 
                                variant="outline" 
                                className={`text-[10px] font-medium px-1.5 py-0 ${
                                  user.role === 'student' 
                                    ? 'bg-blue-50 text-blue-600 border-blue-200' 
                                    : 'bg-purple-50 text-purple-600 border-purple-200'
                                }`}
                              >
                                {user.role}
                              </Badge>
                              {user.degree && (
                                <span className="text-[10px] text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded">
                                  {user.degree.replace('Bachelor of ', '')}
                                </span>
                              )}
                              {user.specialization && (
                                <span className="text-[10px] text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded truncate max-w-[120px]">
                                  {user.specialization}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Delete Button */}
                        <div className="absolute top-3 right-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm(`Are you sure you want to delete ${user.name}?`)) {
                                handleDeleteUser(user.id);
                              }
                            }}
                            className="h-7 w-7 p-0 hover:bg-red-50 hover:text-red-600 text-gray-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};

export default AdminUsers;
