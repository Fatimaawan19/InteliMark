#!/usr/bin/env node

/**
 * VECTORDB QUERY CLI
 * Query FAISS vector database in real-time from terminal
 * Usage: node query-vectordb.js "your question here"
 */

const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execPromise = promisify(exec);

// Color codes
const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
};

const c = (color, text) => `${colors[color]}${text}${colors.reset}`;

// Helper function to describe similarity score
const getSimilarityDescription = (score) => {
  if (score >= 0.90) return c('green', 'PERFECT MATCH 🎯');
  if (score >= 0.70) return c('green', 'HIGHLY RELEVANT ✅');
  if (score >= 0.50) return c('yellow', 'MODERATELY RELEVANT 📌');
  if (score >= 0.30) return c('yellow', 'LOOSELY RELATED ⚠️');
  return c('red', 'NOT RELEVANT ❌');
};

// Helper function to create similarity bar
const getSimilarityBar = (score) => {
  const percentage = Math.round(score * 100);
  const filled = Math.round((percentage / 100) * 20);
  const empty = 20 - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return bar;
};

// Get query and options from command line
const args = process.argv.slice(2);
let query = '';
let topK = 10; // Default to 10
let bestOnly = false; // Flag for best result only

// Parse arguments
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--limit' || args[i] === '-k') {
    topK = parseInt(args[i + 1]) || 10;
    i++;
  } else if (args[i] === '--best' || args[i] === '-b' || args[i] === '--top1') {
    bestOnly = true;
    topK = 1;
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log(c('cyan', '\n📖 VECTORDB QUERY HELP'));
    console.log(c('yellow', '\nUsage:'));
    console.log(c('gray', '  node query-vectordb.js "your question"'));
    console.log(c('gray', '  node query-vectordb.js "your question" --limit 5'));
    console.log(c('gray', '  node query-vectordb.js "your question" --best'));
    console.log(c('gray', '  node query-vectordb.js --best "your question"'));
    console.log(c('\nyellow', 'Options:'));
    console.log(c('gray', '  --limit, -k <number>  Number of results to return (default: 10)'));
    console.log(c('gray', '  --best, -b             Return only the best match (highest similarity)'));
    console.log(c('gray', '  --help, -h             Show this help message'));
    console.log(c('\ncyan', 'Examples:'));
    console.log(c('gray', '  node query-vectordb.js "machine learning"'));
    console.log(c('gray', '  node query-vectordb.js "neural networks" --limit 5'));
    console.log(c('gray', '  node query-vectordb.js "deep learning" --best'));
    console.log(c('gray', '  node query-vectordb.js -b -k "What is AI?"'));
    console.log(c('\ncyan', '📐 Similarity Score Guide:'));
    console.log(c('green', '  0.90-1.0: Identical or near-identical'));
    console.log(c('green', '  0.70-0.89: Highly relevant'));
    console.log(c('yellow', '  0.50-0.69: Moderately relevant'));
    console.log(c('gray', '  0.30-0.49: Loosely related'));
    console.log(c('red', '  0.00-0.29: Not relevant'));
    process.exit(0);
  } else {
    query += (query ? ' ' : '') + args[i];
  }
}

if (!query) {
  console.log(c('red', '❌ Error: No query provided'));
  console.log(c('yellow', '\nUsage:'));
  console.log(c('cyan', '  node query-vectordb.js "your question here"'));
  console.log(c('cyan', '  node query-vectordb.js "your question" --limit 5'));
  console.log(c('cyan', '  node query-vectordb.js "your question" --best'));
  console.log(c('cyan', '  node query-vectordb.js --help (for more options)'));
  process.exit(1);
}

async function queryVectorDB() {
  console.log();
  console.log('═'.repeat(80));
  console.log(c('cyan', '🔍 VECTORDB QUERY'));
  console.log('═'.repeat(80));
  console.log();
  console.log(c('yellow', 'Query:'), c('magenta', `"${query}"`));
  console.log(c('yellow', 'Mode:'), c('magenta', bestOnly ? '⭐ BEST MATCH ONLY' : `Top ${topK} Results`));
  console.log(c('yellow', 'Searching FAISS...'));
  console.log();

  // Python script to query FAISS
  const pythonCode = `
import sys
import os
import json
sys.path.insert(0, r'${path.join(__dirname, 'rag_marking').replace(/\\\\/g, '\\\\\\\\')}')

from faiss_vector_store import FAISSVectorStore
import logging

# Suppress verbose logging
logging.basicConfig(level=logging.ERROR)

try:
    # Initialize FAISS
    store = FAISSVectorStore()
    
    # Query FAISS with dynamic top_k
    result = store.query("${query}", top_k=${topK})
    
    # Format output
    output = {
      "success": True,
      "query": "${query}",
      "top_k_requested": ${topK},
      "results_count": len(result.get("matches", [])),
      "results": []
    }
    
    for i, match in enumerate(result.get("matches", []), 1):
      content = match.get("text", "")
      output["results"].append({
        "rank": i,
        "similarity_score": float(match.get("score", 0)),
        "chunk_id": match.get("id", "unknown"),
        "content_preview": content[:300] + "..." if len(content) > 300 else content,
        "content_full": content,
        "metadata": match.get("metadata", {})
      })
    
    print(json.dumps(output, indent=2))
except Exception as e:
    print(json.dumps({
      "success": False,
      "error": str(e)
    }))
`;

  try {
    // Write and run Python script
    const tempScript = path.join(__dirname, 'rag_marking', 'temp_query.py');
    const fs = require('fs');
    fs.writeFileSync(tempScript, pythonCode);

    const { stdout } = await execPromise(
      `cd "${path.join(__dirname, 'rag_marking')}" && python temp_query.py`,
      { timeout: 60000, maxBuffer: 10 * 1024 * 1024 }
    );

    // Parse results
    const jsonMatch = stdout.match(/\{[\s\S]*\}(?![\s\S]*\{)/);
    if (!jsonMatch) {
      throw new Error('No JSON found in output');
    }
    const results = JSON.parse(jsonMatch[0]);

    // Display results
    if (!results.success) {
      console.log(c('red', '❌ Error:'), results.error);
      fs.unlinkSync(tempScript);
      return;
    }

    console.log(c('green', '✅ RESULTS FOUND\n'));
    if (bestOnly) {
      console.log(c('cyan', `⭐ BEST MATCH: The single most relevant result\n`));
    } else {
      console.log(c('cyan', `📊 Found ${results.results_count} matching chunks (requested top ${results.top_k_requested})\n`));
    }

    if (results.results.length === 0) {
      console.log(c('yellow', '⚠️  No matches found in vector database'));
    } else {
      results.results.forEach((result, idx) => {
        const similarity = result.similarity_score;
        const percentage = Math.round(similarity * 100);
        const bar = getSimilarityBar(similarity);
        const description = getSimilarityDescription(similarity);
        
        if (bestOnly) {
          console.log(c('magenta', '╔════════════════════════════════════════════════════════════════════════════════╗'));
          console.log(c('magenta', '║') + c('yellow', ' 🎯 BEST MATCH - Highest Similarity Result'.padEnd(78)) + c('magenta', '║'));
          console.log(c('magenta', '╚════════════════════════════════════════════════════════════════════════════════╝'));
        } else {
          console.log(c('magenta', `─ RANK #${result.rank}/${results.results_count}`));
        }
        
        console.log();
        console.log(c('blue', '  📊 Similarity Score:'));
        console.log(c('blue', `     ${bar} ${percentage}%`));
        console.log(c('blue', `     ${description}`));
        console.log();
        console.log(c('blue', `  🔗 Chunk ID: ${result.chunk_id}`));
        
        if (Object.keys(result.metadata).length > 0) {
          console.log(c('blue', `  📋 From: ${result.metadata.fileName || result.metadata.material || 'Unknown'}`));
          if (result.metadata.courseId) {
            console.log(c('blue', `  📚 Course: ${result.metadata.courseId}`));
          }
        }
        
        console.log();
        console.log(c('gray', '  📝 Content Preview:'));
        console.log(c('gray', `     "${result.content_preview}"`));
        console.log();
      });

      // Show full content option
      console.log(c('cyan', '═'.repeat(80)));
      console.log(c('yellow', '💾 To see full content of each result:'));
      console.log(c('gray', '  Check the "content_full" field in the JSON output'));
      console.log();
    }

    // Stats
    console.log(c('cyan', '═'.repeat(80)));
    console.log(c('cyan', '📈 Statistics'));
    console.log(c('cyan', '═'.repeat(80)));
    console.log(
      c('green', `  Query Length: ${query.length} characters`)
    );
    console.log(
      c('green', `  Results Returned: ${results.results_count}`)
    );
    if (results.results.length > 0) {
      const avgScore = (
        results.results.reduce((sum, r) => sum + r.similarity_score, 0) /
        results.results.length
      ).toFixed(3);
      console.log(c('green', `  Average Similarity: ${(avgScore * 100).toFixed(1)}%`));
      console.log(c('green', `  Best Match: ${(results.results[0].similarity_score * 100).toFixed(1)}%`));
    }
    console.log();

    // Explain similarity calculation
    console.log(c('cyan', '═'.repeat(80)));
    console.log(c('cyan', '🧮 How Similarity is Calculated'));
    console.log(c('cyan', '═'.repeat(80)));
    console.log();
    console.log(c('yellow', '📐 Cosine Similarity Formula:'));
    console.log(c('gray', '   similarity = (A · B) / (||A|| × ||B||)'));
    console.log();
    console.log(c('yellow', 'Where:'));
    console.log(c('gray', '   • A = Your query vector (384 dimensions)'));
    console.log(c('gray', '   • B = Chunk vector (384 dimensions)'));
    console.log(c('gray', '   • A · B = Dot product (multiply & sum each dimension)'));
    console.log(c('gray', '   • ||A||, ||B|| = Vector lengths (magnitude)'));
    console.log();
    console.log(c('yellow', '📊 Similarity Score Interpretation:'));
    console.log(c('green', '   0.90-1.0  → Identical or near-identical content (PERFECT)'));
    console.log(c('green', '   0.70-0.89 → Highly relevant and related (EXCELLENT)'));
    console.log(c('yellow', '   0.50-0.69 → Moderately relevant (GOOD)'));
    console.log(c('yellow', '   0.30-0.49 → Loosely related (WEAK)'));
    console.log(c('red', '   0.00-0.29 → Not relevant (POOR)'));
    console.log();
    console.log(c('cyan', '💡 Example:'));
    console.log(c('gray', '   Query: "What is machine learning?"'));
    console.log(c('gray', '   ↓ Converts to: [0.234, -0.156, 0.891, ... 0.122]'));
    console.log();
    console.log(c('gray', '   Chunk 1: "ML algorithms learn from data"'));
    console.log(c('gray', '   Vector: [0.245, -0.162, 0.885, ... 0.119]'));
    console.log(c('green', '   → Similarity: 0.87 (87%) ✅ HIGHLY RELEVANT'));
    console.log();
    console.log(c('gray', '   Chunk 2: "Python programming language"'));
    console.log(c('gray', '   Vector: [0.012, 0.534, -0.123, ... 0.445]'));
    console.log(c('red', '   → Similarity: 0.23 (23%) ❌ NOT RELEVANT'));
    console.log();

    // Cleanup
    fs.unlinkSync(tempScript);
  } catch (error) {
    console.log(c('red', '❌ Query failed:'), error.message);
  }
}

queryVectorDB();
