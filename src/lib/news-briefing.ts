interface NewsItem {
  title: string;
  source: string;
}

async function fetchJSON(url: string, timeout = 5000): Promise<unknown> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const res = await fetch(url, { signal: controller.signal, next: { revalidate: 300 } });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function getHackerNews(): Promise<NewsItem[]> {
  const ids = await fetchJSON('https://hacker-news.firebaseio.com/v0/topstories.json') as number[] | null;
  if (!ids) return [];

  const top = ids.slice(0, 15);
  const stories = await Promise.all(
    top.map(id => fetchJSON(`https://hacker-news.firebaseio.com/v0/item/${id}.json`) as Promise<{ title?: string } | null>)
  );

  return stories
    .filter((s): s is { title: string } => !!s?.title)
    .map(s => ({ title: s.title, source: 'HN' }));
}

async function getRedditNews(sub: string): Promise<NewsItem[]> {
  const data = await fetchJSON(`https://www.reddit.com/r/${sub}/hot.json?limit=8`) as {
    data?: { children?: Array<{ data: { title: string } }> }
  } | null;

  if (!data?.data?.children) return [];

  return data.data.children
    .map(c => ({ title: c.data.title, source: `r/${sub}` }))
    .slice(0, 6);
}

export async function getNewsBriefing(): Promise<string> {
  const [hn, worldnews, ai, geopolitics] = await Promise.all([
    getHackerNews(),
    getRedditNews('worldnews'),
    getRedditNews('artificial'),
    getRedditNews('geopolitics'),
  ]);

  const sections: string[] = [];

  if (ai.length > 0) {
    sections.push('AI/TECH:\n' + ai.map(n => `- ${n.title}`).join('\n'));
  }

  if (hn.length > 0) {
    const techOnly = hn.slice(0, 8);
    sections.push('TECH/STARTUPS (Hacker News):\n' + techOnly.map(n => `- ${n.title}`).join('\n'));
  }

  if (worldnews.length > 0) {
    sections.push('MUNDO:\n' + worldnews.map(n => `- ${n.title}`).join('\n'));
  }

  if (geopolitics.length > 0) {
    sections.push('GEOPOLITICA:\n' + geopolitics.map(n => `- ${n.title}`).join('\n'));
  }

  if (sections.length === 0) return '';

  return `\n\n═══════════════════════════════
NOTICIAS EN TIEMPO REAL (para briefing de inicio)
═══════════════════════════════
Fecha: ${new Date().toLocaleDateString('es-PR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
Hora: ${new Date().toLocaleTimeString('es-PR', { hour: '2-digit', minute: '2-digit' })}

${sections.join('\n\n')}

INSTRUCCIÓN: Usa estas noticias para el briefing de inicio. NO las listes todas — selecciona las 5-6 más relevantes para negocios, dinero, AI, y oportunidades. Resúmelas en frases cortas como si hablaras.`;
}
