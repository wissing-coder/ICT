const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

export function renderHome(template, env = process.env) {
  const links = [];
  const icp = env.ICP_NUMBER?.trim();
  if (icp) {
    links.push(`<a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">${escapeHtml(icp)}</a>`);
  }
  const police = env.POLICE_NUMBER?.trim();
  const policeCode = env.POLICE_CODE?.trim();
  if (police && /^\d{10,30}$/.test(policeCode || '')) {
    links.push(`<a href="https://beian.mps.gov.cn/#/query/webSearch?code=${policeCode}" target="_blank" rel="noopener noreferrer">${escapeHtml(police)}</a>`);
  }
  return template.replace('<!-- registration-links -->', links.join(' · '));
}
