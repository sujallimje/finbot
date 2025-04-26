import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// In-memory session storage (for development)
const sessions = {};

// Initialize Google Generative AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

// Load financial knowledge base
const financial_knowledge = {
  "budget": "A plan for your money that helps you track income and expenses. Think of it as a roadmap for your finances.",
  "saving": "Setting aside money for future use instead of spending it now. Like storing nuts for winter!",
  "investing": "Putting money into assets (like stocks or property) with the hope they'll grow in value over time.",
  "compound interest": "When you earn interest not just on your initial money, but also on the interest you've already earned. It's like a snowball that keeps growing as it rolls downhill.",
  "credit score": "A number that tells lenders how reliable you are with money. Higher scores mean you're seen as more trustworthy.",
  "debt": "Money you owe to someone else. Think of it as 'borrowed money' that you need to pay back, usually with interest.",
  "401k": "A retirement account offered by employers where you can save money from your paycheck before taxes. Many employers match part of what you contribute - that's free money!",
  "stock": "A small piece of ownership in a company. When you buy stock, you're buying a tiny fraction of that business.",
  "bond": "A loan you give to a company or government that they promise to pay back with interest. It's generally safer than stocks but offers lower returns.",
  "etf": "Similar to mutual funds, but traded like stocks throughout the day. ETFs (Exchange-Traded Funds) often have lower fees than mutual funds.",
  "mortgage": "A loan specifically for buying property. You pay it back over many years, and the property serves as collateral."
};

// Simple text-based similarity for finding relevant terms
function findRelevantTerms(query) {
  const results = [];
  
  for (const [term, definition] of Object.entries(financial_knowledge)) {
    // Simple word matching (can be improved with proper embeddings)
    const combinedText = term + ' ' + definition;
    const queryWords = query.toLowerCase().split(/\s+/);
    
    let matchCount = 0;
    queryWords.forEach(word => {
      if (word.length > 3 && combinedText.toLowerCase().includes(word)) {
        matchCount++;
      }
    });
    
    if (matchCount > 0) {
      results.push({ term, score: matchCount });
    }
  }
  
  // Sort by score and return top 3
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(item => item.term);
}

export async function POST(request) {
  try {
    const { message, sessionId } = await request.json();
    
    // Create or retrieve session
    let currentSessionId = sessionId;
    if (!currentSessionId || !sessions[currentSessionId]) {
      currentSessionId = crypto.randomUUID();
      sessions[currentSessionId] = {
        conversation: [],
        createdAt: new Date().toISOString()
      };
    }
    
    // Find relevant knowledge
    const relevantTerms = findRelevantTerms(message);
    const relevantKnowledge = relevantTerms.map(term => 
      `- ${term}: ${financial_knowledge[term]}`
    ).join('\n');
    
    // Add user message to history
    sessions[currentSessionId].conversation.push({ user: message });
    
    // Format conversation history
    const recentHistory = sessions[currentSessionId].conversation.slice(-5);
    let conversationContext = '';
    for (const exchange of recentHistory) {
      conversationContext += `User: ${exchange.user}\n`;
      if (exchange.bot) {
        conversationContext += `FinBot: ${exchange.bot}\n`;
      }
    }
    
    // Create prompt for Gemini
    const systemPrompt = `You are FinBot, a friendly financial advisor that explains concepts in simple language. 
Your goal is to make financial topics accessible and easy to understand. 
Use the provided financial knowledge to inform your responses, but explain 
everything in plain, jargon-free language. Use analogies and examples to help 
users understand complex concepts. Keep responses conversational and engaging. 
If you don't know something, be honest about it. Never make up financial information.`;
    
    const userPrompt = `Query: ${message}\n\nRelevant financial knowledge:\n${relevantKnowledge}`;
    
    // Combine all context
    const fullPrompt = `${systemPrompt}\n\nConversation history:\n${conversationContext}\n\n${userPrompt}`;
    
    // Generate response with Gemini
    const result = await model.generateContent(fullPrompt);
    const botResponse = result.response.text();
    
    // Add bot response to history
    sessions[currentSessionId].conversation[sessions[currentSessionId].conversation.length - 1].bot = botResponse;
    
    // Cleanup old sessions (simple memory management)
    const sessionIds = Object.keys(sessions);
    if (sessionIds.length > 1000) {
      const oldestSessions = sessionIds
        .map(id => ({ id, createdAt: sessions[id].createdAt }))
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
        .slice(0, 100);
      
      for (const { id } of oldestSessions) {
        delete sessions[id];
      }
    }
    
    return NextResponse.json({
      sessionId: currentSessionId,
      response: botResponse,
      relevantTerms
    });
  } catch (error) {
    console.error('Error in chat API:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}