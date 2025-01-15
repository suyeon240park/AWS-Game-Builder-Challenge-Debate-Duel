import type { Schema } from "./resource";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelCommandInput,
} from "@aws-sdk/client-bedrock-runtime";

// initialize bedrock runtime client
const client = new BedrockRuntimeClient();

export const handler: Schema["createTopic"]["functionHandler"] = async (
    _event,
    _context
  ) => {
    const input = {
      modelId: "anthropic.claude-3-haiku-20240307-v1:0",
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        system: `You are a debate topic generator. Return topics that are thought-provoking and suitable for structured debate.`,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Create a debate topic in one line."
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
      
      return result.topic;
    } catch (error) {
      console.error("Error generating topic:", error);
      return "Should social media be banned?";
    }
  };
  