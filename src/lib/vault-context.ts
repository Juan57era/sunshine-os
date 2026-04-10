import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

const VAULT_PATH = '/Users/main/Library/Mobile Documents/iCloud~md~obsidian/Documents/Boveda 1';

const MAX_FILE_SIZE = 3000; // chars per file
const MAX_TOTAL_CONTEXT = 15000; // total chars injected

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '\n[... truncado]';
}

async function safeReadFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return null;
  }
}

async function safeReadDir(path: string): Promise<string[]> {
  try {
    return await readdir(path);
  } catch {
    return [];
  }
}

export async function getVaultContext(): Promise<string> {
  const sections: string[] = [];
  let totalChars = 0;

  const addSection = (title: string, content: string) => {
    const truncated = truncate(content, MAX_FILE_SIZE);
    if (totalChars + truncated.length > MAX_TOTAL_CONTEXT) return;
    sections.push(`### ${title}\n${truncated}`);
    totalChars += truncated.length;
  };

  // 1. Active projects (all from proyectos/)
  const projectFiles = await safeReadDir(join(VAULT_PATH, 'proyectos'));
  const mdProjects = projectFiles.filter(f => f.endsWith('.md'));

  for (const file of mdProjects) {
    const content = await safeReadFile(join(VAULT_PATH, 'proyectos', file));
    if (!content) continue;
    // Only include active projects
    if (content.includes('estado: activo') || !content.includes('estado:')) {
      const name = file.replace('.md', '');
      addSection(`Proyecto: ${name}`, content);
    }
  }

  // 2. Recent daily/session notes (last 3)
  const dailyFiles = await safeReadDir(join(VAULT_PATH, 'daily-notes'));
  const sortedDaily = dailyFiles
    .filter(f => f.endsWith('.md'))
    .sort()
    .reverse()
    .slice(0, 3);

  for (const file of sortedDaily) {
    const content = await safeReadFile(join(VAULT_PATH, 'daily-notes', file));
    if (!content) continue;
    const name = file.replace('.md', '');
    addSection(`Sesión: ${name}`, content);
  }

  // 3. Active ideas
  const ideaFiles = await safeReadDir(join(VAULT_PATH, 'ideas'));
  const mdIdeas = ideaFiles.filter(f => f.endsWith('.md'));

  for (const file of mdIdeas) {
    const content = await safeReadFile(join(VAULT_PATH, 'ideas', file));
    if (!content) continue;
    if (content.includes('estado: activo') || content.includes('estado: inbox')) {
      const name = file.replace('.md', '');
      addSection(`Idea: ${name}`, content);
    }
  }

  // 4. Key personas
  const personaFiles = await safeReadDir(join(VAULT_PATH, 'personas'));
  const mdPersonas = personaFiles.filter(f => f.endsWith('.md'));

  for (const file of mdPersonas.slice(0, 5)) {
    const content = await safeReadFile(join(VAULT_PATH, 'personas', file));
    if (!content) continue;
    const name = file.replace('.md', '');
    addSection(`Persona: ${name}`, content);
  }

  if (sections.length === 0) {
    return '';
  }

  return `\n\n═══════════════════════════════
CONTEXTO DEL VAULT (Obsidian - Boveda 1)
═══════════════════════════════

${sections.join('\n\n')}`;
}
