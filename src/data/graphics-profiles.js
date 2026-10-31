// Проверенные подмножества настроек, не универсальная матрица всех патчей и драйверов.
// Наличие пункта в меню НЕ означает наличие бенчмарка для него.
const quality = ['quality', 'balanced', 'performance'];
export const graphicsProfiles = {
  'cyberpunk-2077': {
    scope: 'Windows PC, настройки по документированным обновлениям до 2.3. Версия установленной игры не определяется.',
    presets: ['low','medium','high','ultra'],
    // RT High не добавлен: подтверждены Low, Medium, Ultra и отдельный Path Tracing Overdrive.
    rt: ['low','medium','ultra','overdrive'],
    upscalers: [
      { value:'dlss',label:'NVIDIA DLSS · Super Resolution',prefix:'dlss',requires:'rtx',modes:[...quality,'ultra-performance'] },
      { value:'fsr-2.1',label:'AMD FSR 2.1',prefix:'fsr 2.1',requires:'fsr',modes:[...quality,'ultra-performance'] },
      { value:'xess-2.0',label:'Intel XeSS 2.0',prefix:'xess 2.0',requires:'arc',modes:quality }
    ],
    frameGeneration: [
      { value:'dlss-fg',label:'Включено — NVIDIA DLSS Frame Generation',requires:'rtx-fg',upscalers:['dlss'] },
      { value:'fsr-3.1-fg',label:'Включено — AMD FSR 3.1 Frame Generation',requires:'fsr',upscalers:['dlss','fsr-2.1','xess-2.0'] },
      { value:'xess-2.0-fg',label:'Включено — Intel XeSS 2.0 Frame Generation',requires:'arc',upscalers:['xess-2.0'] }
    ],
    notes: ['Показан проверенный набор, а не все возможности современных версий. XeSS включён только для подтверждённых Arc A/B; другие GPU требуют отдельной проверки. Multi Frame Generation и драйверные подмены не представлены.'],
    sources: ['https://www.cyberpunk.net/fr/news/51683/notes-de-patch-2-3','https://www.nvidia.com/en-us/geforce/technologies/dlss/','https://gpuopen.com/learn/amd_fsr_3_1_release/','https://www.intel.com/content/www/us/en/developer/articles/technical/xess2-whitepaper.html']
  },
  control: {
    scope: 'Control Ultimate Edition, Windows DX12. Учитываются документированные настройки и дополнения 1.30; версия пользователя не определяется.',
    presets: ['low','medium','high'], rt:['medium','high','ultra'],
    upscalers: [{value:'dlss',label:'NVIDIA DLSS · Super Resolution',prefix:'dlss',requires:'rtx',modes:quality}],
    frameGeneration: [],
    notes: ['В Control режимы Quality / Balanced / Performance соответствуют выбору DLSS Rendering Resolution в игре, а не отдельным пунктам с такими названиями. Ultra относится к обновлению 1.30. Генерация кадров в этом справочнике не подтверждена и не предлагается.'],
    sources: ['https://www.nvidia.com/en-gb/geforce/news/nvidia-dlss-2-0-a-big-leap-in-ai-rendering/','https://remedy.helpshift.com/hc/en/4-control-ultimate-edition/faq/164-control-ultimate-edition---v1-30-pc-update-notes-1772026035/']
  }
};
