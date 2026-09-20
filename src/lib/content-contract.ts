export interface ContractIronman {
  id: string;
  data: { day: number; section: string; description: string; publishDate: Date };
}
export interface ContractExtension {
  id: string;
  data: { slug: string; relatedDays?: number[] };
}
export interface ContractProject {
  learningMap: { sections: Array<{ id: string }> };
  publication: { schedule: Array<{ day: number; date: string }> };
}

export function assertContentContract(ironman: ContractIronman[], extensions: ContractExtension[], project: ContractProject) {
  const errors: string[] = [];
  const days = new Map<number, string>();
  const sectionIds = new Set(project.learningMap.sections.map((section) => section.id));
  const schedule = new Map(project.publication.schedule.map((item) => [item.day, item.date]));
  for (const post of ironman) {
    const prior = days.get(post.data.day);
    if (prior) errors.push(`${post.id}: day=${post.data.day} duplicates ${prior}`);
    days.set(post.data.day, post.id);
    if (!post.data.description?.trim()) errors.push(`${post.id}: description is required`);
    if (!sectionIds.has(post.data.section)) errors.push(`${post.id}: section=${post.data.section} expected configured learningMap section`);
    const expectedDate = schedule.get(post.data.day);
    const receivedDate = post.data.publishDate.toISOString().slice(0, 10);
    if (expectedDate && receivedDate !== expectedDate) errors.push(`${post.id}: publishDate=${receivedDate} expected ${expectedDate}`);
  }
  const slugs = new Map<string, string>();
  for (const post of extensions) {
    const prior = slugs.get(post.data.slug);
    if (prior) errors.push(`${post.id}: slug=${post.data.slug} duplicates ${prior}`);
    slugs.set(post.data.slug, post.id);
    const related = post.data.relatedDays ?? [];
    if (new Set(related).size !== related.length) errors.push(`${post.id}: relatedDays contains duplicate value`);
    for (const day of related) if (!days.has(day)) errors.push(`${post.id}: relatedDays=${day} expected existing Ironman Day`);
  }
  if (errors.length) throw new Error(`Invalid content index:\n${errors.join('\n')}`);
}
