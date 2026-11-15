/**
 * Headless memory control. No website/UI changes.
 * Examples:
 * node scripts/memory.mjs status
 * node scripts/memory.mjs recall "договор поставки"
 * node scripts/memory.mjs remember "важное правило"
 * node scripts/memory.mjs replace <uuid> "новая редакция"
 * node scripts/memory.mjs retract <uuid>
 */
import {memoryOverview,recallMemory,rememberManual,supersedeMemory,retractMemory} from "../server/long-memory.mjs";
const [command,...args]=process.argv.slice(2);
try{
  let result;
  if(command==="status") result=memoryOverview();
  else if(command==="recall"){
    if(!args.length)throw new Error("Укажите запрос для поиска");
    result={matches:recallMemory(args.join(" "),{limit:15})};
  }else if(command==="remember"){
    if(!args.length)throw new Error("Укажите текст для сохранения");
    result=rememberManual(args.join(" "));
  }else if(command==="replace"){
    if(args.length<2)throw new Error("Укажите ID старой записи и новую формулировку");
    result=supersedeMemory(args[0],args.slice(1).join(" "));
  }else if(command==="retract"){
    if(args.length!==1)throw new Error("Укажите ID записи");
    result=retractMemory(args[0]);
  }else{
    console.error("Использование: node scripts/memory.mjs status|recall|remember|replace|retract");
    process.exitCode=64;
  }
  if(result!==undefined)console.log(JSON.stringify(result,null,2));
}catch(error){
  console.error("[YATSUMIRA MEMORY] "+(error instanceof Error?error.message:String(error)));
  process.exitCode=1;
}
