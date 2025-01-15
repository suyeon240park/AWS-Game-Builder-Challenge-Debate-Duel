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
  const { prompt } = event.arguments;

  const input = {
    modelId: "anthropic.claude-3-haiku-20240307-v1:0",
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      system: `You are an expert debate judge. Evaluate the following argument.
                Rate the argument on a scale of 1-20 based on:
                - Relevance to topic (1-5 points)
                - Logical reasoning (1-5 points)
                - Evidence/examples (1-5 points)
                - Persuasiveness (1-5 points)
                Return a JSON object with only a "score" field containing the total points as a number.`,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt
            },
          ],
        },
      ],
      max_tokens: 1000,
      temperature: 0.8,
      response_format: { type: "json_object" },
    }),
  } as InvokeModelCommandInput;

  try {
    const command = new InvokeModelCommand(input);
    const response = await client.send(command);
    const data = JSON.parse(Buffer.from(response.body).toString());
    const result = JSON.parse(data.content[0].text);
    
    // Return the score as an integer
    return Math.round(Number(result.score));
  } catch (error) {
    console.error("Error parsing model response:", error);
    return 0;
  }
};
