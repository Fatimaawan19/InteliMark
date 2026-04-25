import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Brain, ArrowLeft, CheckCircle, AlertTriangle, XCircle, Shield, Users, Clock, Activity, Lock, Unlock, Trash2, UserX } from 'lucide-react';
import { db } from '../../firebase';
import { collection, doc, onSnapshot, updateDoc, addDoc, query, orderBy, limit, setDoc, getDoc, deleteDoc, getDocs, where, Timestamp } from 'firebase/firestore';

interface SecuritySettings {
  twoFactorAuth: boolean;
  passwordPolicy: boolean;
  sessionTimeout: boolean;
  ipWhitelisting: boolean;
  sessionTimeoutMinutes: number;
}

interface SecurityEvent {
  id: string;
  type: 'success' | 'warning' | 'error';
  title: string;
  description: string;
  timestamp: any;
  userId?: string;
  ipAddress?: string;
}

interface ActiveSession {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: 'student' | 'teacher';
  ipAddress: string;
  device: string;
  loginTime: any;
  lastActivity: any;
  isOnline: boolean;
}

interface UserActivity {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: 'student' | 'teacher' | 'admin';
  lastLogin: any;
  lastActive: any;
  firstSignupTime: any;
  loginAttempts: number;
  accountStatus: 'active' | 'blocked' | 'suspended';
  failedAttempts: number;
  lastFailedAttempt: any;
  ipAddress: string;
  isOnline: boolean;
}

const AdminSecurity: React.FC = () => {
  const navigate = useNavigate();
  
  const [securitySettings, setSecuritySettings] = useState<SecuritySettings>({
    twoFactorAuth: false,
    passwordPolicy: true,
    sessionTimeout: true,
    ipWhitelisting: false,
    sessionTimeoutMinutes: 30
  });
  
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [userActivities, setUserActivities] = useState<UserActivity[]>([]);
  const [filterRole, setFilterRole] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeNow: 0,
    failedLogins: 0,
    blockedAccounts: 0
  });

  useEffect(() => {
    const loadSettings = async () => {
      const settingsRef = doc(db, 'systemSettings', 'security');
      const settingsDoc = await getDoc(settingsRef);
      
      if (settingsDoc.exists()) {
        setSecuritySettings(settingsDoc.data() as SecuritySettings);
      } else {
        await setDoc(settingsRef, securitySettings);
      }

      const unsubscribe = onSnapshot(settingsRef, (doc) => {
        if (doc.exists()) {
          setSecuritySettings(doc.data() as SecuritySettings);
        }
      });

      return () => unsubscribe();
    };

    loadSettings();
  }, []);

  useEffect(() => {
    const eventsRef = collection(db, 'securityEvents');
    const q = query(eventsRef, orderBy('timestamp', 'desc'), limit(50));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const events = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as SecurityEvent));
      setSecurityEvents(events);

      const failedCount = events.filter(e => 
        e.type === 'error' && 
        e.title.includes('Failed login')
      ).length;
      
      setStats(prev => ({ ...prev, failedLogins: failedCount }));
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const sessionsRef = collection(db, 'activeSessions');
    
    const unsubscribe = onSnapshot(sessionsRef, (snapshot) => {
      const sessions = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as ActiveSession));
      setActiveSessions(sessions);
      setStats(prev => ({ ...prev, activeNow: sessions.length }));
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const usersRef = collection(db, 'users');
    
    const unsubscribe = onSnapshot(usersRef, (snapshot) => {
      const users = snapshot.docs.map(doc => ({
        id: doc.id,
        userId: doc.id,
        userName: doc.data().name || 'Unknown',
        userEmail: doc.data().email,
        userRole: doc.data().role,
        lastLogin: doc.data().lastLogin,
        lastActive: doc.data().lastActive || doc.data().lastLogin,
        firstSignupTime: doc.data().firstSignupTime || doc.data().lastLogin,
        loginAttempts: doc.data().loginAttempts || 0,
        accountStatus: doc.data().accountStatus || 'active',
        failedAttempts: doc.data().failedAttempts || 0,
        lastFailedAttempt: doc.data().lastFailedAttempt,
        ipAddress: doc.data().lastIpAddress || 'N/A',
        isOnline: doc.data().isOnline !== false // Default to true if not set
      } as UserActivity));
      
      const nonAdminUsers = users.filter(u => u.userRole !== 'admin');
      setUserActivities(nonAdminUsers);
      
      const totalUsers = nonAdminUsers.length;
      const blockedAccounts = nonAdminUsers.filter(u => u.accountStatus === 'blocked').length;
      
      // Calculate "Active Now" - users who were active within last 30 minutes
      const now = new Date().getTime();
      const thirtyMinutesAgo = now - (30 * 60 * 1000);
      const activeNow = nonAdminUsers.filter(u => {
        if (!u.lastActive) return false;
        let activeTime: Date;
        if (u.lastActive.toDate) {
          activeTime = u.lastActive.toDate();
        } else if (u.lastActive instanceof Date) {
          activeTime = u.lastActive;
        } else if (typeof u.lastActive === 'string') {
          activeTime = new Date(u.lastActive);
        } else {
          return false;
        }
        return activeTime.getTime() > thirtyMinutesAgo;
      }).length;
      
      setStats(prev => ({ 
        ...prev, 
        totalUsers,
        blockedAccounts,
        activeNow
      }));
    });

    return () => unsubscribe();
  }, []);
  const blockUser = async (userId: string, userName: string) => {
    if (!confirm(`Block account for ${userName}? They won't be able to log in.`)) return;

    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        accountStatus: 'blocked',
        blockedAt: new Date().toISOString(),
        blockedBy: 'admin',
        blockedReason: 'Manually blocked by admin'
      });

      await addDoc(collection(db, 'securityEvents'), {
        type: 'warning',
        title: 'Account blocked',
        description: `Admin blocked account for ${userName}`,
        timestamp: new Date(),
        userId: userId
      });

      alert(`${userName}'s account has been blocked`);
    } catch (error) {
      console.error('Error blocking user:', error);
      alert('Failed to block user');
    }
  };
  const unblockUser = async (userId: string, userName: string) => {
    if (!confirm(`Unblock account for ${userName}? This will reset all failed login attempts and restore full access.`)) return;

    try {
      console.log(`Unblocking user: ${userName} (${userId})`);
      
      const userRef = doc(db, 'users', userId);
      
      // Clear ALL blocking-related fields explicitly
      await updateDoc(userRef, {
        accountStatus: 'active',
        isBlocked: false,
        failedAttempts: 0,
        failedLoginAttempts: 0,
        blockedAt: null,
        blockedReason: null,
        blockedBy: null,
        unblockedAt: new Date().toISOString(),
        unblockedBy: 'admin'
      });

      console.log(`User ${userName} unblocked in Firestore`);

      // Create security event
      await addDoc(collection(db, 'securityEvents'), {
        type: 'success',
        title: 'Account unblocked',
        description: `Admin unblocked account for ${userName}. All login attempts reset.`,
        timestamp: new Date(),
        userId: userId
      });

      alert(`✅ ${userName}'s account has been successfully unblocked!\n\nAll failed login attempts have been reset.\nUser can now login normally.`);
      
    } catch (error) {
      console.error('Error unblocking user:', error);
      alert('❌ Failed to unblock user. Please try again or check console for errors.');
    }
  };

  const deleteUserPermanently = async (userId: string, userName: string) => {
    const confirmation = confirm(
      `⚠️ PERMANENT DELETE WARNING ⚠️\n\nAre you absolutely sure you want to permanently delete ${userName}?\n\nThis will:\n- Delete all user data from Firebase\n- Remove all their submissions\n- Cannot be undone\n\nType "DELETE" to confirm.`
    );

    if (!confirmation) return;

    const finalConfirm = prompt('Type "DELETE" to confirm permanent deletion:');
    if (finalConfirm !== 'DELETE') {
      alert('Deletion cancelled');
      return;
    }

    try {
      const userRef = doc(db, 'users', userId);
      await deleteDoc(userRef);

      const queriesRef = collection(db, 'queries');
      const q = query(queriesRef, where('studentId', '==', userId));
      const querySnapshot = await getDocs(q);
      const deletePromises = querySnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);

      await addDoc(collection(db, 'securityEvents'), {
        type: 'error',
        title: 'User permanently deleted',
        description: `Admin permanently deleted ${userName} (${userId})`,
        timestamp: new Date(),
        userId: userId
      });

      alert(`${userName}'s account and all data have been permanently deleted`);
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('Failed to delete user');
    }
  };  const filteredUsers = userActivities.filter(user => {
    const matchesSearch = 
      user.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.userEmail.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesRole = filterRole === 'all' || user.userRole === filterRole;
    
    // For status filter, check both account status and online status
    let matchesStatus = true;
    if (filterStatus !== 'all') {
      const isAccountActive = user.accountStatus !== 'blocked';
      
      if (filterStatus === 'active') {
        // Show only accounts that are both active account AND online (isOnline = true)
        matchesStatus = isAccountActive && user.isOnline;
      } else if (filterStatus === 'blocked') {
        // Show only blocked accounts
        matchesStatus = user.accountStatus === 'blocked';
      }
    }
    
    return matchesSearch && matchesRole && matchesStatus;
  }).sort((a, b) => {
    // Helper function to check if user is actually active (online AND within 30 minutes)
    const isUserActuallyActive = (user: UserActivity) => {
      if (!user.isOnline) return false;
      const now = new Date().getTime();
      const thirtyMinutesAgo = now - (30 * 60 * 1000);
      let activeTime: number;
      
      if (user.lastActive?.toDate) {
        activeTime = user.lastActive.toDate().getTime();
      } else if (user.lastActive instanceof Date) {
        activeTime = user.lastActive.getTime();
      } else if (typeof user.lastActive === 'string') {
        activeTime = new Date(user.lastActive).getTime();
      } else {
        return false;
      }
      
      return activeTime > thirtyMinutesAgo;
    };
    
    const aIsActive = isUserActuallyActive(a);
    const bIsActive = isUserActuallyActive(b);
    
    // 1. Active users come first (with green border)
    if (aIsActive && !bIsActive) return -1;
    if (!aIsActive && bIsActive) return 1;
    
    // 2. Then blocked users
    if (a.accountStatus === 'blocked' && b.accountStatus !== 'blocked') return -1;
    if (a.accountStatus !== 'blocked' && b.accountStatus === 'blocked') return 1;
    
    // 3. Sort by last active time - most recent first (less time ago = higher priority)
    const getActiveTime = (date: any) => {
      if (!date) return Infinity;
      if (date.toDate) return date.toDate().getTime();
      if (date instanceof Date) return date.getTime();
      if (typeof date === 'string') return new Date(date).getTime();
      return Infinity;
    };
    
    const timeA = getActiveTime(a.lastActive);
    const timeB = getActiveTime(b.lastActive);
    return timeB - timeA; // Most recent first (larger timestamp first)
  });

  const handleToggleSetting = async (setting: keyof SecuritySettings) => {
    const newValue = !securitySettings[setting];
    
    try {
      const settingsRef = doc(db, 'systemSettings', 'security');
      await updateDoc(settingsRef, {
        [setting]: newValue
      });

      await addDoc(collection(db, 'securityEvents'), {
        type: 'success',
        title: `${setting} ${newValue ? 'enabled' : 'disabled'}`,
        description: `Security setting updated by admin`,
        timestamp: new Date(),
        ipAddress: 'Admin Panel'
      });

      // Generate notification message based on setting
      let notificationMessage = '';
      let notificationTitle = '';

      if (setting === 'twoFactorAuth') {
        notificationTitle = 'Two-Factor Authentication Update';
        notificationMessage = newValue 
          ? '🔐 Two-Factor Authentication (2FA) has been enabled by admin. You will need to set up 2FA on your next login for enhanced security.'
          : '🔐 Two-Factor Authentication (2FA) has been disabled by admin.';
      } else if (setting === 'passwordPolicy') {
        notificationTitle = 'Password Policy Update';
        notificationMessage = newValue
          ? '🔒 Strong Password Policy has been enabled by admin. Your password must meet specific security requirements.'
          : '🔒 Strong Password Policy has been disabled by admin.';
      } else if (setting === 'sessionTimeout') {
        notificationTitle = 'Session Timeout Update';
        notificationMessage = newValue
          ? `⏱️ Session Timeout has been enabled by admin. Your session will expire after ${securitySettings.sessionTimeoutMinutes} minutes of inactivity for security purposes.`
          : '⏱️ Session Timeout has been disabled by admin.';
      } else if (setting === 'ipWhitelisting') {
        notificationTitle = 'IP Whitelisting Update';
        notificationMessage = newValue
          ? '🌐 IP Whitelisting has been enabled by admin. You can only access the system from whitelisted IP addresses.'
          : '🌐 IP Whitelisting has been disabled by admin.';
      }

      // Send notifications to students and teachers
      if (notificationMessage) {
        // Create one notification for all students
        await addDoc(collection(db, 'notifications'), {
          title: notificationTitle,
          message: notificationMessage,
          read: false,
          timestamp: Timestamp.now(),
          createdAt: Timestamp.now(),
          recipientRole: 'student',
          type: 'warning'
        });

        // Create one notification for all teachers
        await addDoc(collection(db, 'notifications'), {
          title: notificationTitle,
          message: notificationMessage,
          read: false,
          timestamp: Timestamp.now(),
          createdAt: Timestamp.now(),
          recipientRole: 'teacher',
          type: 'warning'
        });
      }

      alert(`${setting} ${newValue ? 'enabled' : 'disabled'} successfully!`);
    } catch (error) {
      console.error('Error updating security setting:', error);
      alert('Failed to update setting');
    }
  };

  const terminateSession = async (sessionId: string, userName: string) => {
    if (!confirm(`Terminate session for ${userName}?`)) return;

    try {
      const sessionRef = doc(db, 'activeSessions', sessionId);
      await deleteDoc(sessionRef);

      await addDoc(collection(db, 'securityEvents'), {
        type: 'warning',
        title: 'Session terminated',
        description: `Admin terminated session for ${userName}`,
        timestamp: new Date()
      });

      alert('Session terminated successfully');
    } catch (error) {
      console.error('Error terminating session:', error);
      alert('Failed to terminate session');
    }
  };
  const formatTimestamp = (timestamp: any) => {
    if (!timestamp) return 'Just now';
    
    let date: Date;
    if (timestamp.toDate) {
      date = timestamp.toDate();
    } else if (timestamp instanceof Date) {
      date = timestamp;
    } else if (typeof timestamp === 'string') {
      date = new Date(timestamp);
    } else {
      return 'Just now';
    }
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };  const getStatusBadge = (status: string, isOnline: boolean, lastActive: any) => {
    // If user is blocked, always show blocked status
    if (status === 'blocked') return 'bg-red-100 text-red-700';
    
    // Check if user is actively using the portal (online AND active within last 30 minutes)
    const isActuallyActive = isOnline && (() => {
      const now = new Date().getTime();
      const thirtyMinutesAgo = now - (30 * 60 * 1000);
      let activeTime: number;
      
      if (lastActive?.toDate) {
        activeTime = lastActive.toDate().getTime();
      } else if (lastActive instanceof Date) {
        activeTime = lastActive.getTime();
      } else if (typeof lastActive === 'string') {
        activeTime = new Date(lastActive).getTime();
      } else {
        return false;
      }
      
      return activeTime > thirtyMinutesAgo;
    })();
    
    // If user is actually active right now, show as active (green)
    if (isActuallyActive) return 'bg-green-100 text-green-700';
    
    // If user is offline, show as offline (gray)
    return 'bg-gray-100 text-gray-600';
  };

  const getStatusText = (status: string, isOnline: boolean, lastActive: any) => {
    if (status === 'blocked') return 'blocked';
    
    // Check if user is actively using the portal (online AND active within last 30 minutes)
    const isActuallyActive = isOnline && (() => {
      const now = new Date().getTime();
      const thirtyMinutesAgo = now - (30 * 60 * 1000);
      let activeTime: number;
      
      if (lastActive?.toDate) {
        activeTime = lastActive.toDate().getTime();
      } else if (lastActive instanceof Date) {
        activeTime = lastActive.getTime();
      } else if (typeof lastActive === 'string') {
        activeTime = new Date(lastActive).getTime();
      } else {
        return false;
      }
      
      return activeTime > thirtyMinutesAgo;
    })();
    
    if (isActuallyActive) return 'active';
    return 'offline';
  };

  const getCardBorderClass = (status: string, isOnline: boolean, lastActive: any) => {
    // Blocked users get red border - most prominent
    if (status === 'blocked') return 'border-red-400 border-2 bg-red-50/30';
    
    // Check if user is actively using the portal (online AND active within last 30 minutes)
    const isActuallyActive = isOnline && (() => {
      const now = new Date().getTime();
      const thirtyMinutesAgo = now - (30 * 60 * 1000);
      let activeTime: number;
      
      if (lastActive?.toDate) {
        activeTime = lastActive.toDate().getTime();
      } else if (lastActive instanceof Date) {
        activeTime = lastActive.getTime();
      } else if (typeof lastActive === 'string') {
        activeTime = new Date(lastActive).getTime();
      } else {
        return false;
      }
      
      return activeTime > thirtyMinutesAgo;
    })();
    
    // Only show green border for users that are actually actively using the portal
    if (isActuallyActive && status === 'active') return 'border-green-300 border-2';
    
    // All other users get gray border
    return 'border-primary/10';
  };

  return (
    <div className="min-h-screen bg-secondary/20">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white shadow-md border-b border-primary/10">
        <div className="w-full px-4 md:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
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
              <h2 className="text-lg font-semibold text-gray-800">Security & Activity Monitor</h2>
              <p className="text-xs text-gray-600">Monitor and manage system security</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="border-primary/20 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Users</p>
                  <h3 className="text-2xl font-bold text-black">{stats.totalUsers}</h3>
                </div>
                <Users className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-green-200 shadow-sm bg-green-50/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-green-600">Active Now</p>
                  <h3 className="text-2xl font-bold text-green-700">{stats.activeNow}</h3>
                </div>
                <Activity className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-red-200 shadow-sm bg-red-50/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-red-600">Failed Logins</p>
                  <h3 className="text-2xl font-bold text-red-700">{stats.failedLogins}</h3>
                </div>
                <AlertTriangle className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-yellow-200 shadow-sm bg-yellow-50/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-yellow-600">Blocked Accounts</p>
                  <h3 className="text-2xl font-bold text-yellow-700">{stats.blockedAccounts}</h3>
                </div>
                <XCircle className="h-8 w-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Security Settings */}
          <Card className="border-primary/20 shadow-sm">
            <CardHeader className="pb-3 bg-gradient-to-r from-primary/5 to-primary/10 rounded-t-xl border-b border-primary/10">
              <CardTitle className="text-lg font-bold text-black flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Security Settings
              </CardTitle>
              <CardDescription>Configure system security (affects students & teachers only)</CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors">
                <div>
                  <p className="font-semibold text-black">Two-Factor Authentication</p>
                  <p className="text-sm text-muted-foreground">Require 2FA for students & teachers</p>
                </div>
                <Switch
                  checked={securitySettings.twoFactorAuth}
                  onCheckedChange={() => handleToggleSetting('twoFactorAuth')}
                />
              </div>

              <div className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors">
                <div>
                  <p className="font-semibold text-black">Strong Password Policy</p>
                  <p className="text-sm text-muted-foreground">Enforce password requirements</p>
                </div>
                <Switch
                  checked={securitySettings.passwordPolicy}
                  onCheckedChange={() => handleToggleSetting('passwordPolicy')}
                />
              </div>

              <div className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors">
                <div>
                  <p className="font-semibold text-black">Session Timeout</p>
                  <p className="text-sm text-muted-foreground">Auto-logout after {securitySettings.sessionTimeoutMinutes} minutes</p>
                </div>
                <Switch
                  checked={securitySettings.sessionTimeout}
                  onCheckedChange={() => handleToggleSetting('sessionTimeout')}
                />
              </div>

              <div className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors">
                <div>
                  <p className="font-semibold text-black">IP Whitelisting</p>
                  <p className="text-sm text-muted-foreground">Restrict access by IP address</p>
                </div>
                <Switch
                  checked={securitySettings.ipWhitelisting}
                  onCheckedChange={() => handleToggleSetting('ipWhitelisting')}
                />
              </div>
            </CardContent>
          </Card>

          {/* Recent Security Events */}
          <Card className="border-primary/20 shadow-sm">
            <CardHeader className="pb-3 bg-gradient-to-r from-primary/5 to-primary/10 rounded-t-xl border-b border-primary/10">
              <CardTitle className="text-lg font-bold text-black flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Recent Security Events
              </CardTitle>
              <CardDescription>Last 10 security events</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <ScrollArea className="h-[300px]">
                {securityEvents.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No recent events</p>
                ) : (
                  <div className="space-y-3">                    {securityEvents.slice(0, 10).map(event => (
                      <div key={event.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                        {event.type === 'success' && <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />}
                        {event.type === 'warning' && <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />}
                        {event.type === 'error' && <XCircle className="h-5 w-5 text-red-500 mt-0.5" />}
                        <div className="flex-1">
                          <div className="flex items-start justify-between">
                            <p className="text-sm font-semibold text-black">{event.title}</p>
                            <p className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                              {event.timestamp?.toDate ? 
                                event.timestamp.toDate().toLocaleString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit'
                                }) : 
                                formatTimestamp(event.timestamp)
                              }
                            </p>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{event.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* User Activity Monitor */}
        <Card className="border-primary/20 shadow-lg">
          <CardHeader className="pb-3 bg-gradient-to-r from-primary/5 to-primary/10 rounded-t-xl border-b border-primary/10">
            <CardTitle className="text-lg font-bold text-black flex items-center gap-2">
              <Users className="h-5 w-5" />
              User Activity Monitor
            </CardTitle>
            <CardDescription>Track user sessions and manage accounts (Admin excluded)</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <div className="md:col-span-2">
                <Input
                  placeholder="Search by name or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="border-primary/30"
                />
              </div>
              <Select value={filterRole} onValueChange={setFilterRole}>
                <SelectTrigger className="border-primary/30">
                  <SelectValue placeholder="Filter by Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="student">Students</SelectItem>
                  <SelectItem value="teacher">Teachers</SelectItem>
                </SelectContent>
              </Select>              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="border-primary/30">
                  <SelectValue placeholder="Filter by Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="blocked">Blocked</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* User Activity Table */}            <ScrollArea className="h-[500px]">
              {filteredUsers.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No users found</p>
              ) : (
                <div className="space-y-3 pr-4">
                  {filteredUsers.map(user => (
                    <Card key={user.id} className={`${getCardBorderClass(user.accountStatus, user.isOnline, user.lastActive)} hover:shadow-md transition-all`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="font-semibold text-black">{user.userName}</h4>
                              <Badge variant="outline" className="text-xs">
                                {user.userRole}
                              </Badge>
                              <Badge className={getStatusBadge(user.accountStatus, user.isOnline, user.lastActive)}>
                                {getStatusText(user.accountStatus, user.isOnline, user.lastActive)}
                              </Badge>
                              {user.failedAttempts >= 3 && (
                                <Badge className="bg-red-100 text-red-700">
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  {user.failedAttempts} failed attempts
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">{user.userEmail}</p>
                            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Last active: {user.lastActive ? formatTimestamp(user.lastActive) : 'Never'}
                              </span>
                              <span>IP: {user.ipAddress}</span>
                            </div>
                          </div>

                          <div className="flex gap-2">
                            {user.accountStatus === 'blocked' ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-green-300 text-green-700 hover:bg-green-600 hover:text-white hover:border-green-600"
                                onClick={() => unblockUser(user.userId, user.userName)}
                              >
                                <Unlock className="h-4 w-4 mr-1" />
                                Unblock
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-yellow-600 text-yellow-700 hover:bg-yellow-700 hover:text-white hover:border-yellow-700"
                                onClick={() => blockUser(user.userId, user.userName)}
                              >
                                <Lock className="h-4 w-4 mr-1" />
                                Block
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-red-300 text-red-700 hover:bg-red-600 hover:text-white hover:border-red-600"
                              onClick={() => deleteUserPermanently(user.userId, user.userName)}
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              Delete
                            </Button>
                          </div>
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
    </div>
  );
};

export default AdminSecurity;
