(() => {
  const app = window.MPPCare;
  if (!app) throw new Error('mppcare-core.js harus dimuat sebelum pengaturan-tampilan.js.');

  const storageKey = 'mppcare-appearance-v1';
  const defaults = { theme: 'emerald', font: 'jakarta', density: 'comfortable' };
  const valid = {
    theme: ['emerald', 'ocean', 'orchid', 'terracotta', 'citrus', 'midnight'],
    font: ['jakarta', 'nunito', 'atkinson', 'source-serif'],
    density: ['comfortable', 'compact'],
  };
  let wired = false;

  function readSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
      return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [
        key,
        valid[key].includes(saved[key]) ? saved[key] : fallback,
      ]));
    } catch {
      return { ...defaults };
    }
  }

  function applySettings(settings) {
    document.body.dataset.mppTheme = settings.theme;
    document.body.dataset.mppFont = settings.font;
    document.body.dataset.mppDensity = settings.density;
    document.querySelectorAll('.appearance-skin').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.theme === settings.theme));
    });
    const fontSelect = document.getElementById('pilihanFontTampilan');
    if (fontSelect) fontSelect.value = settings.font;
    const density = document.querySelector(`input[name="kepadatanTampilan"][value="${settings.density}"]`);
    if (density) density.checked = true;
  }

  function saveSettings(settings) {
    localStorage.setItem(storageKey, JSON.stringify(settings));
    applySettings(settings);
  }

  function mount() {
    applySettings(readSettings());
    const modal = document.getElementById('modalPengaturanTampilan');
    const openButton = document.getElementById('bukaPengaturanTampilan');
    if (!modal || !openButton || wired) return;
    wired = true;

    openButton.addEventListener('click', () => bootstrap.Modal.getOrCreateInstance(modal).show());
    document.getElementById('pilihanSkinTampilan')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-theme]');
      if (!button) return;
      saveSettings({ ...readSettings(), theme: button.dataset.theme });
    });
    document.getElementById('pilihanFontTampilan')?.addEventListener('change', (event) => {
      saveSettings({ ...readSettings(), font: event.target.value });
    });
    document.querySelectorAll('input[name="kepadatanTampilan"]').forEach((input) => {
      input.addEventListener('change', () => saveSettings({ ...readSettings(), density: input.value }));
    });
    document.getElementById('resetTampilan')?.addEventListener('click', () => saveSettings({ ...defaults }));
  }

  app.modules.appearanceSettings = { mount };
  applySettings(readSettings());
})();