import { NextResponse } from "next/server";

type VoiceAgentRequest = {
  utterance: string;
  context: {
    currentDate: string;
    currentPath?: string;
    preferences: {
      locale: string;
      currency: string;
    };
    categories: Array<{ id: string; name: string }>;
    wallets: Array<{ id: string; name: string; type: string }>;
    monthlySummary: {
      income: number;
      expenses: number;
      net: number;
    };
    recentTransactions: Array<{
      createdAt: string;
      amount: number;
      type: string;
      category: string;
      wallet: string;
      note?: string;
    }>;
  };
};

const SYSTEM_PROMPT = `You are Grain Voice, a finance voice assistant inside a personal finance tracker.

Return ONLY valid JSON with this shape:
{
  "reply": string,
  "action": {
    "type": "none" | "navigate" | "add_transaction",
    "path"?: string,
    "transaction"?: {
      "amount": number,
      "type": "income" | "expense",
      "categoryId": string,
      "walletId": string,
      "createdAt"?: string,
      "note"?: string
    }
  }
}

Rules:
- Use the provided categories and wallets exactly by id.
- If the user wants to add a transaction and enough details are available, return action.type = "add_transaction".
- If required data is missing or ambiguous, return action.type = "none" and ask one short follow-up question in reply.
- If the user asks about transactions or history, you may answer from context and optionally navigate to "/transactions".
- If the user asks about insights, spending, income, or this month summary, answer from context and optionally navigate to "/insights".
- Prefer short voice-friendly replies.
- Never invent categories or wallets that are not in the provided context.
- createdAt should be an ISO timestamp when you can infer it; otherwise omit it.
- If no action is needed, action.type must be "none".`;

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured on the server." },
      { status: 500 },
    );
  }

  const body = (await request.json()) as VoiceAgentRequest;
  if (!body.utterance.trim()) {
    return NextResponse.json({ error: "Utterance is required." }, { status: 400 });
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      response_format: { type: "json_object" },
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            utterance: body.utterance,
            context: body.context,
          }),
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return NextResponse.json(
      { error: `OpenAI request failed: ${errorText}` },
      { status: 500 },
    );
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    return NextResponse.json(
      { error: "OpenAI response did not include content." },
      { status: 500 },
    );
  }

  try {
    return NextResponse.json(JSON.parse(content));
  } catch {
    return NextResponse.json(
      { error: "Could not parse voice agent response." },
      { status: 500 },
    );
  }
}
