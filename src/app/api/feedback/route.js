import { NextResponse } from 'next/server';

// Reference to the same sessions object from chat.js
// In production, use a proper database
const sessions = {};

export async function POST(request) {
  try {
    const body = await request.json();
    const { sessionId, type, messageIndex, text = '' } = body;
    
    if (sessionId && sessions[sessionId]) {
      // Store feedback for future model improvements
      if (!sessions[sessionId].feedback) {
        sessions[sessionId].feedback = [];
      }
      
      sessions[sessionId].feedback.push({
        type,
        messageIndex,
        text,
        timestamp: new Date().toISOString()
      });
      
      return NextResponse.json({ status: 'success' });
    }
    
    return NextResponse.json(
      { error: 'Session not found' },
      { status: 404 }
    );
  } catch (error) {
    console.error('Error in feedback API:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}