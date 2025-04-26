# app.py
from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
import json
import uuid
from datetime import datetime
import google.generativeai as genai
from dotenv import load_dotenv
load_dotenv()  # Load environment variables from .env file
app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Load API key from environment variable
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise ValueError("No Gemini API key found. Set the GEMINI_API_KEY environment variable.")

# Configure the Gemini API
genai.configure(api_key=GEMINI_API_KEY)

# Set up the model
model = genai.GenerativeModel('gemini-2.0-flash')

# Load financial knowledge base
with open('financial_knowledge.json', 'r') as f:
    financial_knowledge = json.load(f)

# In-memory session storage (in production, use Redis or a database)
sessions = {}

# Function to get embeddings from Gemini API
async def get_embedding(text):
    # Note: As of my knowledge cutoff, Gemini might not have a direct embeddings API like OpenAI's
    # This is a placeholder - you would need to use Google's text-embedding API or a suitable alternative
    # For now, we'll use a simple hashing technique as a placeholder
    import hashlib
    # Convert text to a numerical representation (this is NOT a proper embedding, just a placeholder)
    hash_object = hashlib.md5(text.encode())
    hash_hex = hash_object.hexdigest()
    # Convert hex to a list of floats (pseudo-embedding)
    embedding = [float(int(hash_hex[i:i+2], 16)) / 255.0 for i in range(0, len(hash_hex), 2)]
    # Pad to a standard length
    embedding = embedding + [0.0] * (128 - len(embedding))
    return embedding[:128]  # Return a fixed-length vector

# Create embeddings for the knowledge base
def create_embeddings(force_refresh=False):
    # Check if embeddings file exists
    if os.path.exists('embeddings.json') and not force_refresh:
        with open('embeddings.json', 'r') as f:
            return json.load(f)
    
    # Create new embeddings
    import asyncio
    knowledge_embeddings = {}
    
    async def process_embeddings():
        tasks = []
        for term, definition in financial_knowledge.items():
            tasks.append(get_embedding(f"{term}: {definition}"))
        return await asyncio.gather(*tasks)
    
    # Run embedding generation
    embeddings_list = asyncio.run(process_embeddings())
    
    # Assign embeddings to terms
    for i, (term, _) in enumerate(financial_knowledge.items()):
        knowledge_embeddings[term] = embeddings_list[i]
    
    # Save embeddings
    with open('embeddings.json', 'w') as f:
        json.dump(knowledge_embeddings, f)
    
    return knowledge_embeddings

# Find relevant knowledge for user query
async def find_relevant_knowledge(query, knowledge_embeddings):
    query_embedding = await get_embedding(query)
    
    # Calculate similarities
    similarities = {}
    for term, embedding in knowledge_embeddings.items():
        # Convert embedding back to numpy array for similarity calculation
        embedding_array = np.array(embedding)
        query_array = np.array(query_embedding)
        similarity = cosine_similarity([query_array], [embedding_array])[0][0]
        similarities[term] = float(similarity)  # Convert to float for JSON serialization
    
    # Get the most relevant terms (top 3)
    sorted_terms = sorted(similarities.items(), key=lambda x: x[1], reverse=True)
    return sorted_terms[:3]

# Generate response using Gemini
def generate_response(query, conversation_history, relevant_knowledge):
    # Format relevant knowledge
    knowledge_context = ""
    for term, score in relevant_knowledge:
        knowledge_context += f"- {term}: {financial_knowledge[term]}\n"
    
    # Create prompt for Gemini
    system_prompt = """You are FinBot, a friendly financial advisor that explains concepts in simple language. 
Your goal is to make financial topics accessible and easy to understand. 
Use the provided financial knowledge to inform your responses, but explain 
everything in plain, jargon-free language. Use analogies and examples to help 
users understand complex concepts. Keep responses conversational and engaging. 
If you don't know something, be honest about it. Never make up financial information."""
    
    user_prompt = f"Query: {query}\n\nRelevant financial knowledge:\n{knowledge_context}"
    
    # Format recent conversation history
    recent_history = conversation_history[-5:] if len(conversation_history) > 5 else conversation_history
    conversation_context = ""
    for exchange in recent_history:
        conversation_context += f"User: {exchange['user']}\n"
        if "bot" in exchange:
            conversation_context += f"FinBot: {exchange['bot']}\n"
    
    # Combine all context
    full_prompt = f"{system_prompt}\n\nConversation history:\n{conversation_context}\n\n{user_prompt}"
    
    # Generate response with Gemini
    response = model.generate_content(full_prompt)
    
    # Extract text from response
    return response.text

@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.json
    user_message = data.get('message')
    session_id = data.get('sessionId')
    
    # Create or retrieve session
    if not session_id or session_id not in sessions:
        session_id = str(uuid.uuid4())
        sessions[session_id] = {
            "conversation": [],
            "created_at": datetime.now().isoformat()
        }
    
    # Get embeddings (in production, this would be pre-computed and cached)
    try:
        knowledge_embeddings = create_embeddings()
        
        # Find relevant knowledge
        import asyncio
        relevant_knowledge = asyncio.run(find_relevant_knowledge(user_message, knowledge_embeddings))
        
        # Add user message to history
        sessions[session_id]["conversation"].append({"user": user_message})
        
        # Generate response
        bot_response = generate_response(
            user_message, 
            sessions[session_id]["conversation"], 
            relevant_knowledge
        )
        
        # Add bot response to history
        sessions[session_id]["conversation"][-1]["bot"] = bot_response
        
        # Cleanup old sessions (in production, use a proper session management system)
        # This is a simple implementation to prevent memory leaks
        if len(sessions) > 1000:
            # Remove oldest sessions if there are too many
            sessions_by_age = sorted(sessions.items(), key=lambda x: x[1]["created_at"])
            for old_session_id, _ in sessions_by_age[:100]:
                del sessions[old_session_id]
        
        return jsonify({
            "sessionId": session_id,
            "response": bot_response,
            "relevantTerms": [term for term, _ in relevant_knowledge]
        })
    
    except Exception as e:
        return jsonify({
            "error": str(e),
            "sessionId": session_id
        }), 500

@app.route('/api/feedback', methods=['POST'])
def feedback():
    data = request.json
    session_id = data.get('sessionId')
    feedback_type = data.get('type')  # positive or negative
    message_index = data.get('messageIndex')
    feedback_text = data.get('text', '')
    
    if session_id and session_id in sessions:
        # Store feedback for future model improvements
        if 'feedback' not in sessions[session_id]:
            sessions[session_id]['feedback'] = []
        
        sessions[session_id]['feedback'].append({
            "type": feedback_type,
            "messageIndex": message_index,
            "text": feedback_text,
            "timestamp": datetime.now().isoformat()
        })
        
        return jsonify({"status": "success"})
    
    return jsonify({"error": "Session not found"}), 404

if __name__ == '__main__':
    # Create a sample knowledge base file if it doesn't exist
    if not os.path.exists('financial_knowledge.json'):
        sample_knowledge = {
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
        }
        with open('financial_knowledge.json', 'w') as f:
            json.dump(sample_knowledge, f, indent=2)
    
    # Pre-generate embeddings on startup
    create_embeddings()
    
    app.run(debug=True, port=5000)