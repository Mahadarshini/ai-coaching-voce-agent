"use client";
import { Button } from '@/components/ui/button';
import { api } from '@/convex/_generated/api';
import { getToken } from '@/services/GlobalServices';
import { CoachingExpert } from '@/services/Options';
import { UserButton } from '@stackframe/stack';
import { useQuery } from 'convex/react';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import React, { useEffect, useRef, useState } from 'react'
import RecordRTC from 'recordrtc';

function DiscussionRoom() {
    const {roomid} = useParams();
    const DiscussionRoomData = useQuery(api.DiscussionRoom.GetDiscussionRoom, {id: roomid});
    const [expert, setExpert] = useState();
    const [enableMic, setEnableMic] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [transcribedText, setTranscribedText] = useState("");
    const [chatMessages, setChatMessages] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [debug, setDebug] = useState(""); // For displaying debug info
    
    const recorder = useRef(null);
    const streamRef = useRef(null);
    const recordingTimer = useRef(null);
    const silenceTimeOut = useRef(null);

    useEffect(() => {
        if(DiscussionRoomData) {
            const Expert = CoachingExpert.find(item => item.name == DiscussionRoomData.expertName);
            console.log("Expert data:", Expert);
            setExpert(Expert);
        }
    },[DiscussionRoomData]);

    // Cleanup on component unmount
    useEffect(() => {
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
            if (recorder.current) {
                recorder.current.stopRecording();
            }
            clearTimeout(silenceTimeOut.current);
            clearTimeout(recordingTimer.current);
        };
    }, []);

    // Log debug information
    const logDebug = (message) => {
        console.log(message);
        setDebug(prev => prev + "\n" + message);
    };

    // Initialize the microphone and recorder
    const startMicrophone = async () => {
        try {
            setEnableMic(true);
            addMessageToChat("System", "Starting interview session...");
            logDebug("Starting microphone...");
            
            // Get user media stream
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: { 
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                } 
            });
            
            logDebug("Got media stream");
            streamRef.current = stream;
            
            // Initialize recorder
            recorder.current = new RecordRTC(stream, {
                type: 'audio',
                mimeType: 'audio/webm',
                recorderType: RecordRTC.StereoAudioRecorder,
                numberOfAudioChannels: 1,
                desiredSampRate: 16000,
            });
            
            logDebug("Recorder initialized");
            
            // Start recording
            startRecording();
            
            // Add welcome message from interviewer
            setTimeout(() => {
                addMessageToChat(expert?.name || "Interviewer", "Hello! Welcome to this interview. Please introduce yourself and tell me a bit about your experience.");
            }, 1000);
            
        } catch (err) {
            console.error("Error accessing microphone:", err);
            logDebug("Microphone error: " + err.message);
            addMessageToChat("System", "Error accessing microphone. Please ensure your browser has permission to use the microphone.");
            setEnableMic(false);
        }
    };

    // Start recording user's speech
    const startRecording = () => {
        if (recorder.current && !isRecording) {
            recorder.current.startRecording();
            setIsRecording(true);
            logDebug("Started recording");
            addMessageToChat("System", "Listening... (speak your answer)");
            
            // Set a maximum recording duration (e.g., 30 seconds)
            recordingTimer.current = setTimeout(() => {
                if (isRecording) {
                    logDebug("Max duration reached, stopping recording");
                    stopRecording();
                }
            }, 30000); // 30 seconds max recording
            
            // Setup a timer to check for silence 
            startSilenceDetection();
        }
    };
    
    // Simple approach - use a timer to automatically stop after a period of silence
    const startSilenceDetection = () => {
        // Automatically stop after 3 seconds of silence (adjust as needed)
        silenceTimeOut.current = setTimeout(() => {
            logDebug("Silence detected, stopping recording");
            stopRecording();
        }, 3000);
    };

    // Stop recording and send audio to AssemblyAI for transcription
    const stopRecording = async () => {
        clearTimeout(recordingTimer.current);
        clearTimeout(silenceTimeOut.current);
        
        if (recorder.current && isRecording) {
            setIsRecording(false);
            logDebug("Stopping recording");
            
            recorder.current.stopRecording(async () => {
                const blob = recorder.current.getBlob();
                logDebug(`Recording stopped. Blob size: ${blob.size} bytes`);
                const audioUrl = URL.createObjectURL(blob);
                addMessageToChat("You", "🎤 Here's your recorded response:", audioUrl);
                try {
                  const transcript = await transcribeAudio(blob);
                  addMessageToChat("You", transcript);  // <-- ✅ This line adds the transcript to chat
          
                  const feedback = await getInterviewFeedback(transcript);
                  addMessageToChat("System", `Interview Feedback: ${feedback}`);
              } catch (error) {
                  logDebug(`Error during transcription or feedback: ${error}`);
                  addMessageToChat("System", "❌ Failed to process the recording.");
              }
          
              stopStream();
                // Only process if the blob has data (more than just a few bytes)
                if (blob.size > 1000) {
                    await transcribeAudio(blob);
                } else {
                    logDebug("Recording too short, ignoring");
                    // Start a new recording session after a short delay
                    setTimeout(() => {
                        if (enableMic) startRecording();
                    }, 500);
                }
            });
        }
    };

    // Send audio to AssemblyAI for transcription
    const transcribeAudio = async (audioBlob) => {
      setIsProcessing(true);
      addMessageToChat("System", "Processing your audio...");
  
      try {
          const token = await getToken();
          logDebug("Got API token");
  
          // Upload the blob directly
          const uploadResponse = await fetch("https://api.assemblyai.com/v2/upload", {
              method: "POST",
              headers: {
                  authorization: token,
                  "transfer-encoding": "chunked",
                  "content-type": "application/octet-stream"
              },
              body: audioBlob
          });
  
          if (!uploadResponse.ok) {
              throw new Error(`Upload failed with status: ${uploadResponse.status}`);
          }
  
          const { upload_url } = await uploadResponse.json();
          logDebug(`Audio uploaded. URL: ${upload_url}`);
  
          // Start transcription
          const transcriptResponse = await fetch("https://api.assemblyai.com/v2/transcript", {
              method: "POST",
              headers: {
                  authorization: token,
                  "content-type": "application/json"
              },
              body: JSON.stringify({ audio_url: upload_url })
          });
  
          if (!transcriptResponse.ok) {
              throw new Error(`Transcription request failed with status: ${transcriptResponse.status}`);
          }
  
          const { id: transcriptId } = await transcriptResponse.json();
          logDebug(`Transcription started. ID: ${transcriptId}`);
  
          // Poll for result
          const result = await checkTranscriptionStatus(transcriptId, token);
  
          if (result.text && result.text.trim()) {
              setTranscribedText(result.text);
              addMessageToChat("You", result.text);
              await generateAIResponse(result.text);
          } else {
              addMessageToChat("System", "No speech detected. Please try again.");
          }
      } catch (error) {
          console.error("Transcription error:", error);
          addMessageToChat("System", `Error transcribing audio: ${error.message}`);
      } finally {
          setIsProcessing(false);
          if (enableMic) {
              setTimeout(() => startRecording(), 1000);
          }
      }
  };
  

    // Poll for transcription status
    const checkTranscriptionStatus = async (transcriptId, token) => {
        const pollingEndpoint = `https://api.assemblyai.com/v2/transcript/${transcriptId}`;
        let attempts = 0;
        
        while (true) {
            attempts++;
            logDebug(`Polling attempt ${attempts}...`);
            
            const pollingResponse = await fetch(pollingEndpoint, {
                method: 'GET',
                headers: {
                    'authorization': token
                }
            });
            
            const transcriptionResult = await pollingResponse.json();
            logDebug(`Poll result: status = ${transcriptionResult.status}`);
            
            if (transcriptionResult.status === 'completed') {
                return transcriptionResult;
            } else if (transcriptionResult.status === 'error') {
                throw new Error(`Transcription failed: ${transcriptionResult.error}`);
            } else {
                // Wait before polling again
                logDebug("Waiting before next poll...");
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Safety check - don't poll forever
                if (attempts > 30) {
                    throw new Error("Transcription timed out after 30 polling attempts");
                }
            }
        }
    };

    // Generate AI response based on transcription
    const generateAIResponse = async (userText) => {
        // This is where you would integrate with your AI interviewer
        // For now, we'll just simulate a response
        setIsProcessing(true);
        logDebug("Generating AI response...");
        
        try {
            // Simulate API call to get AI response
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Mock interview questions based on user input
            let aiResponse;
            if (userText.toLowerCase().includes("hello") || userText.toLowerCase().includes("hi") || 
                userText.toLowerCase().includes("introduction") || userText.toLowerCase().includes("myself")) {
                aiResponse = "Thank you for the introduction. Could you tell me about a challenging project you've worked on recently?";
            } else if (userText.toLowerCase().includes("experience") || userText.toLowerCase().includes("background") || 
                     userText.toLowerCase().includes("project") || userText.toLowerCase().includes("work")) {
                aiResponse = "That's impressive! What would you say are your key strengths relevant to this position?";
            } else if (userText.toLowerCase().includes("strength") || userText.toLowerCase().includes("skill") ||
                      userText.toLowerCase().includes("good at")) {
                aiResponse = "Great. Can you describe a situation where you had to overcome a significant obstacle at work?";
            } else if (userText.toLowerCase().includes("challenge") || userText.toLowerCase().includes("obstacle") ||
                      userText.toLowerCase().includes("difficult")) {
                aiResponse = "Thank you for sharing that experience. Now, what interests you most about this position?";
            } else if (userText.toLowerCase().includes("interest") || userText.toLowerCase().includes("excited") ||
                      userText.toLowerCase().includes("like about")) {
                aiResponse = "Where do you see yourself professionally in the next 3-5 years?";
            } else {
                aiResponse = "I appreciate your response. Do you have any questions about the role or the company culture?";
            }
            
            logDebug(`AI response generated: "${aiResponse}"`);
            
            // Add AI response to chat
            addMessageToChat(expert?.name || "Interviewer", aiResponse);
            
        } catch (error) {
            console.error("Error generating AI response:", error);
            logDebug(`AI response error: ${error.message}`);
            addMessageToChat("System", "Error generating interviewer response.");
        } finally {
            setIsProcessing(false);
        }
    };

    // Add a message to the chat history
    const addMessageToChat = (sender, text, audioUrl = null) => {
      logDebug(`Adding message to chat - ${sender}: ${text}`);
      setChatMessages(prevMessages => [
          ...prevMessages, 
          { sender, text, audioUrl, timestamp: new Date() }
      ]);
  };

    const disconnect = (e) => {
        e.preventDefault();
        logDebug("Disconnecting...");
        
        // Stop recording and clean up
        if (recorder.current) {
            recorder.current.stopRecording();
            recorder.current = null;
        }
        
        // Stop all tracks in the media stream
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        
        // Clear timers
        clearTimeout(silenceTimeOut.current);
        clearTimeout(recordingTimer.current);
        
        // Reset state
        setEnableMic(false);
        setIsRecording(false);
        
        // Add message to chat
        addMessageToChat("System", "Interview session ended.");
        
        // Here you could generate feedback based on the interview
        setTimeout(() => {
            addMessageToChat("System", "Interview Feedback: You presented yourself well and provided thoughtful answers. Consider being more specific about your achievements and using the STAR method (Situation, Task, Action, Result) when describing your experiences.");
        }, 2000);
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
                            {isRecording && <p className='text-green-500 font-medium'>Recording...</p>}
                            {isProcessing && <p className='text-blue-500 font-medium'>Processing...</p>}
                        </div>
                    </div>
                    <div className='mt-5 flex items-center justify-center gap-4'>
                        {!enableMic ? 
                            <Button onClick={startMicrophone}>Start Interview</Button>
                            :
                            <Button variant="destructive" onClick={disconnect}>End Interview</Button>
                        }
                    </div>
                </div>
                <div>
                    <div className='h-[60vh] bg-secondary border rounded-4xl
                    flex flex-col p-4 relative'>
                        <h2 className='text-center font-bold mb-4'>Interview Conversation</h2>
                        <div className='flex-1 overflow-y-auto'>
                            {chatMessages.map((msg, index) => (
                                <div key={index} className={`mb-3 ${msg.sender === 'You' ? 'text-right' : 'text-left'}`}>
                                    <div className={`inline-block p-2 rounded-lg max-w-3/4 ${
                                        msg.sender === 'You' ? 'bg-blue-100' : 
                                        msg.sender === 'System' ? 'bg-gray-100 italic text-gray-500 text-sm' : 'bg-green-100'
                                    }`}>
                                        {msg.sender !== 'System' && <p className='font-bold text-xs'>{msg.sender}</p>}
                                        <p>{msg.text}</p>
                                        {msg.audioUrl && (
                                          <audio controls src={msg.audioUrl} className="mt-2 w-full rounded" />
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

