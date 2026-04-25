import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { chatAPI } from "../../api/chatAPI";
import { 
  Bot, 
  Send, 
  User,
  Sparkles,
  ChevronLeft,
  Paperclip,
  Mic,
  MoreVertical,
  Clock,
  BookOpen,
  FileText,
  Calendar,
  HelpCircle
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

const Chatbot = () => {
  const navigate = useNavigate();
  const [message, setMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const messages = [
    {
      id: 1,
      type: "bot",
      message: "Hello Hadia! I'm IntelliMark AI Assistant. How can I help you today?",
      time: "10:00 AM",
      suggestions: ["Check deadlines", "View grades", "Get study tips", "Assignment help"]
    },
    {
      id: 2,
      type: "user",
      message: "What are my upcoming assignments?",
      time: "10:01 AM"
    },
    {
      id: 3,
      type: "bot",
      message: "You have 3 upcoming assignments:",
      time: "10:01 AM",
      attachments: [
        { title: "Machine Learning Assignment 3", due: "March 25", course: "CS-401" },
        { title: "Data Structures Quiz 2", due: "March 23", course: "CS-301" },
        { title: "Database Design Project", due: "March 28", course: "CS-302" }
      ]
    },
    {
      id: 4,
      type: "user",
      message: "Can you help me understand bubble sort complexity?",
      time: "10:02 AM"
    },
    {
      id: 5,
      type: "bot",
      message: "Of course! Bubble sort has a time complexity of O(n²) in both average and worst cases. Here's why:\n\n• It uses nested loops to compare adjacent elements\n• Outer loop runs n times\n• Inner loop runs n-1, n-2, ... 1 times\n• Total comparisons: n(n-1)/2 = O(n²)\n\nBest case is O(n) when the array is already sorted. Would you like to see a code example?",
      time: "10:02 AM",
      code: true
    }
  ];

  const quickActions = [
    { icon: Clock, label: "Deadlines", color: "text-warning" },
    { icon: BookOpen, label: "Courses", color: "text-primary" },
    { icon: FileText, label: "Grades", color: "text-success" },
    { icon: Calendar, label: "Schedule", color: "text-info" }
  ];

  const handleSendMessage = () => {
    if (message.trim()) {
      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
      }, 1500);
      setMessage("");
    }
  };

  return (
    <div className="min-h-screen bg-secondary/20">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => navigate(-1)}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Bot className="h-8 w-8 text-primary" />
                  <span className="absolute -bottom-1 -right-1 h-3 w-3 bg-success rounded-full border-2 border-background" />
                </div>
                <div>
                  <h1 className="text-xl font-bold">IntelliMark Assistant</h1>
                  <p className="text-xs text-muted-foreground">Always here to help</p>
                </div>
              </div>
            </div>
            <Button variant="ghost" size="icon">
              <MoreVertical className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Chat Interface */}
      <main className="container mx-auto px-6 py-8 max-w-5xl">
        <div className="grid lg:grid-cols-4 gap-6">
          {/* Chat Area */}
          <div className="lg:col-span-3">
            <Card className="h-[600px] flex flex-col bg-gradient-to-br from-background via-primary/5 to-secondary/10">
              <CardHeader className="border-b">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>AI Chat Assistant</CardTitle>
                    <CardDescription>Get instant help with assignments, grades, and more</CardDescription>
                  </div>
                  <Badge variant="success" className="animate-pulse">
                    <Sparkles className="h-3 w-3 mr-1" />
                    AI Powered
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex-1 p-0">
                <ScrollArea className="h-full p-4">
                  <div className="space-y-4">
                    {messages.map((msg) => (
                      <div key={msg.id} className={`flex gap-3 ${msg.type === 'user' ? 'justify-end' : ''}`}>
                        {msg.type === 'bot' && (
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-gradient-primary text-primary-foreground">
                              <Bot className="h-4 w-4" />
                            </AvatarFallback>
                          </Avatar>
                        )}
                        <div className={`max-w-[70%] ${msg.type === 'user' ? 'order-first' : ''}`}>
                          <div 
                            className={`p-3 rounded-lg ${
                              msg.type === 'user' 
                                ? 'bg-primary text-primary-foreground ml-auto' 
                                : 'bg-muted'
                            }`}
                          >
                            <p className="text-sm whitespace-pre-line">{msg.message}</p>
                            
                            {msg.attachments && (
                              <div className="mt-3 space-y-2">
                                {msg.attachments.map((attachment, idx) => (
                                  <div key={idx} className="p-2 bg-background/50 rounded border">
                                    <div className="flex items-center justify-between">
                                      <div>
                                        <p className="text-xs font-medium">{attachment.title}</p>
                                        <p className="text-xs text-muted-foreground">
                                          {attachment.course} • Due: {attachment.due}
                                        </p>
                                      </div>
                                      <FileText className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {msg.code && (
                              <Button 
                                size="sm" 
                                variant={msg.type === 'user' ? 'secondary' : 'outline'}
                                className="mt-2"
                              >
                                View Code Example
                              </Button>
                            )}
                          </div>
                          
                          {msg.suggestions && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {msg.suggestions.map((suggestion, idx) => (
                                <Button
                                  key={idx}
                                  size="sm"
                                  variant="outline"
                                  className="text-xs"
                                >
                                  {suggestion}
                                </Button>
                              ))}
                            </div>
                          )}
                          
                          <p className="text-xs text-muted-foreground mt-1">{msg.time}</p>
                        </div>
                        {msg.type === 'user' && (
                          <Avatar className="h-8 w-8">
                            <AvatarFallback>
                              <User className="h-4 w-4" />
                            </AvatarFallback>
                          </Avatar>
                        )}
                      </div>
                    ))}
                    
                    {isTyping && (
                      <div className="flex gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-gradient-primary text-primary-foreground">
                            <Bot className="h-4 w-4" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="bg-muted p-3 rounded-lg">
                          <div className="flex gap-1">
                            <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
              <div className="p-4 border-t">
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon">
                    <Paperclip className="h-5 w-5" />
                  </Button>
                  <Input
                    placeholder="Type your message..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    className="flex-1"
                  />
                  <Button variant="ghost" size="icon">
                    <Mic className="h-5 w-5" />
                  </Button>
                  <Button 
                    onClick={handleSendMessage}
                    className="bg-gradient-primary text-primary-foreground hover:shadow-glow"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    className="justify-start"
                    size="sm"
                  >
                    <BookOpen className="h-4 w-4 mr-2 text-primary" />
                    Courses
                  </Button>
                  <Button
                    variant="outline"
                    className="justify-start"
                    size="sm"
                  >
                    <FileText className="h-4 w-4 mr-2 text-success" />
                    Grades
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Chatbot;