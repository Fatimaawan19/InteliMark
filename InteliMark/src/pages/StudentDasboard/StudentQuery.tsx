import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Brain, ArrowLeft, Send, HelpCircle, MessageSquare, Phone, Mail, Clock, CheckCircle2, AlertCircle, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { db } from "../../firebase";
import { collection, query, where, getDocs, addDoc, onSnapshot, orderBy, updateDoc, doc, getDoc } from "firebase/firestore";
import { auth } from "../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Query {
  id: string;
  studentName: string;
  studentEmail: string;
  regNumber: string;
  department: string;
  subject: string;
  category: string;
  priority: string;
  message: string;  status: "new" | "in-progress" | "resolved" | "deleted";
  response: string;
  timestamp: string;
  studentId?: string;
  deletedAt?: string;
  responseSeenByStudent?: boolean;
  responseSeenAt?: string;
}

const StudentQuery = () => {
  const navigate = useNavigate();  const [formData, setFormData] = useState({
    name: "",
    email: "",
    regNumber: "",
    department: "",
    category: "",
    subject: "",
    message: "",
    priority: "medium"
  });  const [submitted, setSubmitted] = useState(false);
  const [adminEmail, setAdminEmail] = useState("support@intelimark.edu");
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [queryHistory, setQueryHistory] = useState<Query[]>([]);
  const [expandedQueryId, setExpandedQueryId] = useState<string | null>(null);

  // Monitor auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);

      if (!user) return;

      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (!userDoc.exists()) return;

        const userData = userDoc.data() as any;
        const fetchedRegNumber = userData.regNo || userData.regNumber || '';

        setFormData(prev => ({
          ...prev,
          name: userData.name || user.displayName || prev.name,
          email: userData.email || user.email || prev.email,
          regNumber: fetchedRegNumber || prev.regNumber,
          department: userData.department || prev.department
        }));
      } catch (error) {
        console.error('Error fetching current user profile:', error);
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch admin email
  useEffect(() => {
    const fetchAdminEmail = async () => {
      try {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('role', '==', 'admin'));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
          const adminDoc = querySnapshot.docs[0];
          const adminData = adminDoc.data();
          setAdminEmail(adminData.email || "support@intelimark.edu");
        }
      } catch (error) {
        console.error('Error fetching admin email:', error);
      }
    };

    fetchAdminEmail();
  }, []);  // Real-time listener for student's queries
  useEffect(() => {
    if (!currentUser) {
      console.log('No user logged in');
      return;
    }

    console.log('Setting up real-time listener for user:', currentUser.uid);

    const queriesRef = collection(db, 'queries');
    const q = query(
      queriesRef,
      where('studentId', '==', currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const queries: Query[] = snapshot.docs.map(doc => {
        const data = doc.data();
        console.log('Query data:', { id: doc.id, status: data.status, subject: data.subject });
        return {
          id: doc.id,
          ...data
        } as Query;
      });
      
      // Sort by timestamp client-side
      queries.sort((a, b) => {
        const dateA = new Date(a.timestamp).getTime();
        const dateB = new Date(b.timestamp).getTime();
        return dateB - dateA; // Most recent first
      });
      
      console.log('Total queries fetched:', queries.length);
      setQueryHistory(queries);
    }, (error) => {
      console.error('Error fetching queries:', error);
    });

    return () => {
      console.log('Cleaning up query listener');
      unsubscribe();
    };
  }, [currentUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentUser) {
      alert('Please log in to submit a query');
      return;
    }

    try {
      // Create new query document in Firebase
      const queriesRef = collection(db, 'queries');
      await addDoc(queriesRef, {
        studentId: currentUser.uid,
        studentName: formData.name,
        studentEmail: formData.email,
        regNumber: formData.regNumber,
        department: formData.department,
        category: formData.category,
        priority: formData.priority,
        subject: formData.subject,
        message: formData.message,
        status: "new",
        response: "",
        timestamp: new Date().toISOString()
      });

      setSubmitted(true);
      
      // Reset form after 3 seconds
      setTimeout(() => {
        setSubmitted(false);
        setFormData(prev => ({
          name: prev.name,
          email: prev.email,
          regNumber: prev.regNumber,
          department: prev.department,
          category: "",
          subject: "",
          message: "",
          priority: "medium"
        }));
      }, 3000);
    } catch (error) {
      console.error('Error submitting query:', error);
      alert('Failed to submit query. Please try again.');
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const hasUnreadReply = (query: Query) => {
    return Boolean(query.response?.trim()) && !query.responseSeenByStudent;
  };

  const handleOpenReply = async (query: Query) => {
    const isCurrentlyOpen = expandedQueryId === query.id;
    setExpandedQueryId(isCurrentlyOpen ? null : query.id);

    if (!isCurrentlyOpen && hasUnreadReply(query)) {
      try {
        const queryRef = doc(db, 'queries', query.id);
        await updateDoc(queryRef, {
          responseSeenByStudent: true,
          responseSeenAt: new Date().toISOString()
        });
      } catch (error) {
        console.error('Error marking reply as seen:', error);
      }
    }
  };

  return (
    <div className="min-h-screen bg-secondary/20">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white shadow-md border-b border-primary/10">
        <div className="w-full px-4 md:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/student-dashboard')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-all"
              aria-label="Back to dashboard"
            >
              <ArrowLeft className="h-6 w-6 text-gray-800" />
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xl md:text-2xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                InteliMark
              </span>
              <Brain className="h-6 w-6 text-primary" />
            </div>
            <div className="hidden md:flex flex-col ml-4 border-l border-gray-300 pl-4">
              <h2 className="text-lg font-semibold text-gray-800">Help & Support</h2>
              <p className="text-xs text-gray-600">We're here to help you</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Quick Contact Banner */}
        <Card className="border-primary/20 shadow-sm">
          <CardHeader className="pb-3 bg-gradient-to-r from-primary/5 to-primary/10 rounded-t-xl border-b border-primary/10">
            <CardTitle className="text-lg font-bold text-black">Quick Contact</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg hover:bg-primary/10 transition-colors cursor-pointer">
                <div className="p-2 bg-blue-500 rounded-lg">
                  <Phone className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Phone Support</p>
                  <p className="font-semibold text-sm">+1 (555) 123-4567</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg hover:bg-primary/10 transition-colors cursor-pointer">
                <div className="p-2 bg-green-500 rounded-lg">
                  <Mail className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Email Support</p>
                  <p className="font-semibold text-sm">{adminEmail}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg">
                <div className="p-2 bg-orange-500 rounded-lg">
                  <Clock className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Response Time</p>
                  <p className="font-semibold text-sm">Within 24-48 hours</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Query Form and Query History Side by Side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left - Query Form */}
          <div>
            <Card className="border-primary/20 shadow-lg">
              <CardHeader className="pb-3 bg-gradient-to-r from-primary/5 to-primary/10 rounded-t-xl border-b border-primary/10">
                <CardTitle className="text-lg font-bold text-black">Submit Your Query</CardTitle>
                <CardDescription className="text-sm text-muted-foreground mt-1">
                  Fill out the form below and we'll get back to you as soon as possible
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                {submitted ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <div className="h-20 w-20 bg-green-100 rounded-full flex items-center justify-center mb-4 animate-pulse">
                      <CheckCircle2 className="h-10 w-10 text-green-600" />
                    </div>
                    <h3 className="text-2xl font-bold text-black mb-2">Query Submitted Successfully!</h3>
                    <p className="text-muted-foreground text-center max-w-md">
                      Thank you for contacting us. Your query has been received and we'll respond within 24-48 hours.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-6">                    {/* Name & Email Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name" className="text-sm font-semibold text-black">
                          Full Name <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="name"
                          value={formData.name}
                          onChange={(e) => handleChange('name', e.target.value)}
                          placeholder="Muhammad Ahmad"
                          required
                          className="border-primary/30 focus:border-primary transition-all"
                        />
                      </div>                      <div className="space-y-2">
                        <Label htmlFor="email" className="text-sm font-semibold text-black">
                          Email Address <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.email}
                          onChange={(e) => handleChange('email', e.target.value)}
                          placeholder="ahmad.khan@gmail.com"
                          required
                          className="border-primary/30 focus:border-primary transition-all"
                        />
                      </div>
                    </div>

                    {/* Registration Number & Department Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="regNumber" className="text-sm font-semibold text-black">
                          Registration Number <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="regNumber"
                          value={formData.regNumber}
                          onChange={(e) => handleChange('regNumber', e.target.value)}
                          placeholder="FA22-BCS-123"
                          required
                          readOnly={Boolean(currentUser && formData.regNumber)}
                          className="border-primary/30 focus:border-primary transition-all"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="department" className="text-sm font-semibold text-black">
                          Department <span className="text-red-500">*</span>
                        </Label>
                        <Select required value={formData.department} onValueChange={(value) => handleChange('department', value)}>
                          <SelectTrigger className="border-primary/30 focus:border-primary">
                            <SelectValue placeholder="Select department" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="CS">Computer Science (CS)</SelectItem>
                            <SelectItem value="DS">Data Science (DS)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Category & Priority Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="category" className="text-sm font-semibold text-black">
                          Category <span className="text-red-500">*</span>
                        </Label>
                        <Select required value={formData.category} onValueChange={(value) => handleChange('category', value)}>
                          <SelectTrigger className="border-primary/30 focus:border-primary">
                            <SelectValue placeholder="Select a category" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="technical">Technical Issues</SelectItem>
                            <SelectItem value="registration">Course Registration</SelectItem>
                            <SelectItem value="assignment">Assignment Submission</SelectItem>
                            <SelectItem value="grading">Grading Queries</SelectItem>
                            <SelectItem value="account">Account Issues</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="priority" className="text-sm font-semibold text-black">
                          Priority Level <span className="text-red-500">*</span>
                        </Label>
                        <Select required value={formData.priority} onValueChange={(value) => handleChange('priority', value)}>
                          <SelectTrigger className="border-primary/30 focus:border-primary">
                            <SelectValue placeholder="Select priority" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">Low - General inquiry</SelectItem>
                            <SelectItem value="medium">Medium - Need assistance</SelectItem>
                            <SelectItem value="high">High - Urgent matter</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Subject Field */}
                    <div className="space-y-2">
                      <Label htmlFor="subject" className="text-sm font-semibold text-black">
                        Subject <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="subject"
                        value={formData.subject}
                        onChange={(e) => handleChange('subject', e.target.value)}
                        placeholder="Brief summary of your issue"
                        required
                        className="border-primary/30 focus:border-primary transition-all"
                      />
                    </div>

                    {/* Message Field */}
                    <div className="space-y-2">
                      <Label htmlFor="message" className="text-sm font-semibold text-black">
                        Detailed Message <span className="text-red-500">*</span>
                      </Label>
                      <Textarea
                        id="message"
                        value={formData.message}
                        onChange={(e) => handleChange('message', e.target.value)}
                        placeholder="Please provide detailed information about your query. Include any relevant course codes, assignment names, or error messages..."
                        required
                        rows={4}
                        className="border-primary/30 focus:border-primary transition-all resize-none"
                      />
                      <p className="text-xs text-muted-foreground">
                        {formData.message.length}/1000 characters
                      </p>
                    </div>

                    {/* Submit Buttons */}
                    <div className="flex gap-3 pt-4">
                      <Button
                        type="submit"
                        className="flex-1 bg-primary hover:bg-primary/90 text-white font-semibold h-11 text-base shadow-lg hover:shadow-xl transition-all"
                      >
                        <Send className="h-5 w-5 mr-2" />
                        Submit Query
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => navigate('/student-dashboard')}
                        className="border-primary/30 hover:bg-primary/5 h-11"
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right - Common Topics and Query History */}
          <div className="space-y-6">
            {/* Common Topics */}
            <Card className="border-primary/20 shadow-sm">
              <CardHeader className="pb-3 bg-gradient-to-r from-primary/5 to-primary/10 rounded-t-xl border-b border-primary/10">
                <CardTitle className="text-lg font-bold text-black">Common Topics</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-2">
                <div className="flex items-center gap-2 p-2 hover:bg-primary/5 rounded-lg transition-colors cursor-pointer">
                  <HelpCircle className="h-4 w-4 text-primary" />
                  <span className="text-sm">Technical Issues</span>
                </div>
                <div className="flex items-center gap-2 p-2 hover:bg-primary/5 rounded-lg transition-colors cursor-pointer">
                  <HelpCircle className="h-4 w-4 text-primary" />
                  <span className="text-sm">Course Registration</span>
                </div>
                <div className="flex items-center gap-2 p-2 hover:bg-primary/5 rounded-lg transition-colors cursor-pointer">
                  <HelpCircle className="h-4 w-4 text-primary" />
                  <span className="text-sm">Assignment Submission</span>
                </div>
                <div className="flex items-center gap-2 p-2 hover:bg-primary/5 rounded-lg transition-colors cursor-pointer">
                  <HelpCircle className="h-4 w-4 text-primary" />
                  <span className="text-sm">Grading Queries</span>
                </div>
                <div className="flex items-center gap-2 p-2 hover:bg-primary/5 rounded-lg transition-colors cursor-pointer">
                  <HelpCircle className="h-4 w-4 text-primary" />
                  <span className="text-sm">Account Issues</span>
                </div>
              </CardContent>
            </Card>

            {/* Query History */}
            <Card className="border-primary/20 shadow-lg">
              <CardHeader className="pb-3 bg-gradient-to-r from-primary/5 to-primary/10 rounded-t-xl border-b border-primary/10">
                <CardTitle className="text-lg font-bold text-black">Your Query History</CardTitle>
                <CardDescription className="text-sm text-muted-foreground mt-1">
                  Track the status of your submitted queries
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <ScrollArea className="h-[250px] pr-4">
                  {queryHistory.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12">
                      <MessageSquare className="h-16 w-16 text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">No queries submitted yet</p>
                    </div>
                  ) : (
                    <div className="space-y-4">                      {queryHistory.map((query) => (
                        <div
                          key={query.id}
                          className={`p-4 rounded-lg border border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10 hover:shadow-md transition-all ${
                            query.status === 'deleted' ? 'opacity-60' : ''
                          }`}
                        >
                          {query.status === 'deleted' ? (
                            <div className="text-center py-8">
                              <div className="flex flex-col items-center gap-2">
                                <div className="h-12 w-12 bg-red-100 rounded-full flex items-center justify-center">
                                  <AlertCircle className="h-6 w-6 text-red-600" />
                                </div>
                                <p className="text-red-600 font-semibold">Query Deleted</p>
                                <p className="text-sm text-muted-foreground max-w-sm">
                                  This query has been deleted from the backend by admin
                                </p>
                                <p className="text-xs text-muted-foreground mt-2">
                                  Subject: {query.subject}
                                </p>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex-1">
                                  <h4 className="font-semibold text-black text-base mb-1">
                                    {query.subject}
                                  </h4>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Badge variant="outline" className="text-xs">
                                      {query.category}
                                    </Badge>
                                    <Badge variant="secondary" className="text-xs bg-gray-200 text-gray-700">
                                      <User className="h-3 w-3 mr-1" />
                                      {query.studentName}
                                    </Badge>
                                    {hasUnreadReply(query) && (
                                      <Badge className="text-xs bg-orange-100 text-orange-700 hover:bg-orange-100">
                                        New Reply
                                      </Badge>
                                    )}
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                      <Clock className="h-3 w-3" />
                                      {formatTimestamp(query.timestamp)}
                                    </div>
                                  </div>
                                </div>
                                <Badge
                                  className={`ml-3 ${
                                    query.status === 'resolved'
                                      ? 'bg-green-100 text-green-700 hover:bg-green-100'
                                      : query.status === 'in-progress'
                                      ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-100'
                                      : 'bg-blue-100 text-blue-700 hover:bg-blue-100'
                                  }`}
                                >
                                  {query.status === 'resolved' ? (
                                    <>
                                      <CheckCircle2 className="h-3 w-3 mr-1" />
                                      Resolved
                                    </>
                                  ) : query.status === 'in-progress' ? (
                                    <>
                                      <Clock className="h-3 w-3 mr-1" />
                                      In Progress
                                    </>
                                  ) : (
                                    <>
                                      <AlertCircle className="h-3 w-3 mr-1" />
                                      New
                                    </>
                                  )}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground line-clamp-2">
                                {query.message}
                              </p>
                              
                              {query.response && expandedQueryId === query.id && (
                                <div className="mt-3 p-3 bg-primary/10 rounded-lg border-l-4 border-primary">
                                  <p className="text-xs text-primary font-semibold mb-1">Admin Response:</p>
                                  <p className="text-sm text-gray-700">{query.response}</p>
                                </div>
                              )}

                              {query.response && (
                                <div className="mt-3">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-primary/30 text-primary hover:bg-primary/5 hover:text-purple-800"
                                    onClick={() => handleOpenReply(query)}
                                  >
                                    {expandedQueryId === query.id ? 'Hide Reply' : 'View Reply'}
                                  </Button>
                                </div>
                              )}
                              
                              {( query.status === 'new' || query.status === 'in-progress') && (
                                <div className="mt-3">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-blue-300 text-blue-700 hover:bg-blue-50 hover:text-blue-900"
                                    onClick={async () => {
                                      try {
                                        const queryRef = doc(db, 'queries', query.id);
                                        await updateDoc(queryRef, {
                                          timestamp: new Date().toISOString()
                                        });
                                        alert('Query resent successfully!');
                                      } catch (error) {
                                        console.error('Error resending query:', error);
                                        alert('Failed to resend query');
                                      }
                                    }}
                                  >
                                    Send Again
                                  </Button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentQuery;
