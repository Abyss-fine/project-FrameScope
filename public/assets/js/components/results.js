const confidenceLabels={high:'Высокая',medium:'Средняя',low:'Низкая'};

export function resetResult(message='Выбери конфигурацию, чтобы получить оценку производительности.'){
  document.querySelectorAll('.metric strong').forEach(node=>node.firstChild.textContent='— ');
  document.querySelector('[data-result-state]').textContent='Ожидает расчёта';
  document.querySelector('[data-result-message]').textContent=message;
  document.querySelector('[data-results]').classList.remove('result-selected');
  const summary=document.querySelector('[data-result-summary]');
  summary.replaceChildren();const title=document.createElement('p');title.className='result-summary-title';title.textContent='Основа оценки';
  const note=document.createElement('p');note.textContent='Бенчмарк или прогноз появится после расчёта.';summary.append(title,note);
}

export function showResult(data){
  const estimated=data.resultType==='estimated';
  const format=value=>value===null?'—':new Intl.NumberFormat('ru-RU',{maximumFractionDigits:estimated?0:2}).format(value);
  [data.averageFps,data.onePercentLow,data.gpuUsage,data.cpuUsage].forEach((value,index)=>{
    document.querySelectorAll('.metric strong')[index].firstChild.textContent=(index===0&&estimated?'≈ ':'')+format(value)+' ';
  });
  document.querySelector('[data-result-state]').textContent=data.label;document.querySelector('[data-results]').classList.add('result-selected');
  const summary=document.querySelector('[data-result-summary]');summary.replaceChildren();
  const confidence=document.createElement('p');confidence.className='result-confidence';confidence.textContent='Уверенность: '+confidenceLabels[data.confidence];
  const explanation=document.createElement('p');explanation.className='result-explanation';explanation.textContent=data.explanation;
  summary.append(confidence,explanation);
  const message=document.querySelector('[data-result-message]');message.replaceChildren();
  const source=document.createElement('a');Object.assign(source,{className:'result-source',href:data.sourceUrl,target:'_blank',rel:'noopener noreferrer',textContent:'Источник: '+data.sourceName});
  const license=document.createElement('span');license.className='result-source-note';license.textContent=' · '+data.source.license;
  const limitation=document.createElement('span');limitation.className='result-short-note';
  limitation.textContent=(data.cpuConsidered?'CPU и RAM совпадают с основой.':'CPU и RAM не учитываются моделью.')+' '+(estimated?'Ориентир, не гарантия FPS.':'Результат тестовой системы.');
  message.append(source,license,limitation);
  // Метаданные остаются доступны для проверки результата, но не занимают основной экран.
  const details=document.createElement('details');details.className='result-method';
  const toggle=document.createElement('summary');toggle.textContent='Как получен результат';
  const text=document.createElement('p');text.textContent=data.limitations.join(' ');
  const date=document.createElement('p');date.textContent='Тест: '+(data.conditions.measuredAt??'дата не указана')+' · версия игры: '+(data.conditions.gameVersion??'не указана')+'.';
  details.append(toggle,text,date);message.append(details);
}
