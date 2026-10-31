export function normalizeName(value) {
  return String(value).normalize('NFKC').toLowerCase().replace(/[™®]/g, '')
    .replace(/[’‘']/g, '').replace(/\s+/g, ' ').trim();
}

export function hardwareIdentity(name, kind, formFactor = '') {
  let model = normalizeName(name).replace(/^(nvidia|amd|intel)\s+/, '');
  if (kind === 'cpu') model = model.replace(/\s+\d+-core processor$/, '');
  // Не удаляем Ti, SUPER, объём VRAM, Laptop, FE: это могут быть разные устройства.
  return `${model}|${kind === 'gpu' ? normalizeName(formFactor) : ''}`;
}

export function manufacturer(name) {
  if (/^(amd|radeon|ryzen)/i.test(name)) return 'AMD';
  if (/^(nvidia|geforce|quadro|rtx|gtx|tesla)/i.test(name)) return 'NVIDIA';
  if (/^(intel|iris|arc|core)/i.test(name)) return 'Intel';
  return 'Unknown';
}

export function slugify(name) {
  return normalizeName(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'game';
}
