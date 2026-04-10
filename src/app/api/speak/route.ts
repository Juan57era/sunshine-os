import OpenAI from 'openai';

const openai = new OpenAI();

export async function POST(req: Request) {
  const { text } = await req.json();

  if (!text || typeof text !== 'string') {
    return new Response('Missing text', { status: 400 });
  }

  // Clean markdown and special chars for natural reading
  const cleaned = text
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/═+/g, '')
    .replace(/---+/g, ' ')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, '. ')
    .replace(/[*_~#`│┌┐└┘├┤]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 4096);

  const response = await openai.audio.speech.create({
    model: 'tts-1-hd',
    voice: 'shimmer',
    input: cleaned,
    speed: 0.95,
  });

  return new Response(response.body, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-cache',
    },
  });
}
