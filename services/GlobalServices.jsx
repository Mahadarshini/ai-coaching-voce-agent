import axios from "axios";
import OpenAI from "openai";
import { CoachingOption } from "./Options";

export const getToken = async() => {
    const result = await axios.get('/api/getToken');
    return result.data;
};

const openai = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.NEXT_PUBLIC_AI_OPENROUTER,
    dangerouslyAllowBrowser: true
});

// Enhanced AI model function that maintains conversation context
export const AIModel = async (topic, coachingOption, msg, conversationHistory = []) => {
  
  try {
      // Find the coaching option
      const option = CoachingOption.find((item) => item.name === coachingOption);
      if (!option) {
          throw new Error("Coaching option not found");
      }

      // Create system prompt by replacing template
      const PROMPT = option.prompt.replace('{user_topic}', topic);

      // Build messages array with history
      const messages = [
          { role: "assistant", content: PROMPT },
          ...(conversationHistory || []), // defensive fallback
          { role: "user", content: msg }
      ];

      // Make the API call
      const completion = await openai.chat.completions.create({
          model: "mistralai/mixtral-8x7b-instruct",
          messages: messages,
          max_tokens: 120,
          temperature: 0.7,
      });

      console.log("AI raw response:", JSON.stringify(completion, null, 2));

      // Defensive check
      if (
          completion &&
          completion.choices &&
          Array.isArray(completion.choices) &&
          completion.choices[0]?.message?.content
      ) {
          return completion.choices[0].message.content;
      } else {
          console.warn("Unexpected AI response format:", completion);
          return "I'm sorry, I didn't understand that. Let's try again.";
      }
  } catch (error) {
      console.error("Error in AIModel:", error);
      return "I'm sorry, I couldn't process that response. Let's continue with the interview.";
  }
};


// Function to get interview feedback from the conversation
export const getInterviewFeedback = async (transcript, conversation = []) => {
    try {
        const feedbackPrompt = `
            Review this interview response and provide constructive feedback:
            
            User's response: "${transcript}"
            
            Provide brief, specific, and actionable feedback on:
            1. Content quality
            2. Communication style
            3. Areas for improvement
            
            Keep your feedback under 150 characters and be encouraging.
        `;

        const completion = await openai.chat.completions.create({
            model: "google/gemini-2.5-pro-exp-03-25:free", 
            messages: [
              { role: "system", content: feedbackPrompt }
            ],
            max_tokens: 150,
            temperature: 0.7,
        });

        return completion.choices[0].message.content;
    } catch (error) {
        console.error("Error getting feedback:", error);
        return "Good response. Continue focusing on specific examples and clear communication.";
    }
};