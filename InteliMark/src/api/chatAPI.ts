import axios from "axios";

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;
// Correct Groq endpoint - no "openai" in path
const GROQ_API_URL = "https://api.groq.com/api/openai/v1/chat/completions";

console.log("🔐 Groq API Key Check:");
console.log("Key exists?", !!GROQ_API_KEY);
console.log("Key length:", GROQ_API_KEY?.length);
console.log("Key starts with 'gsk_'?", GROQ_API_KEY?.startsWith("gsk_"));
console.log("Groq API URL:", GROQ_API_URL);

interface ChatRequest {
  message: string;
  history: { role: string; content: string }[];
  courseId?: string;
  courseHint?: string;
}

interface ChatResponse {
  response: string;
  success: boolean;
  ragMode?: string;
}

// 🔥 SYSTEM PROMPT - Professional Tutoring Assistant
const SYSTEM_PROMPT = `You are a professional tutoring assistant. When explaining learning topics, ALWAYS use this EXACT format:

OVERVIEW:
[Write 3-5 lines explaining the topic clearly and simply. No links here.]

RESOURCES:
- GeeksforGeeks: https://www.geeksforgeeks.org/[topic]
- Official Docs: https://[relevant-official-documentation]

VIDEOS:
- Creator Name - Topic: https://www.youtube.com/watch?v=[video-id]
- Creator Name - Topic: https://www.youtube.com/watch?v=[video-id]

IMPORTANT RULES:
1. ALWAYS include the OVERVIEW section first
2. Include RESOURCES section with 1-2 real, clickable URLs
3. Include VIDEOS section with 1-2 real YouTube URLs
4. No explanations or paragraphs except in OVERVIEW
5. Keep resource titles SHORT (max 10 words)
6. Always use direct, valid URLs
7. Format must be EXACTLY as shown above
8. Maintain friendly, professional tutor tone
9. For non-learning questions, respond naturally without this format`;


console.log("📢 chatAPI.ts LOADED with Groq (FREE)");

export const chatAPI = async (request: ChatRequest): Promise<ChatResponse> => {
  try {
    if (!GROQ_API_KEY) {
      return {
        response:
          "⚠️ Groq API key missing. Get a FREE one from https://console.groq.com/keys",
        success: false,
      };
    }

    console.log("🔑 Groq API Key Loaded (FREE TIER)");
    console.log("📤 User Message:", request.message);

    // Pull semantic context from uploaded course materials, then prepend it
    // to the user message so the LLM can answer with grounded evidence.
    let ragContext = "";
    let ragMode = "none";
    const showRagDebugInReply = import.meta.env.VITE_CHAT_RAG_DEBUG === "true";
    const hasInlineDocContext = request.message.includes("[DOCUMENT CONTEXT]");
    if (!hasInlineDocContext) {
      try {
        const ragResponse = await axios.post(
          "http://localhost:5000/api/courses/material-context",
          {
            query: request.message,
            topK: 4,
            ...(request.courseId ? { courseId: request.courseId } : {}),
            ...(request.courseHint ? { courseHint: request.courseHint } : {}),
          },
          { timeout: 10000 }
        );

        const contextText = ragResponse?.data?.contextForLLM;
        if (typeof contextText === "string" && contextText.trim()) {
          ragContext = contextText.trim().slice(0, 4500);
          if (ragResponse?.data?.courseId) {
            ragMode = "course-specific";
          } else if (ragResponse?.data?.note?.toLowerCase?.().includes("global")) {
            ragMode = "global-fallback";
          } else {
            ragMode = "retrieved";
          }
        }

        console.log("📚 RAG retrieval mode:", ragMode, {
          resultsFound: ragResponse?.data?.resultsFound ?? 0,
          courseId: ragResponse?.data?.courseId ?? null,
          note: ragResponse?.data?.note ?? null,
        });
      } catch (ragError: any) {
        console.warn("⚠️ RAG context fetch skipped:", ragError?.message || ragError);
        ragMode = "failed";
      }
    } else {
      ragMode = "document-inline";
    }

    const userMessageWithContext = ragContext
      ? `[COURSE MATERIAL CONTEXT]\n${ragContext}\n\n[USER QUESTION]\n${request.message}\n\nInstruction: Ground your answer in the provided course material context when relevant.`
      : request.message;

    // Build conversation messages
    const messages: any[] = [];

    // Add system prompt
    messages.push({
      role: "system",
      content: SYSTEM_PROMPT,
    });

    // Add conversation history
    if (request.history.length > 0) {
      request.history.slice(-4).forEach((msg) => {
        messages.push({
          role: msg.role === "user" ? "user" : "assistant",
          content: msg.content,
        });
      });
    }

    // Add current message
    messages.push({
      role: "user",
      content: userMessageWithContext,
    });

    console.log("💬 Sending prompt to Groq (FREE)...\n");
    console.log("📤 Full Messages Array:", JSON.stringify(messages, null, 2));
    console.log("📤 Request Body:", {
      model: "llama-3.1-8b-instant",
      messages: messages,
      temperature: 0.7,
      max_tokens: 1024,
      top_p: 1,
      stream: false,
    });

    // Request to Groq API
    const response = await axios.post(
      GROQ_API_URL,
      {
        model: "llama-3.1-8b-instant", // ✅ Currently supported FREE model from Groq
        messages: messages,
        temperature: 0.7,
        max_tokens: 1024,
        top_p: 1,
        stream: false,
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    console.log("✅ Groq Response Status:", response.status);
    const responseText = response.data.choices?.[0]?.message?.content || "";
    const finalResponseText = showRagDebugInReply
      ? `${responseText}\n\n[debug] ragMode=${ragMode}`
      : responseText;

    console.log("✅ Groq Response Received");

    return {
      response: finalResponseText,
      success: true,
      ragMode,
    };
  } catch (error: any) {
    console.error("❌ Groq Error:", error.message);
    
    // Log detailed error response for debugging
    if (error.response) {
      console.error("❌ Error Response Status:", error.response.status);
      console.error("❌ Error Response Data:", JSON.stringify(error.response.data));
      console.error("❌ Error Response Headers:", error.response.headers);
      console.error("❌ Request URL:", error.config?.url);
    }

    const msg = error?.message?.toLowerCase() || "";
    const status = error?.response?.status;
    const errorCode = error?.response?.data?.error?.code;
    const errorMessage = error?.response?.data?.error?.message || "";

    if (errorCode === "model_not_found" || errorMessage.includes("does not exist")) {
      return {
        response:
          "❌ Model not found. Available free models: llama-3.1-8b-instant, llama-3.3-70b-versatile. Check https://console.groq.com/docs/models",
        success: false,
      };
    }

    if (msg.includes("api key") || msg.includes("invalid") || msg.includes("unauthorized") || status === 401) {
      return {
        response:
          "❌ Invalid Groq API Key. Get a FREE one from https://console.groq.com/keys",
        success: false,
      };
    }

    if (status === 403) {
      return {
        response:
          "❌ Authentication failed. Check your Groq API key at https://console.groq.com/keys",
        success: false,
      };
    }

    if (status === 400) {
      console.error("❌ Groq 400 Error Details:", {
        errorMessage: errorMessage,
        code: errorCode
      });
      return {
        response:
          "❌ Bad request to Groq API. " + (errorMessage || "The request format may be invalid. Check console for details."),
        success: false,
      };
    }

    if (status === 404) {
      return {
        response:
          "❌ Groq endpoint not found (404). The API endpoint may be incorrect. Check console for details.",
        success: false,
      };
    }

    if (msg.includes("429") || status === 429) {
      return {
        response:
          "⚠️ Rate limit exceeded. Please wait a moment and try again.",
        success: false,
      };
    }

    return {
      response: `❌ Error: ${error?.message || "Unexpected error occurred."}`,
      success: false,
    };
  }
};

export default chatAPI;
