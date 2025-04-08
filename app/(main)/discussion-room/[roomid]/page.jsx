"use client"
import { Button } from '@/components/ui/button';
import { api } from '@/convex/_generated/api';
import { getToken } from '@/services/GlobalServices';
import { CoachingExpert } from '@/services/Options';
import { UserButton, useStackApp } from '@stackframe/stack';
import { RealtimeTranscriber } from 'assemblyai';
import { useQuery } from 'convex/react';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import React, { useEffect, useRef, useState } from 'react'
//import dynamic from 'next/dynamic';
//const RecordRTC = dynamic(() => import("recordrtc"),{ssr: false});
import RecordRTC from 'recordrtc';

function DiscussionRoom() {
    const {roomid}=useParams();
    const DiscussionRoomData=useQuery(api.DiscussionRoom.GetDiscussionRoom,{id:roomid});
    const [expert,setExpert]=useState();
    const [enableMic,setEnableMic]=useState(false);
    const recorder= useRef(null);
    const realtimeTranscriber=useRef(null);
    const [transcriptText, setTranscriptText] = useState('');
    const chatEndRef = useRef(null);
    let silenceTimeOut;

    useEffect(()=>{
        if(DiscussionRoomData){
            const Expert=CoachingExpert.find(item=>item.name==DiscussionRoomData.expertName);
            console.log(Expert);
            setExpert(Expert);
        }
    },[DiscussionRoomData])

    useEffect(() => {
        if (chatEndRef.current) {
          chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      }, [transcriptText]);

    const connectToServer = async () => {
        setEnableMic(true);
      
        // Create the WebSocket connection to Deepgram
        const socket = new WebSocket(
          `wss://api.deepgram.com/v1/listen?punctuate=true&language=en`,
          ["token", process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY]
        );
      
        // Store it in a ref
        realtimeTranscriber.current = socket;
      
        // Setup WebSocket event handlers
        socket.onopen = () => {
          console.log("✅ Connected to Deepgram");
      
          // Now that socket is ready, start the mic + recorder
          navigator.mediaDevices.getUserMedia({ audio: true })
            .then((stream) => {
              recorder.current = new RecordRTC(stream, {
                type: 'audio',
                mimeType: 'audio/webm;codecs=pcm',
                recorderType: RecordRTC.StereoAudioRecorder,
                timeSlice: 250,
                desiredSampRate: 16000,
                numberOfAudioChannels: 1,
                bufferSize: 4096,
                audioBitsPerSecond: 128000,
                ondataavailable: async (blob) => {
                  if (!realtimeTranscriber.current || realtimeTranscriber.current.readyState !== 1) {
                    console.warn("❌ WebSocket not ready");
                    return;
                  }
      
                  console.log("🎙️ Audio blob received");
      
                  const arrayBuffer = await blob.arrayBuffer();
                  const uint8Array = new Uint8Array(arrayBuffer);
      
                  console.log("📤 Sending audio data");
                  realtimeTranscriber.current.send(uint8Array);
      
                  // Silence detection
                  clearTimeout(silenceTimeOut);
                  silenceTimeOut = setTimeout(() => {
                    console.log('🛑 User stopped talking');
                  }, 2000);
                },
              });
      
              recorder.current.startRecording();
              console.log("🎬 Started recording audio stream.");
            })
            .catch((err) => {
              console.error("🎤 Mic error:", err);
            });
        };
      
        socket.onmessage = (message) => {
          const data = JSON.parse(message.data);
          const transcript = data.channel?.alternatives[0]?.transcript;
          if (transcript && transcript.length > 0) {
            setTranscriptText(prev => prev + ' ' + transcript);
          }
        };
      
        socket.onerror = (err) => {
          console.error("❌ WebSocket error:", err);
        };
      
        socket.onclose = () => {
          console.log("📴 WebSocket closed");
        };
      };
      

      const disconnect = async (e) => {
        e.preventDefault();
      
        if (realtimeTranscriber.current) {
          realtimeTranscriber.current.close();
          realtimeTranscriber.current = null;
        }
      
        if (recorder.current) {
          recorder.current.stopRecording(() => {
            recorder.current = null;
          });
        }
      
        setEnableMic(false);
        setTranscriptText('');
      };
      


    return (
        <div className='-mt-12'>
            <h2 className='text-lg font-bold'>{DiscussionRoomData?.coachingOption}</h2>
            <div className='mt-5 grid grid-cols-1 lg:grid-cols-3 gap-10'>
                <div className='lg:col-span-2'>
                    <div className=' h-[60vh] bg-secondary border rounded-4xl
                    flex flex-col items-center justify-center relative'>
                        <Image src={expert?.avatar} alt='Avatar' width={200} height={200}
                            className='h-[80px] w-[80px] rounded-full object-cover animate-pulse'
                        />
                        <h2 className='text-gray-500'>{expert?.name}</h2>
                        <div className='p-5 bg-gray-200 px-10 rounded-lg absolute bottom-10 right-10'>
                            <UserButton />
                        </div>
                    </div>
                    <div className='mt-5 flex items-center justify-center'>
                        {!enableMic ?<Button onClick={connectToServer}>Connect</Button>
                        :
                        <Button variant="destructive" onClick={disconnect}>Disconnect</Button>}
                    </div>
                </div>
                <div>
                    <div className='h-[60vh] bg-secondary border rounded-4xl
                    flex flex-col items-center justify-center relative'>
                        
                        <h2>Chat Section</h2>
                        <div className="p-4 text-sm text-black w-full h-full overflow-y-scroll">
                            {transcriptText || "Live transcription will appear here..."}
                        </div>
                        <div ref={chatEndRef}></div>

                    </div>
                    <h2 className='mt-4 text-gray-400 text-sm'>At the end of your conversation we will automatically generate feedback/notes from your conversation</h2>
                </div>
            </div>
        </div>
    );
};

export default DiscussionRoom
