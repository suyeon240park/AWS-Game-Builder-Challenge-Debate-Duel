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
    modelId: process.env.MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Generate a single debate topic in one concise sentence only. No additional text.",
            },
          ],
        },
      ],
      max_tokens: 1000,
      temperature: 0.5,
    }),
  } as InvokeModelCommandInput;

  const command = new InvokeModelCommand(input);

  const response = await client.send(command);

  const data = JSON.parse(Buffer.from(response.body).toString());

  return data.content[0].text;
};
