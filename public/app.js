(() => {
  const appScript = document.currentScript;
  if (!appScript) {
    throw new Error('Tidak dapat menentukan lokasi app.js untuk memuat modul aplikasi.');
  }

  const modules = [
    'supabase-igd.js',
    'mppcare-core.js',
    'dashboard.js',
    'workspace-mpp.js',
    'arsip-mpp.js',
    'form-ppa.js',
    'tindak-lanjut-mpp.js',
    'form-a.js'
  ];
  if (document.getElementById('view-igd')) modules.push('igd.js');
  const loadModule = (index) => {
    if (index >= modules.length) {
      window.dispatchEvent(new Event('mppcare:modules-ready'));
      return;
    }
    const moduleScript = document.createElement('script');
    moduleScript.src = new URL(modules[index], appScript.src).href;
    moduleScript.onload = () => loadModule(index + 1);
    moduleScript.onerror = () => {
      console.error(`Gagal memuat modul ${modules[index]}.`);
    };
    document.head.appendChild(moduleScript);
  };

  loadModule(0);
})();
