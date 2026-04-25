import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { db } from '../../firebase';
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Users, BookOpen, TrendingUp, Download, Calendar, Filter, FileText, ChevronLeft } from 'lucide-react';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: any;
  degree?: string;
  department?: string;
}

interface Course {
  id: string;
  courseId: string;
  courseName: string;
  degree: string;
  teacherName: string;
  createdAt: any;
}

const AdminReports: React.FC = () => {
  const navigate = useNavigate();  // Filter states
  const [reportType, setReportType] = useState('overview');
  const [selectedDegree, setSelectedDegree] = useState('all');
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [filterByRole, setFilterByRole] = useState('all'); // 'all', 'student', 'teacher'
  const [loading, setLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);

  // Data states
  const [users, setUsers] = useState<User[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [statistics, setStatistics] = useState({
    totalUsers: 0,
    totalStudents: 0,
    totalTeachers: 0,
    totalCourses: 0,
    csStudents: 0,
    dsStudents: 0,
    csCourses: 0,
    dsCourses: 0,
  });

  // Fetch all data
  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      // Fetch users
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const usersList = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as User[];
      setUsers(usersList);

      // Fetch courses
      const coursesSnapshot = await getDocs(collection(db, 'courses'));
      const coursesList = coursesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Course[];
      setCourses(coursesList);

      // Calculate statistics
      const students = usersList.filter(u => u.role === 'student');
      const teachers = usersList.filter(u => u.role === 'teacher');
      const csStudents = students.filter(s => s.degree?.includes('Computer Science')).length;
      const dsStudents = students.filter(s => s.degree?.includes('Data Science')).length;
      const csCourses = coursesList.filter(c => c.degree?.includes('Computer Science')).length;
      const dsCourses = coursesList.filter(c => c.degree?.includes('Data Science')).length;

      setStatistics({
        totalUsers: usersList.filter(u => u.role !== 'admin').length,
        totalStudents: students.length,
        totalTeachers: teachers.length,
        totalCourses: coursesList.length,
        csStudents,
        dsStudents,
        csCourses,
        dsCourses,
      });
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter users based on selected criteria
  const getFilteredUsers = () => {
    return users.filter(u => {
      // Exclude admins
      if (u.role === 'admin') return false;

      // Filter by role
      if (filterByRole !== 'all' && u.role !== filterByRole) return false;

      // Filter by degree (for students) or department (for teachers)
      if (selectedDegree !== 'all') {
        if (u.role === 'student') {
          if (selectedDegree === 'cs' && !u.degree?.toLowerCase().includes('computer science')) return false;
          if (selectedDegree === 'ds' && !u.degree?.toLowerCase().includes('data science')) return false;
        } else if (u.role === 'teacher') {
          if (selectedDegree === 'cs' && !u.department?.toLowerCase().includes('computer science')) return false;
          if (selectedDegree === 'ds' && !u.department?.toLowerCase().includes('data science')) return false;
        }
      }

      return true;
    });
  };

  // Filter courses based on selected criteria
  const getFilteredCourses = () => {
    return courses.filter(c => {
      // Filter by degree
      if (selectedDegree !== 'all') {
        if (selectedDegree === 'cs' && !c.degree?.toLowerCase().includes('computer science')) return false;
        if (selectedDegree === 'ds' && !c.degree?.toLowerCase().includes('data science')) return false;
      }

      return true;
    });
  };

  // Get filtered statistics based on current filter selections
  const getFilteredStatistics = () => {
    const filteredUsers = getFilteredUsers();
    const filteredCourses = getFilteredCourses();
    
    const filteredStudents = filteredUsers.filter(u => u.role === 'student');
    const filteredTeachers = filteredUsers.filter(u => u.role === 'teacher');
    
    return {
      totalUsers: filteredUsers.length,
      totalStudents: filteredStudents.length,
      totalTeachers: filteredTeachers.length,
      totalCourses: filteredCourses.length,
    };
  };

  // Prepare chart data
  const userRoleData = [
    { name: 'Students', value: statistics.totalStudents, color: '#3b82f6' },
    { name: 'Teachers', value: statistics.totalTeachers, color: '#8b5cf6' },
  ];

  const degreeDistributionData = [
    { name: 'Computer Science', students: statistics.csStudents, courses: statistics.csCourses },
    { name: 'Data Science', students: statistics.dsStudents, courses: statistics.dsCourses },
  ];
  const userGrowthData = users
    .filter(u => u.role !== 'admin' && u.createdAt)
    .reduce((acc: any[], user) => {
      const date = user.createdAt?.toDate?.() || new Date();
      const month = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      const existing = acc.find(item => item.month === month);
      if (existing) {
        existing.count += 1;
      } else {
        acc.push({ month, count: 1 });
      }
      return acc;
    }, [])
    .sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime());

  // Custom label renderer for pie chart with black text
  const renderCustomLabel = (props: any) => {
    const { cx, cy, midAngle, innerRadius, outerRadius, name, percent } = props;
    const RADIAN = Math.PI / 180;
    const radius = outerRadius + 30;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text 
        x={x} 
        y={y} 
        fill="#000000" 
        textAnchor={x > cx ? 'start' : 'end'} 
        dominantBaseline="central"
        style={{ fontSize: '14px', fontWeight: '600' }}
      >
        {`${name} ${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  // Export to CSV
  const exportToCSV = () => {
    let csvContent = '';
    const filteredUsers = getFilteredUsers();
    const filteredCourses = getFilteredCourses();

    if (reportType === 'users') {
      // Export filtered users only
      csvContent = 'Name,Email,Role,Degree/Department,Created At\n';
      filteredUsers.forEach(user => {
        const date = user.createdAt?.toDate?.()?.toLocaleDateString() || 'N/A';
        const degreeOrDept = user.role === 'student' ? (user.degree || 'N/A') : (user.department || 'N/A');
        csvContent += `${user.name},${user.email},${user.role},${degreeOrDept},${date}\n`;
      });
    } else if (reportType === 'courses') {
      // Export filtered courses only
      csvContent = 'Course ID,Course Name,Degree,Teacher,Created At\n';
      filteredCourses.forEach(course => {
        const date = course.createdAt?.toDate?.()?.toLocaleDateString() || 'N/A';
        csvContent += `${course.courseId},${course.courseName},${course.degree},${course.teacherName},${date}\n`;
      });
    } else if (reportType === 'growth') {
      // Growth Analytics - Aggregated data
      csvContent = 'Category,Computer Science,Data Science,Total\n';
      
      // Users breakdown
      const csStudents = filteredUsers.filter(u => u.role === 'student' && u.degree?.toLowerCase().includes('computer science')).length;
      const dsStudents = filteredUsers.filter(u => u.role === 'student' && u.degree?.toLowerCase().includes('data science')).length;
      const csTeachers = filteredUsers.filter(u => u.role === 'teacher' && u.department?.toLowerCase().includes('computer science')).length;
      const dsTeachers = filteredUsers.filter(u => u.role === 'teacher' && u.department?.toLowerCase().includes('data science')).length;
      
      // Courses breakdown
      const csCourses = filteredCourses.filter(c => c.degree?.toLowerCase().includes('computer science')).length;
      const dsCourses = filteredCourses.filter(c => c.degree?.toLowerCase().includes('data science')).length;
      
      csvContent += `Students,${csStudents},${dsStudents},${csStudents + dsStudents}\n`;
      csvContent += `Teachers,${csTeachers},${dsTeachers},${csTeachers + dsTeachers}\n`;
      csvContent += `Courses,${csCourses},${dsCourses},${csCourses + dsCourses}\n`;
      csvContent += `Total Users,${csStudents + csTeachers},${dsStudents + dsTeachers},${filteredUsers.length}\n`;
    } else {
      // Overview - General statistics
      csvContent = 'Metric,Value\n';
      csvContent += `Total Users,${statistics.totalUsers}\n`;
      csvContent += `Total Students,${statistics.totalStudents}\n`;
      csvContent += `Total Teachers,${statistics.totalTeachers}\n`;
      csvContent += `Total Courses,${statistics.totalCourses}\n`;
      csvContent += `CS Students,${statistics.csStudents}\n`;
      csvContent += `DS Students,${statistics.dsStudents}\n`;
      csvContent += `CS Courses,${statistics.csCourses}\n`;
      csvContent += `DS Courses,${statistics.dsCourses}\n`;
    }

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${reportType}-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100">
      {/* Title Bar */}
      <header className="sticky top-0 z-50 bg-white shadow-md border-b border-primary/10">
        <div className="w-full px-4 md:px-6 py-4 flex items-center gap-6">
          <Button 
            variant="ghost" 
            onClick={() => navigate('/admin-dashboard')}
            className="hover:bg-primary/10 transition-all p-2 rounded-lg"
          >
            <ChevronLeft className="h-5 w-5 text-gray-700" />
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-xl md:text-2xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              InteliMark
            </span>
            <TrendingUp className="h-6 w-6 text-primary" />
          </div>
          <div className="flex flex-col ml-4 border-l border-gray-300 pl-4">
            <h2 className="text-lg font-semibold text-gray-800">
              Reports & Analytics
            </h2>
            <p className="text-xs text-gray-600">Generate and view comprehensive system reports</p>
          </div>
          <div className="flex-1" />
          <Button
            onClick={exportToCSV}
            className="bg-gradient-to-r from-primary to-primary/90 shadow-lg hover:shadow-xl transition-all"
          >
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </Button>
        </div>
      </header>
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Filters */}
        <Card className="mb-6 border-0 shadow-xl">
          <CardHeader className="border-b bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
            <div className="flex items-center gap-3">
              <Filter className="h-5 w-5 text-primary" />
              <CardTitle>Report Filters</CardTitle>
            </div>
          </CardHeader>          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Report Type</Label>
                <Select value={reportType} onValueChange={setReportType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="overview">Overview</SelectItem>
                    <SelectItem value="users">Users Report</SelectItem>
                    <SelectItem value="courses">Courses Report</SelectItem>
                    <SelectItem value="growth">Growth Analytics</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Filter by Role</Label>
                <Select value={filterByRole} onValueChange={(value) => {
                  setFilterByRole(value);
                  // Reset degree filter when role changes
                  setSelectedDegree('all');
                }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Users</SelectItem>
                    <SelectItem value="student">Students Only</SelectItem>
                    <SelectItem value="teacher">Teachers Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>
                  {filterByRole === 'teacher' ? 'Department' : 'Degree Program'}
                </Label>
                <Select value={selectedDegree} onValueChange={setSelectedDegree}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {filterByRole === 'teacher' ? 'All Departments' : 'All Programs'}
                    </SelectItem>
                    <SelectItem value="cs">Computer Science</SelectItem>
                    <SelectItem value="ds">Data Science</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="border-0 shadow-lg hover:shadow-xl transition-all">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Users</p>
                  <p className="text-3xl font-bold text-gray-900">{getFilteredStatistics().totalUsers}</p>
                </div>
                <div className="p-3 bg-blue-100 rounded-lg">
                  <Users className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg hover:shadow-xl transition-all">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Students</p>
                  <p className="text-3xl font-bold text-gray-900">{getFilteredStatistics().totalStudents}</p>
                </div>
                <div className="p-3 bg-green-100 rounded-lg">
                  <Users className="h-6 w-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg hover:shadow-xl transition-all">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Teachers</p>
                  <p className="text-3xl font-bold text-gray-900">{getFilteredStatistics().totalTeachers}</p>
                </div>
                <div className="p-3 bg-purple-100 rounded-lg">
                  <Users className="h-6 w-6 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg hover:shadow-xl transition-all">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Courses</p>
                  <p className="text-3xl font-bold text-gray-900">{getFilteredStatistics().totalCourses}</p>
                </div>
                <div className="p-3 bg-orange-100 rounded-lg">
                  <BookOpen className="h-6 w-6 text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">          {/* User Role Distribution */}
          <Card className="border-0 shadow-xl">
            <CardHeader className="border-b bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
              <CardTitle>User Role Distribution</CardTitle>
              <CardDescription>Students vs Teachers breakdown</CardDescription>
            </CardHeader>
            <CardContent className="pt-6" onClick={(e) => {
              // Reset filter if clicking on the card background (not on pie or stats boxes)
              if (e.target === e.currentTarget) {
                setSelectedRole(null);
              }
            }}>              <div onClick={() => setSelectedRole(null)} style={{ cursor: selectedRole ? 'pointer' : 'default' }}>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={userRoleData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={renderCustomLabel}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                      onClick={(data, index, e) => {
                        e.stopPropagation();
                        setSelectedRole(selectedRole === data.name ? null : data.name);
                      }}
                      style={{ cursor: 'pointer', outline: 'none' }}
                    >
                      {userRoleData.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.color}
                          opacity={selectedRole === null || selectedRole === entry.name ? 1 : 0.3}
                          stroke="none"
                          style={{ outline: 'none' }}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={() => null} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              
              {/* Statistics below chart */}
              <div className="grid grid-cols-2 gap-4 mt-6">
                <div 
                  className={`p-4 bg-blue-50 rounded-lg border-2 transition-all cursor-pointer ${
                    selectedRole === 'Students' ? 'border-blue-500 shadow-lg' : 'border-transparent'
                  } ${selectedRole !== null && selectedRole !== 'Students' ? 'opacity-30' : 'opacity-100'}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedRole(selectedRole === 'Students' ? null : 'Students');
                  }}
                >
                  <p className="text-sm text-blue-600 font-semibold">Students</p>
                  <p className="text-2xl font-bold text-blue-900">{statistics.totalStudents}</p>
                  <p className="text-xs text-blue-500 mt-1">
                    {statistics.totalUsers > 0 ? ((statistics.totalStudents / statistics.totalUsers) * 100).toFixed(0) : 0}% of total
                  </p>
                </div>

                <div 
                  className={`p-4 bg-purple-50 rounded-lg border-2 transition-all cursor-pointer ${
                    selectedRole === 'Teachers' ? 'border-purple-500 shadow-lg' : 'border-transparent'
                  } ${selectedRole !== null && selectedRole !== 'Teachers' ? 'opacity-30' : 'opacity-100'}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedRole(selectedRole === 'Teachers' ? null : 'Teachers');
                  }}
                >
                  <p className="text-sm text-purple-600 font-semibold">Teachers</p>
                  <p className="text-2xl font-bold text-purple-900">{statistics.totalTeachers}</p>
                  <p className="text-xs text-purple-500 mt-1">
                    {statistics.totalUsers > 0 ? ((statistics.totalTeachers / statistics.totalUsers) * 100).toFixed(0) : 0}% of total
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>{/* Degree Distribution */}
          <Card className="border-0 shadow-xl">
            <CardHeader className="border-b bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
              <CardTitle>Degree Program Distribution</CardTitle>
              <CardDescription>Students and courses by degree</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={degreeDistributionData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="students" fill="#3b82f6" name="Students" />
                  <Bar dataKey="courses" fill="#8b5cf6" name="Courses" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>        {/* User Growth */}
        {userGrowthData.length > 0 && (
          <Card className="border-0 shadow-xl">
            <CardHeader className="border-b bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
              <CardTitle>User Growth Over Time</CardTitle>
              <CardDescription>New user registrations by month</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={userGrowthData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="count" stroke="#8b5cf6" strokeWidth={2} name="New Users" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}        {/* Data Tables */}
        {reportType === 'users' && (
          <Card className="mt-6 border-0 shadow-xl">
            <CardHeader className="border-b bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
              <CardTitle>Users Data</CardTitle>
              <CardDescription>
                {filterByRole === 'all' 
                  ? 'Complete list of all users' 
                  : `Showing ${filterByRole === 'student' ? 'Students' : 'Teachers'} only`}
                {selectedDegree !== 'all' && ` - ${selectedDegree === 'cs' ? 'Computer Science' : 'Data Science'} ${filterByRole === 'teacher' ? 'Department' : 'Program'}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-semibold">Name</th>
                      <th className="text-left p-3 font-semibold">Email</th>
                      <th className="text-left p-3 font-semibold">Role</th>
                      <th className="text-left p-3 font-semibold">Degree</th>
                      <th className="text-left p-3 font-semibold">Department</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getFilteredUsers().map((user) => (
                      <tr key={user.id} className="border-b hover:bg-gray-50">
                        <td className="p-3">{user.name}</td>
                        <td className="p-3">{user.email}</td>
                        <td className="p-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            user.role === 'student' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                          }`}>
                            {user.role}
                          </span>
                        </td>
                        <td className="p-3">{user.degree || 'N/A'}</td>
                        <td className="p-3">{user.department || 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 text-sm text-gray-600">
                Showing {getFilteredUsers().length} of {users.filter(u => u.role !== 'admin').length} users
              </div>
            </CardContent>
          </Card>
        )}

        {reportType === 'courses' && (
          <Card className="mt-6 border-0 shadow-xl">
            <CardHeader className="border-b bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
              <CardTitle>Courses Data</CardTitle>
              <CardDescription>
                Complete list of all courses
                {selectedDegree !== 'all' && ` - ${selectedDegree === 'cs' ? 'Computer Science' : 'Data Science'} only`}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-semibold">Course ID</th>
                      <th className="text-left p-3 font-semibold">Course Name</th>
                      <th className="text-left p-3 font-semibold">Degree</th>
                      <th className="text-left p-3 font-semibold">Teacher</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getFilteredCourses().map((course) => (
                      <tr key={course.id} className="border-b hover:bg-gray-50">
                        <td className="p-3 font-medium">{course.courseId}</td>
                        <td className="p-3">{course.courseName}</td>
                        <td className="p-3 text-xs">{course.degree}</td>
                        <td className="p-3">{course.teacherName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 text-sm text-gray-600">
                Showing {getFilteredCourses().length} of {courses.length} courses
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default AdminReports;
