import type { Schema } from "./resource";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelCommandInput,
} from "@aws-sdk/client-bedrock-runtime";

const client = new BedrockRuntimeClient();

export const handler: Schema["evaluateDebate"]["functionHandler"] = async (
  event,
  context
) => {
  const { prompt } = event.arguments;

  const input = {
    modelId: "anthropic.claude-3-haiku-20240307-v1:0",
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      messages: [
        {
          role: "system",
          content: `You are an expert debate judge. Evaluate the following argument.
Rate the argument on a scale of 1-20 based on:
- Relevance to topic (1-5 points)
- Logical reasoning (1-5 points)
- Evidence/examples (1-5 points)
- Persuasiveness (1-5 points)
Provide consistent, fair scoring based on debate standards.
Return only a JSON object with a single "score" field containing the total points as a number.`
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 1000,
      temperature: 0.2
    })
  } as InvokeModelCommandInput;

  try {
    const command = new InvokeModelCommand(input);
    const response = await client.send(command);
    
    const responseBody = Buffer.from(response.body).toString();
    console.log("Raw response:", responseBody);
    
    const data = JSON.parse(responseBody);
    console.log("Parsed data:", data);
    
    // For Haiku, the response structure is slightly different
    let result;
    try {
      // The response might be already in JSON format
      result = typeof data.content === 'string' ? JSON.parse(data.content) : data.content;
    } catch (e) {
      console.error("Error parsing content:", e);
      return 0;
    }

    // Ensure we return an integer
    const score = Math.round(Number(result.score));
    if (isNaN(score)) {
      console.error("Invalid score:", result);
      return 0;
    }
    
    return score;
  } catch (error) {
    console.error("Error in generateScore:", error);
    return 0;
  }
};
