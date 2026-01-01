import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export async function POST() {
  try {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    if (!anthropicKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not set in environment variables" },
        { status: 500 }
      );
    }

    const anthropic = new Anthropic({ apiKey: anthropicKey });
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 10,
      messages: [
        {
          role: "user",
          content: "Say 'Claude connection successful!'",
        },
      ],
    });

    const message =
      response.content[0]?.type === "text"
        ? response.content[0].text
        : "Connection successful!";

    return NextResponse.json({
      success: true,
      message: message,
      model: response.model,
    });
  } catch (error: any) {
    console.error("Claude API error:", error);

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "Unknown error occurred" },
      { status: 500 }
    );
  }
}
