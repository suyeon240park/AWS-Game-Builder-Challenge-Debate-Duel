import type { Schema } from "./resource";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelCommandInput,
} from "@aws-sdk/client-bedrock-runtime";

// initialize bedrock runtime client
const client = new BedrockRuntimeClient();

interface DebateResponse {
  score: number;
  feedback: string;
}

export const handler: Schema["evaluateDebate"]["functionHandler"] = async (
  event,
  context
) => {
  const { topic, argument } = event.arguments;

  const input = {
    modelId: "anthropic.claude-3-haiku-20240307-v1:0",
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      system: `You are an expert debate judge. Evaluate the following argument for the topic: "${topic}"

                Argument: "${argument}"

                Rate the argument on a scale of 1-20 based on:

                1. Relevance to topic (1-5 points)
                2. Logical reasoning (1-5 points)
                3. Evidence/examples (1-5 points)
                4. Persuasiveness (1-5 points)

                Provide only a single number as your output`,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: argument,
            },
          ],
        },
      ],
      max_tokens: 1000,
      temperature: 0.8,
      response_format: { type: "json_object" },
    }),
  } as InvokeModelCommandInput;

  const command = new InvokeModelCommand(input);
  const response = await client.send(command);
  const data = JSON.parse(Buffer.from(response.body).toString());
  
  try {
    const result: DebateResponse = JSON.parse(data.content[0].text);
    return result;
  } catch (error) {
    console.error("Error parsing model response:", error);
    return {
      score: 0,
      feedback: "An error occurred while processing the response"
    };
  }
};
