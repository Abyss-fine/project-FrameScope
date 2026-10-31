import { apiRequest } from '../services/api.js';
import { createSearchCombobox } from './search-combobox.js';

const formFactor=value=>({Desktop:'Настольная',Mobile:'Мобильная','Desktop/Mobile':'Desktop / Mobile',Unknown:''}[value]??value??'');
export function createHardwareCombobox({kind,label,onChange}){
  return createSearchCombobox({
    name:kind,label,onChange,allowManual:true,
    placeholder:kind==='cpu'?'Например, Ryzen 5 5600':'Например, RTX 4070',
    optionHint:item=>kind==='gpu'?formFactor(item.form_factor):'',
    loadOptions:(query,signal)=>apiRequest('/hardware/'+(kind==='cpu'?'cpus':'gpus')+'?'+new URLSearchParams({search:query,limit:25}),{signal})
  });
}
