"use client";
import { Button } from '@/components/ui/button';
import { api } from '@/convex/_generated/api';
import { CoachingExpert } from '@/services/Options';
import { AIModel } from '@/services/GlobalServices';
import { UserButton } from '@stackframe/stack';
import { useQuery } from 'convex/react';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import React, { useEffect, useRef, useState } from 'react';

function DiscussionRoom() {
    const { roomid } = useParams();
    const DiscussionRoomData = useQuery(api.DiscussionRoom.GetDiscussionRoom, { id: roomid });
    const [expert, setExpert] = useState();
    const [enableMic, setEnableMic] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [chatMessages, setChatMessages] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [debug, setDebug] = useState("");
    
    // Web Speech API references
    const recognitionRef = useRef(null);
    const conversationHistoryRef = useRef([]);
    
    // Chat container ref for auto-scrolling
    const chatContainerRef = useRef(null);

    useEffect(() => {
        if(DiscussionRoomData) {
            const Expert = CoachingExpert.find(item => item.name === DiscussionRoomData.expertName);
            setExpert(Expert);
        }
    }, [DiscussionRoomData]);

    // Auto-scroll chat to bottom when new messages are added
    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [chatMessages]);

    // Cleanup on component unmount
    useEffect(() => {
        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
        };
    }, []);

    const logDebug = (message) => {
        console.log(message);
        setDebug(prev => prev + "\n" + message);
    };

    const startSpeechRecognition = () => {
        try {
            setEnableMic(true);
            addMessageToChat("System", "Starting interview session...");
            logDebug("Initializing Web Speech API...");
            
            // Check if Speech Recognition is supported
            if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
                throw new Error("Speech recognition not supported in this browser");
            }
            
            // Initialize speech recognition
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            const recognition = new SpeechRecognition();
            recognitionRef.current = recognition;
            
            // Configure recognition settings
            recognition.continuous = false; // Get complete thoughts as one result
            recognition.interimResults = false; // Only get final results
            recognition.lang = 'en-US'; // Set language
            
            // Add welcome message from interviewer
            setTimeout(() => {
                const welcomeMessage = "Hello! Welcome to this interview. Please introduce yourself and tell me a bit about your experience.";
                addMessageToChat(expert?.name || "Interviewer", welcomeMessage);
                conversationHistoryRef.current.push({ role: "assistant", content: welcomeMessage });
                
                // Start listening after welcome message
                setTimeout(() => {
                    startListening();
                }, 1000);
            }, 1000);
            
        } catch (err) {
            console.error("Speech recognition error:", err);
            logDebug("Speech recognition error: " + err.message);
            addMessageToChat("System", "Error: Speech recognition not available in this browser. Please try Chrome, Edge, or Safari.");
            setEnableMic(false);
        }
    };

    const startListening = () => {
        if (!recognitionRef.current) return;
        
        const recognition = recognitionRef.current;
        
        // Define event handlers
        recognition.onstart = () => {
            setIsListening(true);
            logDebug("Speech recognition started");
            addMessageToChat("System", "Listening... (speak your answer)");
        };
        
        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            const confidence = event.results[0][0].confidence;
            
            logDebug(`Speech recognized: "${transcript}" (confidence: ${confidence.toFixed(2)})`);
            
            if (transcript && transcript.trim()) {
                addMessageToChat("You", transcript);
                processUserResponse(transcript);
            } else {
                logDebug("Empty transcript, retrying...");
                // If no speech detected, restart listening
                setTimeout(() => {
                    if (enableMic) startListening();
                }, 1000);
            }
        };
        
        recognition.onerror = (event) => {
            logDebug(`Recognition error: ${event.error}`);
            
            // Don't show error to user unless it's a critical error
            if (event.error !== 'no-speech') {
                addMessageToChat("System", `Speech recognition error: ${event.error}`);
            }
            
            // Restart listening if it was just a temporary error
            if (enableMic && ['no-speech', 'audio-capture', 'network'].includes(event.error)) {
                setTimeout(() => startListening(), 1000);
            }
        };
        
        recognition.onend = () => {
            setIsListening(false);
            logDebug("Speech recognition ended");
            
            // Don't automatically restart here - we'll restart after processing
        };
        
        // Start the recognition
        try {
            recognition.start();
        } catch (err) {
            logDebug(`Error starting recognition: ${err.message}`);
            // If there's an error (like recognition is already running), wait and retry
            setTimeout(() => {
                if (enableMic) startListening();
            }, 1000);
        }
    };

    const processUserResponse = async (transcript) => {
        try {
            setIsProcessing(true);
            
            // Add user's message to conversation history
            conversationHistoryRef.current.push({ role: "user", content: transcript });
            
            // Generate AI response
            await generateAIResponse(transcript);
            
        } catch (error) {
            console.error("Error processing response:", error);
            logDebug(`Processing error: ${error.message}`);
            addMessageToChat("System", "Error processing your response.");
        } finally {
            setIsProcessing(false);
        }
    };

    const generateAIResponse = async (userText) => {
        logDebug("Generating AI response...");

        try {
            // Always use your AI model, even in development
            const aiResponse = await AIModel(
                DiscussionRoomData?.topic,
                DiscussionRoomData?.coachingOption,
                userText,
                conversationHistoryRef.current // Full chat history for better context
            );
    
            logDebug(`AI response generated: "${aiResponse}"`);
    
            // Add AI response to chat and memory
            addMessageToChat(expert?.name || "Interviewer", aiResponse);
            conversationHistoryRef.current.push({ role: "assistant", content: aiResponse });
    
        } catch (error) {
            console.error("Error generating AI response:", error);
            logDebug(`AI response error: ${error.message}`);
            addMessageToChat("System", "Sorry, there was an issue generating the AI's response.");
        } finally {
            // Continue the conversation
            setTimeout(() => {
                if (enableMic) startListening();
            }, 1000);
        }
    };        
            
            // // In development, use mock responses for quick testing
            // if (process.env.NODE_ENV === 'development') {
            //     // Simple keyword-based response logic for development/testing
            //     const userTextLower = userText.toLowerCase();
                
            //     if (userTextLower.includes("hello") || userTextLower.includes("hi") || 
            //         userTextLower.includes("introduction") || userTextLower.includes("myself")) {
            //         aiResponse = "Thank you for the introduction. Could you tell me about a challenging project you've worked on recently?";
            //     } else if (userTextLower.includes("experience") || userTextLower.includes("background") || 
            //              userTextLower.includes("project") || userTextLower.includes("work")) {
            //         aiResponse = "That's impressive! What would you say are your key strengths relevant to this position?";
            //     } else if (userTextLower.includes("strength") || userTextLower.includes("skill") ||
            //               userTextLower.includes("good at")) {
            //         aiResponse = "Great. Can you describe a situation where you had to overcome a significant obstacle at work?";
            //     } else if (userTextLower.includes("challenge") || userTextLower.includes("obstacle") ||
            //               userTextLower.includes("difficult")) {
            //         aiResponse = "Thank you for sharing that experience. Now, what interests you most about this position?";
            //     } else if (userTextLower.includes("interest") || userTextLower.includes("excited") ||
            //               userTextLower.includes("like about")) {
            //         aiResponse = "Where do you see yourself professionally in the next 3-5 years?";
            //     } else {
            //         aiResponse = "I appreciate your response. Do you have any questions about the role or the company culture?";
            //     }
                
            //     // Add artificial delay to simulate API call
            //     await new Promise(resolve => setTimeout(resolve, 1500)); } else {
                // In production, use the real AI model

    const addMessageToChat = (sender, text, audioUrl = null) => {
        setChatMessages(prevMessages => [
            ...prevMessages, 
            { sender, text, audioUrl, timestamp: new Date() }
        ]);
    };

    const disconnect = () => {
        logDebug("Ending interview session...");
        
        // Stop speech recognition
        if (recognitionRef.current) {
            recognitionRef.current.stop();
            recognitionRef.current = null;
        }
        
        // Reset state
        setEnableMic(false);
        setIsListening(false);
        
        // Add message to chat
        addMessageToChat("System", "Interview session ended.");
        
        // Generate interview feedback based on the conversation
        setTimeout(async () => {
            let feedback;
            
            try {
                // In development, use mock feedback
                if (process.env.NODE_ENV === 'development') {
                    feedback = "Interview Feedback: You presented yourself well and provided thoughtful answers. Consider being more specific about your achievements and using the STAR method when describing your experiences.";
                } else {
                    // In production, generate feedback based on the conversation
                    const userResponses = conversationHistoryRef.current
                        .filter(msg => msg.role === "user")
                        .map(msg => msg.content)
                        .join(" ");
                        
                    // Use your AI feedback function here or another approach
                    feedback = await getInterviewFeedback(userResponses);
                }
                
                addMessageToChat("System", feedback);
            } catch (error) {
                console.error("Error generating feedback:", error);
                addMessageToChat("System", "Unable to generate detailed feedback. Thank you for participating in this interview practice session.");
            }
        }, 2000);
    };

    // Placeholder for feedback function if not using the one from GlobalServices
    const getInterviewFeedback = async (responseText) => {
        // In a real implementation, this would call your AI model
        return "Interview Feedback: You provided detailed responses and demonstrated enthusiasm. Work on structuring your answers more concisely using the STAR method where applicable.";
    };

    return (
        <div className='-mt-12'>
            <h2 className='text-lg font-bold'>{DiscussionRoomData?.coachingOption}</h2>
            <div className='mt-5 grid grid-cols-1 lg:grid-cols-3 gap-10'>
                <div className='lg:col-span-2'>
                    <div className='h-[60vh] bg-secondary border rounded-4xl
                    flex flex-col items-center justify-center relative'>
                        {expert && (
                            <Image src={expert.avatar} alt='Avatar' width={200} height={200}
                                className='h-[80px] w-[80px] rounded-full object-cover animate-pulse'
                            />
                        )}
                        <h2 className='text-gray-500'>{expert?.name}</h2>
                        <div className='p-5 bg-gray-200 px-10 rounded-lg absolute bottom-10 right-10'>
                            <UserButton />
                        </div>
                        <div className='absolute bottom-10 left-10'>
                            {isListening && <p className='text-green-500 font-medium flex items-center'>
                                <span className="w-3 h-3 bg-green-500 rounded-full mr-2 animate-pulse"></span>
                                Listening...
                            </p>}
                            {isProcessing && <p className='text-blue-500 font-medium flex items-center'>
                                <span className="w-3 h-3 bg-blue-500 rounded-full mr-2 animate-pulse"></span>
                                Processing...
                            </p>}
                        </div>
                    </div>
                    <div className='mt-5 flex items-center justify-center gap-4'>
                        {!enableMic ? 
                            <Button onClick={startSpeechRecognition} className="px-6 py-2">Start Interview</Button>
                            :
                            <Button variant="destructive" onClick={disconnect} className="px-6 py-2">End Interview</Button>
                        }
                    </div>
                </div>
                <div>
                    <div className='h-[60vh] bg-secondary border rounded-4xl
                    flex flex-col p-4 relative'>
                        <h2 className='text-center font-bold mb-4'>Interview Conversation</h2>
                        <div 
                            ref={chatContainerRef}
                            className='flex-1 overflow-y-auto'
                        >
                            {chatMessages.map((msg, index) => (
                                <div key={index} className={`mb-3 ${msg.sender === 'You' ? 'text-right' : 'text-left'}`}>
                                    <div className={`inline-block p-2 rounded-lg max-w-[75%] ${
                                        msg.sender === 'You' ? 'bg-blue-100' : 
                                        msg.sender === 'System' ? 'bg-gray-100 italic text-gray-500 text-sm' : 'bg-green-100'
                                    }`}>
                                        {msg.sender !== 'System' && <p className='font-bold text-xs'>{msg.sender}</p>}
                                        <p>{msg.text}</p>
                                        {msg.audioUrl && (
                                            <audio controls src={msg.audioUrl} className="mt-2 w-full rounded h-8" />
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className='mt-4'>
                        <h2 className='text-gray-400 text-sm'>At the end of your interview, we will automatically generate feedback/notes from your conversation</h2>
                        {/* Debug panel - can remove in production */}
                        <details className='mt-2'>
                            <summary className='text-xs text-gray-500 cursor-pointer'>Debug Info</summary>
                            <pre className='text-xs text-gray-500 mt-1 p-2 bg-gray-100 rounded overflow-auto max-h-40'>
                                {debug}
                            </pre>
                        </details>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default DiscussionRoom;

