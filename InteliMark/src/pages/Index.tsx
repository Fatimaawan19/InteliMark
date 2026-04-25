import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, BookOpen, ChartBar, Shield, Sparkles, Zap, Users, FileText, Bot, Target, Clock, Award } from "lucide-react";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const navigate = useNavigate();

  const features = [
    {
      icon: Brain,
      title: "AI-Powered Grading",
      description: "Automated evaluation of text, code, MCQs, and graphical content using advanced NLP and ML models"
    },
    {
      icon: ChartBar,
      title: "Performance Analytics",
      description: "Real-time tracking with predictive insights and personalized learning recommendations"
    },
    {
      icon: Shield,
      title: "Plagiarism Detection",
      description: "Built-in detection for both textual and graphical content without third-party dependencies"
    },
    {
      icon: Bot,
      title: "AI Chatbot Assistant",
      description: "24/7 intelligent support for students' academic queries and deadline reminders"
    },
    {
      icon: Target,
      title: "Mistake Tracking",
      description: "Identify common errors and provide targeted improvement suggestions"
    },
    {
      icon: Zap,
      title: "Instant Feedback",
      description: "Immediate, domain-specific feedback to accelerate student learning"
    }
  ];

  const stats = [
    { value: "90%", label: "Time Saved", description: "In grading process" },
    { value: "24/7", label: "AI Support", description: "Always available" },
    { value: "100%", label: "Accuracy", description: "In MCQ grading" },
    { value: "5 sec", label: "Response Time", description: "Average grading speed" }
  ];

  return (
    <div className="min-h-screen bg-gradient-hero">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              IntelliMark
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate("/student-dashboard")}>
              Student Demo
            </Button>
            <Button variant="ghost" onClick={() => navigate("/teacher-dashboard")}>
              Teacher Demo
            </Button>
            <Button className="bg-gradient-primary text-primary-foreground hover:shadow-glow transition-all">
              Get Started
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="container mx-auto px-6 py-20">
        <div className="text-center max-w-4xl mx-auto animate-fade-up">
          <Badge className="mb-4 bg-primary/10 text-primary border-primary/20">
            <Sparkles className="h-3 w-3 mr-1" />
            AI-Powered Educational Platform
          </Badge>
          <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-primary bg-clip-text text-transparent">
            Transform Academic Assessment with AI
          </h1>
          <p className="text-xl text-muted-foreground mb-8">
            IntelliMark revolutionizes grading with intelligent automation, real-time analytics, 
            and personalized learning insights. Built for modern educational institutions.
          </p>
          <div className="flex gap-4 justify-center">
            <Button 
              size="lg" 
              className="bg-gradient-primary text-primary-foreground hover:shadow-glow transition-all"
              onClick={() => navigate("/student-dashboard")}
            >
              View Student Portal
            </Button>
            <Button 
              size="lg" 
              variant="outline"
              onClick={() => navigate("/teacher-dashboard")}
            >
              View Teacher Portal
            </Button>
          </div>
        </div>

        {/* Hero Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-20">
          {stats.map((stat, index) => (
            <Card key={index} className="p-6 text-center hover:shadow-lg transition-all animate-fade-up" style={{ animationDelay: `${index * 100}ms` }}>
              <div className="text-3xl font-bold text-primary">{stat.value}</div>
              <div className="text-lg font-semibold">{stat.label}</div>
              <div className="text-sm text-muted-foreground">{stat.description}</div>
            </Card>
          ))}
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-4">Powerful Features</h2>
          <p className="text-xl text-muted-foreground">Everything you need for modern academic assessment</p>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <Card 
              key={index} 
              className="p-6 hover:shadow-lg transition-all hover:-translate-y-1 animate-fade-up"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="flex items-start gap-4">
                <div className="p-3 bg-gradient-primary rounded-lg">
                  <feature.icon className="h-6 w-6 text-primary-foreground" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Module Showcase */}
      <section className="container mx-auto px-6 py-20 bg-gradient-card rounded-3xl">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="animate-fade-up">
            <h2 className="text-4xl font-bold mb-6">Comprehensive Module System</h2>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-primary" />
                <span>User & Account Management with role-based access</span>
              </div>
              <div className="flex items-center gap-3">
                <BookOpen className="h-5 w-5 text-primary" />
                <span>Course Management with automated enrollment</span>
              </div>
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-primary" />
                <span>Assignment & Quiz submission in multiple formats</span>
              </div>
              <div className="flex items-center gap-3">
                <Brain className="h-5 w-5 text-primary" />
                <span>Auto-marking with AI-powered evaluation</span>
              </div>
              <div className="flex items-center gap-3">
                <ChartBar className="h-5 w-5 text-primary" />
                <span>Performance visualization with predictive analytics</span>
              </div>
              <div className="flex items-center gap-3">
                <Target className="h-5 w-5 text-primary" />
                <span>Mistake tracking and focused improvement</span>
              </div>
            </div>
          </div>
          <div className="bg-gradient-primary rounded-2xl p-8 text-primary-foreground animate-float">
            <div className="text-center">
              <Award className="h-20 w-20 mx-auto mb-4" />
              <h3 className="text-2xl font-bold mb-4">Ready to Transform Education?</h3>
              <p className="mb-6">Join institutions already using IntelliMark to enhance learning outcomes</p>
              <Button 
                size="lg" 
                className="bg-white text-primary hover:bg-white/90"
                onClick={() => navigate("/ai-grading")}
              >
                See AI Grading Demo
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Technology Stack */}
      <section className="container mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-4">Powered by Cutting-Edge Technology</h2>
          <p className="text-xl text-muted-foreground">Built with modern frameworks and AI technologies</p>
        </div>
        <div className="flex flex-wrap justify-center gap-4">
          {["TensorFlow", "OpenCV", "Flask", "React", "Python", "NLP", "Machine Learning", "Docker"].map((tech) => (
            <Badge key={tech} variant="secondary" className="px-4 py-2 text-sm">
              {tech}
            </Badge>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-muted border-t py-12">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center gap-2 mb-4 md:mb-0">
              <Brain className="h-6 w-6 text-primary" />
              <span className="text-xl font-bold">IntelliMark</span>
            </div>
            <p className="text-muted-foreground">
              © 2024 IntelliMark - AI-Powered Academic Assessment Platform
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;