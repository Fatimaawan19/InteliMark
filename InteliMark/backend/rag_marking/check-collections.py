#!/usr/bin/env python3
import os
from pymongo import MongoClient
from dotenv import load_dotenv
from pathlib import Path

env_path = Path(__file__).parent.parent / '.env'
load_dotenv(env_path)

MONGO_URI = os.getenv('MONGO_URI', 'mongodb+srv://fypAdmin:123%21%40FH@cluster0.9qgq4lg.mongodb.net/fyp_db?retryWrites=true&w=majority')

client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
db = client['fyp_db']

print("Collections in fyp_db:")
for col in sorted(db.list_collection_names()):
    count = db[col].count_documents({})
    print(f"  {col}: {count} documents")

print("\nCoursematerialraws documents:")
materials = db['coursematerialraws'].find({})
for m in materials:
    print(f"  - {m['originalFileName']}")

client.close()
