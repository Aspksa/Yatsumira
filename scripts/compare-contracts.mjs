/**
 * Local contract revision comparison for UTF-8 text/Markdown exports.
 * Never uploads contract text or sends it to a model.
 */
import {readFileSync,writeFileSync} from "node:fs";
import {resolve,extname} from "node:path";
import {fileURLToPath} from "node:url";
import {compareContractTerms} from "../server/memory-intelligence.mjs";

export function compareFiles(previousPath,nextPath){
  for(const path of [previousPath,nextPath]){
    if(![".txt",".md"].includes(extname(path).toLowerCase()))
      throw Error("Only .txt and .md text exports are supported; convert PDF/DOCX first");
  }
  const maxBytes=2*1024*1024;
  const read=path=>{
    const bytes=readFileSync(resolve(path));
    if(bytes.length>maxBytes)throw Error("Contract text file exceeds 2 MiB");
    const decoder=new TextDecoder("utf-8",{fatal:true});
    return decoder.decode(bytes);
  };
  return compareContractTerms(read(previousPath),read(nextPath));
}
function main(args){
  const [previous,next,output,...extra]=args;
  if(!previous||!next||extra.length)throw Error("Usage: node scripts/compare-contracts.mjs old.txt new.txt [report.json]");
  if(output && extname(output).toLowerCase()!==".json")throw Error("Output must be a .json file");
  const report=compareFiles(previous,next);
  const json=JSON.stringify(report,null,2)+"\n";
  if(output)writeFileSync(resolve(output),json,{encoding:"utf8",flag:"wx",mode:0o600});
  else process.stdout.write(json);
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url))){
  try{main(process.argv.slice(2));}
  catch(error){console.error("Contract comparison failed: "+error.message);process.exitCode=1;}
}
