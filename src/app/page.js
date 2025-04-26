"use client";
import { useState, useEffect, useRef } from "react";
import Head from "next/head";
import { FiSend, FiInfo, FiThumbsUp, FiThumbsDown } from "react-icons/fi";

export default function Home() {
  const [message, setMessage] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [relevantTerms, setRelevantTerms] = useState([]);
  const chatEndRef = useRef(null);

  useEffect(() => {
    // Load session from localStorage if available
    const savedSession = localStorage.getItem("finbot_session");
    const savedHistory = localStorage.getItem("finbot_history");

    if (savedSession) {
      setSessionId(savedSession);
    }

    if (savedHistory) {
      setChatHistory(JSON.parse(savedHistory));
    } else {
      // Add welcome message if no history
      setChatHistory([
        {
          type: "bot",
          content:
            "Hi there! I'm FinBot, your friendly financial guide. I can explain financial terms and concepts in simple language. What would you like to know about today?",
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  }, []);

  useEffect(() => {
    // Save chat history to localStorage
    if (chatHistory.length > 0) {
      localStorage.setItem("finbot_history", JSON.stringify(chatHistory));
    }
  }, [chatHistory]);

  useEffect(() => {
    // Save session ID to localStorage
    if (sessionId) {
      localStorage.setItem("finbot_session", sessionId);
    }
  }, [sessionId]);

  useEffect(() => {
    // Scroll to bottom of chat
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  const handleSendMessage = async (e) => {
    e.preventDefault();

    if (!message.trim()) return;

    // Add user message to chat
    const userMessage = {
      type: "user",
      content: message,
      timestamp: new Date().toISOString(),
    };

    setChatHistory([...chatHistory, userMessage]);
    setMessage("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: userMessage.content,
          sessionId: sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
      }
  
      const data = await response.json();
  

      // Save session ID if new
      if (data.sessionId && !sessionId) {
        setSessionId(data.sessionId);
      }

      // Save relevant terms
      if (data.relevantTerms) {
        setRelevantTerms(data.relevantTerms);
      }

      // Add bot response to chat
      setChatHistory([
        ...chatHistory,
        userMessage,
        {
          type: "bot",
          content: data.response,
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (error) {
      console.error("Error sending message:", error);

      // Add error message to chat
      setChatHistory([
        ...chatHistory,
        userMessage,
        {
          type: "bot",
          content:
            "Sorry, I'm having trouble connecting to my financial brain right now. Please try again in a moment.",
          isError: true,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFeedback = async (messageIndex, feedbackType) => {
    const updatedHistory = [...chatHistory];

    // Only allow feedback on bot messages
    if (updatedHistory[messageIndex].type !== "bot") return;

    // Set feedback if not already set
    if (!updatedHistory[messageIndex].feedback) {
      updatedHistory[messageIndex].feedback = feedbackType;
      setChatHistory(updatedHistory);

      // Send feedback to server
      try {
        const response = await fetch("/api/feedback", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sessionId,
            type: feedbackType,
            messageIndex,
          }),
        });
        
        // Check if response is OK
        if (!response.ok) {
          throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
        }
      } catch (error) {
        console.error("Error sending feedback:", error);
      }
    }
  };

  const formatMessage = (content) => {
    // Convert markdown-style formatting to HTML
    // This is a simple implementation - for production, use a proper markdown parser
    let formattedContent = content;

    // Bold text (handle **text**)
    formattedContent = formattedContent.replace(
      /\*\*(.*?)\*\*/g,
      "<strong>$1</strong>"
    );

    // Line breaks
    formattedContent = formattedContent.replace(/\n/g, "<br>");

    return formattedContent;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>FinBot - Financial Education Chatbot</title>
        <meta
          name="description"
          content="Learn about financial concepts in simple language"
        />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="container mx-auto max-w-7xl">
        <header className="bg-blue-600 text-white p-4 rounded-b-lg shadow-md">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">FinBot</h1>
            <p className="text-sm">Your friendly financial guide</p>
          </div>
        </header>

        {/* Chat container */}
        <div className="flex flex-col md:flex-row h-[calc(100vh-80px)]">
          {/* Main chat area */}
          <div className="flex-grow flex flex-col bg-white rounded-lg shadow-md m-4 overflow-hidden">
            {/* Messages */}
            <div className="flex-grow p-4 overflow-y-auto">
              {chatHistory.map((chat, index) => (
                <div
                  key={index}
                  className={`mb-4 ${chat.type === "user" ? "text-right" : ""}`}
                >
                  <div
                    className={`inline-block max-w-[80%] p-3 rounded-lg ${
                      chat.type === "user"
                        ? "bg-blue-100 text-blue-900"
                        : chat.isError
                        ? "bg-red-100 text-red-900"
                        : "bg-gray-100 text-gray-900"
                    }`}
                  >
                    <div
                      dangerouslySetInnerHTML={{
                        __html: formatMessage(chat.content),
                      }}
                      className="text-sm md:text-base"
                    />

                    {/* Feedback buttons for bot messages */}
                    {chat.type === "bot" && (
                      <div className="flex justify-end mt-2 text-xs text-gray-500">
                        <button
                          onClick={() => handleFeedback(index, "positive")}
                          className={`p-1 ${
                            chat.feedback === "positive" ? "text-green-500" : ""
                          }`}
                          aria-label="Thumbs up"
                        >
                          <FiThumbsUp />
                        </button>
                        <button
                          onClick={() => handleFeedback(index, "negative")}
                          className={`p-1 ml-2 ${
                            chat.feedback === "negative" ? "text-red-500" : ""
                          }`}
                          aria-label="Thumbs down"
                        >
                          <FiThumbsDown />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start mb-4">
                  <div className="bg-gray-100 text-gray-900 p-3 rounded-lg">
                    <div className="flex space-x-2">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                      <div
                        className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: "0.2s" }}
                      ></div>
                      <div
                        className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: "0.4s" }}
                      ></div>
                    </div>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            <form
              onSubmit={handleSendMessage}
              className="border-t border-gray-300 p-4 "
            >
              <div className="flex items-center flex-row ">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Ask about a financial term or concept..."
                  className="flex-grow p-2 border border-gray-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isLoading}
                />
                <button
                  type="submit"
                  className="bg-blue-700 text-white p-2 rounded-r-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-blue-300"
                  disabled={isLoading || !message.trim()}
                >
                  <FiSend className="w-6 h-6" />
                </button>
              </div>
            </form>
          </div>

          {/* Sidebar for relevant terms */}
          <div className="hidden md:block  bg-white rounded-lg w-2/5 min-w-2xs shadow-md m-4 p-4 overflow-y-auto">
            <h2 className="text-lg font-semibold mb-3 flex items-center">
              <FiInfo className="mr-2" /> Related Terms
            </h2>

            {relevantTerms.length > 0 ? (
              <ul className="space-y-2">
                {relevantTerms.map((term, index) => (
                  <li key={index}>
                    <button
                      onClick={() => {
                        setMessage(`What is ${term}?`);
                      }}
                      className="text-left w-full p-2 bg-gray-100 hover:bg-blue-100 rounded text-sm"
                    >
                      {term.charAt(0).toUpperCase() + term.slice(1)}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">
                Ask about a financial term to see related concepts
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
