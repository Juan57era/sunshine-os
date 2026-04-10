import OpenAI from 'openai';

const openai = new OpenAI();

export async function POST(req: Request) {
  const { text } = await req.json();

  if (!text || typeof text !== 'string') {
    return new Response('Missing text', { status: 400 });
  }

  // Limit to 4096 chars per request (OpenAI TTS limit)
  const cleaned = text
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/═+/g, '')
    .replace(/---+/g, '')
    .slice(0, 4096);

  const response = await openai.audio.speech.create({
    model: 'tts-1-hd',
    voice: 'nova',
    input: cleaned,
    speed: 1.0,
  });

  return new Response(response.body, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-cache',
    },
  });
}
