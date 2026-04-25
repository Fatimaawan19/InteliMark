#!/usr/bin/env python3
"""
Query chunks and ingestion status from MongoDB
Reads from coursematerialraws collection where FAISS ingestion metadata is stored
"""

import os
import sys
from pymongo import MongoClient
from dotenv import load_dotenv
from pathlib import Path
from datetime import datetime

# Load environment variables
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(env_path)

MONGO_URI = os.getenv('MONGO_URI', 'mongodb+srv://fypAdmin:123%21%40FH@cluster0.9qgq4lg.mongodb.net/fyp_db?retryWrites=true&w=majority')

def query_chunks_history():
    """Query and display all materials and their ingestion status"""
    
    try:
        print("🔗 Connecting to MongoDB...")
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        db = client['fyp_db']
        
        # Query coursematerialraws (where extraction and ingestion data is stored)
        materials_coll = db['coursematerialraws']
        total_materials = materials_coll.count_documents({})
        
        print(f"\n✅ Connected\n")
        print(f"📊 Total materials uploaded: {total_materials}\n")
        
        if total_materials == 0:
            print("No materials found. Upload course materials to get started.")
            client.close()
            return
        
        # Get all materials
        materials = materials_coll.find({}).sort('extractedAt', -1)
        
        total_chunks = 0
        total_embeddings = 0
        completed_count = 0
        failed_count = 0
        
        for mat in materials:
            print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            print(f"📄 {mat.get('originalFileName', 'Unknown')}")
            print(f"   ID: {mat['_id']}")
            
            # Extraction status
            extraction_status = mat.get('extractionStatus', 'pending')
            extraction_emoji = '✅' if extraction_status == 'completed' else '❌' if extraction_status == 'failed' else '⏳'
            print(f"   {extraction_emoji} Extraction: {extraction_status}")
            
            if extraction_status == 'failed':
                error = mat.get('extractionError', 'Unknown error')
                print(f"      Error: {error[:100]}")
                failed_count += 1
                continue
            
            # Extraction details
            if mat.get('charCount'):
                print(f"      Characters: {mat['charCount']}")
            if mat.get('pageCount'):
                print(f"      Pages: {mat['pageCount']}")
            if mat.get('ocrCount'):
                print(f"      OCR text blocks: {mat['ocrCount']}")
            
            # Ingestion status
            ingestion_status = mat.get('faissIngestionStatus', 'pending')
            ingestion_emoji = '✅' if ingestion_status == 'completed' else '⏳'
            print(f"   {ingestion_emoji} FAISS Ingestion: {ingestion_status}")
            
            # Chunks and embeddings
            num_chunks = mat.get('numChunks', mat.get('faissChunkCount', 0))
            num_embeddings = mat.get('numEmbeddings', 0)
            
            if num_chunks > 0:
                print(f"      Chunks: {num_chunks}")
                print(f"      Embeddings: {num_embeddings}")
                total_chunks += num_chunks
                total_embeddings += num_embeddings
            
            if ingestion_status == 'completed':
                completed_count += 1
            
            # Timing
            if mat.get('extractedAt'):
                extracted_time = mat['extractedAt']
                print(f"      Extracted: {extracted_time}")
            if mat.get('faissIngestionAt'):
                ingestion_time = mat['faissIngestionAt']
                print(f"      Ingested: {ingestion_time}")
        
        print(f"\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print(f"\n📈 Summary:")
        print(f"   Total materials: {total_materials}")
        print(f"   Completed: {completed_count}")
        print(f"   Failed: {failed_count}")
        print(f"   Total chunks: {total_chunks}")
        print(f"   Total embeddings: {total_embeddings}")
        
        if total_chunks > 0:
            print(f"\n✅ Phase 1 complete! Ready for answer evaluation (Phase 2)")
        else:
            print(f"\n⏳ Waiting for extractions to complete...")
        
        print()
        
        client.close()
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        sys.exit(1)

if __name__ == '__main__':
    query_chunks_history()
