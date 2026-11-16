/**
 * Offline automatic batch comparison: <name>.old.txt + <name>.new.txt.
 * No cloud calls, no background process, no additional packages.
 */
import {readdirSync,mkdirSync,writeFileSync,readFileSync,existsSync} from "node:fs";
import {join,resolve,basename} from "node:path";
import {fileURLToPath} from "node:url";
import {compareFiles} from "./compare-contracts.mjs";
import {indexDocumentText} from "../server/brain-document-index.mjs";

export function compareDirectory(directory,outputDirectory=join(directory,"reports")){
  const source=resolve(directory),destination=resolve(outputDirectory);
  if(source===destination)throw Error("Input and output directories must differ");
  const entries=readdirSync(source,{withFileTypes:true}).filter(x=>x.isFile()).map(x=>x.name);
  const names=new Set(entries);
  const pairs=entries.filter(x=>/\.old\.(txt|md)$/iu.test(x)).sort();
  mkdirSync(destination,{recursive:true});
  const result={compared:0,skipped:0,failed:0,errors:[]};
  for(const oldName of pairs){
    const newName=oldName.replace(/\.old\.(txt|md)$/iu,".new.$1");
    if(!names.has(newName)){result.skipped++;continue;}
    const base=oldName.replace(/\.old\.(txt|md)$/iu,"");
    const output=join(destination,base+".comparison.json");
    try{
      const oldPath=join(source,oldName),newPath=join(source,newName);
      // Persist both complete source texts even when the review report already exists.
      // Never send contract contents to the embedding provider.
      const decode=new TextDecoder("utf-8",{fatal:true});
      const read=path=>{const bytes=readFileSync(path);if(bytes.length>2*1024*1024)throw Error("Contract text exceeds 2 MiB");return decode.decode(bytes);};
      const oldText=read(oldPath),newText=read(newPath);
      indexDocumentText(oldPath,oldText);
      indexDocumentText(newPath,newText);
      if(existsSync(output)){result.skipped++;continue;}
      const report=compareFiles(oldPath,newPath);
      // Exclusive creation: never overwrite an earlier review report.
      writeFileSync(output,JSON.stringify({
        sourceFiles:{previous:basename(oldPath),next:basename(newPath)},
        generatedAt:new Date().toISOString(),...report
      },null,2)+"\n",{flag:"wx",encoding:"utf8",mode:0o600});
      result.compared++;
    }catch(error){
      if(error?.code==="EEXIST"){result.skipped++;continue;}
      result.failed++;
      result.errors.push({pair:base,error:String(error?.message||error)});
    }
  }
  return result;
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url))){
  try{
    if(process.argv.length>4)throw Error("Usage: node scripts/auto-compare-contracts.mjs [input-folder] [reports-folder]");
    const source=process.argv[2]||join(process.cwd(),"Aspksa","Документы","Договоры");
    const report=compareDirectory(source,process.argv[3]||join(source,"reports"));
    process.stdout.write(JSON.stringify(report,null,2)+"\n");
    if(report.failed)process.exitCode=1;
  }catch(error){console.error("Automatic comparison failed: "+error.message);process.exitCode=1;}
}
