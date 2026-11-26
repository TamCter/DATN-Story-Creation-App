import type { StoryChapter, StoryProject } from '../types/story';

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

export function countParagraphs(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean).length;
}

export function estimateReadingMinutes(wordCount: number): number {
  if (wordCount <= 0) return 0;
  return Math.max(1, Math.ceil(wordCount / 220));
}

function sanitizeFilename(name: string): string {
  return (
    name
      .trim()
      .replace(/[<>:"/\\|?*]+/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 80) || 'ban-thao'
  );
}

function triggerDownload(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportSingleChapter(
  projectTitle: string,
  chapter: StoryChapter,
  format: 'md' | 'txt'
) {
  const heading = chapter.title || `Chương ${chapter.chapterNumber}`;
  let body = '';
  if (format === 'md') {
    body = `# ${heading}\n\n`;
    if (chapter.desc?.trim()) {
      body += `> ${chapter.desc.trim()}\n\n`;
    }
    body += `${chapter.content || ''}\n`;
  } else {
    body = `${heading.toUpperCase()}\n${'='.repeat(Math.min(60, heading.length))}\n\n`;
    if (chapter.desc?.trim()) {
      body += `Tóm tắt: ${chapter.desc.trim()}\n\n`;
    }
    body += `${chapter.content || ''}\n`;
  }

  const filename = `${sanitizeFilename(projectTitle)}-${sanitizeFilename(heading)}.${format}`;
  triggerDownload(filename, body, format === 'md' ? 'text/markdown' : 'text/plain');
}

export function exportFullProject(
  project: StoryProject,
  chapters: StoryChapter[],
  format: 'md' | 'txt'
) {
  const sorted = [...chapters].sort((a, b) => a.chapterNumber - b.chapterNumber);
  let body = '';

  if (format === 'md') {
    body = `# ${project.title}\n\n`;
    if (project.summary?.trim() || project.desc?.trim()) {
      body += `_${(project.summary || project.desc || '').trim()}_\n\n---\n\n`;
    }
    sorted.forEach((ch, idx) => {
      const heading = ch.title || `Chương ${ch.chapterNumber}`;
      body += `## ${heading}\n\n`;
      if (ch.desc?.trim()) {
        body += `> ${ch.desc.trim()}\n\n`;
      }
      body += `${ch.content || ''}\n`;
      if (idx < sorted.length - 1) body += `\n---\n\n`;
    });
  } else {
    body = `${project.title.toUpperCase()}\n${'='.repeat(Math.min(60, project.title.length))}\n\n`;
    if (project.summary?.trim() || project.desc?.trim()) {
      body += `${(project.summary || project.desc || '').trim()}\n\n`;
    }
    sorted.forEach((ch, idx) => {
      const heading = ch.title || `Chương ${ch.chapterNumber}`;
      body += `${heading}\n${'-'.repeat(Math.min(50, heading.length))}\n\n`;
      body += `${ch.content || ''}\n`;
      if (idx < sorted.length - 1) body += `\n\n`;
    });
  }

  const filename = `${sanitizeFilename(project.title)}-full.${format}`;
  triggerDownload(filename, body, format === 'md' ? 'text/markdown' : 'text/plain');
}
