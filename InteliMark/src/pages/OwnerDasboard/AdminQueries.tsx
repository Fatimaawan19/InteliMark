import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, onSnapshot, updateDoc, doc, query, orderBy, deleteDoc, Timestamp } from "firebase/firestore";
import { db } from '../../firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle, Brain, Search, Filter, Clock, User, Mail, AlertCircle, MessageSquare, ArrowLeft, Hash, Trash2 } from 'lucide-react';

interface QueryType {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  regNumber: string;
  department: string;
  subject: string;
  category: string;
  priority: 'low' | 'medium' | 'high';
  message: string;
  timestamp: any;
  status: 'new' | 'in-progress' | 'resolved' | 'deleted';
  response?: string;
  deletedAt?: string;
}

const AdminQueries: React.FC = () => {
  const navigate = useNavigate();
  const [queries, setQueries] = useState<QueryType[]>([]);
  const [selectedQuery, setSelectedQuery] = useState<QueryType | null>(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Update current time every minute for real-time timestamp display
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  // ----------------------
  // Real-time Fetch Queries
  // ----------------------
  useEffect(() => {
    const q = query(collection(db, "queries"), orderBy("timestamp", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as QueryType));
      setQueries(data);
    });
    return () => unsubscribe();
  }, []);

  // Update selected query when queries change
  useEffect(() => {
    if (selectedQuery && queries.length > 0) {
      const updated = queries.find(q => q.id === selectedQuery.id);
      if (updated && JSON.stringify(updated) !== JSON.stringify(selectedQuery)) {
        setSelectedQuery(updated);
      }
    }
  }, [queries]);

  // ----------------------
  // Filter Queries
  // ----------------------
  const filteredQueries = queries.filter(q => {
    // Exclude deleted queries from main list
    if (q.status === 'deleted') return false;
    
    const matchesSearch = 
      q.studentName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      q.subject?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      q.regNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      q.studentEmail?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || q.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || q.priority === priorityFilter;
    const matchesDepartment = departmentFilter === 'all' || q.department === departmentFilter;
    const matchesCategory = categoryFilter === 'all' || q.category === categoryFilter;
    
    return matchesSearch && matchesStatus && matchesPriority && matchesDepartment && matchesCategory;
  });
  // ----------------------
  // Handle Reply
  // ----------------------
  // ----------------------
  // Send Reply Only (Keep Open)
  // ----------------------
  const handleReply = async (queryId: string) => {
    if (!replyMessage.trim()) {
      alert('Please enter a reply message');
      return;
    }

    if (!selectedQuery?.studentId) {
      alert('Student information is missing for this query');
      return;
    }

    try {
      const queryRef = doc(db, "queries", queryId);
      await updateDoc(queryRef, {
        response: replyMessage,
        status: "in-progress",
        responseSeenByStudent: false,
        responseSeenAt: null
      });

      // Add notification for student - reply sent, query still open
      await addDoc(collection(db, "notifications"), {
        recipientId: selectedQuery.studentId,
        userId: selectedQuery.studentId,
        title: 'New reply to your query',
        message: `Admin replied to your query: "${selectedQuery?.subject}" (Still open for follow-ups)`,
        read: false,
        createdAt: Timestamp.now(),
        timestamp: Timestamp.now(),
        recipientRole: 'student',
        type: 'info',
        actionType: 'query_reply'
      });

      setReplyMessage('');
      setSelectedQuery(null);
      alert("Reply sent successfully! Query remains open.");
    } catch (error) {
      console.error("Error replying:", error);
      alert("Failed to send reply");
    }
  };

  // ----------------------
  // Send Reply & Resolve
  // ----------------------
  const handleReplyAndResolve = async (queryId: string) => {
    if (!replyMessage.trim()) {
      alert('Please enter a reply message');
      return;
    }

    if (!selectedQuery?.studentId) {
      alert('Student information is missing for this query');
      return;
    }

    try {
      const queryRef = doc(db, "queries", queryId);
      await updateDoc(queryRef, {
        response: replyMessage,
        status: "resolved",
        resolvedAt: Timestamp.now(),
        responseSeenByStudent: false,
        responseSeenAt: null
      });

      // Add notification for student - reply sent and resolved
      await addDoc(collection(db, "notifications"), {
        recipientId: selectedQuery.studentId,
        userId: selectedQuery.studentId,
        title: 'Query resolved',
        message: `Admin resolved your query: "${selectedQuery?.subject}"`,
        read: false,
        createdAt: Timestamp.now(),
        timestamp: Timestamp.now(),
        recipientRole: 'student',
        type: 'success',
        actionType: 'query_resolved'
      });

      setReplyMessage('');
      setSelectedQuery(null);
      alert("Reply sent and query resolved!");
    } catch (error) {
      console.error("Error replying and resolving:", error);
      alert("Failed to send reply");
    }
  };

  // ----------------------
  // Mark as Resolved
  // ----------------------
  const markAsResolved = async (queryId: string) => {
    if (!queryId) {
      alert('No query selected');
      return;
    }

    try {
      const queryRef = doc(db, "queries", queryId);
      await updateDoc(queryRef, { 
        status: "resolved"
      });

      // Add notification for student
      if (selectedQuery?.studentId) {
        await addDoc(collection(db, "notifications"), {
          userId: selectedQuery.studentId,
          message: `Your query "${selectedQuery?.subject}" has been resolved`,
          read: false,
          createdAt: new Date(),
          recipientRole: 'student',
          type: 'success'
        });
      }

      alert("Query marked as resolved!");
      setSelectedQuery(null);
    } catch (error) {
      console.error("Error resolving query:", error);
      alert("Failed to mark as resolved. Error: " + error);
    }
  };

  // ----------------------
  // Delete Query
  // ----------------------
  const deleteQuery = async (queryId: string) => {
    if (!queryId) {
      alert('No query selected');
      return;
    }

    const confirmDelete = window.confirm(
      'Are you sure you want to delete this query? This action cannot be undone.'
    );

    if (!confirmDelete) return;

    try {
      const queryRef = doc(db, "queries", queryId);
      await updateDoc(queryRef, { 
        status: "deleted",
        deletedAt: new Date().toISOString()
      });

      // Add notification for student
      if (selectedQuery?.studentId) {
        await addDoc(collection(db, "notifications"), {
          userId: selectedQuery.studentId,
          message: `Your query "${selectedQuery?.subject}" has been deleted by admin`,
          read: false,
          createdAt: new Date(),
          recipientRole: 'student',
          type: 'warning'
        });
      }

      alert("Query deleted successfully!");
      setSelectedQuery(null);
    } catch (error) {
      console.error("Error deleting query:", error);
      alert("Failed to delete query. Error: " + error);
    }
  };

  // ----------------------
  // Badge colors
  // ----------------------
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new': return 'bg-blue-100 text-blue-700 hover:bg-blue-100';
      case 'in-progress': return 'bg-yellow-100 text-yellow-700 hover:bg-yellow-100';
      case 'resolved': return 'bg-green-100 text-green-700 hover:bg-green-100';
      default: return 'bg-gray-100 text-gray-700 hover:bg-gray-100';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-700 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-700 border-green-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };
  const formatTimestamp = (timestamp: any) => {
    if (!timestamp?.toDate) return 'Just now';
    const date = timestamp.toDate();
    const diffMs = currentTime.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const getCategoryDisplay = (category: string) => {
    const categoryMap: { [key: string]: string } = {
      'technical': 'Technical Issues',
      'registration': 'Course Registration',
      'assignment': 'Assignment Submission',
      'grading': 'Grading Queries',
      'account': 'Account Issues',
      'financial': 'Financial Matters',
      'other': 'Other'
    };
    return categoryMap[category] || category;
  };

  return (
    <div className="min-h-screen bg-secondary/20">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white shadow-md border-b border-primary/10">
        <div className="w-full px-4 md:px-6 py-4 flex items-center justify-between">          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/admin-dashboard')}
              className="p-2 hover:bg-purple-100 rounded-lg transition-all group"
              aria-label="Back to dashboard"
            >
              <ArrowLeft className="h-6 w-6 text-gray-800 group-hover:text-purple-600 transition-colors" />
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xl md:text-2xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                InteliMark
              </span>
              <Brain className="h-6 w-6 text-primary" />
            </div>
            <div className="hidden md:flex flex-col ml-4 border-l border-gray-300 pl-4">
              <h2 className="text-lg font-semibold text-gray-800">Query & Support Management</h2>
              <p className="text-xs text-gray-600">Manage and respond to student queries</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="border-primary/20 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Queries</p>
                  <h3 className="text-2xl font-bold text-black">{queries.filter(q => q.status !== 'deleted').length}</h3>
                </div>
                <MessageSquare className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-blue-200 shadow-sm bg-blue-50/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-blue-600">New</p>
                  <h3 className="text-2xl font-bold text-blue-700">{queries.filter(q => q.status === 'new').length}</h3>
                </div>
                <AlertCircle className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-yellow-200 shadow-sm bg-yellow-50/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-yellow-600">In Progress</p>
                  <h3 className="text-2xl font-bold text-yellow-700">{queries.filter(q => q.status === 'in-progress').length}</h3>
                </div>
                <Clock className="h-8 w-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-green-200 shadow-sm bg-green-50/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-green-600">Resolved</p>
                  <h3 className="text-2xl font-bold text-green-700">{queries.filter(q => q.status === 'resolved').length}</h3>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters Section */}
        <Card className="border-primary/20 shadow-sm mb-6">
          <CardHeader className="pb-3 bg-gradient-to-r from-primary/5 to-primary/10 rounded-t-xl border-b border-primary/10">
            <CardTitle className="text-lg font-bold text-black">Filters & Search</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              <div className="md:col-span-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, email, reg#, subject..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 border-primary/30"
                  />
                </div>
              </div>
              
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="border-primary/30">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="in-progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>

              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="border-primary/30">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priority</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>

              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger className="border-primary/30">
                  <SelectValue placeholder="Department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  <SelectItem value="CS">Computer Science</SelectItem>
                  <SelectItem value="DS">Data Science</SelectItem>
                </SelectContent>
              </Select>

              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="border-primary/30">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="technical">Technical Issues</SelectItem>
                  <SelectItem value="registration">Course Registration</SelectItem>
                  <SelectItem value="assignment">Assignment Submission</SelectItem>
                  <SelectItem value="grading">Grading Queries</SelectItem>
                  <SelectItem value="account">Account Issues</SelectItem>
                  <SelectItem value="financial">Financial Matters</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Queries Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Queries List */}
          <div>
            <Card className="border-primary/20 shadow-sm">
              <CardHeader className="pb-3 bg-gradient-to-r from-primary/5 to-primary/10 rounded-t-xl border-b border-primary/10">
                <CardTitle className="text-lg font-bold text-black">
                  Queries ({filteredQueries.length})
                </CardTitle>
                <CardDescription className="text-sm text-muted-foreground mt-1">
                  Click on a query to view details and respond
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[600px]">
                  {filteredQueries.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16">
                      <MessageSquare className="h-16 w-16 text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">No queries found</p>
                    </div>
                  ) : (
                    <div className="p-4 space-y-3">                      {filteredQueries.map((q, index) => (
                        <Card
                          key={q.id}
                          className={`cursor-pointer transition-all hover:shadow-lg relative ${
                            selectedQuery?.id === q.id 
                              ? 'ring-2 ring-primary shadow-xl' 
                              : ''
                          } ${
                            index % 5 === 0 ? 'bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200' :
                            index % 5 === 1 ? 'bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200' :
                            index % 5 === 2 ? 'bg-gradient-to-br from-green-50 to-green-100 border-green-200' :
                            index % 5 === 3 ? 'bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200' :
                            'bg-gradient-to-br from-rose-50 to-rose-100 border-rose-200'
                          } border-2`}
                          onClick={() => setSelectedQuery(q)}
                        >
                          <CardContent className="p-4">
                            {/* Delete button for resolved queries */}
                            {q.status === 'resolved' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteQuery(q.id);
                                }}
                                className="absolute top-2 right-2 p-2 bg-red-100 hover:bg-red-200 rounded-full transition-colors z-10"
                                title="Delete query"
                              >
                                <Trash2 className="h-4 w-4 text-red-600" />
                              </button>
                            )}
                            
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1 pr-8">
                                <h4 className="font-semibold text-black text-base mb-1">
                                  {q.subject}
                                </h4>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <User className="h-3 w-3" />
                                  <span>{q.studentName}</span>
                                  <span>•</span>
                                  <Hash className="h-3 w-3" />
                                  <span>{q.regNumber}</span>
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2 flex-wrap mb-3">
                              <Badge className={getStatusColor(q.status)}>
                                {q.status}
                              </Badge>
                              <Badge variant="outline" className={getPriorityColor(q.priority)}>
                                {q.priority}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {q.department}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {getCategoryDisplay(q.category)}
                              </Badge>
                            </div>

                            {/* Timestamp at bottom */}
                            <div className="flex items-center gap-1 text-xs text-gray-500 pt-2 border-t border-gray-200">
                              <Clock className="h-3 w-3" />
                              <span>{formatTimestamp(q.timestamp)}</span>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Query Details Panel */}
          <div>
            {selectedQuery ? (
              <Card className="border-primary/20 shadow-lg sticky top-24">
                <CardHeader className="pb-3 bg-gradient-to-r from-primary/5 to-primary/10 rounded-t-xl border-b border-primary/10">
                  <CardTitle className="text-lg font-bold text-black">Query Details</CardTitle>
                  <CardDescription className="text-sm text-muted-foreground mt-1">
                    Respond to student query
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  {/* Student Info */}
                  <div className="bg-primary/5 p-4 rounded-lg space-y-2">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-primary" />
                      <span className="font-semibold text-black">{selectedQuery.studentName}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Mail className="h-4 w-4" />
                      <span>{selectedQuery.studentEmail}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Hash className="h-4 w-4" />
                      <span>{selectedQuery.regNumber}</span>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <Badge variant="outline">{selectedQuery.department}</Badge>
                      <Badge variant="outline">{getCategoryDisplay(selectedQuery.category)}</Badge>
                      <Badge className={getPriorityColor(selectedQuery.priority)}>
                        {selectedQuery.priority} priority
                      </Badge>
                    </div>
                  </div>

                  {/* Subject */}
                  <div>
                    <h4 className="font-semibold text-black mb-2">Subject:</h4>
                    <p className="text-sm text-muted-foreground">{selectedQuery.subject}</p>
                  </div>

                  {/* Message */}
                  <div>
                    <h4 className="font-semibold text-black mb-2">Message:</h4>
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedQuery.message}</p>
                    </div>
                  </div>

                  {/* Admin Response */}
                  {selectedQuery.response && (
                    <div>
                      <h4 className="font-semibold text-black mb-2">Your Response:</h4>
                      <div className="bg-primary/10 p-3 rounded-lg border-l-4 border-primary">
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedQuery.response}</p>
                      </div>
                    </div>
                  )}                  {/* Reply Section */}
                  {selectedQuery.status !== 'resolved' ? (
                    <>
                      <div>
                        <h4 className="font-semibold text-black mb-2">Reply to Student:</h4>
                        <Textarea
                          placeholder="Type your response here..."
                          value={replyMessage}
                          onChange={(e) => setReplyMessage(e.target.value)}
                          rows={4}
                          className="border-primary/30 focus:border-primary resize-none"
                        />
                      </div>
                      <div className="flex gap-3 flex-col">
                        <Button 
                          onClick={() => handleReply(selectedQuery.id)}
                          className="w-full bg-blue-500 hover:bg-blue-600 text-white"
                        >
                          <MessageSquare className="h-4 w-4 mr-2" />
                          Send Reply & Keep Open
                        </Button>
                        <Button 
                          onClick={() => handleReplyAndResolve(selectedQuery.id)}
                          className="w-full bg-green-500 hover:bg-green-600 text-white"
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Send Reply & Resolve
                        </Button>
                      </div>
                      <div className="pt-2">
                        <Button 
                          onClick={() => deleteQuery(selectedQuery.id)} 
                          variant="outline"
                          className="w-full border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete Query
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-6">
                      <div className="flex flex-col items-center gap-2">
                        <div className="h-12 w-12 bg-green-100 rounded-full flex items-center justify-center">
                          <CheckCircle className="h-6 w-6 text-green-600" />
                        </div>
                        <p className="text-green-600 font-semibold">Query Resolved</p>
                        <p className="text-sm text-muted-foreground">This query has been marked as resolved</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className="border-primary/20 shadow-sm h-full flex items-center justify-center min-h-[600px]">
                <CardContent className="text-center py-16">
                  <MessageSquare className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground text-lg">Select a query to view details</p>
                  <p className="text-sm text-muted-foreground mt-2">Click on any query from the list to respond</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminQueries;
