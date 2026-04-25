import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BookOpen, Plus, Upload, Loader, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import axios from 'axios';
import { useToast } from '@/hooks/use-toast';
import { TeacherMaterialUpload } from '@/components/dashboard/TeacherMaterialUpload';

interface Course {
  _id: string;
  courseCode: string;
  courseTitle: string;
  creditHours?: number;
  description?: string;
  status?: string;
  materialCount?: number;
  vectorCount?: number;
  syllabusStatus?: 'complete' | 'incomplete' | 'pending';
}

export const TeacherCoursePage = () => {
  const { toast } = useToast();
  const [teacherId] = useState<string>(localStorage.getItem('userId') || '');
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [showUploadForm, setShowUploadForm] = useState(false);

  useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = async () => {
    try {
      setIsLoading(true);
      const response = await axios.get(
        `http://localhost:5000/api/courses?teacherId=${teacherId}`
      );
      if (response.data.success) {
        const coursesWithMaterials = await Promise.all(
          (response.data.courses || []).map(async (course: Course) => {
            try {
              // Fetch material count for this course
              const materialRes = await axios.get(
                `http://localhost:5000/api/courses/materials-list/${course._id}`
              );
              const materials = materialRes.data.materials || [];
              const vectorCount = materials.reduce((sum: number, m: any) => sum + (m.chromaChunkCount || m.pineconeChunkCount || 0), 0);
              const materialCount = materialRes.data.numberOfMaterials ?? materials.length;
              
              return {
                ...course,
                materialCount: materialCount,
                vectorCount: vectorCount,
                syllabusStatus: materialCount > 0 ? 'complete' : 'incomplete'
              };
            } catch (error) {
              return {
                ...course,
                materialCount: 0,
                vectorCount: 0,
                syllabusStatus: 'incomplete'
              };
            }
          })
        );
        setCourses(coursesWithMaterials);
        if (coursesWithMaterials?.length > 0) {
          setSelectedCourseId(coursesWithMaterials[0]._id);
        }
      }
    } catch (error: any) {
      toast({
        title: '❌ Error',
        description: 'Failed to fetch courses',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const selectedCourse = courses.find(c => c._id === selectedCourseId);

  const refreshCourseMaterials = async (courseId: string) => {
    try {
      // Fetch updated material count for this specific course
      const materialRes = await axios.get(
        `http://localhost:5000/api/courses/materials-list/${courseId}`
      );
      const materials = materialRes.data.materials || [];
      const vectorCount = materials.reduce((sum: number, m: any) => sum + (m.chromaChunkCount || m.pineconeChunkCount || 0), 0);
      const materialCount = materialRes.data.numberOfMaterials ?? materials.length;
      
      // Update the course in state
      setCourses(prev => prev.map(c => 
        c._id === courseId 
          ? {
              ...c,
              materialCount: materialCount,
              vectorCount: vectorCount,
              syllabusStatus: materialCount > 0 ? 'complete' : 'incomplete'
            }
          : c
      ));
    } catch (error) {
      console.error('Error refreshing course materials:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-8">
        <div className="flex items-center gap-3 mb-2">
          <BookOpen className="h-8 w-8 text-blue-600" />
          <h1 className="text-3xl font-bold">My Courses</h1>
        </div>
        <p className="text-gray-600">Manage your courses and upload learning materials for auto-indexing</p>
      </div>

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Courses List */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Courses</CardTitle>
              <p className="text-xs text-gray-500 mt-1">{courses.length} course(s)</p>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader className="h-5 w-5 animate-spin text-gray-400" />
                </div>
              ) : courses.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-sm text-gray-500">No courses found</p>
                  <Button variant="outline" size="sm" className="mt-3 w-full">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Course
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {courses.map(course => (
                    <button
                      key={course._id}
                      onClick={() => setSelectedCourseId(course._id)}
                      className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                        selectedCourseId === course._id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="text-sm font-bold text-gray-900">{course.courseCode}</div>
                          <div className="text-xs text-gray-600 truncate">{course.courseTitle}</div>
                        </div>
                        {course.syllabusStatus === 'complete' ? (
                          <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                        )}
                      </div>
                      <div className="flex gap-2 text-xs">
                        {course.materialCount ? (
                          <>
                            <Badge variant="secondary" className="text-xs">
                              <FileText className="h-3 w-3 mr-1" />
                              {course.materialCount} file(s)
                            </Badge>
                            <Badge variant="secondary" className="text-xs bg-indigo-100 text-indigo-800">
                              📊 {course.vectorCount || 0} vectors
                            </Badge>
                          </>
                        ) : (
                          <Badge variant="outline" className="text-xs">No materials</Badge>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Course Details & Upload */}
        <div className="lg:col-span-2 space-y-6">
          {selectedCourse ? (
            <>
              {/* Course Info */}
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-2xl">{selectedCourse.courseCode}</CardTitle>
                      <CardDescription>{selectedCourse.courseTitle}</CardDescription>
                    </div>
                    <Badge variant="outline">{selectedCourse.status || 'Active'}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {selectedCourse.creditHours && (
                    <div>
                      <label className="text-xs font-medium text-gray-600">Credits</label>
                      <p className="text-sm">{selectedCourse.creditHours}</p>
                    </div>
                  )}
                  {selectedCourse.description && (
                    <div>
                      <label className="text-xs font-medium text-gray-600">Description</label>
                      <p className="text-sm text-gray-700">{selectedCourse.description}</p>
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-medium text-gray-600">Course ID</label>
                    <p className="text-xs font-mono text-gray-600">{selectedCourse._id}</p>
                  </div>
                </CardContent>
              </Card>

              {/* Materials Dashboard */}
              <Card className="border-2">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-blue-600" />
                      <CardTitle className="text-lg">Course Materials</CardTitle>
                    </div>
                    {selectedCourse.syllabusStatus === 'complete' ? (
                      <Badge className="bg-green-600">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Complete
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-amber-600 text-amber-600">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Incomplete
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Materials Stats */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg">
                      <div className="text-xs font-medium text-blue-600 mb-1">Number of Materials</div>
                      <div className="text-3xl font-bold text-blue-900">{selectedCourse.materialCount || 0}</div>
                      <div className="text-xs text-blue-700 mt-2">
                        {selectedCourse.materialCount ? '✓ Materials ready' : '⊘ No materials yet'}
                      </div>
                    </div>
                    <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 p-4 rounded-lg">
                      <div className="text-xs font-medium text-indigo-600 mb-1">Indexed Vectors</div>
                      <div className="text-3xl font-bold text-indigo-900">{selectedCourse.vectorCount || 0}</div>
                      <div className="text-xs text-indigo-700 mt-2">
                        {selectedCourse.vectorCount ? '✓ Searchable' : '⊘ Pending indexing'}
                      </div>
                    </div>
                  </div>

                  {/* Syllabus Status */}
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <div className="text-sm font-medium text-gray-900 mb-2">Syllabus Status</div>
                    <div className="space-y-2">
                      {selectedCourse.materialCount && selectedCourse.materialCount > 0 ? (
                        <>
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span className="text-gray-700">
                              Syllabus materials uploaded and indexed
                            </span>
                          </div>
                          <div className="text-xs text-gray-600">
                            Your course materials are ready for auto-marking and semantic search.
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 text-sm">
                            <AlertCircle className="h-4 w-4 text-amber-600" />
                            <span className="text-gray-700">
                              Upload course materials to complete syllabus
                            </span>
                          </div>
                          <div className="text-xs text-gray-600">
                            Drag & drop or click to upload PDFs, slides, or study materials.
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Upload Material Form */}
              {showUploadForm ? (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Upload Course Material</CardTitle>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => {
                        setShowUploadForm(false);
                        // Refresh courses after upload
                        fetchCourses();
                      }}
                    >
                      ✕
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <TeacherMaterialUpload 
                      teacherId={teacherId}
                      courses={courses}
                      onUploadComplete={() => {
                        setShowUploadForm(false);
                        refreshCourseMaterials(selectedCourseId);
                      }}
                    />
                  </CardContent>
                </Card>
              ) : (
                <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
                  <CardContent className="pt-6">
                    <div className="text-center space-y-4">
                      <Upload className="h-12 w-12 mx-auto text-blue-600 opacity-50" />
                      <div>
                        <h3 className="font-semibold text-gray-900">Ready to Upload Materials?</h3>
                        <p className="text-sm text-gray-600 mt-1">
                          Upload course slides, books, or materials. They'll be automatically extracted, indexed, and ready for auto-marking.
                        </p>
                      </div>
                      <Button 
                        onClick={() => setShowUploadForm(true)}
                        className="bg-blue-600 hover:bg-blue-700 w-full"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        Upload Materials
                      </Button>
                      <p className="text-xs text-gray-500">
                        📄 Supports PDF, PPTX • Max 50MB
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-gray-500">Select a course to begin</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default TeacherCoursePage;
