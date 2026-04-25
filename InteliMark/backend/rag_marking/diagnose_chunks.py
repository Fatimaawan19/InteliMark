#!/usr/bin/env python3
"""
Diagnostic script to find chunks and vectors in MongoDB
"""

import os
import sys
from pymongo import MongoClient
from dotenv import load_dotenv
from pathlib import Path

# Load environment variables
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(env_path)

MONGO_URI = os.getenv('MONGO_URI', 'mongodb+srv://fypAdmin:123%21%40FH@cluster0.9qgq4lg.mongodb.net/fyp_db?retryWrites=true&w=majority')

def diagnose():
    """Diagnose where chunks are stored"""
    
    try:
        print("🔗 Connecting to MongoDB...\n")
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        db = client['fyp_db']
        
        # List ALL collections
        all_collections = db.list_collection_names()
        print(f"📋 All collections in fyp_db ({len(all_collections)} total):")
        for col in sorted(all_collections):
            print(f"  - {col}")
        
        print("\n" + "="*60)
        
        # Check each collection for chunk-like data
        print("\n🔍 Searching for chunks in each collection...\n")
        
        for col_name in all_collections:
            col = db[col_name]
            count = col.count_documents({})
            
            if count == 0:
                continue
            
            # Get a sample document
            sample = col.find_one({})
            has_embedding = 'embedding' in sample if sample else False
            has_content = 'content' in sample if sample else False
            
            if has_embedding or has_content:
                print(f"✅ {col_name}: {count} documents")
                if has_embedding:
                    print(f"   - Has embeddings field")
                if has_content:
                    print(f"   - Has content field")
                if sample:
                    print(f"   - Sample keys: {list(sample.keys())}")
        
        client.close()
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        sys.exit(1)

if __name__ == '__main__':
    diagnose()
