export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
    keyLength: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0
  });
}
