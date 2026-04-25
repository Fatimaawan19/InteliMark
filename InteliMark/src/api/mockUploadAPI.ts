// TODO: Replace with actual backend API when database is connected

export const mockUploadAPI = async (files: File[]): Promise<{ extractedContent: string; success: boolean }> => {
  // Simulate upload delay
  await new Promise(resolve => setTimeout(resolve, 1500));

  // Mock content extraction
  const fileNames = files.map(f => f.name).join(', ');
  const extractedContent = `I've received your files: ${fileNames}. 
  
  Here's a summary of what I found:
  • Total files: ${files.length}
  • File types: ${files.map(f => f.type || 'unknown').join(', ')}
  
  I can help you analyze these documents, extract key information, or answer questions about their content. What would you like to know?`;

  return {
    extractedContent,
    success: true
  };
};