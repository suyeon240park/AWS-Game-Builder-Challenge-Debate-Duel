import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

const bedrock = new BedrockRuntimeClient({
  region: process.env.NEXT_PUBLIC_AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.NEXT_PUBLIC_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY!
  }
});

export const calculateArgumentScore = async (
  argument: string, 
  topic: string
): Promise<number> => {
  try {
    const prompt = `
      You are an expert debate judge. Evaluate the following argument for the topic: "${topic}"
      
      Argument: "${argument}"
      
      Rate the argument on a scale of 1-20 based on:
      - Relevance to topic (1-5 points)
      - Logical reasoning (1-5 points)
      - Evidence/examples (1-5 points)
      - Persuasiveness (1-5 points)
      
      Provide only a single number as the total score. Do not include any other text.
    `;

    const payload = {
      prompt: `\n\nHuman: ${prompt}\n\nAssistant:`,
      max_tokens_to_sample: 100,
      temperature: 0.5,
      top_k: 250,
      top_p: 1,
      stop_sequences: ["\n\nHuman:"],
      anthropic_version: "bedrock-2023-05-31"
    };

    const command = new InvokeModelCommand({
      modelId: "anthropic.claude-v2",
      contentType: "application/json",
      accept: "*/*",
      body: JSON.stringify(payload)
    });

    const response = await bedrock.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const score = parseInt(responseBody.completion.trim(), 10);

    // Validate score is within expected range
    if (isNaN(score) || score < 1 || score > 20) {
      throw new Error('Invalid score returned from AI');
    }

    return score;

  } catch (error) {
    console.error('Error calculating score:', error);
    // Return a default score if AI scoring fails
    return 10;
  }
};
