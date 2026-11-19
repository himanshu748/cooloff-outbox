function messageUrl(fields) {
  if (
    !fields ||
    !['to', 'subject', 'body'].every(
      (key) => typeof fields[key] === 'string',
    ) ||
    fields.to.length > 254 ||
    fields.subject.length > 200 ||
    fields.body.length > 8000 ||
    !/^[^\s@<>:,;?&#]+@[^\s@<>:,;?&#]+\.[^\s@<>:,;?&#]+$/.test(fields.to) ||
    /[\r\n]/.test(fields.subject)
  )
    throw new Error('Use one email address and a subject without line breaks.');
  return (
    'mailto:' +
    encodeURIComponent(fields.to) +
    '?subject=' +
    encodeURIComponent(fields.subject) +
    '&body=' +
    encodeURIComponent(fields.body)
  );
}
function copyPayload(text) {
  if (typeof text !== 'string' || text.length > 9000)
    throw Error('Invalid clipboard text');
  return text;
}
module.exports = { messageUrl, copyPayload };
