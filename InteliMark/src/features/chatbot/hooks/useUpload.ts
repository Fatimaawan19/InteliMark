import { useState } from 'react';
import { mockUploadAPI } from '@/api/mockUploadAPI';

export const useUpload = () => {
  const [isUploading, setIsUploading] = useState(false);

  const uploadFiles = async (files: File[]): Promise<string> => {
    setIsUploading(true);

    try {
      const data = await mockUploadAPI(files);

      if (!data.success) throw new Error('Upload failed');

      return data.extractedContent || 'Files uploaded successfully';
    } catch (error) {
      console.error('Upload error:', error);
      return 'Error uploading files';
    } finally {
      setIsUploading(false);
    }
  };

  return { uploadFiles, isUploading };
};