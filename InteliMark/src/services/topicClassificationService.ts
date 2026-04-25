/**
 * Topic Classification Service
 * Identifies broad topics and suggests subtopics
 */

export interface TopicInfo {
  isBroadTopic: boolean;
  topic: string;
  subtopics: string[];
}

// Dictionary of broad topics and their common subtopics
const TOPIC_SUBTOPICS: { [key: string]: string[] } = {
  dsa: [
    'Arrays & Linked Lists',
    'Stacks & Queues',
    'Trees & Graphs',
    'Sorting & Searching',
    'Dynamic Programming',
    'Hash Tables & Sets',
  ],
  'data structures': [
    'Arrays & Linked Lists',
    'Stacks & Queues',
    'Trees & Graphs',
    'Hash Tables & Sets',
    'Heaps & Priority Queues',
  ],
  algorithms: [
    'Sorting Algorithms',
    'Searching Algorithms',
    'Dynamic Programming',
    'Greedy Algorithms',
    'Graph Algorithms',
  ],
  python: [
    'Basics & Syntax',
    'Functions & Modules',
    'Object-Oriented Programming',
    'File Handling',
    'Exception Handling',
    'Libraries (NumPy, Pandas)',
  ],
  javascript: [
    'ES6+ Fundamentals',
    'Async/Await & Promises',
    'DOM Manipulation',
    'Closures & Scope',
    'Prototypes & Classes',
    'Event Handling',
  ],
  'machine learning': [
    'Supervised Learning',
    'Unsupervised Learning',
    'Neural Networks',
    'Feature Engineering',
    'Model Evaluation',
    'Scikit-learn & TensorFlow',
  ],
  'web development': [
    'HTML & CSS',
    'JavaScript Fundamentals',
    'React/Vue.js',
    'Node.js & Express',
    'Databases (SQL/NoSQL)',
    'REST APIs',
  ],
  'web design': [
    'HTML Basics',
    'CSS & Styling',
    'Responsive Design',
    'UI/UX Principles',
    'Accessibility',
    'Design Tools (Figma)',
  ],
  mathematics: [
    'Algebra',
    'Geometry',
    'Trigonometry',
    'Calculus',
    'Linear Algebra',
    'Statistics & Probability',
  ],
  java: [
    'Object-Oriented Programming',
    'Collections Framework',
    'Multithreading',
    'Exception Handling',
    'Streams & Lambda',
    'Spring Framework',
  ],
  'c++': [
    'Basics & Syntax',
    'Pointers & Memory',
    'Object-Oriented Programming',
    'STL (Standard Template Library)',
    'File I/O',
    'Debugging',
  ],
  react: [
    'Components & Props',
    'State & Hooks',
    'Event Handling',
    'Routing',
    'State Management (Redux)',
    'Performance Optimization',
  ],
  database: [
    'SQL Basics',
    'Normalization',
    'Joins & Relationships',
    'Indexing',
    'NoSQL (MongoDB)',
    'Query Optimization',
  ],
  sql: [
    'SELECT & Filtering',
    'JOINs',
    'Aggregation Functions',
    'Subqueries',
    'Window Functions',
    'Indexing & Performance',
  ],
  git: [
    'Basics & Setup',
    'Commits & Branches',
    'Merging & Conflicts',
    'Remote Repositories',
    'GitHub Collaboration',
    'Advanced Workflows',
  ],
  'operating systems': [
    'Process Management',
    'Memory Management',
    'File Systems',
    'Deadlocks',
    'CPU Scheduling',
    'Synchronization',
  ],
  os: [
    'Process Management',
    'Memory Management',
    'File Systems',
    'Deadlocks',
    'CPU Scheduling',
    'Synchronization',
  ],
  'computer networks': [
    'OSI Model',
    'TCP/IP Protocol',
    'Network Security',
    'Routing & Switching',
    'DNS & DHCP',
    'HTTP/HTTPS',
  ],
  networking: [
    'OSI Model',
    'TCP/IP Protocol',
    'Network Security',
    'Routing & Switching',
    'DNS & DHCP',
    'HTTP/HTTPS',
  ],
  'software engineering': [
    'SDLC Models',
    'Agile & Scrum',
    'Design Patterns',
    'Testing & QA',
    'Version Control',
    'CI/CD',
  ],
  'artificial intelligence': [
    'Search Algorithms',
    'Knowledge Representation',
    'Expert Systems',
    'Natural Language Processing',
    'Computer Vision',
    'Reinforcement Learning',
  ],
  ai: [
    'Search Algorithms',
    'Knowledge Representation',
    'Expert Systems',
    'Natural Language Processing',
    'Computer Vision',
    'Reinforcement Learning',
  ],
  'deep learning': [
    'Neural Networks',
    'CNNs (Convolutional)',
    'RNNs & LSTMs',
    'Transformers',
    'GANs',
    'Transfer Learning',
  ],
  'data science': [
    'Data Analysis',
    'Statistical Modeling',
    'Data Visualization',
    'Feature Engineering',
    'Predictive Analytics',
    'Big Data Technologies',
  ],
  statistics: [
    'Descriptive Statistics',
    'Probability Theory',
    'Hypothesis Testing',
    'Regression Analysis',
    'ANOVA',
    'Bayesian Statistics',
  ],
  'computer architecture': [
    'CPU Design',
    'Memory Hierarchy',
    'Pipelining',
    'Cache Memory',
    'Instruction Set',
    'Assembly Language',
  ],
  compilers: [
    'Lexical Analysis',
    'Syntax Analysis',
    'Semantic Analysis',
    'Code Generation',
    'Optimization',
    'Parsing Techniques',
  ],
  'theory of computation': [
    'Automata Theory',
    'Regular Languages',
    'Context-Free Grammars',
    'Turing Machines',
    'Computability',
    'Complexity Theory',
  ],
  cryptography: [
    'Symmetric Encryption',
    'Public Key Cryptography',
    'Hash Functions',
    'Digital Signatures',
    'SSL/TLS',
    'Blockchain',
  ],
  cybersecurity: [
    'Network Security',
    'Ethical Hacking',
    'Malware Analysis',
    'Penetration Testing',
    'Firewalls & IDS',
    'Security Protocols',
  ],
  'cloud computing': [
    'AWS/Azure/GCP',
    'Virtualization',
    'Containerization (Docker)',
    'Kubernetes',
    'Serverless Architecture',
    'Cloud Storage',
  ],
  'big data': [
    'Hadoop Ecosystem',
    'MapReduce',
    'Spark',
    'Data Lakes',
    'Stream Processing',
    'Distributed Systems',
  ],
  'data mining': [
    'Association Rules',
    'Classification',
    'Clustering',
    'Anomaly Detection',
    'Text Mining',
    'Web Mining',
  ],
  'natural language processing': [
    'Tokenization',
    'Named Entity Recognition',
    'Sentiment Analysis',
    'Text Classification',
    'Language Models',
    'Machine Translation',
  ],
  nlp: [
    'Tokenization',
    'Named Entity Recognition',
    'Sentiment Analysis',
    'Text Classification',
    'Language Models',
    'Machine Translation',
  ],
  'computer vision': [
    'Image Processing',
    'Object Detection',
    'Image Segmentation',
    'Face Recognition',
    'CNNs for Vision',
    'OpenCV',
  ],
  'discrete mathematics': [
    'Set Theory',
    'Logic & Proofs',
    'Graph Theory',
    'Combinatorics',
    'Number Theory',
    'Relations & Functions',
  ],
  'linear algebra': [
    'Vectors & Matrices',
    'Eigenvalues & Eigenvectors',
    'Matrix Decomposition',
    'Vector Spaces',
    'Linear Transformations',
    'Applications in ML',
  ],
  probability: [
    'Random Variables',
    'Distributions',
    'Expected Value',
    'Conditional Probability',
    'Bayes Theorem',
    'Markov Chains',
  ],
  'data visualization': [
    'Charts & Graphs',
    'Matplotlib & Seaborn',
    'Tableau',
    'D3.js',
    'Interactive Dashboards',
    'Best Practices',
  ],
  'data warehousing': [
    'ETL Processes',
    'Star & Snowflake Schema',
    'OLAP vs OLTP',
    'Data Modeling',
    'Data Quality',
    'Business Intelligence',
  ],
  'business intelligence': [
    'Data Analytics',
    'KPIs & Metrics',
    'Power BI',
    'Tableau',
    'Reporting',
    'Dashboard Design',
  ],
  'r programming': [
    'Basics & Syntax',
    'Data Frames',
    'dplyr & tidyr',
    'ggplot2',
    'Statistical Analysis',
    'R Markdown',
  ],
  r: [
    'Basics & Syntax',
    'Data Frames',
    'dplyr & tidyr',
    'ggplot2',
    'Statistical Analysis',
    'R Markdown',
  ],
  'object oriented programming': [
    'Classes & Objects',
    'Inheritance',
    'Polymorphism',
    'Encapsulation',
    'Abstraction',
    'Design Patterns',
  ],
  oop: [
    'Classes & Objects',
    'Inheritance',
    'Polymorphism',
    'Encapsulation',
    'Abstraction',
    'Design Patterns',
  ],
  'mobile development': [
    'Android Development',
    'iOS Development',
    'React Native',
    'Flutter',
    'Mobile UI/UX',
    'App Deployment',
  ],
  android: [
    'Activities & Fragments',
    'Layouts & Views',
    'Intents',
    'RecyclerView',
    'Room Database',
    'Jetpack Compose',
  ],
  'data analysis': [
    'Pandas',
    'NumPy',
    'Exploratory Data Analysis',
    'Statistical Testing',
    'Data Cleaning',
    'Feature Engineering',
  ],
  pandas: [
    'DataFrames',
    'Series',
    'Data Cleaning',
    'Merging & Joining',
    'Group By',
    'Time Series',
  ],
  numpy: [
    'Arrays',
    'Broadcasting',
    'Mathematical Operations',
    'Indexing & Slicing',
    'Linear Algebra',
    'Random Numbers',
  ],
  'system design': [
    'Scalability',
    'Load Balancing',
    'Caching',
    'Database Sharding',
    'Microservices',
    'API Design',
  ],
  docker: [
    'Containers Basics',
    'Dockerfile',
    'Images & Layers',
    'Docker Compose',
    'Networking',
    'Volumes',
  ],
  kubernetes: [
    'Pods & Deployments',
    'Services',
    'ConfigMaps & Secrets',
    'Persistent Volumes',
    'Helm Charts',
    'Monitoring',
  ],
};

/**
 * Check if input is a broad topic and get subtopics
 */
export function classifyTopic(input: string): TopicInfo {
  const cleanInput = input.toLowerCase().trim();

  // Check if it matches any broad topic
  for (const [topic, subtopics] of Object.entries(TOPIC_SUBTOPICS)) {
    if (cleanInput === topic || cleanInput === topic.replace('-', ' ')) {
      return {
        isBroadTopic: true,
        topic: topic.charAt(0).toUpperCase() + topic.slice(1),
        subtopics,
      };
    }
  }

  // Check for partial matches (word within the broad topic)
  // Also accepts phrases like "i want to learn java" where java is a topic
  for (const [topic, subtopics] of Object.entries(TOPIC_SUBTOPICS)) {
    const topicWords = topic.split(' ');
    const inputWords = cleanInput.split(' ');

    // Match if input is single topic word (exact match)
    if (inputWords.length === 1 && topicWords.includes(inputWords[0])) {
      return {
        isBroadTopic: true,
        topic: topic.charAt(0).toUpperCase() + topic.slice(1),
        subtopics,
      };
    }

    // Also match if topic word is found anywhere in a longer phrase
    // This allows "i want to learn java" to match the "java" topic
    for (const topicWord of topicWords) {
      if (inputWords.includes(topicWord)) {
        return {
          isBroadTopic: true,
          topic: topic.charAt(0).toUpperCase() + topic.slice(1),
          subtopics,
        };
      }
    }
  }

  return {
    isBroadTopic: false,
    topic: input,
    subtopics: [],
  };
}

/**
 * Generate a user-friendly subtopic selection message
 */
export function generateSubtopicPrompt(topic: string, subtopics: string[]): string {
  const subtopicList = subtopics
    .slice(0, 6)
    .map((sub, idx) => `${idx + 1}. ${sub}`)
    .join('\n');

  return `I'm glad to hear you want to learn about **${topic}**! 🎉

Could you please specify what you actually want to learn about ${topic}? Here are some example topics:

${subtopicList}

You can pick one from the list (by number or name), or feel free to type your own specific topic! 📝`;
}

/**
 * Check if user input is selecting from subtopic list
 * Accepts both predefined subtopics and free-form user input
 */
export function parseSubtopicSelection(userInput: string, availableSubtopics: string[]): string | null {
  const cleanInput = userInput.toLowerCase().trim();

  // Don't accept empty input
  if (!cleanInput) {
    return null;
  }

  // Reject common confirmation/rejection/filler words
  const rejectPatterns = /^\s*(yes|yeah|yep|sure|ok|okay|alright|fine|sounds good|go ahead|show|send|no|nope|skip|nevermind|not now|later|please|thanks|thank you|ok thanks|sure thanks|help|hello|hi|hey|what|ok so|so)\s*$/i;
  if (rejectPatterns.test(userInput)) {
    return null;
  }

  // Check for number selection (1-6)
  const numberMatch = cleanInput.match(/^(\d+)$/);
  if (numberMatch) {
    const index = parseInt(numberMatch[1]) - 1;
    if (index >= 0 && index < availableSubtopics.length) {
      return availableSubtopics[index];
    }
  }

  // Check for direct subtopic name match (exact or partial)
  for (const subtopic of availableSubtopics) {
    if (subtopic.toLowerCase() === cleanInput) {
      return subtopic;
    }
    // Partial match (contains)
    if (cleanInput.includes(subtopic.toLowerCase()) || subtopic.toLowerCase().includes(cleanInput)) {
      return subtopic;
    }
  }

  // Extract topic from phrases like "i want to learn about pandas" or "teach me pandas"
  // Remove common learning phrases
  let extractedTopic = cleanInput
    .replace(/^(i want to|i would like to|i'd like to|please|can you|could you)\s+/i, '')
    .replace(/\b(learn about|learn|teach me|explain|understand|study|know about|about)\s+/i, '')
    .trim();

  // If extraction resulted in something, use it; otherwise use original input
  if (extractedTopic && extractedTopic !== cleanInput) {
    // Capitalize first letter
    return extractedTopic.charAt(0).toUpperCase() + extractedTopic.slice(1);
  }

  // Accept any other non-empty input as a valid subtopic (not restricted to predefined list)
  // This allows users to enter custom subtopics like "advanced concepts", "debugging", etc.
  // But we already filtered out filler words above
  return userInput.trim();
}
