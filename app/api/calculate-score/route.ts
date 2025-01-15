import { NextResponse } from 'next/server';
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

// Create the Bedrock client
const bedrock = new BedrockRuntimeClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
  }
});

export async function POST(request: Request) {
  try {
    const { argument, topic } = await request.json();

    const prompt = `
      You are an expert debate judge. Evaluate the following argument for the topic: "${topic}"
      
      Argument: "${argument}"
      
      Rate the argument on a scale of 1-20 based on:
      - Relevance to topic (1-5 points)
      - Logical reasoning (1-5 points)
      - Evidence/examples (1-5 points)
      - Persuasiveness (1-5 points)
      
      Provide only a single number as the total score.
    `;

    const command = new InvokeModelCommand({
      modelId: "anthropic.claude-v2",
      contentType: "application/json",
      accept: "*/*",
      body: JSON.stringify({
        prompt: `\n\nHuman: ${prompt}\n\nAssistant:`,
        max_tokens_to_sample: 100,
        temperature: 0.5,
        top_k: 250,
        top_p: 1,
        stop_sequences: ["\n\nHuman:"],
        anthropic_version: "bedrock-2023-05-31"
      })
    });

    const response = await bedrock.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const score = parseInt(responseBody.completion.trim(), 10);

    return NextResponse.json({ score });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to calculate score' }, { status: 500 });
  }
}
