const taipeiDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function hasReachedPublishDate(publishDate: Date, now = new Date()) {
  const scheduledDate = publishDate.toISOString().slice(0, 10);
  return scheduledDate <= taipeiDateFormatter.format(now);
}
