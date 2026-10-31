import { apiRequest } from '../services/api.js';

const qualityLabels={quality:'Quality',balanced:'Balanced',performance:'Performance','ultra-performance':'Ultra Performance'};
const off={value:'off',label:'Выключено'};
export function createGraphicsControls({onChange}){
  const element=document.createElement('details');element.className='graphics-options';element.hidden=true;
  element.innerHTML='<summary>Дополнительные настройки</summary><p class="form-note graphics-status" role="status" hidden></p><div class="row g-3 mt-1 advanced-fields"></div>';
  const row=element.querySelector('.advanced-fields'),status=element.querySelector('.graphics-status');
  const selects={},columns={};let settings=null,revision=0,controller,loading=false;
  for(const [name,label]of [['rayTracingMode','Трассировка лучей'],['upscalingTechnology','Апскейлинг'],['upscalingQuality','Качество апскейлинга'],['frameGenerationMode','Генерация кадров']]){
    const column=document.createElement('div');column.className='col-12 col-sm-6 col-xl-4';
    const labelNode=document.createElement('label');Object.assign(labelNode,{className:'form-label',htmlFor:'pc-'+name,textContent:label});
    const select=document.createElement('select');Object.assign(select,{name,id:labelNode.htmlFor,className:'form-select'});
    selects[name]=select;columns[name]=column;column.append(labelNode,select);row.append(column);
  }
  function populate(select,options,preferred){
    select.replaceChildren(...options.map(item=>new Option(item.label,item.value)));
    select.value=options.some(item=>item.value===preferred)?preferred:options[0]?.value??'';
  }
  function dependencies(){
    const technology=settings?.upscaling.find(item=>item.value===selects.upscalingTechnology.value);
    const enabled=Boolean(technology&&technology.value!=='off');
    columns.upscalingQuality.hidden=!enabled;selects.upscalingQuality.disabled=!enabled;selects.upscalingQuality.required=enabled;
    populate(selects.upscalingQuality,(technology?.modes??[]).map(value=>({value,label:qualityLabels[value]??value})),selects.upscalingQuality.value);
    const frameModes=(settings?.frameGeneration??[off]).filter(item=>!item.upscalers||item.upscalers.includes(selects.upscalingTechnology.value));
    populate(selects.frameGenerationMode,frameModes,selects.frameGenerationMode.value);
    columns.rayTracingMode.hidden=(settings?.rayTracing.length??1)<=1;
    columns.upscalingTechnology.hidden=(settings?.upscaling.length??1)<=1;
    columns.frameGenerationMode.hidden=frameModes.length<=1;
    element.hidden=columns.rayTracingMode.hidden&&columns.upscalingTechnology.hidden&&columns.frameGenerationMode.hidden;
  }
  function baseline(){
    settings=null;
    populate(selects.rayTracingMode,[off],'off');populate(selects.upscalingTechnology,[{...off,label:'Выключено / Native',modes:[]}],'off');populate(selects.frameGenerationMode,[off],'off');
    dependencies();
  }
  baseline();
  for(const select of Object.values(selects))select.addEventListener('change',()=>{
    const fg=selects.frameGenerationMode.value;dependencies();
    status.hidden=!(fg!=='off'&&selects.frameGenerationMode.value==='off');
    if(!status.hidden)status.textContent='Генерация кадров отключена для выбранного апскейлинга.';
    onChange();
  });
  return{
    element,selects,get ready(){return !loading;},
    getValue(){return{rayTracingMode:selects.rayTracingMode.value,upscalingTechnology:selects.upscalingTechnology.value,upscalingQuality:selects.upscalingTechnology.value==='off'?null:selects.upscalingQuality.value,frameGenerationMode:selects.frameGenerationMode.value};},
    async update(gameId,gpuId){
      const token=++revision;controller?.abort();const old=this.getValue();baseline();status.hidden=true;
      if(!gameId){loading=false;onChange();return null;}
      loading=true;onChange();controller=new AbortController();
      try{
        const data=await apiRequest('/games/'+gameId+'/settings'+(gpuId?'?gpuId='+gpuId:''),{signal:controller.signal});
        if(token!==revision)return null;
        settings=data.analysis??{rayTracing:[off],upscaling:[{...off,modes:[]}],frameGeneration:[off]};
        populate(selects.rayTracingMode,settings.rayTracing,old.rayTracingMode);populate(selects.upscalingTechnology,settings.upscaling,old.upscalingTechnology);
        dependencies();
        if([...selects.upscalingQuality.options].some(option=>option.value===old.upscalingQuality))selects.upscalingQuality.value=old.upscalingQuality;
        if([...selects.frameGenerationMode.options].some(option=>option.value===old.frameGenerationMode))selects.frameGenerationMode.value=old.frameGenerationMode;
        const changed=Object.keys(old).some(key=>old[key]!==this.getValue()[key]&&old[key]!==null&&old[key]!=='off');
        status.hidden=!changed;if(changed)status.textContent='Настройки сброшены: для новой конфигурации нет подтверждённых данных.';
        return data;
      }catch(error){
        if(token===revision&&error.name!=='AbortError'){status.textContent='Не удалось проверить дополнительные настройки.';status.hidden=false;}
        return null;
      }finally{if(token===revision){loading=false;onChange();}}
    }
  };
}
