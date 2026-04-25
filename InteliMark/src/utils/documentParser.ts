/**
 * Document Parser Utility
 * Extracts text from PDF and Word documents
 */

import * as pdfjsLib from 'pdfjs-dist';

// Use Vite's public folder for worker - no CDN dependencies
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

console.log('📦 PDF.js version:', pdfjsLib.version);
console.log('🔧 PDF.js worker configured at:', pdfjsLib.GlobalWorkerOptions.workerSrc);

/**
 * Extract text from PDF file
 */
export async function extractTextFromPDF(file: File): Promise<string> {
  console.log('🔍 Starting PDF extraction for:', file.name);
  console.log('📊 File size:', file.size, 'bytes');
  console.log('📝 File type:', file.type);
  
  try {
    console.log('⏳ Reading file as array buffer...');
    const arrayBuffer = await file.arrayBuffer();
    console.log('✅ Array buffer created, size:', arrayBuffer.byteLength);
    
    console.log('⏳ Loading PDF document...');
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    console.log('✅ PDF loaded successfully! Pages:', pdf.numPages);
    
    let fullText = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
      console.log(`⏳ Processing page ${i}/${pdf.numPages}...`);
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      fullText += pageText + '\n';
      console.log(`✅ Page ${i} extracted, text length:`, pageText.length);
    }
    
    console.log('✅ Full text extracted! Total length:', fullText.trim().length);
    return fullText.trim();
  } catch (error: any) {
    console.error('❌ Error extracting text from PDF:', error);
    console.error('❌ Error name:', error.name);
    console.error('❌ Error message:', error.message);
    console.error('❌ Error stack:', error.stack);
    throw new Error(`Failed to extract text from PDF file: ${error.message}`);
  }
}

/**
 * Extract text from Word (.docx) file
 */
export async function extractTextFromWord(file: File): Promise<string> {
  console.log('🔍 Starting Word extraction for:', file.name);
  console.log('📊 File size:', file.size, 'bytes');
  
  try {
    console.log('⏳ Importing mammoth library...');
    const mammoth = await import('mammoth');
    console.log('✅ Mammoth imported successfully');
    
    console.log('⏳ Reading file as array buffer...');
    const arrayBuffer = await file.arrayBuffer();
    console.log('✅ Array buffer created, size:', arrayBuffer.byteLength);
    
    console.log('⏳ Extracting text from Word document...');
    const result = await mammoth.extractRawText({ arrayBuffer });
    console.log('✅ Text extracted! Length:', result.value.trim().length);
    
    return result.value.trim();
  } catch (error: any) {
    console.error('❌ Error extracting text from Word:', error);
    console.error('❌ Error name:', error.name);
    console.error('❌ Error message:', error.message);
    throw new Error(`Failed to extract text from Word file: ${error.message}`);
  }
}

/**
 * Extract text from document based on file type
 */
export async function extractTextFromDocument(file: File): Promise<string> {
  const fileType = file.type;
  const fileName = file.name.toLowerCase();
  
  console.log('🔍 Determining file type...');
  console.log('📄 File name:', fileName);
  console.log('📋 MIME type:', fileType);
  
  if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
    console.log('✅ Detected as PDF file');
    return await extractTextFromPDF(file);
  } else if (
    fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    fileName.endsWith('.docx')
  ) {
    console.log('✅ Detected as Word (.docx) file');
    return await extractTextFromWord(file);
  } else if (fileName.endsWith('.doc')) {
    console.log('❌ Legacy .doc format detected');
    throw new Error('Legacy .doc files are not supported. Please convert to .docx format.');
  } else {
    console.log('❌ Unsupported file format');
    throw new Error('Unsupported file format. Please upload PDF or DOCX files only.');
  }
}

/**
 * Truncate text for topic extraction (to avoid token limits)
 */
export function truncateTextForAnalysis(text: string, maxLength: number = 3000): string {
  if (text.length <= maxLength) {
    return text;
  }
  
  // Take first and last portions to get better context
  const halfLength = Math.floor(maxLength / 2);
  const beginning = text.substring(0, halfLength);
  const ending = text.substring(text.length - halfLength);
  
  return beginning + '\n...\n' + ending;
}
