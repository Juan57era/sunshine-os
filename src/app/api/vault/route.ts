import { writeFile, appendFile, mkdir } from 'fs/promises';
import { join, normalize, dirname } from 'path';
import { existsSync } from 'fs';
import { NextRequest, NextResponse } from 'next/server';

const VAULT_BASE = '/Users/main/Library/Mobile Documents/iCloud~md~obsidian/Documents/Boveda 1';

function resolveSafePath(relativePath: string): string | null {
  // Reject any path traversal attempts
  if (relativePath.includes('../') || relativePath.includes('..\\')) return null;

  const resolved = normalize(join(VAULT_BASE, relativePath));

  // Ensure the resolved path stays within the vault
  if (!resolved.startsWith(VAULT_BASE + '/') && resolved !== VAULT_BASE) return null;

  return resolved;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, path: relativePath, content } = body as {
      action: 'write' | 'append';
      path: string;
      content: string;
    };

    if (!action || !relativePath || typeof content !== 'string') {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    if (action !== 'write' && action !== 'append') {
      return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
    }

    const fullPath = resolveSafePath(relativePath);
    if (!fullPath) {
      return NextResponse.json({ success: false, error: 'Invalid path' }, { status: 400 });
    }

    // Ensure parent directory exists
    const dir = dirname(fullPath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    if (action === 'write') {
      await writeFile(fullPath, content, 'utf-8');
    } else {
      await appendFile(fullPath, content, 'utf-8');
    }

    return NextResponse.json({ success: true, path: fullPath });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
