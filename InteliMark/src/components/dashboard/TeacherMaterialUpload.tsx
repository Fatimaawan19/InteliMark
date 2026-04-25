import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import axios from 'axios';
import { useToast } from '@/hooks/use-toast';

interface UploadedMaterial {
  id: string;
  originalFileName: string;
  processingStatus: 'extracted' | 'embedded' | 'queryable' | 'failed';
  pageCount?: number;
  charCount?: number;
  createdAt: string;
}

interface CourseOption {
  _id: string;
  courseCode: string;
  courseTitle: string;
}

export const TeacherMaterialUpload = ({ teacherId, courses = [], onUploadComplete }: { teacherId: string; courses?: CourseOption[]; onUploadComplete?: () => void }) => {
  const { toast } = useToast();
  const [selectedCourse, setSelectedCourse] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedMaterials, setUploadedMaterials] = useState<UploadedMaterial[]>([]);
  const [dragActive, setDragActive] = useState(false);

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const waitForPhase1Completion = async (materialId: string) => {
    const startedAt = Date.now();
    const timeoutMs = 5 * 60 * 1000; // 5 minutes
    const okIngestionStatuses = new Set(['completed', 'already_ingested', 'global_duplicate']);

    while (Date.now() - startedAt < timeoutMs) {
      const statusRes = await axios.get(
        `http://localhost:5000/api/courses/material/${materialId}/ingestion-status`
      );

      const material = statusRes.data?.material;
      const raw = statusRes.data?.raw;

      // extraction failed
      if (raw?.extractionStatus === 'failed' || material?.processingStatus === 'failed') {
        return { done: true, ok: false, material, raw };
      }

      const extractionDone = raw?.extractionStatus === 'completed';
      const ingestionDone = okIngestionStatuses.has(String(raw?.faissIngestionStatus || ''));
      const ingestionFailed = raw?.faissIngestionStatus === 'failed';

      if (extractionDone && ingestionDone) {
        return { done: true, ok: true, material, raw };
      }

      if (extractionDone && ingestionFailed) {
        return { done: true, ok: false, material, raw };
      }

      await sleep(2000);
    }

    return { done: false, ok: false };
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files?.[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file || !selectedCourse) {
      toast({
        title: '⚠️ Missing Information',
        description: 'Please select a course and choose a file to upload.',
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);

    try {
      const courseData = courses.find(c => c._id === selectedCourse);
      const formData = new FormData();
      formData.append('materialFile', file);
      // Ensure backend links the upload to the correct Mongo course document.
      formData.append('mongoCourseId', selectedCourse);
      formData.append('courseCode', courseData?.courseCode || 'UNKNOWN');
      // Backend expects `courseName` for fallback course creation/metadata.
      formData.append('courseName', courseData?.courseTitle || 'Unknown Course');
      formData.append('teacherId', teacherId);
      formData.append('enableOcr', 'true');

      const response = await axios.post(
        'http://localhost:5000/api/courses/upload-material',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      if (response.data.isDuplicate) {
        // ✅ DUPLICATE UPLOAD MESSAGE
        toast({
          title: '⚠️ Duplicate Upload',
          description: response.data.message || 'The slide is already uploaded',
          variant: 'default',
          duration: 5000,
        });
        setFile(null);
        setSelectedCourse('');
        setIsUploading(false);
        return;
      }

      // Backend may return 200 with success:false for validation-type failures.
      if (!response.data?.success) {
        toast({
          title: '❌ Upload Failed',
          description: response.data?.error || response.data?.message || 'Upload was rejected by the server.',
          variant: 'destructive',
          duration: 7000,
        });
        setFile(null);
        setSelectedCourse('');
        setIsUploading(false);
        return;
      }

      if (response.data.success) {
        const { extraction, ingestion } = response.data;
        const materialId = response.data?.material?.id as string | undefined;

        // Always show "processing" first. Success should only be shown after Phase-1 completes.
        const processingToast = toast({
          title: 'Processing',
          description: 'This can take time.',
          variant: 'default',
          duration: 1000000,
        });

        // Add to materials list
        setUploadedMaterials(prev => [...prev, {
          id: response.data.material.id,
          originalFileName: file.name,
          processingStatus: response.data.material.processingStatus as any,
          pageCount: extraction?.pageCount,
          charCount: extraction?.charCount,
          createdAt: new Date().toISOString(),
        }]);

        setFile(null);
        setSelectedCourse('');
        
        // Poll backend until Phase-1 is done, then show the real result.
        if (materialId) {
          try {
            const result = await waitForPhase1Completion(materialId);
            if (result.done && result.ok) {
              processingToast?.update?.({
                id: processingToast.id,
                title: '✅ Embedding complete',
                description: 'Extraction and vector embedding finished.',
                variant: 'default',
                duration: 6000,
              } as any);
              setUploadedMaterials(prev =>
                prev.map(m => (m.id === materialId ? { ...m, processingStatus: 'embedded' } : m))
              );
            } else if (result.done && !result.ok) {
              processingToast?.update?.({
                id: processingToast.id,
                title: '❌ Phase‑1 failed',
                description: result.raw?.extractionError || result.raw?.faissIngestionError || 'Pipeline failed. Check backend logs.',
                variant: 'destructive',
                duration: 8000,
              } as any);
              setUploadedMaterials(prev =>
                prev.map(m => (m.id === materialId ? { ...m, processingStatus: 'failed' } : m))
              );
            } else {
              // Keep the same processing toast visible (TOAST_LIMIT=1 would otherwise replace it).
              processingToast?.update?.({
                id: processingToast.id,
                title: 'Processing',
                description: 'This can take time.',
                variant: 'default',
                duration: 1000000,
              } as any);
            }
          } catch (pollErr: any) {
            processingToast?.update?.({
              id: processingToast.id,
              title: '⚠️ Status check failed',
              description: pollErr?.message || 'Could not verify Phase‑1 completion.',
              variant: 'destructive',
              duration: 6000,
            } as any);
          }
        }

        // Notify parent that upload flow finished (file accepted).
        if (onUploadComplete) onUploadComplete();
      }
    } catch (error: any) {
      toast({
        title: '❌ Upload Failed',
        description: error.response?.data?.error || 'An error occurred during upload.',
        variant: 'destructive',
        duration: 5000,
      });
    } finally {
      setIsUploading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      extracted: { color: 'bg-blue-500', text: '📄 Extracted' },
      embedded: { color: 'bg-purple-500', text: '🧠 Embedded' },
      queryable: { color: 'bg-green-500', text: '✅ Ready' },
      failed: { color: 'bg-red-500', text: '❌ Failed' },
    };
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.extracted;
    return <Badge className={config.color}>{config.text}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Upload Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Course Materials
          </CardTitle>
          <CardDescription>Upload PDF slides, PowerPoint presentations, or course materials for auto-indexing</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Course Selection */}
          <div>
            <label className="block text-sm font-medium mb-2">Select Course</label>
            <select
              value={selectedCourse}
              onChange={(e) => setSelectedCourse(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isUploading}
            >
              <option value="">-- Choose a course --</option>
              {courses.map(course => (
                <option key={course._id} value={course._id}>
                  {course.courseCode} - {course.courseTitle}
                </option>
              ))}
            </select>
          </div>

          {/* File Upload Area */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-all ${
              dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
            } ${isUploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <div className="space-y-2">
              <FileText className="h-8 w-8 mx-auto text-gray-400" />
              <div>
                <p className="text-sm font-medium">Drag your file here or click to browse</p>
                <p className="text-xs text-gray-500">Supports: PDF, PPTX (Max 50MB)</p>
              </div>
              <input
                type="file"
                onChange={handleFileChange}
                accept=".pdf,.pptx"
                disabled={isUploading}
                className="hidden"
                id="file-input"
              />
              <label htmlFor="file-input" className="inline-block">
                <Button variant="outline" disabled={isUploading} type="button" asChild>
                  <span>Browse Files</span>
                </Button>
              </label>
            </div>
          </div>

          {file && (
            <div className="flex items-center justify-between bg-blue-50 p-3 rounded-lg border border-blue-200">
              <span className="text-sm font-medium text-gray-700">{file.name}</span>
              <button
                onClick={() => setFile(null)}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Change file
              </button>
            </div>
          )}

          <Button
            onClick={handleUpload}
            disabled={!file || !selectedCourse || isUploading}
            className="w-full"
            size="lg"
          >
            {isUploading ? (
              <>
                <Loader className="h-4 w-4 mr-2 animate-spin" />
                Uploading and Processing...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload Material
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Uploaded Materials List */}
      {uploadedMaterials.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Uploaded Materials
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {uploadedMaterials.map(material => (
                <div key={material.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                  <div className="flex items-center gap-3 flex-1">
                    <FileText className="h-5 w-5 text-gray-400" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{material.originalFileName}</p>
                      <p className="text-xs text-gray-500">
                        {material.pageCount && `${material.pageCount} pages • `}
                        {material.charCount && `${material.charCount} chars`}
                      </p>
                    </div>
                  </div>
                  {getStatusBadge(material.processingStatus)}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {uploadedMaterials.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <AlertCircle className="h-8 w-8 text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">No materials uploaded yet</p>
            <p className="text-xs text-gray-400">Upload course slides to get started</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
