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
      system: `You are a debate topic generator. Generate thought-provoking topics suitable for structured debate.`,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Create a debate topic in one line. Return a JSON object with a 'topic' field containing the topic as a string."
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
    console.log("Raw Bedrock response:", response); // Debug log

    const responseBody = Buffer.from(response.body).toString();
    console.log("Response body:", responseBody); // Debug log

    const data = JSON.parse(responseBody);
    console.log("Parsed data:", data); // Debug log

    const result = JSON.parse(data.content[0].text);
    console.log("Final result:", result); // Debug log

    if (!result.topic) {
      console.error("No topic in result:", result);
      throw new Error('No topic generated');
    }

    return result.topic;
  } catch (error) {
    console.error("Error generating topic:", error);
    return "Should social media be regulated by governments?"; // Fallback topic
  }
};
