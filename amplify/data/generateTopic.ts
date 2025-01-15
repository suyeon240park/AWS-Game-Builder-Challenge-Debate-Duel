import type { Schema } from "./resource";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelCommandInput,
} from "@aws-sdk/client-bedrock-runtime";

const client = new BedrockRuntimeClient();

export const handler: Schema["createTopic"]["functionHandler"] = async (
  event,
  context
) => {
  const input = {
    modelId: "anthropic.claude-3-haiku-20240307-v1:0",
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      messages: [
        {
          role: "system",
          content: `Generate an engaging debate topic. The topic should be:
- Controversial but not offensive
- Suitable for a 2-player debate
- Clear and concise
- Interesting and thought-provoking
Return only the topic as a plain text string, without quotes or additional formatting.`
        },
        {
          role: "user",
          content: "Generate a debate topic."
        }
      ],
      max_tokens: 1000,
      temperature: 0.9 // Higher temperature for more creative topics
    })
  } as InvokeModelCommandInput;

  try {
    const command = new InvokeModelCommand(input);
    const response = await client.send(command);
    
    const responseBody = Buffer.from(response.body).toString();
    console.log("Raw response:", responseBody);
    
    const data = JSON.parse(responseBody);
    console.log("Parsed data:", data);
    
    // Extract the topic from the response
    const topic = data.content[0].text.trim();
    
    // Basic validation
    if (!topic || topic.length < 5) {
      console.error("Invalid topic generated:", topic);
      return "Should social media be banned?"; // fallback topic
    }
    
    return topic;
  } catch (error) {
    console.error("Error generating topic:", error);
    return "Should social media be banned?"; // fallback topic
  }
};
