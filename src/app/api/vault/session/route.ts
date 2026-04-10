import { writeFile, mkdir } from 'fs/promises';
import { join, normalize, dirname } from 'path';
import { existsSync } from 'fs';
import { NextRequest, NextResponse } from 'next/server';

const VAULT_BASE = '/Users/main/Library/Mobile Documents/iCloud~md~obsidian/Documents/Boveda 1';

interface SessionBody {
  summary: string;
  decisions: string[];
  tasks: string[];
  projects: string[];
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
}

function buildSessionNote(body: SessionBody, date: string): string {
  const { summary, decisions, tasks, projects } = body;

  const decisionsBlock = decisions.length
    ? decisions.map((d) => `- ${d}`).join('\n')
    : '- (ninguna)';

  const tasksBlock = tasks.length
    ? tasks.map((t) => `- [ ] ${t}`).join('\n')
    : '- [ ] (ninguna)';

  const projectsBlock = projects.length
    ? projects.map((p) => `- [[${p}]]`).join('\n')
    : '- (ninguno)';

  const relatedBlock = projects.length
    ? projects.map((p) => `[[${p}]]`).join(', ')
    : '';

  return `---
fecha: ${date}
tipo: sesion
estado: completado
tags: [sunshine-os, auto-generated]
relacionado: [${relatedBlock}]
---

# Sesión SUNSHINE OS — ${date}

## Resumen
${summary}

## Decisiones
${decisionsBlock}

## Tareas generadas
${tasksBlock}

## Proyectos tocados
${projectsBlock}

## 🔗 Relacionado
${relatedBlock}
`;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SessionBody;
    const { summary, decisions, tasks, projects } = body;

    if (
      typeof summary !== 'string' ||
      !Array.isArray(decisions) ||
      !Array.isArray(tasks) ||
      !Array.isArray(projects)
    ) {
      return NextResponse.json({ success: false, error: 'Invalid body shape' }, { status: 400 });
    }

    const date = formatDate(new Date());
    const relativePath = `daily-notes/${date}-sesion-sunshine-os.md`;

    // Security: no path traversal
    const fullPath = normalize(join(VAULT_BASE, relativePath));
    if (!fullPath.startsWith(VAULT_BASE + '/')) {
      return NextResponse.json({ success: false, error: 'Invalid path' }, { status: 400 });
    }

    const dir = dirname(fullPath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    const content = buildSessionNote(body, date);
    await writeFile(fullPath, content, 'utf-8');

    return NextResponse.json({ success: true, path: fullPath });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
