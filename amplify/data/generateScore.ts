import type { Schema } from "./resource";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelCommandInput,
} from "@aws-sdk/client-bedrock-runtime";

// initialize bedrock runtime client
const client = new BedrockRuntimeClient();

export const handler: Schema["evaluateDebate"]["functionHandler"] = async (
  event,
  _context
) => {
  // User prompt
  const prompt = event.arguments.prompt;

  // Invoke model
  const input = {
    modelId: process.env.MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      system:    
      "You are a debate judge. Evaluate the argument on a scale of 1-20 based on relevance, logic, evidence, and persuasiveness. Return only the score as a number. No extra text.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt,
            },
          ],
        },
      ],
      max_tokens: 1000,
      temperature: 0.5,
    }),
  } as InvokeModelCommandInput;

  try {
    const command = new InvokeModelCommand(input);
    const response = await client.send(command);
    
    const data = JSON.parse(Buffer.from(response.body).toString());
    
    // Convert the response to a number and round it
    const score = Math.round(Number(data.content[0].text));
    
    // Validate the score
    if (isNaN(score)) {
      console.error("Invalid score received:", data.content[0].text);
      return 0;
    }
    return score;
    
  } catch (error) {
    console.error("Error in evaluateDebate:", error);
    return 0;
  }
};